"""Chat service — answers the in-app assistant.

The default path hands the request to the AgentOps platform (agentops.py). The
direct providers in providers.py (Anthropic, OpenAI-compatible) run a local
tool-calling loop here instead; they bypass the platform's guardrails, audit and
cost tracking, so they are break-glass: `chat_provider` must name one *and*
`chat_direct_enabled` must be true, and the backend logs a warning while one is
active.
"""

import json
import logging

from app.config import settings
from app.tooling.client import RosterApiClient, static_token

from .agentops import AgentOpsClient, AgentOpsError
from .providers import (
    AnthropicProvider,
    OpenAICompatibleProvider,
    Provider,
    ToolCall,
)
from .tools import ANTHROPIC_TOOLS, OPENAI_TOOLS, execute_tool

logger = logging.getLogger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5"
MAX_TOKENS = 4096

# Guards against a runaway loop (e.g. the model retrying a failing tool forever).
# Each iteration is one model turn; the flows here need ~2-4.
MAX_ITERATIONS = 10

# Where tool calls are sent. Loopback to this same app so they pass through the
# normal routers — same auth, validation, and status-transition rules as any client.
BACKEND_URL = "http://localhost:8000"

SYSTEM_PROMPT = """\
You are the scheduling assistant inside Roster Engine, a staff rostering app that \
solves rosters with a CP-SAT constraint solver. You help operators (typically ward \
managers) set up and generate rosters.

## How this app is structured

- **Shifts** are grouped into shift groups (e.g. day/evening/night). Each shift has a \
start and end time and a paid-work-minutes credit.
- **Staff** belong to staff groups. They may have skills, and permitted shifts (a \
staff member with no permitted-shift rows is allowed every shift).
- **A Profile** is the configuration unit: it bundles the staff + shifts eligible for \
a roster, plus solver settings (objective weights, time limit, conditional rules like \
"no work the day after a night shift").
- **A roster** is generated for a profile over a date window, against **demands** \
(how many staff are needed in a given time window on a given day).
- Rosters run asynchronously: they start as `running`, then become `draft` (solved) \
or `failed` (infeasible). A human approves or discards drafts.

## Conventions that matter

- All times are **minutes from midnight**: 09:00 = 540, 17:00 = 1020. Overnight \
shifts are encoded with `end_min <= start_min` (e.g. 22:00-07:00 = 1320 to 420).
- Target hours are **exact**, not a maximum. Staff must hit the target precisely.
- Keep paid work minutes **uniform across shifts** (e.g. 440 everywhere). Mixed \
credits make an exact-hours target very hard to satisfy and often cause infeasibility.
- Leave is not a separate constraint — it becomes a pre-assignment of a leave shift, \
by convention code `AL`. That shift must exist among the profile's shifts, and should \
carry the same paid minutes so leave days still count toward hours.
- **A roster with no demands is always infeasible**: staff are only rostered on days \
that have demands, and the hours target is exact. Always include demands for each day \
you want covered.

## Diagnosing infeasibility

When a roster fails, the usual causes are, in order: no demands for some days; a \
target-hours figure that can't be met with the available shift credits; demand \
headcount exceeding available staff; a missing `AL` shift when leaves fall in the \
window; or over-restrictive permitted shifts.

## How to work

- Use your tools to look up real data before answering — don't guess profile ids, \
skill ids, or what rosters exist.
- Before generating a roster, check `list_leaves` for the window and mention reduced \
availability if it's material.
- When creating a roster, confirm the plan with the user first if anything is \
ambiguous (dates, headcount, target hours). Don't invent headcounts they didn't ask for.
- After `create_roster`, the roster is `running`. Tell the user it's solving and that \
it will appear on the Rosters page; you may poll `get_roster_status` once or twice, \
but don't poll in a long loop.

## What you cannot do

You **cannot approve or discard rosters** — those are deliberate human actions. If \
asked, say so plainly and point the user to the Rosters page to do it there.

## Response format

Your replies are shown in a small chat panel that renders **plain text only** — it \
does not render Markdown. Write prose and use real line breaks for structure. Do not \
use `**bold**`, `#` headings, backticks, or Markdown tables; those render as literal \
punctuation and look broken. For a short list, use a plain "- " prefix on its own line.

Keep responses concise and practical — you're talking to a busy operator, not writing \
documentation.\
"""


DIRECT_PROVIDERS = ("anthropic", "openai")


class ChatUnavailable(RuntimeError):
    """Raised when the assistant isn't configured (no API key)."""


def direct_mode_blocked() -> str | None:
    """Why a direct provider cannot be used right now, or None when it can.

    A direct provider sends roster data straight to a model with no AgentOps
    guardrails, audit or cost record, so it has to be switched on explicitly.
    """
    if settings.chat_provider in DIRECT_PROVIDERS and not settings.chat_direct_enabled:
        return (
            f"chat_provider is '{settings.chat_provider}', a direct (break-glass) path, "
            "but CHAT_DIRECT_ENABLED is not true. Use scripts/chat-provider.sh, or set "
            "CHAT_PROVIDER=agentops."
        )
    return None


def is_configured() -> bool:
    """Whether the assistant can run with the current settings."""
    if direct_mode_blocked():
        return False
    if settings.chat_provider == "anthropic":
        return bool(settings.anthropic_api_key)
    if settings.chat_provider == "openai":
        return bool(settings.chat_base_url)
    if settings.chat_provider == "agentops":
        return all((settings.agentops_base_url, settings.agentops_client_id,
                    settings.agentops_client_secret, settings.agentops_agent_id))
    return False


def provider_label() -> str:
    """Short human label for the UI: which path answers, and roughly with what."""
    p = settings.chat_provider
    if p == "agentops":
        return "via AgentOps"
    if p == "anthropic":
        return f"direct (break-glass) · {settings.chat_model or DEFAULT_ANTHROPIC_MODEL}"
    if p == "openai":
        return f"direct (break-glass) · {settings.chat_model or 'openai-compatible'}"
    return p


def log_chat_mode() -> None:
    """One line at startup saying which path the assistant uses. The direct paths
    are logged at WARNING so an operator reading the log sees that requests are
    bypassing AgentOps governance."""
    p = settings.chat_provider
    if p in DIRECT_PROVIDERS:
        if settings.chat_direct_enabled:
            logger.warning(
                "chat assistant: DIRECT %s mode is active (break-glass). Requests bypass "
                "AgentOps guardrails, audit and cost tracking. Set CHAT_PROVIDER=agentops "
                "to restore the governed path.", p,
            )
        else:
            logger.warning(
                "chat assistant disabled: chat_provider='%s' is break-glass and "
                "CHAT_DIRECT_ENABLED is not true.", p,
            )
    elif p == "agentops":
        if is_configured():
            logger.info("chat assistant: via AgentOps at %s (agent %s)",
                        settings.agentops_base_url, settings.agentops_agent_id)
        else:
            logger.warning("chat assistant disabled: chat_provider='agentops' but the "
                           "AGENTOPS_* settings are incomplete.")
    else:
        logger.warning("chat assistant disabled: unknown chat_provider '%s'.", p)


def build_agentops_client() -> AgentOpsClient:
    missing = [n for n in ("agentops_base_url", "agentops_client_id",
                           "agentops_client_secret", "agentops_agent_id")
               if not getattr(settings, n)]
    if missing:
        raise ChatUnavailable(
            "The chat assistant is not configured: chat_provider is 'agentops' but "
            + ", ".join(m.upper() for m in missing) + " unset."
        )
    return AgentOpsClient(
        base_url=settings.agentops_base_url,
        client_id=settings.agentops_client_id,
        client_secret=settings.agentops_client_secret,
        agent_id=settings.agentops_agent_id,
        model=settings.agentops_model,
        timeout_seconds=settings.agentops_timeout_seconds,
    )


def build_provider() -> Provider:
    """Construct the configured provider, or explain what's missing."""
    provider = settings.chat_provider

    blocked = direct_mode_blocked()
    if blocked:
        raise ChatUnavailable("The chat assistant is not configured: " + blocked)
    if provider in DIRECT_PROVIDERS:
        logger.warning("chat request served by the direct %s path (break-glass)", provider)

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ChatUnavailable(
                "The chat assistant is not configured: chat_provider is 'anthropic' "
                "but ANTHROPIC_API_KEY is unset."
            )
        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            model=settings.chat_model or DEFAULT_ANTHROPIC_MODEL,
            max_tokens=MAX_TOKENS,
            tools=ANTHROPIC_TOOLS,
        )

    if provider == "openai":
        if not settings.chat_base_url:
            raise ChatUnavailable(
                "The chat assistant is not configured: chat_provider is 'openai' "
                "but CHAT_BASE_URL is unset (e.g. http://my-llm.svc:8080/v1)."
            )
        if not settings.chat_model:
            raise ChatUnavailable(
                "The chat assistant is not configured: chat_provider is 'openai' "
                "requires CHAT_MODEL (the model name the endpoint serves)."
            )
        return OpenAICompatibleProvider(
            base_url=settings.chat_base_url,
            model=settings.chat_model,
            max_tokens=MAX_TOKENS,
            tools=OPENAI_TOOLS,
            api_key=settings.chat_api_key,
        )

    if provider == "agentops":
        raise ChatUnavailable(
            "chat_provider 'agentops' does not run the local tool loop; use answer()."
        )

    raise ChatUnavailable(
        f"Unknown chat_provider {provider!r} — expected 'anthropic', 'openai' or 'agentops'."
    )


class ChatResult:
    """What the router returns: the reply plus where it came from."""

    def __init__(self, reply: str, provider: str, run_id: str | None = None) -> None:
        self.reply, self.provider, self.run_id = reply, provider, run_id


async def answer(messages: list[dict], token: str) -> ChatResult:
    """Provider-agnostic entry point for the router.

    agentops (default): one call to the platform; no local loop, no provider key.
    anthropic / openai (break-glass): the local tool-calling loop below, unchanged.
    """
    if settings.chat_provider == "agentops":
        client = build_agentops_client()
        try:
            reply, run_id = await client.chat(messages)
        except AgentOpsError as e:
            raise ChatUnavailable(str(e)) from e
        finally:
            await client.aclose()
        return ChatResult(reply, "agentops", run_id)
    return ChatResult(await chat(messages, token), settings.chat_provider)


async def chat(messages: list[dict], token: str) -> str:
    """Run the tool-calling loop and return the assistant's final text.

    `messages` is the full conversation so far; the caller owns history. `token` is
    the requesting user's own JWT, so tool calls act as that user.

    The loop is provider-independent: the provider translates one turn to and from
    its wire format, and everything else — tool dispatch, error handling, the
    iteration cap — is shared.
    """
    provider = build_provider()
    client = RosterApiClient(BACKEND_URL, token_provider=static_token(token))

    convo: list[dict] = list(messages)
    try:
        for _ in range(MAX_ITERATIONS):
            turn = await provider.send(convo, SYSTEM_PROMPT)

            if not turn.tool_calls:
                return turn.text or "(no response)"

            convo.append(turn.assistant_message)

            results: list[tuple[ToolCall, str]] = []
            for call in turn.tool_calls:
                logger.info("chat tool call (%s): %s", provider.name, call.name)
                result = await execute_tool(call.name, call.arguments, client)
                output = (
                    result
                    if isinstance(result, str)
                    else json.dumps(result, default=str)
                )
                results.append((call, output))

            convo.extend(provider.tool_result_messages(results))

        return (
            "I wasn't able to finish that — it took more steps than I'm allowed in one "
            "turn. Try narrowing the request."
        )
    finally:
        await client.aclose()
        await provider.aclose()
