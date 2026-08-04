import { api } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask the scheduling assistant. Stateless — the full conversation is resent each
 * turn and nothing is stored server-side, so history lives in the component.
 */
export const sendChat = (messages: ChatMessage[]) =>
  api.post<{ reply: string }>("/chat", { messages }).then((r) => r.data);

/** Whether the assistant is configured on the server (ANTHROPIC_API_KEY set). */
export const chatStatus = () =>
  api.get<{ enabled: boolean }>("/chat/status").then((r) => r.data);
