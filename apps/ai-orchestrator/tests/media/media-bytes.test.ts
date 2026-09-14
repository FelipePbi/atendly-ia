import { describe, expect, it } from "vitest";

import {
  decodeBase64Media,
  readInlineMediaBase64,
  readMediaProto,
} from "../../src/modules/media/media-bytes.js";

const audio = Buffer.from("bytes-de-audio");

function payload(message: Record<string, unknown>) {
  return { event: "messages.upsert", data: { Info: {}, Message: message } };
}

describe("bytes da midia no payload do provedor", () => {
  it("le o base64 embutido do evento em processamento", () => {
    const raw = payload({
      audioMessage: { mimetype: "audio/ogg" },
      base64: audio.toString("base64"),
    });

    expect(readInlineMediaBase64(raw)).toBe(audio.toString("base64"));
  });

  it("nao inventa bytes quando o payload nao trouxe base64", () => {
    expect(
      readInlineMediaBase64(
        payload({ audioMessage: { mimetype: "audio/ogg" } }),
      ),
    ).toBeUndefined();
    expect(readInlineMediaBase64({ data: {} })).toBeUndefined();
    expect(readInlineMediaBase64(undefined)).toBeUndefined();
  });

  it("devolve o proto da midia para o download sob demanda, sem os bytes", () => {
    const proto = readMediaProto(
      payload({
        audioMessage: { mimetype: "audio/ogg", mediaKey: "chave" },
        base64: audio.toString("base64"),
        mediaUrl: "http://minio/audio.ogg",
      }),
    );

    // O download precisa da chave do proto, nunca dos bytes: mandar o base64
    // de volta ao Go so inflaria o corpo de uma requisicao que existe
    // justamente porque os bytes nao estao aqui.
    expect(proto).toMatchObject({
      audioMessage: { mimetype: "audio/ogg", mediaKey: "chave" },
      mediaUrl: "http://minio/audio.ogg",
    });
    expect(proto).not.toHaveProperty("base64");
  });

  it("nao devolve proto para payload sem chave de midia", () => {
    expect(readMediaProto(payload({ conversation: "oi" }))).toBeUndefined();
  });

  it("decodifica base64 puro e data URL (formato que o Go devolve no download)", () => {
    const plain = decodeBase64Media(audio.toString("base64"));
    const dataUrl = decodeBase64Media(
      `data:audio/ogg;codecs=opus;base64,${audio.toString("base64")}`,
    );

    expect(Buffer.from(plain?.data ?? new Uint8Array()).toString()).toBe(
      "bytes-de-audio",
    );
    expect(Buffer.from(dataUrl?.data ?? new Uint8Array()).toString()).toBe(
      "bytes-de-audio",
    );
    expect(dataUrl?.mimetype).toBe("audio/ogg");
  });

  it("recusa conteudo vazio e data URL que nao e base64", () => {
    expect(decodeBase64Media("")).toBeNull();
    expect(decodeBase64Media("data:text/plain,oi")).toBeNull();
  });
});
