#!/usr/bin/env node

// `validate:integration` — executa a suíte de integração do BFF contra um
// PostgreSQL descartável, nomeado explicitamente em BFF_TEST_DATABASE_URL.
//
// O runner nunca cai em `.env`/produção: ele exige a URL de teste, valida que
// ela pertence a um ambiente descartável e injeta DATABASE_URL/
// DIRECT_DATABASE_URL no subprocesso. `dotenv` não sobrescreve variáveis já
// definidas, então o app enxerga exatamente o banco declarado — e a própria
// suíte reconfirma isso com `SELECT current_database()`.
//
// Códigos de saída: 0 sucesso, 1 falha de passo, 2 recusa por alvo inválido.

import { createRequire } from "node:module";
import path from "node:path";

import { isMain, printSummary, repositoryRoot, runGate } from "./lib/gate.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

// Parâmetros de query que NÃO podem redirecionar a conexão. Tudo fora desta
// lista é recusado: `host`, `hostaddr`, `port`, `dbname`, `service`,
// `servicefile`, `passfile` e `options` conseguem apontar o driver para outro
// servidor, socket ou banco sem mudar a autoridade da URL.
const ALLOWED_QUERY_PARAMS = new Set([
  "application_name",
  "connect_timeout",
  "connection_limit",
  "pool_timeout",
  "schema",
  "sslmode",
]);

export class IntegrationTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrationTargetError";
  }
}

/**
 * Valida o alvo de integração sem jamais expor credenciais.
 * Lança IntegrationTargetError quando a URL está ausente ou não pertence a um
 * ambiente descartável.
 */
export function resolveIntegrationTarget(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new IntegrationTargetError(
      "BFF_TEST_DATABASE_URL is not set. validate:integration refuses to run: it will not fall back to apps/bff/.env or to any inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new IntegrationTargetError(
      "BFF_TEST_DATABASE_URL is not a valid URL.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new IntegrationTargetError(
      `BFF_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!database) {
    throw new IntegrationTargetError(
      "BFF_TEST_DATABASE_URL must name a database.",
    );
  }
  if (!DISPOSABLE_NAME.test(database)) {
    throw new IntegrationTargetError(
      `Database "${database}" is not recognised as disposable. Provision a dedicated database whose name contains "test" (for example atendly_bff_test); this gate drops and recreates rows and must never touch a shared or product database.`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new IntegrationTargetError(
      `Host "${host}" is not loopback. validate:integration only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1), including the CI service container published on localhost.`,
    );
  }

  const port = url.port || "5432";

  const rejected = [...url.searchParams.keys()].filter(
    (key) => !ALLOWED_QUERY_PARAMS.has(key.toLowerCase()),
  );
  if (rejected.length > 0) {
    throw new IntegrationTargetError(
      `Query parameter(s) ${rejected.join(", ")} are not allowed in BFF_TEST_DATABASE_URL: they can send the driver to a host, socket, service or database other than the one validated here. Allowed: ${[...ALLOWED_QUERY_PARAMS].sort().join(", ")}.`,
    );
  }

  assertDriverResolvesSameDestination(raw, { host, port, database });

  return {
    url: raw,
    database,
    host,
    port,
    // Seguro para log: sem usuário, senha ou query string.
    label: `${host}:${port}/${database}`,
  };
}

// O consumer real do BFF é `PrismaPg` sobre `pg`; a autoridade da URL não é
// necessariamente o destino que esse driver resolve. Esta checagem usa o
// próprio parser do `pg` para comparar o destino efetivo com o que foi
// validado, em processo e sem abrir conexão, antes de qualquer subprocesso.
export function driverDestination(raw) {
  const parse = loadDriverParser();
  let resolved;
  try {
    resolved = parse(raw);
  } catch {
    throw new IntegrationTargetError(
      "BFF_TEST_DATABASE_URL could not be parsed by the PostgreSQL driver.",
    );
  }

  return {
    host: String(resolved.host ?? "")
      .toLowerCase()
      .replace(/^\[|\]$/gu, ""),
    port: String(resolved.port ?? "5432"),
    database: resolved.database ?? "",
  };
}

export function assertDriverResolvesSameDestination(raw, validated) {
  const { host, port, database } = driverDestination(raw);

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new IntegrationTargetError(
      `The PostgreSQL driver resolves host "${host}", which is not loopback. Refusing before any connection or subprocess.`,
    );
  }
  if (
    host !== validated.host ||
    port !== validated.port ||
    database !== validated.database
  ) {
    throw new IntegrationTargetError(
      `The PostgreSQL driver resolves ${host}:${port}/${database}, not the validated ${validated.host}:${validated.port}/${validated.database}. Refusing: the announced target is not the target that would be used.`,
    );
  }
}

function loadDriverParser() {
  // Resolvido a partir do package do BFF para ser exatamente a versão que o
  // app usa em runtime, não uma cópia da raiz.
  const bffRequire = createRequire(
    path.join(repositoryRoot, "apps", "bff", "package.json"),
  );
  try {
    return bffRequire("pg-connection-string").parse;
  } catch {
    throw new IntegrationTargetError(
      "Cannot verify the effective PostgreSQL destination: the BFF dependencies are not installed. Run `npm ci --prefix apps/bff` before validate:integration.",
    );
  }
}

// Banco próprio do ensaio do Evolution Go, no mesmo servidor descartável já
// validado. O sufixo mantém "test" no nome, então o alvo continua reconhecível
// como descartável por quem o consome.
export function evolutionTargetUrl(target) {
  const url = new URL(target.url);
  url.pathname = `/${encodeURIComponent(`${target.database}_evolution`)}`;
  return url.toString();
}

// Banco do ensaio de transporte da IA (Goal004). É o mesmo banco que
// `goal004-migration-rehearsal.mjs` cria e deixa no estado pós-migration, então
// a suíte de persistência/concorrência roda sobre o resultado do ensaio, não
// sobre um schema montado à parte.
export function aiTransportTargetUrl(target) {
  const url = new URL(target.url);
  url.pathname = `/${encodeURIComponent(`${target.database}_goal004`)}`;
  return url.toString();
}

// Chave de cifra sintética, fixa e pública por definição: existe apenas para
// que a suíte exercite selagem, abertura e rotação. Nenhuma credencial real
// entra aqui, e o valor jamais é usado fora do gate.
const SYNTHETIC_CREDENTIAL_KEY =
  "aW50ZWdyYXRpb24tb25seS1rZXktMDAwMS0zMmJ5dGU=";
const SYNTHETIC_CREDENTIAL_KEY_NEXT =
  "aW50ZWdyYXRpb24tb25seS1rZXktMDAwMi0zMmJ5dGU=";

// Segredos sintéticos: a suíte não deve herdar credenciais reais do shell nem
// alcançar serviços externos.
function childEnvironment(target) {
  return {
    NODE_ENV: "test",
    DATABASE_URL: target.url,
    DIRECT_DATABASE_URL: target.url,
    BFF_TEST_DATABASE_URL: target.url,
    EVOLUTION_TEST_DATABASE_URL: evolutionTargetUrl(target),
    AI_TEST_DATABASE_URL: aiTransportTargetUrl(target),
    BFF_RUN_INTEGRATION_TESTS: "true",
    JWT_SECRET: "integration-only-secret-with-at-least-32-characters",
    INTERNAL_SERVICE_TOKEN: "integration-only-internal-token",
    EVOLUTION_GO_API_KEY: "integration-only-evolution-key",
    EVOLUTION_WEBHOOK_SECRET: "integration-only-webhook-secret",
    WHATSAPP_CREDENTIAL_KEYS: `v1:${SYNTHETIC_CREDENTIAL_KEY},v2:${SYNTHETIC_CREDENTIAL_KEY_NEXT}`,
    WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: "v1",
    CHANNEL_CREDENTIAL_KEYS: `v1:${SYNTHETIC_CREDENTIAL_KEY},v2:${SYNTHETIC_CREDENTIAL_KEY_NEXT}`,
    CHANNEL_CREDENTIAL_ACTIVE_KEY_ID: "v1",
    PASSWORD_RESET_DELIVERY_URL: "",
    PASSWORD_RESET_DELIVERY_TOKEN: "",
  };
}

export function integrationSteps(target) {
  const env = childEnvironment(target);
  return [
    {
      // Checkout limpo não tem `src/generated/prisma` (gerado, fora do Git) e
      // `npm ci` não o produz. Sem esta etapa a suíte falha na importação.
      name: "generate:bff-prisma-client",
      cwd: "apps/bff",
      command: "npx",
      args: ["prisma", "generate"],
      env,
    },
    {
      name: "migrate:bff-test-database",
      cwd: "apps/bff",
      command: "npx",
      args: ["prisma", "migrate", "deploy"],
      env,
    },
    {
      name: "test:bff-integration",
      cwd: "apps/bff",
      command: "npx",
      args: ["vitest", "run"],
      env,
    },
    // Gate M0: ensaio da migration de vínculo contra estoque legado, em banco
    // próprio e descartável. Contagens sanitizadas, sem credencial na saída.
    {
      name: "rehearse:goal003-link-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal003-migration-rehearsal.mjs"],
      env,
    },
    // Ensaio de propriedade de metadados do Evolution Go. Usa o mesmo servidor
    // descartável, em banco próprio derivado do alvo já validado: nenhuma
    // variável nova precisa ser configurada, e o gate não fica dependente de
    // banco pessoal.
    {
      name: "provision:evolution-test-database",
      cwd: ".",
      command: "node",
      args: ["scripts/provision-evolution-test-database.mjs"],
      env,
    },
    {
      name: "test:evolution-go-ownership",
      cwd: "apps/evolution-go",
      command: "go",
      args: ["test", "-count=1", "./pkg/message/..."],
      env,
    },
    // Gate M0/M1 do Goal004: ensaio da migration de transporte contra estoque
    // legado, em banco próprio e descartável. Deixa o banco no estado
    // pós-migration para a suíte de persistência logo abaixo.
    {
      name: "rehearse:goal004-transport-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal004-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal005: ensaio da migration de contato, sessão e controle
    // humano contra estoque legado (handoff, pausa indefinida, `state` com
    // classificação, mensagens antigas), em banco próprio e descartável.
    {
      name: "rehearse:goal005-contact-session-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal005-migration-rehearsal.mjs"],
      env,
    },
    {
      // Checkout limpo não tem `src/generated/prisma`; sem isto a suíte falha
      // na importação do client.
      name: "generate:ai-orchestrator-prisma-client",
      cwd: "apps/ai-orchestrator",
      command: "npx",
      args: ["prisma", "generate"],
      env,
    },
    // Persistência e concorrência da inbox/outbox contra PostgreSQL real:
    // claim com SKIP LOCKED, serialização por conversa, lease e reconciliação.
    // Não pertence ao core porque exige banco.
    {
      name: "test:ai-orchestrator-transport-durability",
      cwd: "apps/ai-orchestrator",
      command: "npx",
      args: ["vitest", "run", "tests/integration"],
      env,
    },
    // Outbox técnico do Evolution Go contra o mesmo servidor descartável.
    {
      name: "test:evolution-go-webhook-outbox",
      cwd: "apps/evolution-go",
      command: "go",
      args: ["test", "-count=1", "./pkg/events/..."],
      env,
    },
  ];
}

export function main() {
  let target;
  try {
    target = resolveIntegrationTarget();
  } catch (error) {
    if (error instanceof IntegrationTargetError) {
      console.error(`validate:integration REFUSED — ${error.message}`);
      return 2;
    }
    throw error;
  }

  console.log(`validate:integration target: ${target.label}`);
  const { results, exitCode } = runGate("validate:integration", integrationSteps(target));
  printSummary("validate:integration", results);
  console.log(
    exitCode === 0
      ? `\nvalidate:integration PASSED against ${target.label}.`
      : "\nvalidate:integration FAILED — see the failed steps above.",
  );
  return exitCode;
}

if (isMain(import.meta.url)) process.exit(main());
