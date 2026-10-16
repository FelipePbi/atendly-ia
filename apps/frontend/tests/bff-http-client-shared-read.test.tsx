// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BffHttpClient, BffHttpError } from "../src/data/http/BffHttpClient";

/**
 * Leitura compartilhada do adapter HTTP.
 *
 * O caso que motivou: a cada reload em `next dev`, o StrictMode monta, desmonta
 * e remonta cada efeito. A desmontagem abortava a primeira leitura e a
 * remontagem disparava outra igual — o DevTools mostrava cada uma em vermelho
 * (`net::ERR_ABORTED`) seguida da mesma requisição com sucesso.
 */
const BASE_URL = "https://bff.example.invalid";
const schema = z.object({ ok: z.boolean() });

interface Call {
  method: string;
  url: string;
  signal: AbortSignal | null | undefined;
  respond: () => void;
}

/** `fetch` que só responde quando o teste manda — a leitura fica em voo. */
function heldFetch() {
  const calls: Call[] = [];
  const implementation: typeof fetch = (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
      calls.push({
        method: init?.method ?? "GET",
        url: input instanceof Request ? input.url : input.toString(),
        signal,
        respond: () =>
          resolve(
            new Response(
              JSON.stringify({ data: { ok: true }, requestId: "request-1" }),
              { headers: { "content-type": "application/json" } },
            ),
          ),
      });
    });
  return { calls, implementation };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function client(implementation: typeof fetch) {
  return new BffHttpClient({
    baseUrl: BASE_URL,
    fetchImplementation: implementation,
  });
}

describe("BffHttpClient shared reads", () => {
  it("survives a StrictMode remount: one request, never aborted", async () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);
    let renders = 0;

    function Reader() {
      const [state, setState] = useState("loading");
      useEffect(() => {
        renders += 1;
        const controller = new AbortController();
        http
          .request({
            path: "/v1/settings",
            schema,
            signal: controller.signal,
          })
          .then(() => setState("ready"))
          .catch((error: unknown) => {
            if (!controller.signal.aborted) setState(String(error));
          });
        return () => controller.abort();
      }, []);
      return <p>{state}</p>;
    }

    render(
      <StrictMode>
        <Reader />
      </StrictMode>,
    );
    await tick();

    // O efeito rodou duas vezes (montar, desmontar, remontar)...
    expect(renders).toBe(2);
    // ...mas só uma requisição saiu, e ela continua viva.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal?.aborted).toBe(false);

    calls[0]?.respond();
    expect(await screen.findByText("ready")).toBeVisible();
  });

  it("does not start a request for a caller that already gave up", async () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);
    const controller = new AbortController();
    controller.abort();

    await expect(
      http.request({ path: "/v1/status", schema, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "REQUEST_ABORTED", status: 0 });
    expect(calls).toHaveLength(0);
  });

  it("cancels the network request once every caller left", async () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);
    const first = new AbortController();
    const second = new AbortController();

    const reads = [
      http.request({ path: "/v1/status", schema, signal: first.signal }),
      http.request({ path: "/v1/status", schema, signal: second.signal }),
    ].map((read) =>
      read.then(
        () => null,
        (error: unknown) => error,
      ),
    );
    expect(calls).toHaveLength(1);

    first.abort();
    await tick();
    expect(calls[0]?.signal?.aborted).toBe(false);

    second.abort();
    await tick();
    expect(calls[0]?.signal?.aborted).toBe(true);
    for (const error of await Promise.all(reads)) {
      expect(error).toBeInstanceOf(BffHttpError);
      expect(error).toMatchObject({ code: "REQUEST_ABORTED" });
    }

    // A próxima leitura não herda a cancelada.
    const next = http.request({ path: "/v1/status", schema });
    expect(calls).toHaveLength(2);
    calls[1]?.respond();
    await expect(next).resolves.toEqual({ ok: true });
  });

  it("only shares a read while it is in flight", async () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);

    const first = http.request({ path: "/v1/summary", schema });
    const second = http.request({ path: "/v1/summary", schema });
    expect(calls).toHaveLength(1);
    calls[0]?.respond();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);

    const later = http.request({ path: "/v1/summary", schema });
    expect(calls).toHaveLength(2);
    calls[1]?.respond();
    await later;
  });

  it("starts a new read after a mutation instead of reusing an older one", async () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);

    const before = http.request({ path: "/v1/settings", schema });
    const mutation = http.request({
      method: "PATCH",
      path: "/v1/settings",
      body: { tone: "BALANCED" },
      schema,
    });
    const after = http.request({ path: "/v1/settings", schema });

    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH", "GET"]);
    for (const call of calls) call.respond();
    await Promise.all([before, mutation, after]);
  });

  it("keeps different queries apart", () => {
    const { calls, implementation } = heldFetch();
    const http = client(implementation);

    void http.request({ path: "/v1/calendar", query: { day: 1 }, schema });
    void http.request({ path: "/v1/calendar", query: { day: 2 }, schema });
    expect(calls).toHaveLength(2);
  });
});
