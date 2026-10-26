"""AgentOps provider — the assistant is served by the AgentOps platform.

In this mode the roster engine holds no model-provider key and runs no tool
loop of its own. It exchanges its Application Key for a short-lived token,
invokes the "Roster Planner" agent, waits for the run, and returns the text.
Model choice, tool execution (through this app's own MCP server), guardrails,
audit, tracing and cost all happen on the platform.

Switching between this and the direct providers is one setting:
    CHAT_PROVIDER=agentops | anthropic | openai
(see scripts/chat-provider.sh). The direct providers are untouched, so a
stand-alone deployment keeps working without AgentOps.

Wire contract (AgentOps consumption API):
    POST {base}/v1/token                 {clientId, clientSecret} -> {accessToken, expiresIn?}
    POST {base}/v1/agents/{id}/invoke    {input, model?}          -> {runId, status}
    GET  {base}/v1/runs/{id}                                       -> {status, output, error}
A 422 on invoke is a guardrail block; it is returned to the user as the reply
rather than treated as a failure, because "your request was blocked by policy"
is the correct answer to show.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

logger = logging.getLogger(__name__)

TERMINAL = {"succeeded", "failed", "cancelled"}


class AgentOpsError(RuntimeError):
    """The platform could not serve the request (auth, network, run failure)."""


def _flatten(messages: list[dict]) -> str:
    """AgentOps invoke takes a single input. The chat panel is stateless and resends
    the whole conversation, so prior turns are folded in as context. Single-turn
    conversations are passed through verbatim."""
    if len(messages) == 1:
        return messages[0]["content"]
    prior = messages[:-1]
    last = messages[-1]["content"]
    lines = ["Conversation so far (for context):"]
    for m in prior:
        who = "User" if m["role"] == "user" else "Assistant"
        lines.append(f"{who}: {m['content']}")
    lines += ["", "Latest user message (respond to this):", last]
    return "\n".join(lines)


class AgentOpsClient:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        agent_id: str,
        model: str | None = None,
        timeout_seconds: float = 120.0,
        poll_interval: float = 1.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.agent_id = agent_id
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.poll_interval = poll_interval
        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0, transport=transport)
        self._token: str | None = None
        self._token_expiry: float = 0.0

    async def aclose(self) -> None:
        await self._http.aclose()

    # ── auth ────────────────────────────────────────────────────────────────
    async def _token_value(self) -> str:
        if self._token and time.time() < self._token_expiry - 30:
            return self._token
        r = await self._http.post(
            "/v1/token", json={"clientId": self.client_id, "clientSecret": self.client_secret}
        )
        if r.status_code != 200:
            raise AgentOpsError(f"AgentOps rejected the application key (HTTP {r.status_code}).")
        body = r.json()
        self._token = body["accessToken"]
        self._token_expiry = time.time() + float(body.get("expiresIn") or 900)
        return self._token

    async def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self._token_value()}"}

    # ── chat ────────────────────────────────────────────────────────────────
    async def chat(self, messages: list[dict]) -> tuple[str, str | None]:
        """Return (reply_text, run_id). Guardrail blocks become the reply."""
        payload: dict = {"input": _flatten(messages)}
        if self.model:
            payload["model"] = self.model

        r = await self._http.post(
            f"/v1/agents/{self.agent_id}/invoke", json=payload, headers=await self._auth()
        )
        if r.status_code == 401:
            # token expired server-side: refresh once
            self._token = None
            r = await self._http.post(
                f"/v1/agents/{self.agent_id}/invoke", json=payload, headers=await self._auth()
            )
        if r.status_code == 422:
            reason = _detail(r)
            logger.info("agentops guardrail blocked a chat request: %s", reason)
            return f"That request was blocked by policy: {reason}", None
        if r.status_code == 403:
            raise AgentOpsError(f"AgentOps refused this application: {_detail(r)}")
        if r.status_code == 402:
            raise AgentOpsError("The application's AgentOps budget is exhausted.")
        if r.status_code == 429:
            raise AgentOpsError("Rate limit reached on the AgentOps gateway; try again shortly.")
        if r.status_code >= 300:
            raise AgentOpsError(f"AgentOps invoke failed (HTTP {r.status_code}): {_detail(r)}")

        run_id = r.json()["runId"]
        deadline = time.time() + self.timeout_seconds
        while time.time() < deadline:
            s = await self._http.get(f"/v1/runs/{run_id}", headers=await self._auth())
            if s.status_code != 200:
                raise AgentOpsError(f"Could not read run {run_id} (HTTP {s.status_code}).")
            run = s.json()
            status = str(run.get("status") or "").lower()
            if status in TERMINAL:
                if status != "succeeded":
                    raise AgentOpsError(f"Run {run_id} {status}: {run.get('error') or 'no detail'}")
                return _output_text(run.get("output")), run_id
            await asyncio.sleep(self.poll_interval)
        raise AgentOpsError(f"Run {run_id} did not finish within {int(self.timeout_seconds)}s.")


def _detail(r: httpx.Response) -> str:
    try:
        j = r.json()
        return str(j.get("message") or j.get("detail") or j.get("error") or r.text)[:300]
    except ValueError:
        return r.text[:300]


def _output_text(output) -> str:
    if output is None:
        return "(no response)"
    if isinstance(output, dict):
        return str(output.get("text") or output.get("content") or output)
    return str(output)
