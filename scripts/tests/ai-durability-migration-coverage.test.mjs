import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// O banco de durabilidade da IA (`<banco>_goal004`) não passa por
// `prisma migrate deploy`: os ensaios de migration o montam, cada um aplicando
// a migration do seu Goal. Migration nova da IA sem ensaio que a aplique deixa
// o banco sem a coluna, e `test:ai-orchestrator-transport-durability` só
// descobre isso no fim de validate:integration (foi o caso de
// `20261011120000_ai_reply_split_dispatch`). Este teste falha no gate rápido.

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const AI_MIGRATIONS = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
);
// Anteriores a esta entram pela base que o próprio Goal004 monta.
const FIRST_REHEARSED_MIGRATION = "20260907160000_goal004_durable_transport";

export function uncoveredMigrations(migrations, rehearsalSources) {
  return migrations
    .filter((name) => name >= FIRST_REHEARSED_MIGRATION)
    .filter((name) => !rehearsalSources.some((source) => source.includes(name)));
}

function aiMigrations() {
  return readdirSync(AI_MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function rehearsalSources() {
  const scripts = path.join(repositoryRoot, "scripts");
  return readdirSync(scripts)
    .filter((name) => /rehearsal\.mjs$/u.test(name))
    .map((name) => readFileSync(path.join(scripts, name), "utf8"));
}

test("every AI migration since Goal004 is applied by a rehearsal to the durability target", () => {
  assert.deepEqual(uncoveredMigrations(aiMigrations(), rehearsalSources()), []);
});

test("uncoveredMigrations names a new migration that no rehearsal applies", () => {
  assert.deepEqual(
    uncoveredMigrations(
      [
        "20260511000000_init",
        FIRST_REHEARSED_MIGRATION,
        "20991231000000_brand_new_column",
      ],
      [`apply("${FIRST_REHEARSED_MIGRATION}")`],
    ),
    ["20991231000000_brand_new_column"],
  );
});
