import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findPublicApiRoute,
  ignoredContactEntrySchema,
  ignoredContactListSchema,
  ignoredContactSchema,
} from "@avenly-ia/public-api-contract";

/**
 * Goal139/WU-02 — a lista dos contatos ignorados com a origem de cada
 * marcação, no contrato e no BFF. Sem PostgreSQL e sem sessão real: o tenant é
 * um dublê de módulo e a IA é um `fetch` dublê (como em
 * `goal074-dashboard-week.test.ts`). Prova: o contrato encontra a rota nova e
 * recusa `origin` fora do enum; a rota estática convive com
 * `GET /v1/conversations/:id`; `origin` é repassado nas duas escritas e fica
 * ausente quando não vem; `origin` fora do enum dá `400` antes da IA; e a
 * resposta da leitura passa pelo contrato.
 */

const ROOT = "root-internal-secret-with-32-chars-min-139";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: async (request: FastifyRequest) => {
    request.tenantContext = {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "OWNER",
    };
  },
  currentTenantContext: (request: FastifyRequest) => request.tenantContext,
}));

vi.mock("../src/modules/whatsapp/instance-link.js", () => ({
  findLinkedInstance: async () => null,
}));

const { registerV1ConversationRoutes } = await import(
  "../src/modules/conversations/routes.js"
);
const { registerResponseContractCheck } = await import(
  "../src/lib/response-contract.js"
);

interface UpstreamCall {
  method: string;
  path: string;
  search: string;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];

const listPayload = {
  items: [
    {
      contactId: "contact-1",
      externalContactId: "5511999990001",
      displayName: "Maria",
      ignoredAt: "2026-09-18T12:00:00.000Z",
      origin: "ONBOARDING",
    },
    {
      contactId: "contact-2",
      externalContactId: "5511999990002",
      displayName: null,
      ignoredAt: null,
      origin: null,
    },
  ],
  total: 2,
  // A IA devolve a janela; o contrato público não a declara.
  limit: 100,
  offset: 0,
};

const conversationPayload = {
  id: "conv-1",
  externalContactId: "5511999990001",
  customerName: "Maria",
  status: "ACTIVE",
  humanHandoff: false,
  handoffReason: null,
  lastMessage: null,
  unreadCount: 0,
  updatedAt: "2026-09-18T12:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText = request.method === "GET" ? null : await request.text();
      upstream.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        body: bodyText
          ? (JSON.parse(bodyText) as Record<string, unknown>)
          : null,
      });
      if (url.pathname === "/internal/contacts/ignored") {
        return jsonResponse({ data: listPayload, requestId: "up-list" });
      }
      if (url.pathname === "/internal/contacts/ignore") {
        return jsonResponse({
          data: {
            contactId: "contact-1",
            externalContactId: "5511999990001",
            ignored: true,
            ignoredAt: "2026-09-18T12:00:00.000Z",
          },
          requestId: "up-phone",
        });
      }
      return jsonResponse({ data: conversationPayload, requestId: "up-conv" });
    }),
  );
}

let app: FastifyInstance;

beforeEach(async () => {
  upstream.length = 0;
  stubUpstream();
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1ConversationRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("Goal139/WU-02: contrato da lista dos contatos ignorados", () => {
  it("findPublicApiRoute encontra GET /v1/conversations/ignored-contacts com o schema da lista", () => {
    const route = findPublicApiRoute("GET", "/v1/conversations/ignored-contacts");
    expect(route?.schema).toBe(ignoredContactListSchema);
  });

  it("a rota PUT por telefone continua com ignoredContactSchema", () => {
    expect(
      findPublicApiRoute("PUT", "/v1/conversations/ignored-contacts")?.schema,
    ).toBe(ignoredContactSchema);
  });

  it("aceita item com displayName, ignoredAt e origin nulos", () => {
    const parsed = ignoredContactListSchema.parse({
      items: [
        {
          contactId: "c1",
          externalContactId: "5511999990001",
          displayName: null,
          ignoredAt: null,
          origin: null,
        },
      ],
      total: 1,
    });
    expect(parsed.items[0]).toMatchObject({
      displayName: null,
      ignoredAt: null,
      origin: null,
    });
  });

  it("aceita as três origens e recusa origin fora do enum", () => {
    const item = {
      contactId: "c1",
      externalContactId: "5511999990001",
      displayName: "Maria",
      ignoredAt: "2026-09-18T12:00:00.000Z",
    };
    for (const origin of ["ONBOARDING", "CONVERSATION", "SETTINGS"]) {
      expect(
        ignoredContactEntrySchema.safeParse({ ...item, origin }).success,
      ).toBe(true);
    }
    for (const origin of ["panel", "onboarding", "IMPORT", "", 3]) {
      expect(
        ignoredContactEntrySchema.safeParse({ ...item, origin }).success,
      ).toBe(false);
    }
    expect(ignoredContactEntrySchema.safeParse(item).success).toBe(false);
  });

  it("recusa ignoredAt que não é instante e total negativo", () => {
    const item = {
      contactId: "c1",
      externalContactId: "5511999990001",
      displayName: null,
      origin: null,
    };
    expect(
      ignoredContactEntrySchema.safeParse({ ...item, ignoredAt: "ontem" })
        .success,
    ).toBe(false);
    expect(
      ignoredContactListSchema.safeParse({ items: [], total: -1 }).success,
    ).toBe(false);
  });
});

describe("Goal139/WU-02: GET /v1/conversations/ignored-contacts", () => {
  it("lê da IA, repassa limit e offset e devolve só items e total, validados pelo contrato", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/ignored-contacts?limit=50&offset=10",
    });

    expect(response.statusCode).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]?.method).toBe("GET");
    expect(upstream[0]?.path).toBe("/internal/contacts/ignored");
    expect(new URLSearchParams(upstream[0]?.search).get("limit")).toBe("50");
    expect(new URLSearchParams(upstream[0]?.search).get("offset")).toBe("10");

    const { data } = response.json();
    expect(Object.keys(data).sort()).toEqual(["items", "total"]);
    expect(() => ignoredContactListSchema.parse(data)).not.toThrow();
    expect(data.items).toEqual(listPayload.items);
    expect(data.total).toBe(2);
  });

  it("sem consulta, não manda limit nem offset: o padrão é da IA", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/ignored-contacts",
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]?.search).toBe("");
  });

  it("recusa limit fora de 1 a 200 e offset negativo com 400, sem chamar a IA", async () => {
    for (const query of ["limit=0", "limit=201", "offset=-1", "limit=abc"]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/conversations/ignored-contacts?${query}`,
      });
      expect(response.statusCode, query).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });

  it("a rota estática não esconde GET /v1/conversations/:id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conv-1",
    });
    expect(response.statusCode).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]?.path).toBe("/internal/conversations/conv-1");
    expect(response.json().data.id).toBe("conv-1");
  });

  it("resposta da IA fora do formato não chega ao cliente como lista válida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            items: [
              {
                contactId: "contact-1",
                externalContactId: "5511999990001",
                displayName: "Maria",
                ignoredAt: null,
                origin: "panel",
              },
            ],
            total: 1,
          },
          requestId: "up-bad",
        }),
      ),
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/ignored-contacts",
    });
    expect(response.statusCode).not.toBe(200);
  });
});

describe("Goal139/WU-02: origin nas duas escritas", () => {
  it("PUT /:id/ignore repassa origin quando vem", async () => {
    for (const origin of ["ONBOARDING", "CONVERSATION"]) {
      upstream.length = 0;
      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/conv-1/ignore",
        payload: { ignored: true, origin },
      });
      expect(response.statusCode, origin).toBe(200);
      expect(upstream[0]?.path).toBe("/internal/conversations/conv-1/ignore");
      expect(upstream[0]?.body).toEqual({ ignored: true, origin });
    }
  });

  it("PUT /:id/ignore sem origin manda o mesmo corpo de antes", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/ignore",
      payload: { ignored: false },
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]?.body).toEqual({ ignored: false });
    expect(upstream[0]?.body).not.toHaveProperty("origin");
  });

  it("PUT /:id/ignore recusa origin fora do enum com 400, antes da IA", async () => {
    for (const origin of ["SETTINGS", "panel", "", null, 1]) {
      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/conv-1/ignore",
        payload: { ignored: true, origin },
      });
      expect(response.statusCode, String(origin)).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });

  it("PUT /ignored-contacts repassa origin quando vem", async () => {
    for (const origin of ["ONBOARDING", "SETTINGS"]) {
      upstream.length = 0;
      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        payload: { phone: "11999990001", ignored: true, origin },
      });
      expect(response.statusCode, origin).toBe(200);
      expect(upstream[0]?.path).toBe("/internal/contacts/ignore");
      expect(upstream[0]?.body).toEqual({
        phone: "11999990001",
        ignored: true,
        origin,
      });
    }
  });

  it("PUT /ignored-contacts sem origin manda o mesmo corpo de antes", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/conversations/ignored-contacts",
      payload: { phone: "11999990001", ignored: false },
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]?.body).toEqual({
      phone: "11999990001",
      ignored: false,
    });
    expect(upstream[0]?.body).not.toHaveProperty("origin");
  });

  it("PUT /ignored-contacts recusa origin fora do enum com 400, antes da IA", async () => {
    for (const origin of ["CONVERSATION", "onboarding", "", null]) {
      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        payload: { phone: "11999990001", ignored: true, origin },
      });
      expect(response.statusCode, String(origin)).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });
});
