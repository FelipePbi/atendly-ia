/**
 * Mídia do chat guardada na aba (2026-10-16).
 *
 * Imagem e figurinha passaram a aparecer sozinhas, e cada busca é uma ida ao
 * WhatsApp. O que este arquivo prova:
 *
 * - voltar a uma mídia já baixada não busca de novo;
 * - duas telas pedindo a mesma mídia esperam a mesma busca;
 * - no máximo três buscas correm ao mesmo tempo, e quem sai da fila antes da
 *   vez não chega a buscar;
 * - busca de imagem que já começou termina e fica guardada mesmo depois de
 *   cancelada (troca de conversa), e a próxima tela reaproveita;
 * - trocar de sessão esvazia tudo.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getMedia = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ conversations: { getMedia } }),
}));

const { clearMediaCache, loadMedia, peekMedia } = await import(
  "@/features/conversations/mediaCache"
);
const { claimSessionMemory } = await import("@/shared/runtime/sessionMemory");

function bytes() {
  return {
    blob: new Blob(["x"], { type: "image/webp" }),
    contentType: "image/webp",
    fileName: null,
  };
}

function deferred() {
  let resolve!: (value: ReturnType<typeof bytes>) => void;
  const promise = new Promise<ReturnType<typeof bytes>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let urls = 0;
const revokeObjectURL = vi.fn();

beforeEach(() => {
  getMedia.mockReset();
  revokeObjectURL.mockReset();
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:media-${++urls}`);
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => clearMediaCache());

describe("mediaCache", () => {
  test("voltar à mesma mídia não busca de novo", async () => {
    getMedia.mockResolvedValue(bytes());

    const first = await loadMedia("c1", "m1");
    const again = await loadMedia("c1", "m1");

    expect(getMedia).toHaveBeenCalledTimes(1);
    expect(again.url).toBe(first.url);
    expect(peekMedia("c1", "m1")?.url).toBe(first.url);
  });

  test("dois pedidos da mesma mídia esperam a mesma busca", async () => {
    const pending = deferred();
    getMedia.mockReturnValue(pending.promise);

    const a = loadMedia("c1", "m1");
    const b = loadMedia("c1", "m1");
    pending.resolve(bytes());

    expect((await a).url).toBe((await b).url);
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  test("no máximo três buscas ao mesmo tempo; quem sai da fila não busca", async () => {
    const calls: Array<ReturnType<typeof deferred>> = [];
    getMedia.mockImplementation(() => {
      const next = deferred();
      calls.push(next);
      return next.promise;
    });
    const leaving = new AbortController();

    const loads = ["m1", "m2", "m3", "m4"].map((id) => loadMedia("c1", id));
    const gone = loadMedia("c1", "m5", { signal: leaving.signal });
    await Promise.resolve();

    expect(getMedia).toHaveBeenCalledTimes(3);
    leaving.abort();
    await expect(gone).rejects.toMatchObject({ name: "AbortError" });

    calls[0].resolve(bytes());
    await loads[0];
    await vi.waitFor(() => expect(getMedia).toHaveBeenCalledTimes(4));
    expect(getMedia.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    for (const call of calls.slice(1)) call.resolve(bytes());
    await Promise.all(loads);
  });

  test("busca de imagem já começada termina guardada, mesmo cancelada", async () => {
    const pending = deferred();
    getMedia.mockReturnValue(pending.promise);
    const screen = new AbortController();

    const first = loadMedia("c1", "m1", {
      keepRunning: true,
      signal: screen.signal,
    });
    await Promise.resolve();
    screen.abort();
    // A tela seguinte pede a mesma imagem antes de a busca voltar.
    const second = loadMedia("c1", "m1", { keepRunning: true });
    pending.resolve(bytes());

    expect((await second).url).toBe((await first).url);
    expect(getMedia).toHaveBeenCalledTimes(1);
    expect(getMedia.mock.calls[0][2]).toBeUndefined();
  });

  test("trocar de sessão esvazia a mídia guardada", async () => {
    getMedia.mockResolvedValue(bytes());
    const first = await loadMedia("c1", "m1");

    claimSessionMemory("outra-conta");

    expect(peekMedia("c1", "m1")).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith(first.url);
  });
});
