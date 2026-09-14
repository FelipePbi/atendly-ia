import { describe, expect, it } from "vitest";

import {
  toMessageAttachmentKind,
  toMessageKind,
} from "../../src/modules/media/media-metadata.js";

describe("media-metadata kind mapping", () => {
  it.each([
    ["text", "TEXT"],
    ["audio", "AUDIO"],
    ["image", "IMAGE"],
    ["document", "DOCUMENT"],
    ["video", "VIDEO"],
    ["sticker", "STICKER"],
    ["unknown", "UNKNOWN"],
  ] as const)("maps channel kind %s to Message.kind %s", (kind, expected) => {
    expect(toMessageKind(kind)).toBe(expected);
  });

  it.each([
    ["audio", "AUDIO"],
    ["image", "IMAGE"],
    ["document", "DOCUMENT"],
    ["video", "VIDEO"],
    ["sticker", "STICKER"],
  ] as const)(
    "maps channel kind %s to MessageAttachment.kind %s",
    (kind, expected) => {
      expect(toMessageAttachmentKind(kind)).toBe(expected);
    },
  );

  it.each(["text", "unknown"] as const)(
    "has no attachment kind for %s",
    (kind) => {
      expect(toMessageAttachmentKind(kind)).toBeNull();
    },
  );
});
