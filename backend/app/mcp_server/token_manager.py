import asyncio
import time

import httpx
from jose import jwt


class ServiceAuthError(Exception):
    """Raised when the MCP server cannot obtain a token for its service account."""


# Fallback lifetime (seconds) if the JWT carries no decodable `exp` claim.
_DEFAULT_TTL = 1440 * 60


class ServiceTokenManager:
    """Logs the MCP server's service account into the backend and caches the JWT.

    The token is fetched lazily on first use, reused while valid, and re-minted
    proactively `skew` seconds before expiry. A backend 401 can force an early
    re-login via `invalidate()`.
    """

    def __init__(self, base_url: str, username: str, password: str, skew: int = 60):
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._password = password
        self._skew = skew
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()

    def _valid(self) -> bool:
        return self._token is not None and time.time() < self._expires_at - self._skew

    async def get_token(self) -> str:
        # Fast path: a valid cached token, no lock contention.
        if self._valid():
            return self._token  # type: ignore[return-value]
        async with self._lock:
            # Double-check: another coroutine may have logged in while we waited.
            if self._valid():
                return self._token  # type: ignore[return-value]
            await self._login()
            return self._token  # type: ignore[return-value]

    def invalidate(self) -> None:
        """Drop the cached token so the next get_token() re-logs in."""
        self._token = None
        self._expires_at = 0.0

    async def _login(self) -> None:
        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0) as c:
                resp = await c.post(
                    "/api/auth/login",
                    json={"username": self._username, "password": self._password},
                )
        except httpx.HTTPError as e:
            raise ServiceAuthError(
                f"MCP service account login request failed: {e}"
            ) from e

        if resp.status_code != 200:
            raise ServiceAuthError(
                f"MCP service account login failed ({resp.status_code}). "
                "Check ROSTER_SERVICE_USERNAME / ROSTER_SERVICE_PASSWORD."
            )

        token = resp.json().get("access_token")
        if not token:
            raise ServiceAuthError("Login response did not contain an access_token.")

        self._token = token
        self._expires_at = self._read_expiry(token)

    @staticmethod
    def _read_expiry(token: str) -> float:
        """Read the JWT `exp` claim without verifying the signature (we only schedule
        refresh — the backend still validates the token on every request)."""
        try:
            claims = jwt.get_unverified_claims(token)
            exp = claims.get("exp")
            if exp is not None:
                return float(exp)
        except Exception:
            pass
        return time.time() + _DEFAULT_TTL
