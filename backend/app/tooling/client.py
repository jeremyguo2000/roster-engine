from typing import Any, Awaitable, Callable

import httpx


class BackendError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"backend returned {status_code}: {detail}")


# How a caller obtains a bearer token for the next request. The MCP server passes a
# service-account manager's `get_token`; the chat endpoint passes a closure over the
# logged-in user's own JWT. The client itself has no opinion on which.
TokenProvider = Callable[[], Awaitable[str]]


def static_token(token: str) -> TokenProvider:
    """TokenProvider for a token that's already in hand and valid for this request."""

    async def _provide() -> str:
        return token

    return _provide


class RosterApiClient:
    """Talks to the backend REST API on a caller's behalf.

    Goes over HTTP rather than reaching into the DB so that every tool call passes
    through the same auth, validation, and status-transition rules as any other
    client — no bypass. The bearer token is resolved per request via `TokenProvider`.

    `on_unauthorized` is an optional hook invoked after a 401; the MCP server uses it
    to invalidate its cached service-account token so the retry re-logs-in. Callers
    holding an already-valid token (the chat endpoint) leave it unset — a 401 there
    is a real auth failure, not a stale cache.
    """

    def __init__(
        self,
        base_url: str,
        token_provider: TokenProvider,
        on_unauthorized: Callable[[], None] | None = None,
    ):
        self._token_provider = token_provider
        self._on_unauthorized = on_unauthorized
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=30.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        resp = await self._send(method, path, **kwargs)
        if resp.status_code == 401 and self._on_unauthorized is not None:
            # Cached token may have been invalidated server-side; force one re-login.
            self._on_unauthorized()
            resp = await self._send(method, path, **kwargs)

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise BackendError(resp.status_code, detail)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    async def _send(self, method: str, path: str, **kwargs) -> httpx.Response:
        token = await self._token_provider()
        headers = {**kwargs.pop("headers", {}), "Authorization": f"Bearer {token}"}
        return await self._client.request(method, path, headers=headers, **kwargs)

    async def list_profiles(self) -> list[dict]:
        return await self._request("GET", "/api/profiles")

    async def list_skill_types(self) -> list[dict]:
        return await self._request("GET", "/api/skills/types")

    async def list_rosters(
        self, status: str | None = None, profile_id: int | None = None
    ) -> list[dict]:
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if profile_id is not None:
            params["profile_id"] = profile_id
        return await self._request("GET", "/api/rosters", params=params)

    async def list_leaves(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        staff_id: int | None = None,
    ) -> list[dict]:
        params: dict[str, Any] = {}
        if from_date is not None:
            params["from_date"] = from_date
        if to_date is not None:
            params["to_date"] = to_date
        if staff_id is not None:
            params["staff_id"] = staff_id
        return await self._request("GET", "/api/staff/leaves", params=params)

    async def create_roster(self, payload: dict) -> dict:
        """Demands ride inline in `payload["demands"]` so the backend creates them
        in the same transaction as the roster — see POST /api/rosters."""
        return await self._request("POST", "/api/rosters", json=payload)

    async def get_roster(self, roster_id: int) -> dict:
        return await self._request("GET", f"/api/rosters/{roster_id}")
