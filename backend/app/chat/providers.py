"""Chat providers.

Two are supported, because deployments differ in what they're allowed to call:

- `anthropic` — the Claude API. Best quality; needs egress to api.anthropic.com.
- `openai` — any server speaking OpenAI's /v1/chat/completions with tool calling.
  This is what an on-prem deployment serves: HPE PCAI runs models under
  `vllm/vllm-openai` with `--enable-auto-tool-choice`, and NVIDIA NIM and Ollama
  expose the same shape. "OpenAI-compatible" here is a wire format, not a vendor —
  no request leaves the cluster.

The tool-calling loop itself is identical for both and lives in service.py. A
provider's only job is to translate one turn to and from the wire, which it does
through the neutral `Turn`/`ToolCall` types below. Conversation history stays in
each provider's native shape, so nothing is lost round-tripping through a
lowest-common-denominator format.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Turn:
    """One model response, normalised."""

    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    # The assistant turn to append to history, in the provider's own shape.
    assistant_message: Any = None


class Provider(ABC):
    """Translates a single turn to and from a provider's wire format."""

    name: str

    @abstractmethod
    async def send(self, messages: list[dict], system: str) -> Turn: ...

    @abstractmethod
    def tool_result_messages(
        self, results: list[tuple[ToolCall, str]]
    ) -> list[dict]:
        """Messages carrying tool output back to the model."""

    async def aclose(self) -> None:
        return None


class AnthropicProvider(Provider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str, max_tokens: int, tools: list[dict]):
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model
        self._max_tokens = max_tokens
        self._tools = tools

    async def send(self, messages: list[dict], system: str) -> Turn:
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=system,
            tools=self._tools,
            messages=messages,
        )
        text = "\n".join(b.text for b in resp.content if b.type == "text").strip()
        calls = [
            ToolCall(id=b.id, name=b.name, arguments=dict(b.input))
            for b in resp.content
            if b.type == "tool_use"
        ]
        return Turn(
            text=text,
            tool_calls=calls,
            assistant_message={"role": "assistant", "content": resp.content},
        )

    def tool_result_messages(self, results: list[tuple[ToolCall, str]]) -> list[dict]:
        # Anthropic expects every result for a turn in one user message.
        return [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": output,
                        "is_error": output.startswith("Error:"),
                    }
                    for call, output in results
                ],
            }
        ]


class OpenAICompatibleProvider(Provider):
    """Talks to any OpenAI-shaped /v1/chat/completions endpoint.

    Uses httpx directly rather than the `openai` package: httpx is already a
    dependency, the request is small, and shipping a package named `openai` to
    talk to a self-hosted Llama invites the reasonable question of whether data
    is going to OpenAI. It isn't — `base_url` points at the cluster.
    """

    name = "openai"

    def __init__(
        self,
        base_url: str,
        model: str,
        max_tokens: int,
        tools: list[dict],
        api_key: str | None = None,
        timeout: float = 120.0,
    ):
        headers = {"Content-Type": "application/json"}
        # Self-hosted endpoints are often unauthenticated inside the namespace.
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"), headers=headers, timeout=timeout
        )
        self._model = model
        self._max_tokens = max_tokens
        self._tools = tools

    async def aclose(self) -> None:
        await self._client.aclose()

    async def send(self, messages: list[dict], system: str) -> Turn:
        # Unlike Anthropic, the system prompt is an ordinary message here.
        payload = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": [{"role": "system", "content": system}, *messages],
            "tools": self._tools,
        }
        resp = await self._client.post("/chat/completions", json=payload)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Inference endpoint returned {resp.status_code}: {resp.text[:300]}"
            )
        choice = resp.json()["choices"][0]
        message = choice["message"]

        calls: list[ToolCall] = []
        for tc in message.get("tool_calls") or []:
            fn = tc["function"]
            # Arguments arrive as a JSON *string* here, unlike Anthropic's parsed
            # dict. A smaller model can emit malformed JSON; treat that as a tool
            # error the model can correct rather than a request failure.
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {"__malformed__": fn.get("arguments")}
            calls.append(ToolCall(id=tc["id"], name=fn["name"], arguments=args))

        return Turn(
            text=(message.get("content") or "").strip(),
            tool_calls=calls,
            assistant_message=message,
        )

    def tool_result_messages(self, results: list[tuple[ToolCall, str]]) -> list[dict]:
        # One `tool` message per call, each keyed by tool_call_id.
        return [
            {"role": "tool", "tool_call_id": call.id, "content": output}
            for call, output in results
        ]
