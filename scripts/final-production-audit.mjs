#!/usr/bin/env node

// Auditoria estatica auxiliar: le arquivos e aplica expressoes regulares.
// Nao executa os servicos, nao prova isolamento em runtime e nao substitui
// teste de integracao ou E2E. Chamadas remotas so acontecem quando
// PRODUCTION_HEALTH_TARGETS e fornecido explicitamente.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const results = [];

const expectedServices = [
  "atendly-ia-frontend",
  "atendly-ia-bff",
  "atendly-ia-ai-orchestrator",
  "atendly-ia-scheduling-service",
  "atendly-ia-evolution-go",
  "atendly-ia-health-worker",
];

async function main() {
  const renderBlueprint = read("render.yaml");
  const frontendSources = sourceFiles("apps/frontend/src");
  const bffSchema = read("apps/bff/prisma/schema.prisma");
  const aiSources = sourceFiles("apps/ai-orchestrator/src");
  const schedulingSources = sourceFiles("apps/scheduling-service/src");
  const schedulingPackage = read("apps/scheduling-service/package.json");
  const graphSources = sourceFiles("apps/ai-orchestrator/src/modules/graph");
  const knowledgeStore = read(
    "apps/ai-orchestrator/src/modules/knowledge/pgvector-knowledge-store.ts",
  );
  const modelProvider = read(
    "apps/ai-orchestrator/src/modules/model/model-provider.ts",
  );
  const assistantTools = read(
    "apps/ai-orchestrator/src/modules/tools/assistant-tools.ts",
  );
  const schedulingEnv = read("apps/scheduling-service/src/config/env.ts");
  const credentialRepository = read(
    "apps/scheduling-service/src/modules/integrations/credentials.ts",
  );

  check(
    "render_has_exact_final_service_set",
    expectedServices.every((name) =>
      renderBlueprint.includes(`name: ${name}`),
    ) && !renderBlueprint.includes("name: atendly-ia-api"),
    expectedServices.join(", "),
  );
  check(
    "all_services_expose_cheap_health_route",
    count(renderBlueprint, "healthCheckPath: /health") === 6 &&
      read("apps/frontend/src/app/health/route.ts").includes("function GET") &&
      read("apps/bff/src/routes/health.ts").includes('app.get("/health"') &&
      read("apps/ai-orchestrator/src/app.ts").includes('app.get("/health"') &&
      read("apps/scheduling-service/src/app/health.ts").includes(
        'app.get("/health"',
      ) &&
      read("apps/evolution-go/pkg/routes/routes.go").includes(
        'eng.GET("/health"',
      ) &&
      read("apps/health-worker/src/index.js").includes(
        'request.url === "/health"',
      ),
    "six GET /health endpoints and six Render health checks",
  );

  const frontendNetworkFiles = matchingFiles(frontendSources, [
    /\bfetch\s*\(/u,
    /\baxios\b/u,
    /AI_ORCHESTRATOR_BASE_URL|SCHEDULING_SERVICE_BASE_URL|EVOLUTION(?:_GO)?_BASE_URL/u,
  ]);
  check(
    "frontend_calls_only_bff",
    frontendNetworkFiles.length === 0 &&
      read("apps/frontend/src/data/services/registry.ts").includes(
        "NEXT_PUBLIC_BFF_URL",
      ),
    frontendNetworkFiles.length
      ? frontendNetworkFiles.join(", ")
      : "BFF service registry is the only data boundary",
  );
  check(
    "bff_does_not_persist_conversation_or_message",
    !/model\s+(Conversation|Message)\b/u.test(bffSchema),
    "no Conversation or Message model in BFF Prisma schema",
  );

  const aiMinhaAgendaFiles = matchingFiles(aiSources, [
    /minha.?agenda/iu,
  ]).filter((file) => file !== "apps/ai-orchestrator/src/lib/redact.ts");
  check(
    "ai_does_not_access_minha_agenda",
    aiMinhaAgendaFiles.length === 0,
    aiMinhaAgendaFiles.length
      ? aiMinhaAgendaFiles.join(", ")
      : "only the generic Scheduling gateway is visible to AI",
  );
  check(
    "scheduling_does_not_call_openai",
    !/(?:@langchain|langgraph|openai)/iu.test(
      `${joinSources(schedulingSources)}\n${schedulingPackage}`,
    ),
    "no model dependency or call in Scheduling Service",
  );
  check(
    "rag_is_tenant_scoped",
    knowledgeStore.includes('WHERE chunk."tenantId" = ${tenantId}') &&
      knowledgeStore.includes('AND document."tenantId" = ${tenantId}'),
    "chunk and document tenant filters are mandatory in vector search",
  );
  check(
    "appointments_do_not_depend_on_langgraph_state",
    !/prisma\.(?:appointment|externalAppointment)|appointment\.(?:create|update|delete)/iu.test(
      joinSources(graphSources),
    ),
    "LangGraph contains workflow state, not appointment persistence",
  );
  check(
    "llm_cannot_create_appointments_directly",
    !/Prisma|SchedulingClient|CalendarProvider/u.test(modelProvider) &&
      /SchedulingGateway/u.test(assistantTools),
    "model provider emits typed calls; tool registry owns Scheduling access",
  );
  check(
    "minha_agenda_has_no_global_credentials",
    !/MINHA_AGENDA_(?:URL|USERNAME|PASSWORD|TOKEN)/u.test(schedulingEnv) &&
      /tenantId/u.test(credentialRepository) &&
      /decrypt|encrypted/iu.test(credentialRepository),
    "credentials are encrypted and resolved by tenant",
  );

  const prismaSchemas = [
    "apps/bff/prisma/schema.prisma",
    "apps/ai-orchestrator/prisma/schema.prisma",
    "apps/scheduling-service/prisma/schema.prisma",
  ].map(read);
  check(
    "no_global_phone_unique_constraint",
    prismaSchemas.every((schema) => !/phone\w*\s+[^\n]*@unique/iu.test(schema)),
    "no operational phone field is globally unique",
  );

  check(
    "request_id_is_propagated_end_to_end",
    [
      "apps/frontend/src/data/http/BffHttpClient.ts",
      "apps/bff/src/app.ts",
      "apps/bff/src/clients/internal-http-client.ts",
      "apps/ai-orchestrator/src/app.ts",
      "apps/ai-orchestrator/src/modules/scheduling-service/client.ts",
      "apps/evolution-go/pkg/routes/routes.go",
      "apps/health-worker/src/index.js",
    ].every((file) => /x-request-id/iu.test(read(file))),
    "frontend, BFF, AI, Scheduling calls, Evolution and worker carry x-request-id",
  );
  check(
    "ai_tool_logs_have_required_correlation",
    ["tenantId", "conversationId", "aiRunId", "toolCallId"].every((field) =>
      read(
        "apps/ai-orchestrator/src/modules/assistant/assistant.service.ts",
      ).includes(field),
    ),
    "tenantId, conversationId, aiRunId and toolCallId",
  );
  check(
    "sensitive_log_redaction_is_configured",
    /authorization|cookie|password|token/iu.test(read("apps/bff/src/app.ts")) &&
      /authorization|cookie|password|credentials/iu.test(
        read("apps/scheduling-service/src/app/build-app.ts"),
      ) &&
      /openai_api_key|evolution_api_key|minha_agenda_password/iu.test(
        read("apps/ai-orchestrator/src/lib/redact.ts"),
      ) &&
      /sanitizeLogMessage/u.test(
        read("apps/evolution-go/pkg/logger/logger.go"),
      ),
    "authorization, cookies, credentials, provider tokens and customer phones",
  );

  await auditProductionHealth();
  summarize();
}

async function auditProductionHealth() {
  const configured = process.env.PRODUCTION_HEALTH_TARGETS?.trim();
  if (!configured) {
    check(
      "production_health",
      true,
      "not requested; set PRODUCTION_HEALTH_TARGETS=name=url,... to verify deployed endpoints",
      true,
    );
    return;
  }

  const targets = configured.split(",").map((entry) => {
    const [name, url] = entry.trim().split("=", 2);
    if (!name || !url) throw new Error(`Invalid health target: ${entry}`);
    return { name, url };
  });
  const evidence = await Promise.all(
    targets.map(async ({ name, url }) => {
      const requestId = crypto.randomUUID();
      try {
        const response = await fetch(url, {
          headers: { "x-request-id": requestId },
          signal: AbortSignal.timeout(20_000),
        });
        return {
          name,
          ok: response.ok,
          status: response.status,
          requestId: response.headers.get("x-request-id") ?? requestId,
        };
      } catch (error) {
        return {
          name,
          ok: false,
          error: error instanceof Error ? error.name : "NETWORK_ERROR",
          requestId,
        };
      }
    }),
  );
  check(
    "production_health",
    evidence.every((item) => item.ok),
    JSON.stringify(evidence),
  );
}

function read(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!existsSync(absolutePath))
    throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

function sourceFiles(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (["dist", "generated", "node_modules"].includes(entry)) continue;
      const absolutePath = path.join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        visit(absolutePath);
      } else if (/\.(?:cjs|js|jsx|mjs|ts|tsx)$/u.test(entry)) {
        files.push(
          path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
        );
      }
    }
  };
  visit(absoluteRoot);
  return files;
}

function matchingFiles(files, patterns) {
  return files.filter((file) => {
    const content = read(file);
    return patterns.some((pattern) => pattern.test(content));
  });
}

function joinSources(files) {
  return files.map(read).join("\n");
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function check(name, ok, details, skipped = false) {
  results.push({ name, ok, details, skipped });
  console.log(JSON.stringify({ name, ok, skipped, details }));
}

function summarize() {
  // Um check pulado nao e um check aprovado: skipped tem contagem propria e
  // nao entra em "passed".
  const skipped = results.filter((result) => result.skipped);
  const failed = results.filter((result) => !result.skipped && !result.ok);
  const passed = results.filter((result) => !result.skipped && result.ok);
  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: passed.length,
        failed: failed.length,
        skipped: skipped.length,
        skippedChecks: skipped.map((result) => result.name),
        kind: "static-regex-audit",
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
