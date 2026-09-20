import assert from "node:assert/strict";
import test from "node:test";

import {
  findDevelopmentDefaultViolations,
  findEnvExampleParityMismatches,
  findMissingBuildPaths,
  findMissingExplicitLoopFlags,
  findMissingRequiredEnvKeys,
  parseEnvExampleKeys,
  parseEnvSchemaKeys,
  parseRenderServices,
} from "../final-production-audit.mjs";

const BFF_ENV_SOURCE = `
const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  DATABASE_URL: stringEnv(),
  FRONTEND_ORIGIN: stringEnv("http://localhost:3001"),
  COOKIE_SECURE: boolEnv(false),
  INTERNAL_SERVICE_TOKEN: serviceTokenEnv(),
  AI_ORCHESTRATOR_PROVISIONING_TOKEN: serviceTokenEnv(),
  PASSWORD_RESET_DELIVERY_TOKEN: stringEnv(),
});
`;

const AI_ENV_SOURCE = `
const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://localhost:3003"),
  INBOX_WORKER_ENABLED: boolEnv(true),
  NOTIFICATION_DELIVERY_ENABLED: boolEnv(true),
});
`;

const SCHEDULING_ENV_SOURCE = `
const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  CALENDAR_AUTO_COMPLETE_ENABLED: boolEnv(true),
});
`;

function renderYaml({
  bffNodeEnv = "  - key: NODE_ENV\n        value: production\n",
  bffFrontendOrigin = "https://atendly-ia-frontend.onrender.com",
  bffPasswordResetDeliveryToken = "",
  bffPasswordResetPublicUrl = "",
  bffCookieSecure = "true",
  bffRetentionFlag = "      - key: RETENTION_SWEEP_ENABLED\n        value: false\n",
  bffAccountPurgeFlag = "      - key: ACCOUNT_PURGE_ENABLED\n        value: false\n",
  aiScheduling = "https://atendly-ia-scheduling-service.onrender.com",
  aiInboxFlag = "      - key: INBOX_WORKER_ENABLED\n        value: true\n",
  aiNotificationFlag = "      - key: NOTIFICATION_DELIVERY_ENABLED\n        value: true\n",
  aiNodeEnv = "production",
  schedulingCalendarFlag = "      - key: CALENDAR_AUTO_COMPLETE_ENABLED\n        value: true\n",
  schedulingNodeEnv = "production",
} = {}) {
  return `services:
  - type: web
    name: atendly-ia-bff
    rootDir: apps/bff
    buildFilter:
      paths:
        - apps/bff/**
        - packages/**
        - render.yaml
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: FRONTEND_ORIGIN
        value: ${bffFrontendOrigin}
      - key: COOKIE_SECURE
        value: ${bffCookieSecure}
${bffNodeEnv}      - key: INTERNAL_SERVICE_TOKEN
        sync: false
${bffPasswordResetDeliveryToken}${bffPasswordResetPublicUrl}${bffRetentionFlag}${bffAccountPurgeFlag}
  - type: web
    name: atendly-ia-ai-orchestrator
    rootDir: apps/ai-orchestrator
    buildFilter:
      paths:
        - apps/ai-orchestrator/**
    envVars:
      - key: NODE_ENV
        value: ${aiNodeEnv}
      - key: SCHEDULING_SERVICE_BASE_URL
        value: ${aiScheduling}
${aiInboxFlag}${aiNotificationFlag}
  - type: web
    name: atendly-ia-scheduling-service
    rootDir: apps/scheduling-service
    buildFilter:
      paths:
        - apps/scheduling-service/**
    envVars:
      - key: NODE_ENV
        value: ${schedulingNodeEnv}
${schedulingCalendarFlag}
databases:
  - name: atendly-ia-scheduling-db
`;
}

test("parseEnvSchemaKeys: classifies stringEnv()/serviceTokenEnv() as required and captures string defaults", () => {
  const keys = parseEnvSchemaKeys(BFF_ENV_SOURCE);
  const byName = Object.fromEntries(keys.map((key) => [key.name, key]));
  assert.equal(byName.DATABASE_URL.required, true);
  assert.equal(byName.INTERNAL_SERVICE_TOKEN.required, true);
  assert.equal(byName.NODE_ENV.required, false);
  assert.equal(byName.NODE_ENV.defaultValue, "development");
  assert.equal(byName.FRONTEND_ORIGIN.defaultValue, "http://localhost:3001");
});

test("parseEnvExampleKeys: extracts KEY= assignments only", () => {
  const example = "NODE_ENV=development\n# comment\nDATABASE_URL=postgres://x\n";
  assert.deepEqual(parseEnvExampleKeys(example), ["NODE_ENV", "DATABASE_URL"]);
});

test("parseRenderServices: reads rootDir, buildFilter paths and envVars per service", () => {
  const services = parseRenderServices(renderYaml());
  const bff = services.find((entry) => entry.name === "atendly-ia-bff");
  assert.equal(bff.rootDir, "apps/bff");
  assert.deepEqual(bff.buildFilterPaths, [
    "apps/bff/**",
    "packages/**",
    "render.yaml",
  ]);
  assert.ok(bff.envVars.some((entry) => entry.key === "DATABASE_URL"));
});

test("production_config_render_env_coverage: passes when every required key is declared or HMAC-derived", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    renderYaml({
      bffPasswordResetDeliveryToken:
        "      - key: PASSWORD_RESET_DELIVERY_TOKEN\n        sync: false\n",
    }),
    "atendly-ia-bff",
  );
  assert.deepEqual(missing, []);
});

test("production_config_render_env_coverage: fails when a required key with no safe default is missing from render.yaml", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    renderYaml({ bffPasswordResetDeliveryToken: "" }),
    "atendly-ia-bff",
  );
  assert.deepEqual(missing, ["PASSWORD_RESET_DELIVERY_TOKEN"]);
});

test("production_config_render_env_coverage: does not reprove an HMAC-derived token that is legitimately absent", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    renderYaml({
      bffPasswordResetDeliveryToken:
        "      - key: PASSWORD_RESET_DELIVERY_TOKEN\n        sync: false\n",
    }),
    "atendly-ia-bff",
  );
  assert.ok(!missing.includes("AI_ORCHESTRATOR_PROVISIONING_TOKEN"));
});

test("production_config_loop_flags_explicit: passes when all five flags have an explicit value", () => {
  assert.deepEqual(findMissingExplicitLoopFlags(renderYaml()), []);
});

test("production_config_loop_flags_explicit: fails when a flag is removed from render.yaml", () => {
  const missing = findMissingExplicitLoopFlags(
    renderYaml({ bffRetentionFlag: "" }),
  );
  assert.deepEqual(missing, ["RETENTION_SWEEP_ENABLED"]);
});

test("production_config_loop_flags_explicit: fails when a flag is declared without an explicit value", () => {
  const missing = findMissingExplicitLoopFlags(
    renderYaml({
      aiInboxFlag: "      - key: INBOX_WORKER_ENABLED\n        sync: false\n",
    }),
  );
  assert.deepEqual(missing, ["INBOX_WORKER_ENABLED"]);
});

test("production_config_no_development_defaults: passes on a fully production-shaped render.yaml", () => {
  const violations = findDevelopmentDefaultViolations(renderYaml(), {
    "atendly-ia-bff": BFF_ENV_SOURCE,
    "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
    "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
  });
  assert.deepEqual(violations, []);
});

test("production_config_no_development_defaults: fails when a declared *_BASE_URL points at localhost", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({ aiScheduling: "http://localhost:3003" }),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.ok(
    violations.some((entry) =>
      entry.includes("atendly-ia-ai-orchestrator:SCHEDULING_SERVICE_BASE_URL"),
    ),
  );
});

test("production_config_no_development_defaults: fails when an undeclared URL falls back to its localhost default", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({ bffFrontendOrigin: "" }).replace(
      "      - key: FRONTEND_ORIGIN\n        value: \n",
      "",
    ),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.ok(
    violations.some((entry) =>
      entry.includes("atendly-ia-bff:FRONTEND_ORIGIN"),
    ),
  );
});

test("production_config_no_development_defaults: fails when NODE_ENV is missing for a service", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({ bffNodeEnv: "" }),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.deepEqual(
    violations,
    ["atendly-ia-bff:NODE_ENV is not declared as production"],
  );
});

test("production_config_no_development_defaults: fails when COOKIE_SECURE is not true", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({ bffCookieSecure: "false" }),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.deepEqual(
    violations,
    ["atendly-ia-bff:COOKIE_SECURE is not declared as true"],
  );
});

test("production_config_no_development_defaults: fails when a secret-like key has a literal value", () => {
  const withLiteralSecret = renderYaml().replace(
    "      - key: INTERNAL_SERVICE_TOKEN\n        sync: false\n",
    "      - key: INTERNAL_SERVICE_TOKEN\n        value: hunter2\n",
  );
  const violations = findDevelopmentDefaultViolations(withLiteralSecret, {
    "atendly-ia-bff": BFF_ENV_SOURCE,
    "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
    "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
  });
  assert.ok(
    violations.some((entry) =>
      entry.includes(
        "atendly-ia-bff:INTERNAL_SERVICE_TOKEN declares a literal secret value",
      ),
    ),
  );
});

const BFF_ENV_SOURCE_WITH_PUBLIC_URL = `
const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  DATABASE_URL: stringEnv(),
  FRONTEND_ORIGIN: stringEnv("http://localhost:3001"),
  COOKIE_SECURE: boolEnv(false),
  INTERNAL_SERVICE_TOKEN: serviceTokenEnv(),
  AI_ORCHESTRATOR_PROVISIONING_TOKEN: serviceTokenEnv(),
  PASSWORD_RESET_DELIVERY_TOKEN: stringEnv(),
  PASSWORD_RESET_PUBLIC_URL: stringEnv("http://localhost:3001/nova-senha"),
});
`;

test("production_config_no_development_defaults: a public URL key is not a literal secret even when its name contains PASSWORD", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({
      bffPasswordResetPublicUrl:
        "      - key: PASSWORD_RESET_PUBLIC_URL\n        value: https://atendly-ia-frontend.onrender.com/nova-senha\n",
    }),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE_WITH_PUBLIC_URL,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.deepEqual(violations, []);
});

test("production_config_no_development_defaults: a public URL key still fails when it points at localhost", () => {
  const violations = findDevelopmentDefaultViolations(
    renderYaml({
      bffPasswordResetPublicUrl:
        "      - key: PASSWORD_RESET_PUBLIC_URL\n        value: http://localhost:3001/nova-senha\n",
    }),
    {
      "atendly-ia-bff": BFF_ENV_SOURCE_WITH_PUBLIC_URL,
      "atendly-ia-ai-orchestrator": AI_ENV_SOURCE,
      "atendly-ia-scheduling-service": SCHEDULING_ENV_SOURCE,
    },
  );
  assert.deepEqual(violations, [
    "atendly-ia-bff:PASSWORD_RESET_PUBLIC_URL resolves to a development host (http://localhost:3001/nova-senha)",
  ]);
});

test("production_config_build_paths_exist: passes when every rootDir and buildFilter path exists", () => {
  const existingPaths = new Set([
    "apps/bff",
    "apps/bff/**",
    "packages",
    "render.yaml",
    "apps/ai-orchestrator",
    "apps/ai-orchestrator/**",
    "apps/scheduling-service",
    "apps/scheduling-service/**",
  ]);
  const missing = findMissingBuildPaths(renderYaml(), (relativePath) =>
    existingPaths.has(relativePath),
  );
  assert.deepEqual(missing, []);
});

test("production_config_build_paths_exist: fails when rootDir does not exist in the tree", () => {
  const missing = findMissingBuildPaths(renderYaml(), () => false);
  assert.ok(missing.includes("atendly-ia-bff:rootDir:apps/bff"));
});

test("production_config_build_paths_exist: fails when a buildFilter path does not exist", () => {
  const existingPaths = new Set([
    "apps/bff",
    "apps/bff/**",
    "render.yaml",
    "apps/ai-orchestrator",
    "apps/ai-orchestrator/**",
    "apps/scheduling-service",
    "apps/scheduling-service/**",
  ]);
  const missing = findMissingBuildPaths(renderYaml(), (relativePath) =>
    existingPaths.has(relativePath),
  );
  assert.deepEqual(missing, ["atendly-ia-bff:buildFilter:packages/**"]);
});

test("production_config_env_example_parity: passes when .env.example and config/env.ts declare the same keys", () => {
  const example = "NODE_ENV=development\nDATABASE_URL=\nFRONTEND_ORIGIN=\nCOOKIE_SECURE=false\nINTERNAL_SERVICE_TOKEN=\nAI_ORCHESTRATOR_PROVISIONING_TOKEN=\nPASSWORD_RESET_DELIVERY_TOKEN=\n";
  const { missingFromExample, extraInExample } =
    findEnvExampleParityMismatches(example, BFF_ENV_SOURCE);
  assert.deepEqual(missingFromExample, []);
  assert.deepEqual(extraInExample, []);
});

test("production_config_env_example_parity: fails when .env.example is missing a key declared in config/env.ts", () => {
  const example = "NODE_ENV=development\nDATABASE_URL=\n";
  const { missingFromExample } = findEnvExampleParityMismatches(
    example,
    BFF_ENV_SOURCE,
  );
  assert.ok(missingFromExample.includes("FRONTEND_ORIGIN"));
});

test("production_config_env_example_parity: fails when .env.example has a key that config/env.ts no longer declares", () => {
  const example =
    "NODE_ENV=development\nDATABASE_URL=\nFRONTEND_ORIGIN=\nCOOKIE_SECURE=false\nINTERNAL_SERVICE_TOKEN=\nAI_ORCHESTRATOR_PROVISIONING_TOKEN=\nPASSWORD_RESET_DELIVERY_TOKEN=\nDIRECT_DATABASE_URL=\n";
  const { extraInExample } = findEnvExampleParityMismatches(
    example,
    BFF_ENV_SOURCE,
  );
  assert.deepEqual(extraInExample, ["DIRECT_DATABASE_URL"]);
});
