/**
 * Download sob demanda da midia no Evolution Go (Goal013/WU-03).
 *
 * Nenhum teste fala com o Go real: `fetch` e dublado. O que importa aqui e a
 * credencial — a rota do Go esta sob autenticacao de instancia, e cair para a
 * chave global significaria baixar midia na conta errada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const audioBytes = Buffer.from("bytes-de-audio");
const proto = {
  audioMessage: { mimetype: "audio/ogg; codecs=opus", mediaKey: "chave" },
};

describe("EvolutionProvider.downloadMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("baixa com a credencial da instancia e devolve o data URL do Go", async () => {
    vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution-go:8080/");
    vi.stubEnv("EVOLUTION_API_KEY", "global-key");
    vi.stubEnv("EVOLUTION_DOWNLOAD_MEDIA_PATH", "/message/downloadmedia");
    vi.resetModules();

    const dataUrl = `data:audio/ogg;base64,${audioBytes.toString("base64")}`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "success",
          data: { base64: dataUrl, timestamp: "2026-09-13T12:00:00Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { EvolutionProvider } =
      await import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js");
    const result = await new EvolutionProvider(
      undefined,
      "instance-token",
      "instance-1",
    ).downloadMedia({ message: proto, requestId: "request-1" });

    expect(result).toEqual({ provider: "evolution-go", base64: dataUrl });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution-go:8080/message/downloadmedia",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          // A chave global existe no ambiente e nao e usada: e a credencial da
          // instancia que autoriza o download.
          apikey: "instance-token",
          instanceId: "instance-1",
          "x-request-id": "request-1",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: proto,
    });
  });

  it("recusa baixar sem a credencial da instancia, sem cair para a chave global", async () => {
    vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution-go:8080");
    vi.stubEnv("EVOLUTION_API_KEY", "global-key");
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { EvolutionProvider } =
      await import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js");

    await expect(
      new EvolutionProvider(undefined, undefined, "instance-1").downloadMedia({
        message: proto,
      }),
    ).rejects.toMatchObject({ code: "EVOLUTION_CHANNEL_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro HTTP do Go vira falha com codigo proprio, nao data URL vazia", async () => {
    vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution-go:8080");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid media type" }), {
          status: 500,
        }),
      ),
    );

    const { EvolutionProvider } =
      await import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js");

    await expect(
      new EvolutionProvider(
        undefined,
        "instance-token",
        "instance-1",
      ).downloadMedia({ message: proto }),
    ).rejects.toMatchObject({ code: "EVOLUTION_DOWNLOAD_MEDIA_FAILED" });
  });

  it("resposta sem conteudo vira falha, nao transcricao de nada", async () => {
    vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution-go:8080");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "success", data: {} }), {
          status: 200,
        }),
      ),
    );

    const { EvolutionProvider } =
      await import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js");

    await expect(
      new EvolutionProvider(
        undefined,
        "instance-token",
        "instance-1",
      ).downloadMedia({ message: proto }),
    ).rejects.toMatchObject({ code: "EVOLUTION_DOWNLOAD_MEDIA_EMPTY" });
  });
});
