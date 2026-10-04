import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ InternalHttpClient }, credentials, { env }] = await Promise.all([
  import("../src/clients/internal-http-client.js"),
  import("../src/lib/internal-credentials.js"),
  import("../src/config/env.js"),
]);

/**
 * Goal110, prova 3 (lado do BFF) — o BFF apresenta, à IA e ao Scheduling, o
 * token derivado com o rótulo novo (`avenly:internal:v1`), e nada de produção
 * do BFF deriva com o rótulo antigo para apresentar.
 */
const NEW_LABEL = "avenly:internal:v1";
const OLD_LABEL = "atendly:internal:v1";

function derive(
  label: string,
  caller: string,
  audience: string,
  use: string,
): string {
  return createHmac("sha256", ROOT)
    .update(`${label}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

const EXPLICIT = [
  "AI_ORCHESTRATOR_PROVISIONING_TOKEN",
  "AI_ORCHESTRATOR_COMMAND_TOKEN",
  "SCHEDULING_SERVICE_COMMAND_TOKEN",
] as const;
const saved = Object.fromEntries(EXPLICIT.map((key) => [key, env[key]]));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of EXPLICIT) env[key] = saved[key] as string;
});

function presentedAuthorization(
  audience: "ai-orchestrator" | "scheduling-service",
  use: "provisioning" | "command",
): Promise<string | undefined> {
  for (const key of EXPLICIT) env[key] = "";
  let presented: string | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      presented = init?.headers?.authorization;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const client = new InternalHttpClient(`http://${audience}.test`, audience);
  return client
    .request({
      method: "POST",
      path: "/internal/probe",
      context: { tenantId: "tenant-a", userId: "user-a", requestId: "req-1" },
      schema: z.unknown(),
      use,
    })
    .then(() => presented);
}

describe("BFF presents the derived credential with the new label", () => {
  it("derives with the new label", () => {
    expect(
      credentials.deriveInternalToken(
        ROOT,
        "bff",
        "ai-orchestrator",
        "provisioning",
      ),
    ).toEqual(derive(NEW_LABEL, "bff", "ai-orchestrator", "provisioning"));
  });

  it.each([
    ["ai-orchestrator", "provisioning"],
    ["ai-orchestrator", "command"],
    ["scheduling-service", "command"],
  ] as const)("sends the %s/%s credential on the wire with the new label", async (audience, use) => {
    const presented = await presentedAuthorization(audience, use);

    expect(presented).toBe(
      `Bearer ${derive(NEW_LABEL, "bff", audience, use)}`,
    );
    expect(presented).not.toBe(
      `Bearer ${derive(OLD_LABEL, "bff", audience, use)}`,
    );
  });

  it("has no production code in the BFF that derives with the old label", () => {
    const srcRoot = join(import.meta.dirname, "..", "src");
    const offenders: string[] = [];
    for (const entry of readdirSync(srcRoot, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const path = join(entry.parentPath, entry.name);
      const relativePath = relative(srcRoot, path);
      if (relativePath.split(/[\\/]/u).includes("generated")) continue;
      if (readFileSync(path, "utf8").includes(OLD_LABEL)) {
        offenders.push(relativePath);
      }
    }
    expect(offenders).toEqual([]);
  });
});
