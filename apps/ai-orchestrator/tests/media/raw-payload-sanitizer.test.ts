import { describe, expect, it } from "vitest";

import { stripMediaBase64 } from "../../src/modules/media/raw-payload-sanitizer.js";

describe("stripMediaBase64", () => {
  it("removes data.Message.base64 and keeps the other proto fields", () => {
    const payload = {
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: { ID: "msg-1" },
        Message: {
          audioMessage: {
            mimetype: "audio/ogg",
            fileSHA256: "aGVsbG8=",
            mediaKey: "a2V5",
            directPath: "/v/t62.7117-24/abc",
            url: "https://mmg.whatsapp.net/abc",
          },
          base64: "d2hhdHNhcHAtYXVkaW8=",
        },
      },
    };

    const sanitized = stripMediaBase64(payload) as typeof payload;

    expect(sanitized.data.Message).not.toHaveProperty("base64");
    expect(sanitized.data.Message.audioMessage).toEqual(
      payload.data.Message.audioMessage,
    );
    expect(sanitized.data.Info).toEqual(payload.data.Info);
    // Imutavel: o payload original nao e alterado.
    expect(payload.data.Message).toHaveProperty("base64");
  });

  it("returns the payload unchanged when there is no base64 to strip", () => {
    const payload = {
      event: "Message",
      data: { Info: { ID: "msg-1" }, Message: { conversation: "Oi" } },
    };

    expect(stripMediaBase64(payload)).toEqual(payload);
  });

  it("is a no-op for payloads that are not the expected shape", () => {
    expect(stripMediaBase64(null)).toBeNull();
    expect(stripMediaBase64("raw-string")).toBe("raw-string");
    expect(stripMediaBase64({ event: "Presence" })).toEqual({
      event: "Presence",
    });
  });
});
