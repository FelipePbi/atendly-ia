import { whatsappConversationDedupeKey } from "@/lib/phone";

export type ConversationDedupeCandidate = {
  id: string;
  contactJid: string;
  lastMessageAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

export function groupEquivalentConversations<T extends ConversationDedupeCandidate>(
  conversations: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const conversation of conversations) {
    const key = whatsappConversationDedupeKey(conversation.contactJid);
    if (!key) continue;

    const group = groups.get(key);
    if (group) {
      group.push(conversation);
    } else {
      groups.set(key, [conversation]);
    }
  }

  return groups;
}

export function equivalentConversationGroups<T extends ConversationDedupeCandidate>(conversations: T[]): T[][] {
  return [...groupEquivalentConversations(conversations).values()].filter((group) => group.length > 1);
}

export function chooseCanonicalConversation<T extends ConversationDedupeCandidate>(conversations: T[]): T {
  return [...conversations].sort((left, right) => {
    const safeJidDelta = safeJidScore(right.contactJid) - safeJidScore(left.contactJid);
    if (safeJidDelta !== 0) return safeJidDelta;

    const activityDelta = activityTime(right) - activityTime(left);
    if (activityDelta !== 0) return activityDelta;

    return right.createdAt.getTime() - left.createdAt.getTime();
  })[0];
}

export function conversationActivityTime(conversation: ConversationDedupeCandidate): number {
  return activityTime(conversation);
}

function safeJidScore(contactJid: string): number {
  const key = whatsappConversationDedupeKey(contactJid);
  if (key.startsWith("phone:") || key.startsWith("group:") || key.startsWith("lid:")) return 1;
  return 0;
}

function activityTime(conversation: ConversationDedupeCandidate): number {
  return (conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt).getTime();
}
