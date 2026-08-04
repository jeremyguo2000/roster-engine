"""Chat service — runs the Claude tool-calling loop for the in-app assistant."""

import json
import logging

from anthropic import AsyncAnthropic

from app.config import settings
from app.tooling.client import RosterApiClient, static_token

from .tools import TOOLS, execute_tool

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5"
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


class ChatUnavailable(RuntimeError):
    """Raised when the assistant isn't configured (no API key)."""


def _text_from(blocks) -> str:
    return "\n".join(b.text for b in blocks if b.type == "text").strip()


async def chat(messages: list[dict], token: str) -> str:
    """Run the tool-calling loop and return the assistant's final text.

    `messages` is the full conversation so far; the caller owns history. `token` is
    the requesting user's own JWT, so tool calls act as that user.
    """
    if not settings.anthropic_api_key:
        raise ChatUnavailable(
            "The chat assistant is not configured on this server "
            "(ANTHROPIC_API_KEY is unset)."
        )

    anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)
    client = RosterApiClient(BACKEND_URL, token_provider=static_token(token))

    convo: list[dict] = list(messages)
    try:
        for _ in range(MAX_ITERATIONS):
            response = await anthropic.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=convo,
            )

            if response.stop_reason != "tool_use":
                return _text_from(response.content) or "(no response)"

            convo.append({"role": "assistant", "content": response.content})

            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                logger.info("chat tool call: %s", block.name)
                result = await execute_tool(block.name, block.input, client)
                is_error = isinstance(result, str) and result.startswith("Error:")
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                        if isinstance(result, str)
                        else json.dumps(result, default=str),
                        "is_error": is_error,
                    }
                )
            convo.append({"role": "user", "content": results})

        return (
            "I wasn't able to finish that — it took more steps than I'm allowed in one "
            "turn. Try narrowing the request."
        )
    finally:
        await client.aclose()
