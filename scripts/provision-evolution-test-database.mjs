#!/usr/bin/env node

// Provisiona o banco descartável do ensaio de propriedade do Evolution Go.
//
// Não pede uma variável nova: o alvo é derivado de EVOLUTION_TEST_DATABASE_URL,
// que `validate:integration` monta a partir do mesmo servidor descartável já
// validado para o BFF. O script recusa qualquer destino que não seja loopback
// ou cujo nome não indique um banco de teste, e nunca imprime credencial.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function refuse(message) {
  console.error(`provision:evolution-test-database REFUSED — ${message}`);
  process.exit(2);
}

const raw = process.env.EVOLUTION_TEST_DATABASE_URL?.trim();
if (!raw) refuse("EVOLUTION_TEST_DATABASE_URL is not set.");

let url;
try {
  url = new URL(raw);
} catch {
  refuse("EVOLUTION_TEST_DATABASE_URL is not a valid URL.");
}

const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
if (!LOOPBACK_HOSTS.has(host)) {
  refuse(`Host "${host}" is not loopback.`);
}

const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
if (!DISPOSABLE_NAME.test(database)) {
  refuse(`Database "${database}" is not recognised as disposable.`);
}

const require = createRequire(
  path.join(repositoryRoot, "apps", "bff", "package.json"),
);
const { Client } = require("pg");

const maintenanceUrl = new URL(raw);
maintenanceUrl.pathname = "/postgres";

const client = new Client({ connectionString: maintenanceUrl.toString() });
await client.connect();
try {
  const existing = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [database],
  );
  if (existing.rowCount === 0) {
    // Identificador citado: o nome já passou pela allowlist acima.
    await client.query(`CREATE DATABASE "${database.replace(/"/gu, '""')}"`);
    console.log(`created disposable database ${host}:${url.port || 5432}/${database}`);
  } else {
    console.log(`reusing disposable database ${host}:${url.port || 5432}/${database}`);
  }
} finally {
  await client.end();
}
