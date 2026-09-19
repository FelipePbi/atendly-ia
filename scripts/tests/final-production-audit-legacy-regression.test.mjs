import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findCalendarMigrationServiceReferences,
  findLegacyMigrationRouteReferences,
  findMinhaAgendaWriterReferences,
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
