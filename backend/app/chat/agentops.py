"""AgentOps provider — the assistant is served by the AgentOps platform.

In this mode the roster engine holds no model-provider key and runs no tool
loop of its own. It exchanges its Application Key for a short-lived token,
invokes the "Roster Planner" agent, follows the run and returns the text.
Model choice, tool execution (through this app's own MCP server), guardrails,
audit, tracing and cost all happen on the platform.

This is the default path. The direct providers (anthropic / openai) still exist
but are break-glass: CHAT_PROVIDER=anthropic|openai plus CHAT_DIRECT_ENABLED=true
(see scripts/chat-provider.sh and service.py).

Wire contract (AgentOps consumption API, docs/integration-guide.md there):
    POST {base}/v1/token                 {clientId, clientSecret} -> {accessToken, expiresInSeconds}
    POST {base}/v1/agents/{id}/invoke    {input, model?}          -> {runId, status}
    GET  {base}/v1/runs/{id}/events      text/event-stream: run.started, step…, run.completed | run.failed
    GET  {base}/v1/runs/{id}                                       -> {status, output, error, guardrail}

The run is followed over the event stream, so the answer arrives the moment the
platform finalises it (after output guardrails) rather than on the next poll.
If the stream cannot be opened (an older gateway without the route, the
per-app stream cap, a proxy that cannot hold the connection) or it closes
without a terminal event, the client falls back to polling GET /v1/runs/{id},
which is what it did before the stream existed.

A 422 on invoke is a guardrail block; it is returned to the user as the reply
rather than treated as a failure, because "your request was blocked by policy"
is the correct answer to show.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)

TERMINAL = {"succeeded", "failed", "cancelled"}

# The gateway sends a `:keepalive` comment every 15 s; the read timeout must
# comfortably outlive that gap or an idle-but-healthy stream would be dropped.
STREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)


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
        stream: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.agent_id = agent_id
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.poll_interval = poll_interval
        self.stream = stream
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
        ttl = body.get("expiresInSeconds") or body.get("expiresIn") or 900
        self._token_expiry = time.time() + float(ttl)
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

        if self.stream:
            reply = await self._follow_stream(run_id, deadline)
            if reply is not None:
                return reply, run_id
            logger.info("agentops run %s: event stream unavailable, polling instead", run_id)
        return await self._poll(run_id, deadline), run_id

    # ── waiting for the run ─────────────────────────────────────────────────
    async def _follow_stream(self, run_id: str, deadline: float) -> str | None:
        """Follow GET /v1/runs/{id}/events to its terminal event.

        Returns the reply on `run.completed`, raises on `run.failed`, and returns
        None when the stream could not be used (not opened, or closed without a
        terminal event) so the caller can fall back to polling.
        """
        remaining = deadline - time.time()
        if remaining <= 0:
            return None
        try:
            return await asyncio.wait_for(self._read_stream(run_id), timeout=remaining)
        except asyncio.TimeoutError:
            raise AgentOpsError(
                f"Run {run_id} did not finish within {int(self.timeout_seconds)}s."
            ) from None
        except httpx.HTTPError as e:
            logger.warning("agentops run %s: event stream dropped (%s)", run_id, e)
            return None

    async def _read_stream(self, run_id: str) -> str | None:
        headers = {**await self._auth(), "Accept": "text/event-stream"}
        async with self._http.stream(
            "GET", f"/v1/runs/{run_id}/events", headers=headers, timeout=STREAM_TIMEOUT
        ) as resp:
            if resp.status_code != 200:
                await resp.aread()
                logger.warning(
                    "agentops run %s: event stream refused (HTTP %s): %s",
                    run_id, resp.status_code, _detail(resp),
                )
                return None
            async for event, data in _sse_events(resp.aiter_lines()):
                if event == "run.completed":
                    return _output_text(data.get("output"))
                if event == "run.failed":
                    status = data.get("status") or "failed"
                    raise AgentOpsError(
                        f"Run {run_id} {status}: {data.get('error') or 'no detail'}"
                    )
                if event == "step":
                    logger.debug(
                        "agentops run %s step %s %s %s",
                        run_id, data.get("seq"), data.get("kind"), data.get("name"),
                    )
        # Closed without a terminal event (gateway restart, server-side limit).
        return None

    async def _poll(self, run_id: str, deadline: float) -> str:
        while time.time() < deadline:
            s = await self._http.get(f"/v1/runs/{run_id}", headers=await self._auth())
            if s.status_code != 200:
                raise AgentOpsError(f"Could not read run {run_id} (HTTP {s.status_code}).")
            run = s.json()
            status = str(run.get("status") or "").lower()
            if status in TERMINAL:
                if status != "succeeded":
                    raise AgentOpsError(f"Run {run_id} {status}: {run.get('error') or 'no detail'}")
                return _output_text(run.get("output"))
            await asyncio.sleep(self.poll_interval)
        raise AgentOpsError(f"Run {run_id} did not finish within {int(self.timeout_seconds)}s.")


async def _sse_events(lines: AsyncIterator[str]) -> AsyncIterator[tuple[str, dict]]:
    """Yield (event, data) per SSE frame. Comments (`:keepalive`) are skipped and
    multi-line `data:` fields are joined with newlines, per the SSE spec. The
    gateway writes `event:run.completed` without a space; both forms are accepted."""
    event = "message"
    data: list[str] = []
    async for raw in lines:
        line = raw.rstrip("\r")
        if line == "":
            if data:
                try:
                    payload = json.loads("\n".join(data))
                except json.JSONDecodeError:
                    payload = {}
                yield event, payload if isinstance(payload, dict) else {}
            event, data = "message", []
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if field == "event":
            event = value
        elif field == "data":
            data.append(value)
    if data:
        try:
            payload = json.loads("\n".join(data))
        except json.JSONDecodeError:
            payload = {}
        yield event, payload if isinstance(payload, dict) else {}


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
