#!/usr/bin/env node

// Auditoria estatica auxiliar: le arquivos e aplica expressoes regulares.
// Nao executa os servicos, nao prova isolamento em runtime e nao substitui
// teste de integracao ou E2E. Chamadas remotas so acontecem quando
// PRODUCTION_HEALTH_TARGETS e fornecido explicitamente.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isMain } from "./lib/gate.mjs";

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

export async function main() {
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

  // Goal006/D-005: o telefone também não pode ser exclusivo **por tenant**.
  // Duas pessoas do mesmo negócio podem compartilhar o número, então um
  // `@@unique([tenantId, normalizedPhone])` reintroduziria a identidade por
  // telefone que este Goal removeu. A prova de que o comportamento vale em
  // runtime está nas suítes do Scheduling; esta regra só impede a volta do
  // constraint por engano.
  check(
    "no_tenant_scoped_phone_unique_constraint",
    prismaSchemas.every(
      (schema) => !/@@unique\(\[[^\]]*phone[^\]]*\]/iu.test(schema),
    ),
    "no composite unique constraint makes a phone identify a person within a tenant",
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

  const appsSources = sourceFiles("apps").map((file) => ({
    path: file,
    content: read(file),
  }));
  const minhaAgendaSources = sourceFiles(
    "apps/scheduling-service/src/modules/integrations/minha-agenda",
  ).map((file) => ({ path: file, content: read(file) }));

  const legacyRouteFiles = excludeLegitimateAbsenceAssertions(
    findLegacyMigrationRouteReferences(appsSources),
  );
  check(
    "no_legacy_calendar_migration_routes",
    legacyRouteFiles.length === 0,
    legacyRouteFiles.length
      ? legacyRouteFiles.join(", ")
      : "no source under apps/ references /v1/calendar/migrations or /internal/calendar/migrations",
  );

  const calendarMigrationServiceFiles =
    findCalendarMigrationServiceReferences(appsSources);
  check(
    "no_calendar_migration_service_reference",
    calendarMigrationServiceFiles.length === 0,
    calendarMigrationServiceFiles.length
      ? calendarMigrationServiceFiles.join(", ")
      : "CalendarMigrationService has no file, import, export, class or instantiation left",
  );

  const minhaAgendaWriterFiles =
    findMinhaAgendaWriterReferences(minhaAgendaSources);
  check(
    "minha_agenda_origin_has_no_writer",
    minhaAgendaWriterFiles.length === 0,
    minhaAgendaWriterFiles.length
      ? minhaAgendaWriterFiles.join(", ")
      : "no CalendarProvider implementation remains in the Minha Agenda origin",
  );

  const externalCalendarSourceFiles =
    findCalendarSourceExternalComparisons(appsSources);
  check(
    "no_external_calendar_source_comparison",
    externalCalendarSourceFiles.length === 0,
    externalCalendarSourceFiles.length
      ? externalCalendarSourceFiles.join(", ")
      : "no comparison treats EXTERNAL or MINHA_AGENDA as a calendar source; IntegrationProvider.MINHA_AGENDA and the import origin are untouched",
  );

  const removedCalendarErrorCodeFiles =
    findRemovedCalendarErrorCodeReferences(appsSources);
  check(
    "no_removed_calendar_error_codes",
    removedCalendarErrorCodeFiles.length === 0,
    removedCalendarErrorCodeFiles.length
      ? removedCalendarErrorCodeFiles.join(", ")
      : "none of the retired external-source error codes appear as a string literal",
  );

  const requireAtendlyCalendarFiles =
    findRequireAtendlyCalendarReferences(appsSources);
  check(
    "no_require_atendly_calendar_reference",
    requireAtendlyCalendarFiles.length === 0,
    requireAtendlyCalendarFiles.length
      ? requireAtendlyCalendarFiles.join(", ")
      : "requireAtendlyCalendar was retired along with the source guard it enforced",
  );

  check(
    "frontend_mocks_directory_is_absent",
    !frontendMocksDirectoryExists(repositoryRoot),
    "apps/frontend/src/mocks",
  );

  const groupDiscardSources = [
    ...appsSources,
    ...configurationFiles("apps").map((file) => ({
      path: file,
      content: read(file),
    })),
  ];
  const groupDiscardConfigurationFiles =
    findGroupDiscardConfigurationViolations(groupDiscardSources);
  check(
    "group_discard_is_not_configuration",
    groupDiscardConfigurationFiles.length === 0,
    groupDiscardConfigurationFiles.length
      ? groupDiscardConfigurationFiles.join(", ")
      : "group discard is unconditional and EVOLUTION_IGNORE_GROUPS does not appear in apps/",
  );

  const darkThemeCssFiles = findDarkThemeCssReferences(
    styleFiles("apps/frontend/src").map((file) => ({
      path: file,
      content: read(file),
    })),
  );
  check(
    "frontend_has_no_dark_theme_css",
    darkThemeCssFiles.length === 0,
    darkThemeCssFiles.length
      ? darkThemeCssFiles.join(", ")
      : "no CSS under apps/frontend/src declares prefers-color-scheme or a dark theme selector",
  );

  const renderYaml = read("render.yaml");
  const configEnvSources = {
    "atendly-ia-bff": read("apps/bff/src/config/env.ts"),
    "atendly-ia-ai-orchestrator": read("apps/ai-orchestrator/src/config/env.ts"),
    "atendly-ia-scheduling-service": read(
      "apps/scheduling-service/src/config/env.ts",
    ),
  };
  const envExamplesByService = {
    "atendly-ia-bff": read("apps/bff/.env.example"),
    "atendly-ia-ai-orchestrator": read("apps/ai-orchestrator/.env.example"),
    "atendly-ia-scheduling-service": read(
      "apps/scheduling-service/.env.example",
    ),
  };

  const missingRenderEnvKeys = Object.entries(configEnvSources).flatMap(
    ([serviceName, envSource]) =>
      findMissingRequiredEnvKeys(envSource, renderYaml, serviceName).map(
        (key) => `${serviceName}:${key}`,
      ),
  );
  check(
    "production_config_render_env_coverage",
    missingRenderEnvKeys.length === 0,
    missingRenderEnvKeys.length
      ? missingRenderEnvKeys.join(", ")
      : "every required config/env.ts key is declared in render.yaml or HMAC-derived",
  );

  const missingLoopFlags = findMissingExplicitLoopFlags(renderYaml);
  check(
    "production_config_loop_flags_explicit",
    missingLoopFlags.length === 0,
    missingLoopFlags.length
      ? missingLoopFlags.join(", ")
      : "RETENTION_SWEEP_ENABLED, ACCOUNT_PURGE_ENABLED, INBOX_WORKER_ENABLED, NOTIFICATION_DELIVERY_ENABLED and CALENDAR_AUTO_COMPLETE_ENABLED all have an explicit value in render.yaml",
  );

  const developmentDefaultViolations = findDevelopmentDefaultViolations(
    renderYaml,
    configEnvSources,
  );
  check(
    "production_config_no_development_defaults",
    developmentDefaultViolations.length === 0,
    developmentDefaultViolations.length
      ? developmentDefaultViolations.join(", ")
      : "no *_BASE_URL/FRONTEND_ORIGIN/PASSWORD_RESET_PUBLIC_URL resolves to a development host, NODE_ENV and COOKIE_SECURE are production-ready, and no secret-like key has a literal value",
  );

  const missingBuildPaths = findMissingBuildPaths(renderYaml, (relativePath) =>
    existsSync(path.join(repositoryRoot, relativePath)),
  );
  check(
    "production_config_build_paths_exist",
    missingBuildPaths.length === 0,
    missingBuildPaths.length
      ? missingBuildPaths.join(", ")
      : "every rootDir and buildFilter.paths entry exists in the tree",
  );

  const envExampleParityMismatches = Object.entries(configEnvSources).flatMap(
    ([serviceName, envSource]) => {
      const { missingFromExample, extraInExample } =
        findEnvExampleParityMismatches(
          envExamplesByService[serviceName],
          envSource,
        );
      return [
        ...missingFromExample.map(
          (key) => `${serviceName}:missing from .env.example:${key}`,
        ),
        ...extraInExample.map(
          (key) => `${serviceName}:extra in .env.example:${key}`,
        ),
      ];
    },
  );
  check(
    "production_config_env_example_parity",
    envExampleParityMismatches.length === 0,
    envExampleParityMismatches.length
      ? envExampleParityMismatches.join(", ")
      : "every service's .env.example has exactly the keys declared in its config/env.ts",
  );

  const bffSources = sourceFiles("apps/bff/src").map((file) => ({
    path: file,
    content: read(file),
  }));
  const frontendServiceSources = sourceFiles(
    "apps/frontend/src/data/services",
  ).map((file) => ({ path: file, content: read(file) }));
  const publicApiRoutesTableSource = read(
    "packages/public-api-contract/src/routes.ts",
  );
  const publicApiSchemasSource = read(
    "packages/public-api-contract/src/schemas.ts",
  );

  const nonLiteralV1RouteFiles = findNonLiteralV1RouteRegistrations(bffSources);
  check(
    "bff_v1_routes_use_literal_paths",
    nonLiteralV1RouteFiles.length === 0,
    `read ${bffSources.length} files under apps/bff/src for /v1 route registrations. ` +
      (nonLiteralV1RouteFiles.length
        ? `registered with a non-literal path: ${nonLiteralV1RouteFiles.join(", ")}`
        : "every /v1 route is registered with a literal string path"),
  );

  const bffV1RouteRegistrations = extractBffV1RouteRegistrations(bffSources);
  const { missingFromTable, routesWithoutCaller } =
    findUncoveredPublicApiRoutes(
      bffSources,
      frontendServiceSources,
      publicApiRoutesTableSource,
    );
  check(
    "public_api_route_coverage",
    missingFromTable.length === 0,
    `read ${bffSources.length} files under apps/bff/src for /v1 route registrations ` +
      `(${bffV1RouteRegistrations.length} routes registered), ` +
      `${frontendServiceSources.length} files under apps/frontend/src/data/services for routeSchema() callers, ` +
      `and packages/public-api-contract/src/routes.ts for the route table. ` +
      (missingFromTable.length
        ? `missing from the table despite a frontend caller: ${missingFromTable.join(", ")}. `
        : "every BFF /v1 route with a frontend caller has a table entry. ") +
      `routes with no frontend caller (table entry not required): ${
        routesWithoutCaller.length ? routesWithoutCaller.join(", ") : "none"
      }`,
  );

  const frontendAllSources = frontendSources.map((file) => ({
    path: file,
    content: read(file),
  }));
  const duplicateResponseSchemaFiles =
    findDuplicatePublicResponseSchemaDeclarations(
      frontendAllSources,
      publicApiSchemasSource,
    );
  check(
    "public_api_response_schema_single_source",
    duplicateResponseSchemaFiles.length === 0,
    `read ${frontendAllSources.length} files under apps/frontend/src and packages/public-api-contract/src/schemas.ts for public route response schema names. ` +
      (duplicateResponseSchemaFiles.length
        ? `declared outside the package: ${duplicateResponseSchemaFiles.join(", ")}`
        : "no file outside the package declares a public route response schema"),
  );

  await auditProductionHealth();
  summarize();
}

// As funções abaixo são puras (recebem conteúdo, não lêem o disco) para que
// scripts/tests possa provar o caso negativo — uma árvore que contém o
// padrão de volta — sem depender de repositoryRoot.
export function findLegacyMigrationRouteReferences(files) {
  const pattern = /\/v1\/calendar\/migrations|\/internal\/calendar\/migrations/u;
  return files
    .filter(({ content }) => pattern.test(content))
    .map(({ path: filePath }) => filePath);
}

export function findCalendarMigrationServiceReferences(files) {
  const contentPatterns = [
    /\bimport\b[^;]*\bCalendarMigrationService\b/u,
    /\bexport\b[^;]*\bCalendarMigrationService\b/u,
    /\bclass\s+CalendarMigrationService\b/u,
    /\bnew\s+CalendarMigrationService\s*\(/u,
  ];
  return files
    .filter(
      ({ path: filePath, content }) =>
        /calendar-migration-service/iu.test(filePath) ||
        contentPatterns.some((pattern) => pattern.test(content)),
    )
    .map(({ path: filePath }) => filePath);
}

const MINHA_AGENDA_WRITER_METHOD_NAMES = [
  "createAppointment",
  "rescheduleAppointment",
  "cancelAppointment",
  "createHold",
  "listHolds",
  "getHold",
  "releaseHold",
  "getAvailability",
  "getAppointment",
  "listAppointments",
  "getMigrationSnapshot",
  "updateAppointment",
  "cancelWithComments",
  "createCustomer",
  "appointmentExists",
  "searchCustomers",
];

export function findMinhaAgendaWriterReferences(files) {
  const contentPatterns = [
    /\bMinhaAgendaCalendarProvider\b/u,
    /\bimplements\s+CalendarProvider\b/u,
    new RegExp(
      `\\b(?:${MINHA_AGENDA_WRITER_METHOD_NAMES.join("|")})\\s*\\(`,
      "u",
    ),
  ];
  return files
    .filter(({ content }) =>
      contentPatterns.some((pattern) => pattern.test(content)),
    )
    .map(({ path: filePath }) => filePath);
}

// `source`/`calendarSource` é o campo de fonte de agenda (CalendarSettings,
// capabilities, UI). `provider` é a origem da importação única
// (IntegrationProvider, ImportSession) — enum diferente, mesmo valor
// MINHA_AGENDA, e continua legítimo. Exigir o operador de comparação
// colado ao nome do campo é o que separa os dois: `IntegrationProvider.
// MINHA_AGENDA` e `provider: "MINHA_AGENDA"` não têm `source`/`calendarSource`
// adjacente a `===`/`!==`/`==`/`!=`, então passam.
const CALENDAR_SOURCE_EXTERNAL_COMPARISON = new RegExp(
  String.raw`\b(?:calendarSource|source)\b\s*(?:===|!==|==|!=)\s*["'](?:EXTERNAL|MINHA_AGENDA)["']` +
    "|" +
    String.raw`["'](?:EXTERNAL|MINHA_AGENDA)["']\s*(?:===|!==|==|!=)\s*(?:[\w$]+\??\.)*\b(?:calendarSource|source)\b`,
  "u",
);

export function findCalendarSourceExternalComparisons(files) {
  return files
    .filter(({ content }) => CALENDAR_SOURCE_EXTERNAL_COMPARISON.test(content))
    .map(({ path: filePath }) => filePath);
}

// Códigos de erro que só existiam para recusar a fonte externa (Goal027).
// Casados só entre aspas de string literal: os comentários que explicam a
// retirada citam o mesmo nome entre crases (` `` `), nunca entre aspas, então
// prosa não aciona a regra — só um `throw`/`.code ===`/`toBe(...)` novo aciona.
const REMOVED_CALENDAR_ERROR_CODES = [
  "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED",
  "EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED",
  "EXTERNAL_CALENDAR_SERIES_UNSUPPORTED",
  "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED",
  "OPERATION_MANAGED_EXTERNALLY",
];
const REMOVED_CALENDAR_ERROR_CODE_PATTERN = new RegExp(
  `["'](?:${REMOVED_CALENDAR_ERROR_CODES.join("|")})["']`,
  "u",
);

export function findRemovedCalendarErrorCodeReferences(files) {
  return files
    .filter(({ content }) => REMOVED_CALENDAR_ERROR_CODE_PATTERN.test(content))
    .map(({ path: filePath }) => filePath);
}

// Mesmo raciocínio de `findCalendarMigrationServiceReferences`: só código
// estrutural aciona a regra (chamada ou declaração de função), não prosa.
export function findRequireAtendlyCalendarReferences(files) {
  const contentPatterns = [
    /\bimport\b[^;]*\brequireAtendlyCalendar\w*\b/u,
    /\bexport\b[^;]*\brequireAtendlyCalendar\w*\b/u,
    /\bfunction\s+requireAtendlyCalendar\w*\b/u,
    /\brequireAtendlyCalendar\w*\s*\(/u,
  ];
  return files
    .filter(({ content }) =>
      contentPatterns.some((pattern) => pattern.test(content)),
    )
    .map(({ path: filePath }) => filePath);
}

// import-out-of-reach.test.ts (Goal010) prova que nenhuma tool da IA alcança
// importação via `expect(source).not.toContain("/internal/calendar/
// migrations")`: a asserção de ausência grava o caminho legado no próprio
// arquivo de teste para provar que ele não aparece em outro lugar.
// `findLegacyMigrationRouteReferences` não distingue "contém o texto" de
// "prova que o texto não aparece alhures", então sinalizaria esse arquivo
// mesmo ele fazendo exatamente o que a regra pede. Excluir é a única forma de
// manter a suíte verde sem esvaziar a asserção negativa que ela prova; a
// exclusão é só este arquivo, e o teste da função pura verifica os dois lados
// (que ele seria sinalizado sem a exclusão, e que só ele é removido por ela).
const LEGITIMATE_ABSENCE_ASSERTION_FILES = [
  "apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts",
];

export function excludeLegitimateAbsenceAssertions(files) {
  return files.filter(
    (file) => !LEGITIMATE_ABSENCE_ASSERTION_FILES.includes(file),
  );
}

export function frontendMocksDirectoryExists(root) {
  return existsSync(path.join(root, "apps/frontend/src/mocks"));
}

// Goal034/WU-03: descarte de grupo (Goal031/WU-01 deste Goal) voltou a ser
// incondicional e sem env. Duas formas de regredir: (1) `EVOLUTION_IGNORE_
// GROUPS` reaparece em apps/**, texto que só existia como a variável que
// condicionava o descarte; (2) um `if` que testa `isGroup` volta a carregar
// uma leitura de env/config na mesma condição, mesmo sob outro nome de
// variável. As duas viram uma unica lista de arquivos violadores. A forma (1)
// tipicamente reaparece em `.env.example`/`docker-compose.yml`, não em
// código-fonte — por isso o chamador junta `configurationFiles("apps")` a
// `appsSources` antes de rodar esta função.
const EVOLUTION_IGNORE_GROUPS_PATTERN = /EVOLUTION_IGNORE_GROUPS/u;
const IF_CONDITION_PATTERN = /if\s*\(([\s\S]*?)\)\s*\{/gu;
const GROUP_DISCARD_CONDITION_TOKEN = /\bisGroup\b/u;
const ENV_CONDITION_TOKEN = /\benv\b|process\.env|\bconfig\b/iu;

export function findGroupDiscardConfigurationViolations(files) {
  return files
    .filter(({ content }) => {
      if (EVOLUTION_IGNORE_GROUPS_PATTERN.test(content)) return true;
      for (const match of content.matchAll(IF_CONDITION_PATTERN)) {
        const condition = match[1];
        if (
          GROUP_DISCARD_CONDITION_TOKEN.test(condition) &&
          ENV_CONDITION_TOKEN.test(condition)
        ) {
          return true;
        }
      }
      return false;
    })
    .map(({ path: filePath }) => filePath);
}

// Goal034/WU-03: `tokens.css` documenta "tema claro apenas — não declarar
// esquema escuro aqui" (linha 6); esta regra prova a promessa. `prefers-
// color-scheme` é a media query nativa; os seletores cobrem os nomes comuns
// de toggle manual de tema (classe, atributo ou combinação com `:root`/
// `html`) para que a regra não valha só contra o media query.
const DARK_THEME_CSS_PATTERN =
  /prefers-color-scheme\s*:\s*dark|\[\s*data-theme\s*=\s*["']?dark["']?\s*\]|(?:^|[^\w-])\.dark\b|:root\.dark\b|html\.dark\b/imu;

export function findDarkThemeCssReferences(files) {
  return files
    .filter(({ content }) => DARK_THEME_CSS_PATTERN.test(content))
    .map(({ path: filePath }) => filePath);
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

// Regras de configuracao de producao (Goal028/WU-03). Todas puras: recebem
// texto de render.yaml / config/env.ts / .env.example, nunca leem o disco
// sozinhas, para que o caso negativo passe um contraexemplo sintetico sem
// depender da arvore real.

// Vazios, estes tokens sao derivados de INTERNAL_SERVICE_TOKEN por HMAC
// (nunca o valor bruto) — ver apps/bff/src/config/env.ts:53-55,
// apps/ai-orchestrator/src/config/env.ts:149-151 e
// apps/scheduling-service/src/config/env.ts:40-41. Por isso ficam
// legitimamente ausentes de render.yaml mesmo sendo obrigatorios no schema, e
// a regra de cobertura nao pode reprova-los por essa ausencia.
export const HMAC_DERIVED_SERVICE_TOKEN_KEYS = [
  "AI_ORCHESTRATOR_PROVISIONING_TOKEN",
  "AI_ORCHESTRATOR_COMMAND_TOKEN",
  "SCHEDULING_SERVICE_COMMAND_TOKEN",
  "BFF_COMMAND_TOKEN",
  "INTERNAL_PROVISIONING_TOKEN",
  "INTERNAL_COMMAND_TOKEN",
];

export const LOOP_FLAG_OWNERS = Object.freeze({
  RETENTION_SWEEP_ENABLED: "atendly-ia-bff",
  ACCOUNT_PURGE_ENABLED: "atendly-ia-bff",
  INBOX_WORKER_ENABLED: "atendly-ia-ai-orchestrator",
  NOTIFICATION_DELIVERY_ENABLED: "atendly-ia-ai-orchestrator",
  CALENDAR_AUTO_COMPLETE_ENABLED: "atendly-ia-scheduling-service",
});

// Extrai as chaves de `const envSchema = z.object({ ... });`. Uma chave e
// "obrigatoria" (sem default seguro) quando e `stringEnv()`/`serviceTokenEnv()`
// sem argumento — as duas fabricas cujo default e string vazia.
export function parseEnvSchemaKeys(envSource) {
  const schemaBody = envSource.match(
    /const envSchema = z\.object\(\{([\s\S]*?)\n\}\);/u,
  );
  if (!schemaBody) throw new Error("envSchema block not found");
  return schemaBody[1]
    .split("\n")
    .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*):\s*(.+),\s*$/u))
    .filter((match) => match !== null)
    .map(([, name, expression]) => {
      const stringDefault = expression.match(/^stringEnv\(\s*"([^"]*)"\s*\)/u);
      const required =
        /^serviceTokenEnv\(\s*\)/u.test(expression) ||
        /^stringEnv\(\s*\)/u.test(expression);
      return {
        name,
        required,
        defaultValue: stringDefault ? stringDefault[1] : null,
      };
    });
}

export function parseEnvExampleKeys(envExampleContent) {
  return envExampleContent
    .split("\n")
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/u))
    .filter((match) => match !== null)
    .map((match) => match[1]);
}

function parseRenderEnvVarEntries(envVarsText) {
  return envVarsText
    .split(/(?=- key: )/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("- key:"))
    .map((entry) => {
      const lines = entry
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"));
      const key = lines[0].match(/^-\s*key:\s*(\S+)/u)?.[1] ?? null;
      const valueLine = lines.find((line) => /^\s*value:\s*\S+/u.test(line));
      return {
        key,
        hasExplicitValue: Boolean(valueLine),
        value: valueLine
          ? valueLine.replace(/^\s*value:\s*/u, "").trim()
          : null,
      };
    })
    .filter((entry) => entry.key !== null);
}

// Parser de render.yaml deliberadamente tolerante a indentacao (usa `\s+` em
// vez de contar espacos): o formato do arquivo e estavel, mas casar a
// indentacao exata deixaria o parser fragil a uma reindentacao inofensiva.
export function parseRenderServices(renderYamlContent) {
  const withoutDatabases = renderYamlContent.split(/\ndatabases:\n/u)[0];
  return withoutDatabases
    .split(/\n(?=  - type: )/u)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("- type:"))
    .map((block) => {
      const name = block.match(/\n\s*name:\s*(\S+)/u)?.[1] ?? null;
      const rootDir = block.match(/\n\s*rootDir:\s*(\S+)/u)?.[1] ?? null;
      const pathsBlock = block.match(
        /buildFilter:\s*\n\s*paths:\s*\n((?:\s*-\s*\S+\n?)+)/u,
      );
      const buildFilterPaths = pathsBlock
        ? [...pathsBlock[1].matchAll(/-\s*(\S+)/gu)].map((match) => match[1])
        : [];
      const envVarsBlock = block.match(/envVars:\s*\n([\s\S]*)$/u);
      const envVars = envVarsBlock
        ? parseRenderEnvVarEntries(envVarsBlock[1])
        : [];
      return { name, rootDir, buildFilterPaths, envVars };
    });
}

export function findMissingRequiredEnvKeys(
  envSource,
  renderYamlContent,
  serviceName,
) {
  const service = parseRenderServices(renderYamlContent).find(
    (entry) => entry.name === serviceName,
  );
  const declaredKeys = new Set(
    (service?.envVars ?? []).map((entry) => entry.key),
  );
  return parseEnvSchemaKeys(envSource)
    .filter((key) => key.required)
    .filter((key) => !declaredKeys.has(key.name))
    .filter((key) => !HMAC_DERIVED_SERVICE_TOKEN_KEYS.includes(key.name))
    .map((key) => key.name);
}

export function findMissingExplicitLoopFlags(renderYamlContent) {
  const services = parseRenderServices(renderYamlContent);
  return Object.entries(LOOP_FLAG_OWNERS)
    .filter(([flagName, serviceName]) => {
      const service = services.find((entry) => entry.name === serviceName);
      const entry = service?.envVars.find((item) => item.key === flagName);
      return !entry || !entry.hasExplicitValue;
    })
    .map(([flagName]) => flagName);
}

const DEVELOPMENT_HOST_PATTERN = /localhost|127\.0\.0\.1/iu;
const SECRET_LIKE_KEY_PATTERN = /SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL/u;
const NODE_ENV_PRODUCTION_SERVICES = [
  "atendly-ia-bff",
  "atendly-ia-ai-orchestrator",
  "atendly-ia-scheduling-service",
];

function isDevelopmentSensitiveUrlKey(name) {
  return (
    /_BASE_URL$/u.test(name) ||
    name === "FRONTEND_ORIGIN" ||
    name === "PASSWORD_RESET_PUBLIC_URL"
  );
}

// Chave de endereco publico nao e segredo mesmo quando o nome contem uma
// palavra da lista de segredos (PASSWORD_RESET_PUBLIC_URL e o caso real).
// Ela precisa de valor literal em render.yaml justamente para a checagem de
// host de desenvolvimento acima poder conferir o dominio de producao.
function isPublicUrlKey(name) {
  return isDevelopmentSensitiveUrlKey(name) || /_PUBLIC_URL$/u.test(name);
}

// Reprova valor efetivo de producao que resolve para host de desenvolvimento
// (declarado em render.yaml ou, na ausencia, o default do proprio schema),
// NODE_ENV/COOKIE_SECURE sem valor de producao, e segredo literal em
// render.yaml (deveria usar generateValue/fromService/sync: false).
export function findDevelopmentDefaultViolations(
  renderYamlContent,
  envSourcesByService,
) {
  const violations = [];
  const services = parseRenderServices(renderYamlContent);

  for (const [serviceName, envSource] of Object.entries(
    envSourcesByService,
  )) {
    const service = services.find((entry) => entry.name === serviceName);
    const renderEnvVars = service?.envVars ?? [];
    for (const schemaKey of parseEnvSchemaKeys(envSource)) {
      if (!isDevelopmentSensitiveUrlKey(schemaKey.name)) continue;
      const renderEntry = renderEnvVars.find(
        (entry) => entry.key === schemaKey.name,
      );
      const effectiveValue = renderEntry?.value ?? schemaKey.defaultValue;
      if (effectiveValue && DEVELOPMENT_HOST_PATTERN.test(effectiveValue)) {
        violations.push(
          `${serviceName}:${schemaKey.name} resolves to a development host (${effectiveValue})`,
        );
      }
    }
  }

  for (const serviceName of NODE_ENV_PRODUCTION_SERVICES) {
    const service = services.find((entry) => entry.name === serviceName);
    const nodeEnv = service?.envVars.find((entry) => entry.key === "NODE_ENV");
    if (!nodeEnv || nodeEnv.value !== "production") {
      violations.push(`${serviceName}:NODE_ENV is not declared as production`);
    }
  }

  const bffService = services.find(
    (entry) => entry.name === "atendly-ia-bff",
  );
  const cookieSecure = bffService?.envVars.find(
    (entry) => entry.key === "COOKIE_SECURE",
  );
  if (!cookieSecure || cookieSecure.value !== "true") {
    violations.push("atendly-ia-bff:COOKIE_SECURE is not declared as true");
  }

  for (const service of services) {
    for (const entry of service.envVars) {
      if (
        SECRET_LIKE_KEY_PATTERN.test(entry.key) &&
        !isPublicUrlKey(entry.key) &&
        entry.hasExplicitValue &&
        entry.value &&
        entry.value !== "true" &&
        entry.value !== "false"
      ) {
        violations.push(
          `${service.name}:${entry.key} declares a literal secret value in render.yaml`,
        );
      }
    }
  }

  return violations;
}

export function findMissingBuildPaths(renderYamlContent, pathExists) {
  const missing = [];
  for (const service of parseRenderServices(renderYamlContent)) {
    if (service.rootDir && !pathExists(service.rootDir)) {
      missing.push(`${service.name}:rootDir:${service.rootDir}`);
    }
    for (const buildPath of service.buildFilterPaths) {
      const literalPath = buildPath.replace(/\/\*\*?$/u, "");
      if (!pathExists(literalPath)) {
        missing.push(`${service.name}:buildFilter:${buildPath}`);
      }
    }
  }
  return missing;
}

export function findEnvExampleParityMismatches(envExampleContent, envSource) {
  const exampleKeys = new Set(parseEnvExampleKeys(envExampleContent));
  const schemaKeys = new Set(
    parseEnvSchemaKeys(envSource).map((key) => key.name),
  );
  return {
    missingFromExample: [...schemaKeys].filter((key) => !exampleKeys.has(key)),
    extraInExample: [...exampleKeys].filter((key) => !schemaKeys.has(key)),
  };
}

// Goal035/WU-07: as duas regras abaixo comparam quem registra rota `/v1` no
// BFF, quem a chama no frontend e o que a tabela em
// `packages/public-api-contract/src/routes.ts` sabe descrever. Puras como as
// demais: recebem conteudo ja lido, nunca tocam o disco, para que o teste de
// regressao passe uma arvore sintetica sem depender do repositorio real.
const BFF_V1_ROUTE_REGISTRATION_PATTERN =
  /\bapp\.(get|post|put|patch|delete)\(\s*["'](\/v1\/[^"']*)["']/gu;
const FRONTEND_ROUTE_SCHEMA_CALL_PATTERN =
  /\brouteSchema<[\s\S]*?>\(\s*["'](GET|POST|PUT|PATCH|DELETE)["'],\s*["']([^"']+)["']/gu;
const PUBLIC_API_ROUTE_TABLE_ENTRY_PATTERN =
  /\{\s*method:\s*["'](GET|POST|PUT|PATCH|DELETE)["'],\s*pathPattern:\s*["']([^"']+)["']/gu;

// Goal036/WU-04: um path de rota `/v1` construido em tempo de execucao
// (template literal, `for` sobre uma lista de nomes de acao) escapa do
// registro literal que `BFF_V1_ROUTE_REGISTRATION_PATTERN` reconhece — a
// rota existe, mas fica invisivel para `public_api_route_coverage`. Esta
// regra cobre o caso concreto que ja aconteceu: crase abrindo o path logo
// depois de `/v1`, com ou sem interpolacao.
const BFF_V1_NON_LITERAL_ROUTE_REGISTRATION_PATTERN =
  /\bapp\.(?:get|post|put|patch|delete)\(\s*`(\/v1\/[^`]*)`/u;

export function findNonLiteralV1RouteRegistrations(files) {
  return files
    .filter(({ content }) =>
      BFF_V1_NON_LITERAL_ROUTE_REGISTRATION_PATTERN.test(content),
    )
    .map(({ path: filePath }) => filePath);
}

function routeRegistrationKey({ method, pathPattern }) {
  return `${method} ${pathPattern}`;
}

export function extractBffV1RouteRegistrations(files) {
  const routes = new Map();
  for (const { content } of files) {
    for (const match of content.matchAll(BFF_V1_ROUTE_REGISTRATION_PATTERN)) {
      const route = { method: match[1].toUpperCase(), pathPattern: match[2] };
      routes.set(routeRegistrationKey(route), route);
    }
  }
  return [...routes.values()];
}

function extractFrontendRouteSchemaCalls(files) {
  const routes = [];
  for (const { content } of files) {
    for (const match of content.matchAll(FRONTEND_ROUTE_SCHEMA_CALL_PATTERN)) {
      routes.push({ method: match[1], pathPattern: match[2] });
    }
  }
  return routes;
}

function extractPublicApiRouteTableEntries(routesTableSource) {
  return [...routesTableSource.matchAll(PUBLIC_API_ROUTE_TABLE_ENTRY_PATTERN)].map(
    (match) => ({ method: match[1], pathPattern: match[2] }),
  );
}

// COBERTURA: toda rota `/v1` registrada no BFF que tem pelo menos um chamador
// em `apps/frontend/src/data/services` precisa de entrada na tabela. Uma rota
// sem chamador nao exige entrada — ninguem no frontend depende do schema dela
// — mas o conjunto e computado e devolvido, nunca mantido a mao.
export function findUncoveredPublicApiRoutes(
  bffSourceFiles,
  frontendServiceFiles,
  routesTableSource,
) {
  const bffRoutes = extractBffV1RouteRegistrations(bffSourceFiles);
  const calledKeys = new Set(
    extractFrontendRouteSchemaCalls(frontendServiceFiles).map(
      routeRegistrationKey,
    ),
  );
  const tableKeys = new Set(
    extractPublicApiRouteTableEntries(routesTableSource).map(
      routeRegistrationKey,
    ),
  );

  const routesWithoutCaller = [];
  const missingFromTable = [];
  for (const route of bffRoutes) {
    const key = routeRegistrationKey(route);
    if (!calledKeys.has(key)) {
      routesWithoutCaller.push(key);
      continue;
    }
    if (!tableKeys.has(key)) missingFromTable.push(key);
  }
  return { missingFromTable, routesWithoutCaller };
}

const PUBLIC_SCHEMA_EXPORT_PATTERN = /^export const (\w+Schema) = z\./gmu;
const SCHEMA_DECLARATION_PATTERN = /\bconst\s+(\w+Schema)\s*=\s*z\./gu;

// FONTE UNICA: nenhum arquivo de `apps/frontend/src` pode redeclarar, com o
// mesmo nome, um schema de resposta que ja vive em
// `packages/public-api-contract/src/schemas.ts`. Importar o schema (ou
// reexportar o pacote inteiro, como `publicApiSchemas.ts` faz) nao aciona a
// regra — so uma nova declaracao `const nomeSchema = z....` aciona.
export function findDuplicatePublicResponseSchemaDeclarations(
  frontendFiles,
  schemasSource,
) {
  const publicSchemaNames = new Set(
    [...schemasSource.matchAll(PUBLIC_SCHEMA_EXPORT_PATTERN)].map(
      (match) => match[1],
    ),
  );

  const violations = [];
  for (const { path: filePath, content } of frontendFiles) {
    for (const match of content.matchAll(SCHEMA_DECLARATION_PATTERN)) {
      if (publicSchemaNames.has(match[1])) {
        violations.push(filePath);
        break;
      }
    }
  }
  return violations;
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

// `.env.example` e `docker-compose*.yml` não são código-fonte, então
// `sourceFiles` não os coleta — e é exatamente onde `EVOLUTION_IGNORE_GROUPS`
// reapareceria numa regressão. Coletor à parte, só para os checks que
// precisam ler configuração além de código.
const CONFIGURATION_FILENAME_PATTERN = /^(?:\.env\.example|docker-compose(?:\..+)?\.yml)$/u;

function configurationFiles(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (["dist", "generated", "node_modules"].includes(entry)) continue;
      const absolutePath = path.join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        visit(absolutePath);
      } else if (CONFIGURATION_FILENAME_PATTERN.test(entry)) {
        files.push(
          path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
        );
      }
    }
  };
  visit(absoluteRoot);
  return files;
}

function styleFiles(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (["dist", "generated", "node_modules"].includes(entry)) continue;
      const absolutePath = path.join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        visit(absolutePath);
      } else if (/\.css$/u.test(entry)) {
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

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
