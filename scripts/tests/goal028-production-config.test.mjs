import assert from "node:assert/strict";
import test from "node:test";

import {
  findDevelopmentDefaultViolations,
  findEnvExampleParityMismatches,
  findMissingBuildPaths,
  findMissingExplicitLoopFlags,
  findMissingRequiredEnvKeys,
  parseComposeServices,
  parseEnvExampleKeys,
  parseEnvSchemaKeys,
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

const ENV_SOURCES = {
  bff: BFF_ENV_SOURCE,
  "ai-orchestrator": AI_ENV_SOURCE,
  "scheduling-service": SCHEDULING_ENV_SOURCE,
};

function composeYaml({
  bffNodeEnv = "      NODE_ENV: production\n",
  bffFrontendOrigin = "${APP_URL:?}",
  bffPasswordResetDeliveryToken = "",
  bffPasswordResetPublicUrl = "",
  bffCookieSecure = '"true"',
  bffRetentionFlag = '      RETENTION_SWEEP_ENABLED: "false"\n',
  bffAccountPurgeFlag = '      ACCOUNT_PURGE_ENABLED: "false"\n',
  aiScheduling = "http://scheduling-service:3003",
  aiInboxFlag = '      INBOX_WORKER_ENABLED: "true"\n',
  aiNotificationFlag = '      NOTIFICATION_DELIVERY_ENABLED: "true"\n',
  aiNodeEnv = "production",
  schedulingCalendarFlag = '      CALENDAR_AUTO_COMPLETE_ENABLED: "true"\n',
  schedulingNodeEnv = "production",
} = {}) {
  return `x-logging: &logging
  driver: json-file

services:
  postgres:
    image: pgvector/pgvector:0.8.6-pg17-bookworm
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?}

  bff:
    build:
      context: .
      dockerfile: apps/bff/Dockerfile
    environment:
      DATABASE_URL: postgresql://bff:\${BFF_DB_PASSWORD}@postgres:5432/avenly_bff
      FRONTEND_ORIGIN: ${bffFrontendOrigin}
      COOKIE_SECURE: ${bffCookieSecure}
${bffNodeEnv}      # Comentário dentro do bloco não vira variável.
      INTERNAL_SERVICE_TOKEN: \${INTERNAL_SERVICE_TOKEN}
${bffPasswordResetDeliveryToken}${bffPasswordResetPublicUrl}${bffRetentionFlag}${bffAccountPurgeFlag}    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3002/health')"]

  ai-orchestrator:
    build:
      context: ./apps/ai-orchestrator
    environment:
      NODE_ENV: ${aiNodeEnv}
      SCHEDULING_SERVICE_BASE_URL: ${aiScheduling}
${aiInboxFlag}${aiNotificationFlag}
  scheduling-service:
    build:
      context: ./apps/scheduling-service
    environment:
      NODE_ENV: ${schedulingNodeEnv}
${schedulingCalendarFlag}
volumes:
  postgres_data:
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

test("parseComposeServices: reads build context, Dockerfile, environment and healthcheck per service", () => {
  const services = parseComposeServices(composeYaml());
  assert.deepEqual(
    services.map((entry) => entry.name),
    ["postgres", "bff", "ai-orchestrator", "scheduling-service"],
  );
  const bff = services.find((entry) => entry.name === "bff");
  assert.equal(bff.buildContext, ".");
  assert.equal(bff.dockerfilePath, "apps/bff/Dockerfile");
  assert.match(bff.healthcheck, /\/health/u);
  assert.ok(bff.envVars.some((entry) => entry.key === "DATABASE_URL"));
  assert.ok(
    !bff.envVars.some((entry) => entry.key === "Comentário"),
    "comment lines are not environment entries",
  );
  const cookieSecure = bff.envVars.find(
    (entry) => entry.key === "COOKIE_SECURE",
  );
  assert.equal(cookieSecure.value, "true");

  const ai = services.find((entry) => entry.name === "ai-orchestrator");
  assert.equal(ai.buildContext, "apps/ai-orchestrator");
  assert.equal(ai.dockerfilePath, "apps/ai-orchestrator/Dockerfile");
  assert.equal(ai.healthcheck, null);

  const postgres = services.find((entry) => entry.name === "postgres");
  assert.equal(postgres.buildContext, null);
});

test("parseComposeServices: reads a CRLF checkout the same as LF", () => {
  const lf = parseComposeServices(composeYaml());
  const crlf = parseComposeServices(composeYaml().replace(/\n/gu, "\r\n"));
  assert.deepEqual(crlf, lf);
});

test("parseComposeServices: a ${VAR} reference is not an explicit literal value", () => {
  const bff = parseComposeServices(composeYaml()).find(
    (entry) => entry.name === "bff",
  );
  const token = bff.envVars.find(
    (entry) => entry.key === "INTERNAL_SERVICE_TOKEN",
  );
  assert.equal(token.hasExplicitValue, false);
});

test("production_config_compose_env_coverage: passes when every required key is declared or HMAC-derived", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    composeYaml({
      bffPasswordResetDeliveryToken:
        "      PASSWORD_RESET_DELIVERY_TOKEN: ${PASSWORD_RESET_DELIVERY_TOKEN:-}\n",
    }),
    "bff",
  );
  assert.deepEqual(missing, []);
});

test("production_config_compose_env_coverage: fails when a required key with no safe default is missing from the compose", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    composeYaml({ bffPasswordResetDeliveryToken: "" }),
    "bff",
  );
  assert.deepEqual(missing, ["PASSWORD_RESET_DELIVERY_TOKEN"]);
});

test("production_config_compose_env_coverage: does not reprove an HMAC-derived token that is legitimately absent", () => {
  const missing = findMissingRequiredEnvKeys(
    BFF_ENV_SOURCE,
    composeYaml({
      bffPasswordResetDeliveryToken:
        "      PASSWORD_RESET_DELIVERY_TOKEN: ${PASSWORD_RESET_DELIVERY_TOKEN:-}\n",
    }),
    "bff",
  );
  assert.ok(!missing.includes("AI_ORCHESTRATOR_PROVISIONING_TOKEN"));
});

test("production_config_loop_flags_explicit: passes when all five flags have an explicit value", () => {
  assert.deepEqual(findMissingExplicitLoopFlags(composeYaml()), []);
});

test("production_config_loop_flags_explicit: fails when a flag is removed from the compose", () => {
  const missing = findMissingExplicitLoopFlags(
    composeYaml({ bffRetentionFlag: "" }),
  );
  assert.deepEqual(missing, ["RETENTION_SWEEP_ENABLED"]);
});

test("production_config_loop_flags_explicit: fails when a flag is declared without an explicit value", () => {
  const missing = findMissingExplicitLoopFlags(
    composeYaml({
      aiInboxFlag: "      INBOX_WORKER_ENABLED: ${INBOX_WORKER_ENABLED}\n",
    }),
  );
  assert.deepEqual(missing, ["INBOX_WORKER_ENABLED"]);
});

test("production_config_no_development_defaults: passes on a fully production-shaped compose", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml(),
    ENV_SOURCES,
  );
  assert.deepEqual(violations, []);
});

test("production_config_no_development_defaults: fails when a declared *_BASE_URL points at localhost", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml({ aiScheduling: "http://localhost:3003" }),
    ENV_SOURCES,
  );
  assert.ok(
    violations.some((entry) =>
      entry.includes("ai-orchestrator:SCHEDULING_SERVICE_BASE_URL"),
    ),
  );
});

test("production_config_no_development_defaults: fails when a ${VAR:-default} reference falls back to localhost", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml({
      aiScheduling: "${SCHEDULING_URL:-http://localhost:3003}",
    }),
    ENV_SOURCES,
  );
  assert.ok(
    violations.some((entry) =>
      entry.includes("ai-orchestrator:SCHEDULING_SERVICE_BASE_URL"),
    ),
  );
});

test("production_config_no_development_defaults: fails when an undeclared URL falls back to its localhost default", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml().replace("      FRONTEND_ORIGIN: ${APP_URL:?}\n", ""),
    ENV_SOURCES,
  );
  assert.ok(violations.some((entry) => entry.includes("bff:FRONTEND_ORIGIN")));
});

test("production_config_no_development_defaults: fails when NODE_ENV is missing for a service", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml({ bffNodeEnv: "" }),
    ENV_SOURCES,
  );
  assert.deepEqual(violations, ["bff:NODE_ENV is not declared as production"]);
});

test("production_config_no_development_defaults: fails when COOKIE_SECURE is not true", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml({ bffCookieSecure: '"false"' }),
    ENV_SOURCES,
  );
  assert.deepEqual(violations, ["bff:COOKIE_SECURE is not declared as true"]);
});

test("production_config_no_development_defaults: fails when a secret-like key has a literal value", () => {
  const withLiteralSecret = composeYaml().replace(
    "      INTERNAL_SERVICE_TOKEN: ${INTERNAL_SERVICE_TOKEN}\n",
    "      INTERNAL_SERVICE_TOKEN: hunter2\n",
  );
  const violations = findDevelopmentDefaultViolations(
    withLiteralSecret,
    ENV_SOURCES,
  );
  assert.ok(
    violations.some((entry) =>
      entry.includes(
        "bff:INTERNAL_SERVICE_TOKEN declares a literal secret value",
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
    composeYaml({
      bffPasswordResetPublicUrl:
        "      PASSWORD_RESET_PUBLIC_URL: https://app.avenly.example/nova-senha\n",
    }),
    { ...ENV_SOURCES, bff: BFF_ENV_SOURCE_WITH_PUBLIC_URL },
  );
  assert.deepEqual(violations, []);
});

test("production_config_no_development_defaults: a public URL key still fails when it points at localhost", () => {
  const violations = findDevelopmentDefaultViolations(
    composeYaml({
      bffPasswordResetPublicUrl:
        "      PASSWORD_RESET_PUBLIC_URL: http://localhost:3001/nova-senha\n",
    }),
    { ...ENV_SOURCES, bff: BFF_ENV_SOURCE_WITH_PUBLIC_URL },
  );
  assert.deepEqual(violations, [
    "bff:PASSWORD_RESET_PUBLIC_URL resolves to a development host (http://localhost:3001/nova-senha)",
  ]);
});

test("production_config_build_paths_exist: passes when every build context and Dockerfile exists", () => {
  const existingPaths = new Set([
    ".",
    "apps/bff/Dockerfile",
    "apps/ai-orchestrator",
    "apps/ai-orchestrator/Dockerfile",
    "apps/scheduling-service",
    "apps/scheduling-service/Dockerfile",
  ]);
  const missing = findMissingBuildPaths(composeYaml(), (relativePath) =>
    existingPaths.has(relativePath),
  );
  assert.deepEqual(missing, []);
});

test("production_config_build_paths_exist: fails when a build context does not exist in the tree", () => {
  const missing = findMissingBuildPaths(composeYaml(), () => false);
  assert.ok(missing.includes("ai-orchestrator:context:apps/ai-orchestrator"));
});

test("production_config_build_paths_exist: fails when a Dockerfile does not exist", () => {
  const existingPaths = new Set([
    ".",
    "apps/ai-orchestrator",
    "apps/ai-orchestrator/Dockerfile",
    "apps/scheduling-service",
    "apps/scheduling-service/Dockerfile",
  ]);
  const missing = findMissingBuildPaths(composeYaml(), (relativePath) =>
    existingPaths.has(relativePath),
  );
  assert.deepEqual(missing, ["bff:dockerfile:apps/bff/Dockerfile"]);
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
