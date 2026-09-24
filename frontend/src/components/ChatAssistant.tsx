import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { chatStatus, sendChat, ChatMessage } from "../api/chat";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

// Floating assistant, anchored bottom-right (the WorkflowGuide overlay owns
// top-centre). Both the open flag and the conversation are component state: the
// widget mounts outside <Routes> so it survives navigation, and the endpoint is
// stateless by design, so there is nothing meaningful to restore across a reload.
const SUGGESTIONS = [
  "What profiles are set up?",
  "Why would a roster come back infeasible?",
  "Are any staff on leave next week?",
];

export default function ChatAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const statusQ = useQuery({
    queryKey: ["chat", "status"],
    queryFn: chatStatus,
    enabled: !!user,
    staleTime: Infinity,
  });

  const send = useMutation({
    mutationFn: (conversation: ChatMessage[]) => sendChat(conversation),
    onSuccess: (data) => {
      setError(null);
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    },
    onError: (e, conversation) => {
      // Nothing was exchanged, so don't leave a dangling user turn in the log —
      // roll it back and hand the text back so the question isn't lost.
      setMessages(conversation.slice(0, -1));
      setDraft(conversation[conversation.length - 1].content);
      setError(errorMessage(e, "The assistant didn't respond."));
    },
  });

  // Pin to the newest message. Layout effect so it happens before paint.
  useLayoutEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, send.isPending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Grow the box with the question. Reset to auto first so it shrinks back when
  // text is deleted; CSS max-height turns it into a scroller past a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  function submit(text: string) {
    const content = text.trim();
    if (!content || send.isPending) return;
    setDraft("");
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(conversation);
    send.mutate(conversation);
  }

  function reset() {
    setMessages([]);
    setError(null);
    setDraft("");
    inputRef.current?.focus();
  }

  // Hidden when logged out, and when the server has no API key — better than
  // offering a widget that fails on first use.
  if (!user || statusQ.data?.enabled !== true) return null;

  if (!open) {
    return (
      <button className="chat-pill" onClick={() => setOpen(true)}>
        💬 Assistant
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span style={{ fontWeight: 600 }}>
          Scheduling assistant
          {statusQ.data?.label && (
            <span
              className="muted"
              title={`chat_provider = ${statusQ.data.provider}`}
              style={{ fontWeight: 400, fontSize: "0.8em", marginLeft: "var(--s-2)" }}
            >
              {statusQ.data.label}
            </span>
          )}
        </span>
        <div className="row" style={{ gap: "var(--s-2)" }}>
          {messages.length > 0 && (
            <button className="chat-reset" onClick={reset}>
              New chat
            </button>
          )}
          <button
            className="workflow-overlay-close"
            onClick={() => setOpen(false)}
            aria-label="Hide assistant"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="chat-log" ref={logRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="muted" style={{ marginTop: 0 }}>
              Ask about your rosters, or for help setting one up.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chat-suggestion" onClick={() => submit(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              {m.content}
            </div>
          ))
        )}

        {send.isPending && (
          <div className="chat-msg chat-msg-assistant chat-thinking">Thinking…</div>
        )}
      </div>

      {error && (
        <div className="chat-error" role="alert">
          {error}
        </div>
      )}

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          ref={inputRef}
          className="chat-textarea"
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline, as in every chat client.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask a question…"
          aria-label="Message the assistant"
        />
        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={send.isPending || !draft.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}