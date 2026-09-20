import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  excludeLegitimateAbsenceAssertions,
  findCalendarMigrationServiceReferences,
  findCalendarSourceExternalComparisons,
  findDarkThemeCssReferences,
  findGroupDiscardConfigurationViolations,
  findLegacyMigrationRouteReferences,
  findMinhaAgendaWriterReferences,
  findRemovedCalendarErrorCodeReferences,
  findRequireAtendlyCalendarReferences,
  frontendMocksDirectoryExists,
} from "../final-production-audit.mjs";

test("no_legacy_calendar_migration_routes: passes on a tree without the legacy paths", () => {
  const files = [
    { path: "apps/bff/src/routes/calendar.ts", content: "export const ok = true;" },
  ];
  assert.deepEqual(findLegacyMigrationRouteReferences(files), []);
});

test("no_legacy_calendar_migration_routes: fails when a public route path comes back", () => {
  const files = [
    {
      path: "apps/bff/src/routes/calendar.ts",
      content: 'app.post("/v1/calendar/migrations", handler);',
    },
  ];
  assert.deepEqual(findLegacyMigrationRouteReferences(files), [
    "apps/bff/src/routes/calendar.ts",
  ]);
});

test("no_legacy_calendar_migration_routes: fails when an internal route path comes back", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/internal-api/routes.ts",
      content: 'app.post("/internal/calendar/migrations", handler);',
    },
  ];
  assert.deepEqual(findLegacyMigrationRouteReferences(files), [
    "apps/scheduling-service/src/modules/internal-api/routes.ts",
  ]);
});

test("no_calendar_migration_service_reference: passes on a tree that only mentions the removed service in prose", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/migrations/import-execution-service.ts",
      content:
        "/**\n * Substitui a transacao monolitica de `CalendarMigrationService.importToAtendly`.\n */\nexport function run() {}",
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), []);
});

test("no_calendar_migration_service_reference: fails when the file itself comes back", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/migrations/calendar-migration-service.ts",
      content: "export function noop() {}",
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), [
    "apps/scheduling-service/src/modules/migrations/calendar-migration-service.ts",
  ]);
});

test("no_calendar_migration_service_reference: fails when it is imported again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/internal-api/routes.ts",
      content:
        'import { CalendarMigrationService } from "../migrations/calendar-migration-service.js";',
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), [
    "apps/scheduling-service/src/modules/internal-api/routes.ts",
  ]);
});

test("no_calendar_migration_service_reference: fails when it is exported again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/migrations/index.ts",
      content: 'export { CalendarMigrationService } from "./service.js";',
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), [
    "apps/scheduling-service/src/modules/migrations/index.ts",
  ]);
});

test("no_calendar_migration_service_reference: fails when the class is declared again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/migrations/service.ts",
      content: "export class CalendarMigrationService {}",
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), [
    "apps/scheduling-service/src/modules/migrations/service.ts",
  ]);
});

test("no_calendar_migration_service_reference: fails when it is instantiated again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/migrations/routes.ts",
      content: "const service = new CalendarMigrationService();",
    },
  ];
  assert.deepEqual(findCalendarMigrationServiceReferences(files), [
    "apps/scheduling-service/src/modules/migrations/routes.ts",
  ]);
});

test("minha_agenda_origin_has_no_writer: passes on a read-only origin", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/integrations/minha-agenda/import-source-reader.ts",
      content: "export async function getImportSnapshot() {}",
    },
  ];
  assert.deepEqual(findMinhaAgendaWriterReferences(files), []);
});

test("minha_agenda_origin_has_no_writer: fails when MinhaAgendaCalendarProvider comes back", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/integrations/minha-agenda/calendar-provider.ts",
      content: "export class MinhaAgendaCalendarProvider {}",
    },
  ];
  assert.deepEqual(findMinhaAgendaWriterReferences(files), [
    "apps/scheduling-service/src/modules/integrations/minha-agenda/calendar-provider.ts",
  ]);
});

test("minha_agenda_origin_has_no_writer: fails when a new writer implements CalendarProvider", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/integrations/minha-agenda/writer.ts",
      content: "export class MinhaAgendaWriter implements CalendarProvider {}",
    },
  ];
  assert.deepEqual(findMinhaAgendaWriterReferences(files), [
    "apps/scheduling-service/src/modules/integrations/minha-agenda/writer.ts",
  ]);
});

test("minha_agenda_origin_has_no_writer: fails when a write method comes back without the old class name or CalendarProvider", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts",
      content:
        "export class MinhaAgendaClient {\n  async createAppointment(input) {\n    return this.request(input);\n  }\n}",
    },
  ];
  assert.deepEqual(findMinhaAgendaWriterReferences(files), [
    "apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts",
  ]);
});

test("minha_agenda_origin_has_no_writer: fails when an operational read method comes back", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts",
      content:
        "export class MinhaAgendaClient {\n  async searchCustomers(query) {\n    return this.request(query);\n  }\n}",
    },
  ];
  assert.deepEqual(findMinhaAgendaWriterReferences(files), [
    "apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts",
  ]);
});

test("frontend_mocks_directory_is_absent: passes when apps/frontend/src/mocks does not exist", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "audit-mocks-absent-"));
  try {
    assert.equal(frontendMocksDirectoryExists(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("frontend_mocks_directory_is_absent: fails when apps/frontend/src/mocks comes back", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "audit-mocks-present-"));
  try {
    mkdirSync(path.join(root, "apps/frontend/src/mocks"), { recursive: true });
    assert.equal(frontendMocksDirectoryExists(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no_external_calendar_source_comparison: passes when nothing compares source to EXTERNAL or MINHA_AGENDA", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/routes.ts",
      content:
        'if (settings.source !== "ATENDLY") { throw new Error("unreachable"); }',
    },
  ];
  assert.deepEqual(findCalendarSourceExternalComparisons(files), []);
});

test("no_external_calendar_source_comparison: fails when settings.source is compared to MINHA_AGENDA again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/internal-api/routes.ts",
      content: 'if (settings.source === "MINHA_AGENDA") { return legacy(); }',
    },
  ];
  assert.deepEqual(findCalendarSourceExternalComparisons(files), [
    "apps/scheduling-service/src/modules/internal-api/routes.ts",
  ]);
});

test("no_external_calendar_source_comparison: fails when a UI label compares source to EXTERNAL again", () => {
  const files = [
    {
      path: "apps/frontend/src/features/settings/shared/labels.ts",
      content:
        'export function sourceLabel(source) { return source === "EXTERNAL" ? "Minha Agenda" : "Agenda Atendly"; }',
    },
  ];
  assert.deepEqual(findCalendarSourceExternalComparisons(files), [
    "apps/frontend/src/features/settings/shared/labels.ts",
  ]);
});

test("no_external_calendar_source_comparison: fails when the string literal comes first", () => {
  const files = [
    {
      path: "apps/frontend/src/features/agenda/sourceGuard.ts",
      content: 'const isExternal = "EXTERNAL" === calendar.source;',
    },
  ];
  assert.deepEqual(findCalendarSourceExternalComparisons(files), [
    "apps/frontend/src/features/agenda/sourceGuard.ts",
  ]);
});

test("no_external_calendar_source_comparison: IntegrationProvider.MINHA_AGENDA keeps passing", () => {
  const files = [
    {
      path: "apps/scheduling-service/prisma/schema.prisma",
      content: "enum IntegrationProvider {\n  MINHA_AGENDA\n}",
    },
    {
      path: "apps/scheduling-service/src/modules/migrations/import-execution-service.ts",
      content:
        'const connection = await prisma.integrationConnection.findUnique({\n  where: { tenantId_provider: { tenantId, provider: "MINHA_AGENDA" } },\n});',
    },
  ];
  assert.deepEqual(findCalendarSourceExternalComparisons(files), []);
});

test("no_removed_calendar_error_codes: passes when only the survivor code is used", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/routes.ts",
      content: 'throw new AppError("CALENDAR_SETTINGS_NOT_FOUND", "msg", 404);',
    },
  ];
  assert.deepEqual(findRemovedCalendarErrorCodeReferences(files), []);
});

test("no_removed_calendar_error_codes: passes when a comment only cites the retired name in prose", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/provider-factory.ts",
      content:
        "/**\n * O ramo de recusa saiu junto com o codigo `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`.\n */\nexport function noop() {}",
    },
  ];
  assert.deepEqual(findRemovedCalendarErrorCodeReferences(files), []);
});

test("no_removed_calendar_error_codes: fails when a retired code is thrown again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/calendar-service.ts",
      content:
        'throw new AppError("EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED", "msg", 409);',
    },
  ];
  assert.deepEqual(findRemovedCalendarErrorCodeReferences(files), [
    "apps/scheduling-service/src/modules/calendar/calendar-service.ts",
  ]);
});

test("no_removed_calendar_error_codes: fails when a retired code is asserted in a test again", () => {
  const files = [
    {
      path: "apps/scheduling-service/tests/unit/calendar-provider-factory.test.ts",
      content:
        'await expect(create()).rejects.toMatchObject({ code: "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED" });',
    },
  ];
  assert.deepEqual(findRemovedCalendarErrorCodeReferences(files), [
    "apps/scheduling-service/tests/unit/calendar-provider-factory.test.ts",
  ]);
});

test("no_require_atendly_calendar_reference: passes when only the replacement guard is called", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/routes.ts",
      content: "async function requireCalendar(prisma, tenantId) {}",
    },
  ];
  assert.deepEqual(findRequireAtendlyCalendarReferences(files), []);
});

test("no_require_atendly_calendar_reference: passes when a comment only cites the retired name in prose", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/routes.ts",
      content:
        "// O guard antigo `requireAtendlyCalendarForSeries` somava duas exigencias.",
    },
  ];
  assert.deepEqual(findRequireAtendlyCalendarReferences(files), []);
});

test("no_require_atendly_calendar_reference: fails when the guard is declared again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/internal-api/routes.ts",
      content: "async function requireAtendlyCalendar(prisma, tenantId) {}",
    },
  ];
  assert.deepEqual(findRequireAtendlyCalendarReferences(files), [
    "apps/scheduling-service/src/modules/internal-api/routes.ts",
  ]);
});

test("no_require_atendly_calendar_reference: fails when the guard is called again", () => {
  const files = [
    {
      path: "apps/scheduling-service/src/modules/calendar/routes.ts",
      content: "await requireAtendlyCalendarForSeries(prisma, context.tenantId);",
    },
  ];
  assert.deepEqual(findRequireAtendlyCalendarReferences(files), [
    "apps/scheduling-service/src/modules/calendar/routes.ts",
  ]);
});

test("no_legacy_calendar_migration_routes: the absence-assertion file is exactly what the pure finder would flag without the exclusion", () => {
  const files = [
    {
      path: "apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts",
      content:
        'expect(source).not.toContain("/internal/calendar/migrations");',
    },
  ];
  assert.deepEqual(findLegacyMigrationRouteReferences(files), [
    "apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts",
  ]);
});

test("excludeLegitimateAbsenceAssertions: removes only the documented absence-assertion file", () => {
  const flagged = [
    "apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts",
    "apps/bff/src/routes/calendar.ts",
  ];
  assert.deepEqual(excludeLegitimateAbsenceAssertions(flagged), [
    "apps/bff/src/routes/calendar.ts",
  ]);
});

test("excludeLegitimateAbsenceAssertions: does not swallow a real regression alongside the excluded file", () => {
  const flagged = [
    "apps/ai-orchestrator/tests/tools/import-out-of-reach.test.ts",
    "apps/scheduling-service/src/modules/migrations/routes.ts",
  ];
  assert.deepEqual(excludeLegitimateAbsenceAssertions(flagged), [
    "apps/scheduling-service/src/modules/migrations/routes.ts",
  ]);
});

test("group_discard_is_not_configuration: passes when the discard is unconditional and the env flag is gone", () => {
  const files = [
    {
      path: "apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts",
      content:
        "if (message.isGroup) {\n  return { ok: true, action: \"ignored_group\" };\n}",
    },
  ];
  assert.deepEqual(findGroupDiscardConfigurationViolations(files), []);
});

test("group_discard_is_not_configuration: fails when EVOLUTION_IGNORE_GROUPS reappears", () => {
  const files = [
    {
      path: "apps/ai-orchestrator/.env.example",
      content: "EVOLUTION_IGNORE_GROUPS=true",
    },
  ];
  assert.deepEqual(findGroupDiscardConfigurationViolations(files), [
    "apps/ai-orchestrator/.env.example",
  ]);
});

test("group_discard_is_not_configuration: fails when the discard is conditioned on an env read again", () => {
  const files = [
    {
      path: "apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts",
      content:
        "if (this.env.ignoreGroups && message.isGroup) {\n  return { ok: true, action: \"ignored_group\" };\n}",
    },
  ];
  assert.deepEqual(findGroupDiscardConfigurationViolations(files), [
    "apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts",
  ]);
});

test("frontend_has_no_dark_theme_css: passes on a light-theme-only stylesheet", () => {
  const files = [
    {
      path: "apps/frontend/src/shared/styles/tokens.css",
      content: ":root {\n  color-scheme: light;\n  --at-color-canvas: #f7f4ef;\n}",
    },
  ];
  assert.deepEqual(findDarkThemeCssReferences(files), []);
});

test("frontend_has_no_dark_theme_css: fails when prefers-color-scheme comes back", () => {
  const files = [
    {
      path: "apps/frontend/src/shared/styles/tokens.css",
      content: "@media (prefers-color-scheme: dark) {\n  :root { --at-color-canvas: #111; }\n}",
    },
  ];
  assert.deepEqual(findDarkThemeCssReferences(files), [
    "apps/frontend/src/shared/styles/tokens.css",
  ]);
});

test("frontend_has_no_dark_theme_css: fails when a manual dark theme selector comes back", () => {
  const files = [
    {
      path: "apps/frontend/src/shared/styles/atendly.css",
      content: "html.dark {\n  --at-color-canvas: #111;\n}",
    },
  ];
  assert.deepEqual(findDarkThemeCssReferences(files), [
    "apps/frontend/src/shared/styles/atendly.css",
  ]);
});
