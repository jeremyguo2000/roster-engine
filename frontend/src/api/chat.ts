import { api } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask the scheduling assistant. Stateless — the full conversation is resent each
 * turn and nothing is stored server-side, so history lives in the component.
 */
export interface ChatReply {
  reply: string;
  /** Which path answered: "anthropic" | "openai" (direct) or "agentops" (governed). */
  provider: string;
  /** AgentOps run id, when the platform answered — look it up in Runs & Traces. */
  run_id: string | null;
}

export const sendChat = (messages: ChatMessage[]) =>
  api.post<ChatReply>("/chat", { messages }).then((r) => r.data);

export interface ChatStatus {
  enabled: boolean;
  provider: string;
  /** Short human label, e.g. "via AgentOps" or "direct · claude-sonnet-5". */
  label: string;
}

/** Whether the assistant is configured on the server, and which path it uses. */
export const chatStatus = () => api.get<ChatStatus>("/chat/status").then((r) => r.data);
