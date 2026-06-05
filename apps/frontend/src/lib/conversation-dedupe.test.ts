import { describe, expect, it } from "vitest";
import { chooseCanonicalConversation, equivalentConversationGroups } from "@/lib/conversation-dedupe";

function conversation(input: {
  id: string;
  contactJid: string;
  lastMessageAt?: Date | null;
  updatedAt?: Date;
  createdAt?: Date;
}) {
  const createdAt = input.createdAt ?? new Date("2026-06-01T12:00:00.000Z");

  return {
    id: input.id,
    contactJid: input.contactJid,
    lastMessageAt: input.lastMessageAt ?? null,
    updatedAt: input.updatedAt ?? createdAt,
    createdAt,
  };
}

describe("conversation dedupe logic", () => {
  it("groups only equivalent contact conversations", () => {
    const groups = equivalentConversationGroups([
      conversation({ id: "with-nine", contactJid: "5511999999999@s.whatsapp.net" }),
      conversation({ id: "without-nine", contactJid: "551199999999@s.whatsapp.net" }),
      conversation({ id: "group", contactJid: "5511999999999@g.us" }),
      conversation({ id: "lid", contactJid: "5511999999999@lid" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.id).sort()).toEqual(["with-nine", "without-nine"]);
  });

  it("chooses the most recently active safe JID as canonical", () => {
    const canonical = chooseCanonicalConversation([
      conversation({
        id: "old",
        contactJid: "5511999999999@s.whatsapp.net",
        lastMessageAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      conversation({
        id: "new",
        contactJid: "551199999999@s.whatsapp.net",
        lastMessageAt: new Date("2026-06-02T12:00:00.000Z"),
      }),
    ]);

    expect(canonical.id).toBe("new");
  });
});
