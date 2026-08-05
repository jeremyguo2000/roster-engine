import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.chat.service import ChatUnavailable, chat as run_chat, is_configured
from app.config import settings
from app.dependencies.auth import get_current_user, oauth2_scheme
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # Stateless, mirroring the Messages API itself: the client owns the conversation
    # and resends it each turn. Nothing is persisted server-side.
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
):
    """Ask the scheduling assistant.

    `get_current_user` gates access as usual; `token` is the same bearer string,
    forwarded so the assistant's tool calls act as this user rather than a shared
    service account.
    """
    try:
        reply = await run_chat([m.model_dump() for m in body.messages], token)
    except ChatUnavailable as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    except Exception:
        logger.exception("chat request failed for user %s", current_user.username)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The assistant failed to respond. Please try again.",
        )
    return ChatResponse(reply=reply)


@router.get("/status")
def chat_status(current_user: User = Depends(get_current_user)):
    """Whether the assistant is configured — lets the UI hide the widget instead of
    showing one that 503s on first use. `provider` is reported for support: which
    model answered is the first question when replies look wrong."""
    return {"enabled": is_configured(), "provider": settings.chat_provider}
