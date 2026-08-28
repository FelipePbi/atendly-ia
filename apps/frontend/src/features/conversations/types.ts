export type ConversationState =
  "ai" | "human" | "paused" | "waiting" | "resolved" | "error";
export type ConversationsScenario =
  "list" | "empty" | "loading" | "error" | "detail-error" | ConversationState;

export interface ConversationSummary {
  id: string;
  name: string;
  initials: string;
  preview: string;
  time: string;
  state: ConversationState;
  unread: number;
}

export interface ConversationService {
  list(): Promise<ConversationSummary[]>;
  setState(id: string, state: ConversationState): Promise<void>;
}
