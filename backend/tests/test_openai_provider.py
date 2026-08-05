"""Tests for the OpenAI-compatible provider.

An on-prem deployment (HPE PCAI serves models under vllm/vllm-openai with
--enable-auto-tool-choice) speaks a different wire format from the Claude API:
the system prompt is an ordinary message, tools are nested under
`function.parameters`, tool-call arguments arrive as a JSON *string*, and results
go back as one `tool` message per call.

None of that can be exercised without an endpoint, so these drive the provider
against a mock transport and assert on the bytes actually sent.
"""

import json
import os

import httpx
import pytest

os.environ.setdefault("ROSTER_SERVICE_USERNAME", "test")
os.environ.setdefault("ROSTER_SERVICE_PASSWORD", "test")

from app.chat.providers import OpenAICompatibleProvider, ToolCall  # noqa: E402
from app.chat.tools import OPENAI_TOOLS  # noqa: E402


def _provider(handler) -> OpenAICompatibleProvider:
    p = OpenAICompatibleProvider(
        base_url="http://llm.internal:8080/v1",
        model="llama-3.3-70b-instruct",
        max_tokens=4096,
        tools=OPENAI_TOOLS,
    )
    # Swap the real transport for the mock, keeping base_url/headers.
    p._client = httpx.AsyncClient(
        base_url="http://llm.internal:8080/v1",
        transport=httpx.MockTransport(handler),
    )
    return p


def _reply(message: dict) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": message}]})


@pytest.mark.asyncio
async def test_request_uses_openai_shape():
    """System prompt as a message, tools nested under function.parameters."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        seen["path"] = request.url.path
        return _reply({"role": "assistant", "content": "hi"})

    await _provider(handler).send([{"role": "user", "content": "hello"}], "SYSTEM")

    assert seen["path"].endswith("/chat/completions")
    # Anthropic puts the system prompt in a top-level field; here it's a message.
    assert "system" not in seen
    assert seen["messages"][0] == {"role": "system", "content": "SYSTEM"}
    assert seen["messages"][1] == {"role": "user", "content": "hello"}

    tool = seen["tools"][0]
    assert tool["type"] == "function"
    assert "parameters" in tool["function"]
    assert "input_schema" not in tool["function"]  # that's the Anthropic spelling


@pytest.mark.asyncio
async def test_plain_reply_has_no_tool_calls():
    def handler(request):
        return _reply({"role": "assistant", "content": "  There is 1 profile.  "})

    turn = await _provider(handler).send([{"role": "user", "content": "?"}], "s")
    assert turn.text == "There is 1 profile."
    assert turn.tool_calls == []


@pytest.mark.asyncio
async def test_tool_call_arguments_are_parsed_from_json_string():
    """OpenAI sends arguments as a string; the loop needs a dict."""

    def handler(request):
        return _reply(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "list_rosters",
                            "arguments": '{"status": "draft"}',
                        },
                    }
                ],
            }
        )

    turn = await _provider(handler).send([{"role": "user", "content": "?"}], "s")
    assert turn.text == ""  # content is null on a pure tool-call turn
    assert len(turn.tool_calls) == 1
    call = turn.tool_calls[0]
    assert (call.id, call.name) == ("call_1", "list_rosters")
    assert call.arguments == {"status": "draft"}  # parsed, not left as a string


@pytest.mark.asyncio
async def test_malformed_tool_arguments_do_not_raise():
    """Smaller models emit invalid JSON; that must not fail the request."""

    def handler(request):
        return _reply(
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "id": "call_2",
                        "type": "function",
                        "function": {"name": "list_profiles", "arguments": "{oops"},
                    }
                ],
            }
        )

    turn = await _provider(handler).send([{"role": "user", "content": "?"}], "s")
    assert turn.tool_calls[0].arguments == {"__malformed__": "{oops"}


@pytest.mark.asyncio
async def test_tool_results_go_back_as_one_tool_message_each():
    def handler(request):
        return _reply({"role": "assistant", "content": "ok"})

    msgs = _provider(handler).tool_result_messages(
        [
            (ToolCall(id="call_1", name="list_profiles", arguments={}), '[{"id":1}]'),
            (ToolCall(id="call_2", name="list_rosters", arguments={}), "Error: nope"),
        ]
    )
    assert msgs == [
        {"role": "tool", "tool_call_id": "call_1", "content": '[{"id":1}]'},
        {"role": "tool", "tool_call_id": "call_2", "content": "Error: nope"},
    ]


@pytest.mark.asyncio
async def test_endpoint_error_surfaces_readably():
    def handler(request):
        return httpx.Response(503, text="no healthy upstream")

    with pytest.raises(RuntimeError, match="503"):
        await _provider(handler).send([{"role": "user", "content": "?"}], "s")


@pytest.mark.asyncio
async def test_api_key_optional_for_in_cluster_endpoints():
    """Self-hosted endpoints are frequently unauthenticated inside the namespace."""
    unauth = OpenAICompatibleProvider(
        base_url="http://llm.internal:8080/v1", model="m", max_tokens=10, tools=[]
    )
    authed = OpenAICompatibleProvider(
        base_url="http://llm.internal:8080/v1",
        model="m",
        max_tokens=10,
        tools=[],
        api_key="secret",
    )
    assert "Authorization" not in unauth._client.headers
    assert authed._client.headers["Authorization"] == "Bearer secret"
