from typing import Any

import httpx

from .identity import resolve_token
from .token_manager import ServiceTokenManager


class BackendError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"backend returned {status_code}: {detail}")


class RosterApiClient:
    """Talks to the backend as the MCP server's service account.

    Holds one long-lived httpx client with no static auth header; the bearer token
    is resolved per request from the ServiceTokenManager. A backend 401 triggers one
    re-login + retry in case the cached token was invalidated server-side.
    """

    def __init__(self, base_url: str, token_manager: ServiceTokenManager):
        self._token_manager = token_manager
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=30.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        resp = await self._send(method, path, **kwargs)
        if resp.status_code == 401:
            # Token may have been invalidated server-side; force a fresh login once.
            self._token_manager.invalidate()
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
        token = await resolve_token(self._token_manager)
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

    async def create_demand(self, payload: dict) -> dict:
        return await self._request("POST", "/api/demands", json=payload)

    async def create_roster(self, payload: dict) -> dict:
        return await self._request("POST", "/api/rosters", json=payload)

    async def get_roster(self, roster_id: int) -> dict:
        return await self._request("GET", f"/api/rosters/{roster_id}")
