#!/usr/bin/env node

// Ensaio do Goal029 (WU-07): a reconciliação dono/réplica do fuso do negócio
// (D-010, `apps/bff/src/lib/timezone-reconciliation.ts`) contra duas bases
// PostgreSQL descartáveis de verdade — a do BFF (`BusinessProfile.timezone`,
// o dono) e a do Scheduling (`CalendarSettings.timezone`, a réplica) —,
// exercitando o código de produção real: o `SchedulingClient` do BFF fala
// HTTP de verdade, autenticado pela mesma credencial interna derivada em
// `internal-credentials.ts`, com um `scheduling-service` real de pé.
//
// O que este ensaio semeia é exatamente o estado que qualquer base que já
// passou por `PATCH /v1/settings/business` antes deste Goal pode carregar
// hoje: `BusinessProfile.timezone` (dono) já mudou, `CalendarSettings.
// timezone` (réplica) ficou para trás. Duas linhas nascem divergentes desse
// jeito, uma nasce já convergida — para provar que a passada de leitura não
// reescreve à toa quem já está certo (propriedade 2 de D-010: idempotente) —
// e uma nasce sem `CalendarSettings` nenhuma, para provar que a passada nunca
// cria a réplica que não existe (propriedade 5 de D-010).
//
// A convergência é provada por LEITURA DIRETA das duas bases depois da
// passada, nunca só pelo que a função de reconciliação devolveu: o ensaio
// reconecta a cada banco com `pg` puro e compara `BusinessProfile.timezone`
// com `CalendarSettings.timezone`, linha a linha.
//
// Duas bases próprias e descartáveis, derivadas de BFF_TEST_DATABASE_URL e
// recriadas do zero a cada execução — nunca as bases compartilhadas do resto
// do gate. `prisma migrate deploy` roda em cada uma com o histórico
// versionado de cada serviço, como em produção.
//
// As leituras reconciliadoras rodam sob `tsx` (subprocesso próprio, iniciado
// por este mesmo arquivo com a flag `--exercise`): é o único jeito de subir os
// dois apps TypeScript sem duplicar a lógica deles aqui. O subprocesso sobe um
// `scheduling-service` real numa porta efêmera, sobe o BFF real apontado para
// ela e exerce as ROTAS PÚBLICAS declaradas como pontos de reconciliação
// obrigatórios — `GET /v1/settings` e `GET /v1/calendar` —, com sessão de
// verdade e `requireTenantContext` valendo. Não é a função de reconciliação
// chamada por fora: o que precisa ser provado é que a leitura converge, e uma
// chamada direta ao módulo provaria só o módulo.
//
// Nenhuma credencial aparece na saída: strings de conexão passam por
// `redactConnectionStrings` antes de qualquer impressão, e o token interno
// usado para autenticar as duas metades do ensaio é sintético e nunca
// impresso. Códigos de saída: 0 sucesso, 1 falha de asserção, 2 recusa
// (destino inválido ou dependência ausente). Sem caminho de skip.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isMain } from "./lib/gate.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

// Sintético e de uso único deste ensaio: nunca deriva de segredo real e
// nunca é impresso. Serve só para as duas metades do subprocesso `--exercise`
// (a réplica do Scheduling e o `SchedulingClient` do BFF) concordarem na
// mesma credencial interna, como dois processos de produção fariam com
// `INTERNAL_SERVICE_TOKEN` compartilhado.
const INTERNAL_TOKEN =
  "goal029-timezone-reconciliation-rehearsal-synthetic-internal-token";

// Mesma natureza do token acima: sintético, de uso único deste ensaio e nunca
// impresso. Assina a sessão que as leituras públicas apresentam, para que o
// ensaio não dependa de `JWT_SECRET` de nenhum `.env` local.
const SESSION_SECRET =
  "goal029-timezone-reconciliation-rehearsal-synthetic-session-secret";

export class TimezoneRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimezoneRehearsalError";
  }
}

/** Remove usuário e senha de qualquer URL de conexão presente num texto. */
export function redactConnectionStrings(text) {
  return String(text ?? "").replace(
    /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]*@/gu,
    "$1***@",
  );
}

function refuse(message) {
  console.error(
    `goal029:timezone-reconciliation-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal029:timezone-reconciliation-rehearsal FAILED — ${redactConnectionStrings(message)}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

function bffRequire() {
  return createRequire(path.join(repositoryRoot, "apps", "bff", "package.json"));
}

/**
 * Quatro tenants sintéticos, cada um com a(s) rota(s) pública(s) que o
 * exercita(m).
 *
 * Dois nascem divergentes (dono já mudou, réplica ficou para trás — o estado
 * real de qualquer negócio que já passou por `PATCH /v1/settings/business`
 * antes deste Goal), e cada um é lido por **uma só** das duas rotas: é o que
 * faz `GET /v1/settings` e `GET /v1/calendar` ficarem provadas em separado.
 * Se os dois divergentes passassem pelas duas rotas, a primeira leitura
 * convergiria o tenant e a segunda rota não teria divergência para resolver —
 * a prova da segunda rota seria trivialmente verdadeira.
 *
 * O terceiro nasce já convergido e é lido pelas duas, para provar que nenhuma
 * das rotas escreve à toa sobre quem já está certo.
 *
 * O quarto nasce com dono gravado e SEM `CalendarSettings` nenhuma —
 * `replicaTimezone: null` significa "não semear a réplica", não "réplica
 * vazia" — e é lido pelas duas rotas, para provar a propriedade 5 de D-010:
 * réplica ausente sai `ABSENT`, sem escrita, e continua ausente depois de
 * qualquer leitura reconciliadora.
 */
export const TENANT_FIXTURES = Object.freeze([
  Object.freeze({
    tenantId: "goal029-rehearsal-divergent-settings",
    businessName: "Goal029 Rehearsal Divergent Settings",
    ownerTimezone: "America/Bahia",
    replicaTimezone: "America/Sao_Paulo",
    routes: Object.freeze(["/v1/settings"]),
  }),
  Object.freeze({
    tenantId: "goal029-rehearsal-divergent-calendar",
    businessName: "Goal029 Rehearsal Divergent Calendar",
    ownerTimezone: "America/Manaus",
    replicaTimezone: "America/Recife",
    routes: Object.freeze(["/v1/calendar"]),
  }),
  Object.freeze({
    tenantId: "goal029-rehearsal-convergent",
    businessName: "Goal029 Rehearsal Convergent",
    ownerTimezone: "America/Sao_Paulo",
    replicaTimezone: "America/Sao_Paulo",
    routes: Object.freeze(["/v1/settings", "/v1/calendar"]),
  }),
  Object.freeze({
    tenantId: "goal029-rehearsal-absent-replica",
    businessName: "Goal029 Rehearsal Absent Replica",
    ownerTimezone: "America/Fortaleza",
    replicaTimezone: null,
    routes: Object.freeze(["/v1/settings", "/v1/calendar"]),
  }),
]);

/**
 * Valida o alvo e monta o plano do ensaio, sem tocar em banco nem
 * subprocesso. Duas bases PRÓPRIAS e descartáveis são derivadas do mesmo
 * alvo já validado — nunca as bases compartilhadas do resto do gate.
 */
export function resolveRehearsalPlan(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new TimezoneRehearsalError(
      "BFF_TEST_DATABASE_URL is not set. This rehearsal refuses to run: it will not fall back to any app .env or to an inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TimezoneRehearsalError("BFF_TEST_DATABASE_URL is not a valid URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TimezoneRehearsalError(
      `BFF_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new TimezoneRehearsalError(
      `Host "${host}" is not loopback. This rehearsal drops and recreates whole databases and only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1).`,
    );
  }

  const baseDatabase = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!baseDatabase) {
    throw new TimezoneRehearsalError("BFF_TEST_DATABASE_URL must name a database.");
  }
  if (!DISPOSABLE_NAME.test(baseDatabase)) {
    throw new TimezoneRehearsalError(
      `Database "${baseDatabase}" is not recognised as disposable. This rehearsal issues DROP DATABASE and must never touch a shared or product database; the name must contain "test".`,
    );
  }

  const port = url.port || "5432";
  const bff = derivedTarget(raw, baseDatabase, "goal029_bff", host, port);
  const scheduling = derivedTarget(raw, baseDatabase, "goal029_scheduling", host, port);

  const maintenance = new URL(raw);
  maintenance.pathname = "/postgres";

  return { maintenance: maintenance.href, host, port, bff, scheduling };
}

function derivedTarget(raw, baseDatabase, suffix, host, port) {
  const database = `${baseDatabase}_${suffix}`;
  // O nome derivado também passa pela allowlist: se o sufixo apagasse a marca
  // de descarte, o DROP seguinte seria cego.
  if (!DISPOSABLE_NAME.test(database)) {
    throw new TimezoneRehearsalError(`Derived database "${database}" is not recognised as disposable.`);
  }
  const target = new URL(raw);
  target.pathname = `/${encodeURIComponent(database)}`;
  return {
    database,
    url: target.href,
    // Seguro para log: sem usuário, senha ou query string.
    label: `${host}:${port}/${database}`,
  };
}

/**
 * Exige, ANTES de qualquer conexão, que as dependências de que o ensaio
 * depende existam: o driver `pg`, a CLI do Prisma de cada serviço e `tsx`
 * (a leitura reconciliadora real é TypeScript e roda sob ele). Ausência é
 * recusa com exit 2, nunca skip.
 */
export function assertRequiredBinaries() {
  try {
    bffRequire().resolve("pg");
  } catch {
    throw new TimezoneRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
  try {
    bffRequire().resolve("tsx/package.json");
  } catch {
    throw new TimezoneRehearsalError(
      "tsx is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal — it drives the exercise that imports the real BFF SchedulingClient and the real Scheduling service under a TypeScript loader.",
    );
  }
  try {
    bffRequire().resolve("prisma/package.json");
  } catch {
    throw new TimezoneRehearsalError(
      "The Prisma CLI is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
  const schedulingRequire = createRequire(
    path.join(repositoryRoot, "apps", "scheduling-service", "package.json"),
  );
  try {
    schedulingRequire.resolve("prisma/package.json");
  } catch {
    throw new TimezoneRehearsalError(
      "The Prisma CLI is not installed for apps/scheduling-service. Run `npm ci --prefix apps/scheduling-service` before this rehearsal.",
    );
  }
}

async function recreateDatabase(maintenanceUrl, database) {
  const { Client } = bffRequire()("pg");
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  try {
    const quoted = `"${database.replace(/"/gu, '""')}"`;
    // FORCE derruba conexão remanescente de uma execução anterior.
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${quoted}`);
    await maintenance.query(`ALTER DATABASE ${quoted} SET TimeZone = 'UTC'`);
  } finally {
    await maintenance.end();
  }
}

/**
 * `prisma migrate deploy` do histórico versionado de um serviço contra o seu
 * banco descartável. Comando entregue como string única ao shell porque
 * `npx` no Windows é um script `.cmd` e o Node recusa executá-lo sem shell.
 */
function runPrisma(appDir, url) {
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url };
  const outcome = spawnSync("npx prisma migrate deploy", {
    cwd: path.join(repositoryRoot, "apps", appDir),
    env,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(`${outcome.stdout ?? ""}${outcome.stderr ?? ""}`).trim(),
  };
}

/**
 * Semeia Tenant + BusinessProfile (o dono) + o usuário dono e o seu vínculo
 * direto no banco do BFF.
 *
 * O usuário e o `TenantMember` existem porque a leitura reconciliadora é
 * exercida pelas **rotas públicas**, e elas passam por `requireTenantContext`:
 * sem dono autenticado não há tenant resolvido e não há leitura para
 * reconciliar. O hash de senha é sintético e nunca é usado para autenticar —
 * o ensaio emite a sessão pelo próprio código de sessão do BFF, sem login.
 */
async function seedBff(url, fixtures) {
  const { Client } = bffRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const fixture of fixtures) {
      await client.query(
        `INSERT INTO "Tenant" ("id", "name", "updatedAt") VALUES ($1, $2, now())`,
        [fixture.tenantId, fixture.businessName],
      );
      await client.query(
        `INSERT INTO "BusinessProfile" ("id", "tenantId", "businessName", "timezone", "updatedAt")
         VALUES ($1, $2, $3, $4, now())`,
        [`${fixture.tenantId}-profile`, fixture.tenantId, fixture.businessName, fixture.ownerTimezone],
      );
      await client.query(
        `INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt")
         VALUES ($1, $2, $3, now())`,
        [
          `${fixture.tenantId}-user`,
          `${fixture.tenantId}@example.invalid`,
          "rehearsal-only-never-verified",
        ],
      );
      await client.query(
        `INSERT INTO "TenantMember" ("id", "tenantId", "userId", "role")
         VALUES ($1, $2, $3, 'OWNER')`,
        [`${fixture.tenantId}-member`, fixture.tenantId, `${fixture.tenantId}-user`],
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Semeia CalendarSettings (a réplica) direto no banco do Scheduling.
 *
 * `replicaTimezone: null` num fixture significa "esta réplica não existe" —
 * a linha não é inserida, para que o tenant chegue às rotas do jeito que a
 * propriedade 5 de D-010 precisa provar (tenant sem agenda nunca escolhida).
 */
async function seedScheduling(url, fixtures) {
  const { Client } = bffRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const fixture of fixtures) {
      if (fixture.replicaTimezone === null) continue;
      await client.query(
        `INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone", "updatedAt")
         VALUES ($1, 'ATENDLY', $2, now())`,
        [fixture.tenantId, fixture.replicaTimezone],
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Lê as duas bases DIRETO, cada uma com sua própria conexão `pg`: o dono em
 * `BusinessProfile.timezone` e a réplica em `CalendarSettings.timezone`. É a
 * prova de convergência deste ensaio — nunca a resposta HTTP da leitura
 * reconciliadora.
 */
async function readState(bffUrl, schedulingUrl, tenantIds) {
  const { Client } = bffRequire()("pg");
  const bffClient = new Client({ connectionString: bffUrl });
  const schedulingClient = new Client({ connectionString: schedulingUrl });
  await Promise.all([bffClient.connect(), schedulingClient.connect()]);
  try {
    const [ownerRows, replicaRows] = await Promise.all([
      bffClient.query(
        `SELECT "tenantId", "timezone" FROM "BusinessProfile" WHERE "tenantId" = ANY($1::text[])`,
        [tenantIds],
      ),
      schedulingClient.query(
        `SELECT "tenantId", "timezone", "updatedAt"::text AS "updatedAt"
         FROM "CalendarSettings" WHERE "tenantId" = ANY($1::text[])`,
        [tenantIds],
      ),
    ]);
    const owners = Object.fromEntries(ownerRows.rows.map((row) => [row.tenantId, row.timezone]));
    const replicas = Object.fromEntries(
      replicaRows.rows.map((row) => [row.tenantId, { timezone: row.timezone, updatedAt: row.updatedAt }]),
    );
    return tenantIds.map((tenantId) => ({
      tenantId,
      owner: owners[tenantId] ?? null,
      replica: replicas[tenantId]?.timezone ?? null,
      replicaUpdatedAt: replicas[tenantId]?.updatedAt ?? null,
    }));
  } finally {
    await bffClient.end();
    await schedulingClient.end();
  }
}

/**
 * Roda as leituras reconciliadoras reais — `GET /v1/settings` e
 * `GET /v1/calendar` do BFF de produção, contra um `scheduling-service` real —
 * num subprocesso `tsx`: este mesmo arquivo, reinvocado com `--exercise`. É o
 * único jeito de subir os dois apps TypeScript sem duplicar a lógica deles
 * aqui.
 */
function runExercise(plan, fixtures) {
  const scriptPath = fileURLToPath(import.meta.url);
  const cwd = path.join(repositoryRoot, "apps", "bff");
  // Caminho relativo com barra normal: evita qualquer questão de escape de
  // barra invertida na string de comando entregue ao shell.
  const relativeScriptPath = path.relative(cwd, scriptPath).split(path.sep).join("/");

  const env = {
    ...process.env,
    GOAL029_BFF_DB_URL: plan.bff.url,
    GOAL029_SCHEDULING_DB_URL: plan.scheduling.url,
    GOAL029_INTERNAL_TOKEN: INTERNAL_TOKEN,
    // Fixo e sintético: as duas metades deste ensaio precisam concordar na
    // assinatura da sessão emitida, e herdar um segredo de `.env` faria o
    // ensaio depender de configuração local. Nunca é impresso.
    JWT_SECRET: SESSION_SECRET,
    GOAL029_TENANTS: JSON.stringify(
      fixtures.map((fixture) => ({
        tenantId: fixture.tenantId,
        ownerTimezone: fixture.ownerTimezone,
        routes: [...fixture.routes],
      })),
    ),
  };

  const outcome = spawnSync(`npx tsx ${relativeScriptPath} --exercise`, {
    cwd,
    env,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(`${outcome.stdout ?? ""}${outcome.stderr ?? ""}`).trim(),
  };
}

const EXERCISE_RESULT_MARKER = "GOAL029_EXERCISE_RESULT ";

export function parseExerciseResults(output) {
  const line = output.split("\n").find((entry) => entry.startsWith(EXERCISE_RESULT_MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(EXERCISE_RESULT_MARKER.length));
  } catch {
    return null;
  }
}

/**
 * Metade `--exercise`: roda sob `tsx`, num subprocesso próprio. Sobe um
 * `scheduling-service` real numa porta efêmera contra o banco descartável do
 * Scheduling, sobe o **BFF real** contra o banco descartável do BFF apontado
 * para ela, e exerce as leituras que o Goal declara como pontos de
 * reconciliação obrigatórios: `GET /v1/settings` e `GET /v1/calendar`.
 *
 * São as rotas públicas de verdade, com `requireTenantContext` valendo e a
 * sessão emitida pelo próprio código de sessão do BFF — não a função de
 * reconciliação chamada por fora. O que o Goal precisa provar é que **a
 * leitura** converge, e uma chamada direta ao módulo provaria só o módulo.
 *
 * Nunca imprime as URLs de conexão, o token interno nem o cookie de sessão.
 */
async function runExerciseChild() {
  const bffDbUrl = process.env.GOAL029_BFF_DB_URL;
  const schedulingDbUrl = process.env.GOAL029_SCHEDULING_DB_URL;
  const internalToken = process.env.GOAL029_INTERNAL_TOKEN;
  const tenants = JSON.parse(process.env.GOAL029_TENANTS ?? "[]");

  process.env.NODE_ENV = "test";
  process.env.INTERNAL_SERVICE_TOKEN = internalToken;
  // Desligado de propósito: este ensaio não precisa do laço de conclusão
  // automática do Scheduling, e ele manteria o processo vivo além do
  // necessário.
  process.env.CALENDAR_AUTO_COMPLETE_ENABLED = "false";
  process.env.DATABASE_URL = schedulingDbUrl;
  process.env.DIRECT_DATABASE_URL = schedulingDbUrl;

  const { buildApp: buildSchedulingApp } = await import(
    pathToFileURL(
      path.join(repositoryRoot, "apps", "scheduling-service", "src", "app", "build-app.ts"),
    ).href
  );
  const schedulingApp = await buildSchedulingApp();
  const address = await schedulingApp.listen({ host: "127.0.0.1", port: 0 });

  process.env.DATABASE_URL = bffDbUrl;
  process.env.DIRECT_DATABASE_URL = bffDbUrl;
  process.env.SCHEDULING_SERVICE_BASE_URL = address;

  const bffSource = (...segments) =>
    pathToFileURL(path.join(repositoryRoot, "apps", "bff", "src", ...segments)).href;

  const { buildApp: buildBffApp } = await import(bffSource("app.ts"));
  const { signSession } = await import(bffSource("lib", "auth.ts"));
  const { createUserSession } = await import(bffSource("lib", "session.ts"));
  const { env } = await import(bffSource("config", "env.ts"));

  const bffApp = await buildBffApp();
  await bffApp.ready();

  const results = [];
  try {
    for (const tenant of tenants) {
      const user = {
        id: `${tenant.tenantId}-user`,
        email: `${tenant.tenantId}@example.invalid`,
      };
      // Sessão emitida pelo caminho de produção (linha em `UserSession` mais
      // JWT assinado), não por header forjado: as rotas exercidas abaixo
      // passam por `requireAuth` de verdade.
      const session = await createUserSession(user.id);
      const token = await signSession(user, session.sessionId);

      for (const route of tenant.routes) {
        const response = await bffApp.inject({
          method: "GET",
          url: route,
          headers: { cookie: `${env.SESSION_COOKIE_NAME}=${token}` },
        });
        const payload = response.statusCode === 200 ? response.json().data : null;
        results.push({
          tenantId: tenant.tenantId,
          route,
          status: response.statusCode,
          // `GET /v1/settings` devolve as duas cópias lado a lado;
          // `GET /v1/calendar` devolve só a réplica, que é o valor de que a
          // agenda do frontend depende.
          businessTimezone: payload?.business?.timezone ?? null,
          calendarTimezone:
            route === "/v1/calendar"
              ? (payload?.timezone ?? null)
              : (payload?.calendar?.timezone ?? null),
        });
      }
    }
  } finally {
    await bffApp.close();
    await schedulingApp.close();
  }

  process.stdout.write(`${EXERCISE_RESULT_MARKER}${JSON.stringify(results)}\n`);
}

export async function rehearse(plan) {
  await recreateDatabase(plan.maintenance, plan.bff.database);
  await recreateDatabase(plan.maintenance, plan.scheduling.database);

  const bffMigration = runPrisma("bff", plan.bff.url);
  if (
    !assert(
      bffMigration.status === 0,
      `prisma migrate deploy failed for the BFF rehearsal database, exit ${bffMigration.status}\n${bffMigration.output}`,
    )
  ) {
    return;
  }

  const schedulingMigration = runPrisma("scheduling-service", plan.scheduling.url);
  if (
    !assert(
      schedulingMigration.status === 0,
      `prisma migrate deploy failed for the Scheduling rehearsal database, exit ${schedulingMigration.status}\n${schedulingMigration.output}`,
    )
  ) {
    return;
  }

  const fixtures = TENANT_FIXTURES;
  await seedBff(plan.bff.url, fixtures);
  await seedScheduling(plan.scheduling.url, fixtures);

  const tenantIds = fixtures.map((fixture) => fixture.tenantId);
  const before = await readState(plan.bff.url, plan.scheduling.url, tenantIds);
  // Réplica ausente (`row.replica === null`) não é réplica divergente: é o
  // caso separado da propriedade 5, contado abaixo.
  const divergencesCreated = before.filter(
    (row) => row.replica !== null && row.owner !== row.replica,
  ).length;
  const absentReplicas = before.filter((row) => row.replica === null).length;

  console.log(
    `goal029:timezone-reconciliation-rehearsal seeded ${fixtures.length} tenant(s), ` +
      `${divergencesCreated} with a divergent replica (owner already changed, replica stale), ` +
      `${absentReplicas} with no CalendarSettings replica at all`,
  );
  if (
    !assert(
      divergencesCreated >= 1,
      "the fixture must seed at least one tenant with a divergent replica — otherwise the rehearsal proves nothing about convergence",
    )
  ) {
    return;
  }
  if (
    !assert(
      absentReplicas >= 1,
      "the fixture must seed at least one tenant with no CalendarSettings replica — otherwise the rehearsal proves nothing about property 5 (never create the replica)",
    )
  ) {
    return;
  }
  // Cada rota reconciliadora precisa receber, sozinha, um tenant que nasce
  // divergente. Sem isso o ensaio poderia passar com uma das duas rotas nunca
  // tendo tido divergência para resolver.
  for (const route of ["/v1/settings", "/v1/calendar"]) {
    const divergentForRoute = fixtures.filter(
      (fixture) =>
        fixture.ownerTimezone !== fixture.replicaTimezone &&
        fixture.routes.length === 1 &&
        fixture.routes[0] === route,
    );
    if (
      !assert(
        divergentForRoute.length >= 1,
        `no seeded tenant reaches ${route} as its only reconciling read while diverging — that route would be proved by another route's convergence`,
      )
    ) {
      return;
    }
  }

  const exercise = runExercise(plan, fixtures);
  if (
    !assert(
      exercise.status === 0,
      "the reconciling reads (GET /v1/settings and GET /v1/calendar on the real BFF, against a real Scheduling service, over the two rehearsal databases) failed, exit " +
        `${exercise.status}\n${exercise.output}`,
    )
  ) {
    return;
  }

  const results = parseExerciseResults(exercise.output);
  if (
    !assert(
      results !== null,
      `the reconciling reads did not report a parseable result\n${exercise.output}`,
    )
  ) {
    return;
  }
  console.log(
    `goal029:timezone-reconciliation-rehearsal reconciling reads reported: ` +
      results
        .map((row) => `${row.tenantId} ${row.route} -> ${row.status} tz=${row.calendarTimezone}`)
        .join(", "),
  );

  const expectedReads = fixtures.reduce((total, fixture) => total + fixture.routes.length, 0);
  if (
    !assert(
      results.length === expectedReads,
      `every seeded tenant must be read by each of its declared routes — expected ${expectedReads} read(s), got ${results.length}`,
    )
  ) {
    return;
  }

  for (const fixture of fixtures) {
    for (const route of fixture.routes) {
      const read = results.find(
        (row) => row.tenantId === fixture.tenantId && row.route === route,
      );
      if (
        !assert(read !== undefined, `${fixture.tenantId}: ${route} was never exercised`)
      ) {
        continue;
      }
      // A leitura pública responde normalmente: a reconciliação é efeito de
      // favor e nunca transforma a leitura em erro.
      assert(
        read.status === 200,
        `${fixture.tenantId}: ${route} must answer 200, got ${read.status}`,
      );
      if (fixture.replicaTimezone === null) {
        // Propriedade 5: sem `CalendarSettings`, a leitura nunca inventa um
        // fuso de réplica — o outcome é `ABSENT`, não `CONVERGED`.
        assert(
          read.calendarTimezone === null,
          `${fixture.tenantId}: ${route} must report no calendar timezone (CalendarSettings absent, reconciliation must never create it) — got ${read.calendarTimezone}`,
        );
      } else {
        // E a resposta não afirma convergência que não houve: o `timezone` que
        // a rota devolve é o da réplica depois da passada, e com o Scheduling
        // de pé ele tem de ser o do dono.
        assert(
          read.calendarTimezone === fixture.ownerTimezone,
          `${fixture.tenantId}: ${route} must report the owner's timezone (${fixture.ownerTimezone}) after reconciling — got ${read.calendarTimezone}`,
        );
      }
      if (route === "/v1/settings") {
        assert(
          read.businessTimezone === fixture.ownerTimezone,
          `${fixture.tenantId}: GET /v1/settings must keep reporting the owner (${fixture.ownerTimezone}) — got ${read.businessTimezone}`,
        );
      }
    }
  }

  const after = await readState(plan.bff.url, plan.scheduling.url, tenantIds);
  // Só tenants seguidos com réplica podem convergir; o tenant sem
  // `CalendarSettings` é provado à parte, abaixo, contra `null`.
  const replicatedFixtures = fixtures.filter((fixture) => fixture.replicaTimezone !== null);
  const convergedCount = after.filter(
    (row) =>
      replicatedFixtures.some((fixture) => fixture.tenantId === row.tenantId) &&
      row.owner !== null &&
      row.owner === row.replica,
  ).length;

  console.log(
    `goal029:timezone-reconciliation-rehearsal direct read of both databases after the reconciling reads: ` +
      `${convergedCount} of ${replicatedFixtures.length} tenant(s) with a replica converged`,
  );

  assert(
    convergedCount === replicatedFixtures.length,
    `every seeded tenant with a CalendarSettings replica must converge (owner timezone equal to replica timezone), reading both databases directly — got ${convergedCount} of ${replicatedFixtures.length}`,
  );

  for (const row of before) {
    const afterRow = after.find((entry) => entry.tenantId === row.tenantId);
    if (row.replica === null) {
      // Propriedade 5, provada por leitura direta do banco: nenhuma passada
      // cria a linha que não existia.
      assert(
        afterRow?.replica === null,
        `${row.tenantId}: a tenant with no CalendarSettings must still have none after the reconciling reads, reading CalendarSettings directly — found ${afterRow?.replica}`,
      );
    } else if (row.owner !== row.replica) {
      assert(
        afterRow?.replica === row.owner,
        `${row.tenantId}: the replica must be rewritten to the owner's timezone (${row.owner}), reading CalendarSettings directly — found ${afterRow?.replica}`,
      );
      assert(
        afterRow?.replicaUpdatedAt !== row.replicaUpdatedAt,
        `${row.tenantId}: a rewritten replica must carry a new updatedAt`,
      );
    } else {
      assert(
        afterRow?.replica === row.replica,
        `${row.tenantId}: an already-converged tenant must not have its replica rewritten`,
      );
    }
  }
}

export async function main() {
  let plan;
  try {
    assertRequiredBinaries();
    plan = resolveRehearsalPlan();
  } catch (error) {
    if (error instanceof TimezoneRehearsalError) refuse(error.message);
    throw error;
  }

  console.log(
    `goal029:timezone-reconciliation-rehearsal target: BFF ${plan.bff.label}, Scheduling ${plan.scheduling.label}`,
  );

  try {
    await rehearse(plan);
  } catch (error) {
    if (error instanceof TimezoneRehearsalError) refuse(error.message);
    console.error(
      `goal029:timezone-reconciliation-rehearsal FAILED — ${redactConnectionStrings(error.stack ?? error.message)}`,
    );
    process.exitCode = 1;
  }

  if (process.exitCode) {
    console.error("goal029:timezone-reconciliation-rehearsal FAILED — see the assertions above.");
  } else {
    console.log(
      "\ngoal029:timezone-reconciliation-rehearsal PASSED — against two disposable PostgreSQL databases, the real " +
        "public reconciling reads (GET /v1/settings and GET /v1/calendar on the real BFF, against a real Scheduling " +
        "service) converged every seeded tenant that had a CalendarSettings replica, each route proving its own " +
        "divergent tenant, and the convergence is proved by reading BusinessProfile.timezone and " +
        "CalendarSettings.timezone directly, not by the HTTP response — with the divergent replicas rewritten to " +
        "the owner's timezone, the already-converged tenant left untouched by either route, and the tenant with no " +
        "CalendarSettings left without one after both routes.",
    );
  }
}

if (process.argv[2] === "--exercise") {
  await runExerciseChild();
} else if (isMain(import.meta.url)) {
  await main();
}
