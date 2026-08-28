import type {
  ConversationService,
  ConversationState,
} from "@/features/conversations/types";
import { mockConversations } from "@/mocks/data/conversations";

export class MockConversationService implements ConversationService {
  private conversations = structuredClone(mockConversations);
  async list() {
    return Promise.resolve(this.conversations);
  }
  async setState(id: string, state: ConversationState) {
    this.conversations = this.conversations.map((item) =>
      item.id === id ? { ...item, state } : item,
    );
    return Promise.resolve();
  }
}
