import { describe, expect, it } from "vitest";
import {
  normalizeWhatsappJid,
  phoneFromWhatsappJid,
  whatsappConversationDedupeKey,
  whatsappJidCandidates,
  whatsappPhoneCandidates,
} from "@/lib/phone";

describe("WhatsApp phone and JID helpers", () => {
  it("uses one dedupe key for the same Brazilian phone with and without the ninth digit", () => {
    expect(whatsappConversationDedupeKey("5511999999999@s.whatsapp.net")).toBe(
      whatsappConversationDedupeKey("551199999999@s.whatsapp.net")
    );
  });

  it("normalizes device-suffixed WhatsApp JIDs into the same contact identity", () => {
    expect(normalizeWhatsappJid("5511999999999:12@s.whatsapp.net")).toBe("5511999999999@s.whatsapp.net");
    expect(whatsappConversationDedupeKey("5511999999999:12@s.whatsapp.net")).toBe(
      whatsappConversationDedupeKey("5511999999999@s.whatsapp.net")
    );
  });

  it("keeps groups isolated from direct phone conversations", () => {
    expect(whatsappConversationDedupeKey("5511999999999@g.us")).not.toBe(
      whatsappConversationDedupeKey("5511999999999@s.whatsapp.net")
    );
    expect(whatsappJidCandidates("5511999999999@g.us")).toEqual(["5511999999999@g.us"]);
    expect(whatsappPhoneCandidates("5511999999999@g.us")).toEqual([]);
  });

  it("keeps @lid contacts isolated from phone candidates", () => {
    expect(phoneFromWhatsappJid("123456789012@lid")).toBe("");
    expect(whatsappJidCandidates("123456789012@lid")).toEqual(["123456789012@lid"]);
    expect(whatsappConversationDedupeKey("123456789012@lid")).not.toBe(
      whatsappConversationDedupeKey("123456789012@s.whatsapp.net")
    );
  });
});
