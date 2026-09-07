import type { FastifyRequest } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";

// `config/env.js` lê process.env uma única vez, na avaliação do módulo. O
// segredo raiz é definido antes do import dinâmico, que acontece uma vez só.
vi.stubEnv("INTERNAL_SERVICE_TOKEN", "root-internal-secret-with-32-chars-min");

const {
  authorizeInternalRequest,
  deriveInternalToken,
  expectedToken,
  SERVICE_AUDIENCE,
} = await import("../../src/lib/internal-credentials.js");

const { requiredScope } = await import("../../src/modules/internal/routes.js");

const ROOT = "root-internal-secret-with-32-chars-min";

function request(input: {
  token?: string;
  audience?: string;
  method?: string;
  url?: string;
}): FastifyRequest {
  return {
    method: input.method ?? "GET",
    url: input.url ?? "/internal/conversations",
    headers: {
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
      ...(input.audience ? { "x-service-audience": input.audience } : {}),
    },
  } as unknown as FastifyRequest;
}

let provisioningToken: string;
let commandToken: string;

beforeAll(() => {
  provisioningToken = expectedToken("provisioning");
  commandToken = expectedToken("command");
});

describe("internal credential derivation", () => {
  it("derives a different credential per caller, audience and use", () => {
    expect(provisioningToken).not.toEqual(commandToken);
    expect(provisioningToken).toEqual(
      deriveInternalToken(ROOT, "bff", SERVICE_AUDIENCE, "provisioning"),
    );
    // Trocar qualquer componente do contrato produz outra credencial.
    expect(provisioningToken).not.toEqual(
      deriveInternalToken(ROOT, "ai-orchestrator", SERVICE_AUDIENCE, "provisioning"),
    );
    expect(commandToken).not.toEqual(
      deriveInternalToken(ROOT, "bff", "scheduling-service", "command"),
    );
  });

  it("never accepts the shared root secret itself", () => {
    expect(provisioningToken).not.toEqual(ROOT);
    expect(commandToken).not.toEqual(ROOT);
    expect(() =>
      authorizeInternalRequest(request({ token: ROOT }), "conversations:read"),
    ).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });
});

describe("internal request authorization", () => {
  it("rejects a request without credentials", () => {
    expect(() =>
      authorizeInternalRequest(request({}), "conversations:read"),
    ).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("rejects an unknown credential", () => {
    expect(() =>
      authorizeInternalRequest(
        request({ token: "not-a-valid-credential" }),
        "conversations:read",
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("accepts the credential issued for the operation", () => {
    expect(
      authorizeInternalRequest(
        request({ token: commandToken }),
        "conversations:read",
      ),
    ).toMatchObject({ use: "command" });
    expect(
      authorizeInternalRequest(
        request({ token: provisioningToken }),
        "channel:provision",
      ),
    ).toMatchObject({ use: "provisioning" });
  });

  it("refuses the provisioning credential on ordinary commands", () => {
    expect(() =>
      authorizeInternalRequest(
        request({ token: provisioningToken }),
        "messages:send",
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("refuses the command credential on provisioning", () => {
    expect(() =>
      authorizeInternalRequest(
        request({ token: commandToken }),
        "channel:provision",
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("refuses a mismatched declared audience", () => {
    expect(() =>
      authorizeInternalRequest(
        request({ token: commandToken, audience: "scheduling-service" }),
        "conversations:read",
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("does not let declared context headers authenticate on their own", () => {
    const declaratory = {
      method: "GET",
      url: "/internal/conversations",
      headers: {
        "x-service-audience": SERVICE_AUDIENCE,
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-a",
      },
    } as unknown as FastifyRequest;

    expect(() =>
      authorizeInternalRequest(declaratory, "conversations:read"),
    ).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });
});

describe("scope routing", () => {
  it("maps every internal operation to the credential that owns it", () => {
    expect(
      requiredScope(
        request({
          method: "PUT",
          url: "/internal/channel-connections/evolution",
        }),
      ),
    ).toBe("channel:provision");
    expect(
      requiredScope(request({ method: "PUT", url: "/internal/ai-tenant-config" })),
    ).toBe("tenant-config:write");
    expect(
      requiredScope(request({ method: "GET", url: "/internal/dashboard" })),
    ).toBe("dashboard:read");
    expect(
      requiredScope(
        request({ method: "GET", url: "/internal/conversations?limit=10" }),
      ),
    ).toBe("conversations:read");
    expect(
      requiredScope(
        request({ method: "POST", url: "/internal/conversations/c1/messages" }),
      ),
    ).toBe("messages:send");
    expect(
      requiredScope(
        request({ method: "POST", url: "/internal/conversations/c1/takeover" }),
      ),
    ).toBe("conversations:write");
  });

  it("denies an internal path with no declared scope, for every credential", () => {
    const unmapped = request({ method: "POST", url: "/internal/anything-new" });
    expect(requiredScope(unmapped)).toBe("internal:unmapped");

    for (const token of [provisioningToken, commandToken]) {
      expect(() =>
        authorizeInternalRequest(request({ token }), "internal:unmapped"),
      ).toThrowError(expect.objectContaining({ statusCode: 403 }));
    }
  });
});
