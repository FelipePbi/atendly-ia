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

// Banco próprio da suíte de identidade de cliente do Scheduling (Goal006), no
// mesmo servidor descartável já validado. O sufixo mantém "test" no nome, então
// o alvo continua reconhecível como descartável por quem o consome.
export function schedulingTargetUrl(target) {
  const url = new URL(target.url);
  url.pathname = `/${encodeURIComponent(`${target.database}_scheduling`)}`;
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
    SCHEDULING_TEST_DATABASE_URL: schedulingTargetUrl(target),
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
    // Gate M0/M1 do Goal006: ensaio da migração de identidade de cliente contra
    // estoque legado (telefone obrigatório e único), em banco próprio e
    // descartável, com expansão e corte em passos separados.
    {
      name: "rehearse:goal006-customer-identity-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal006-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal006 na IA: referência ao cliente no Contato e índice
    // parcial de sessão aberta (resíduo do Goal005), em banco próprio.
    {
      name: "rehearse:goal006-ai-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal006-ai-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal007: ensaio da migração de catálogo e acordo
    // comercial contra estoque legado (duração obrigatória, dois tipos de
    // preço), em banco próprio e descartável, com expansão e constraints em
    // passos separados.
    {
      name: "rehearse:goal007-catalog-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal007-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal008: ensaio da migração de transações, holds e
    // histórico da agenda contra estoque legado (atendimentos SCHEDULED e
    // CANCELLED, idempotências COMPLETED e PENDING), em banco próprio e
    // descartável, com expansão e normalização de status em passos
    // separados — a normalização precedida de guarda contra status
    // desconhecido.
    {
      name: "rehearse:goal008-agenda-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal008-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal009: ensaio da migração de regras de oferta,
    // buffers, exceções, séries de bloqueio/compromisso e série de
    // atendimento contra estoque legado (fim do Goal008), em banco próprio
    // e descartável, passo único aditivo.
    {
      name: "rehearse:goal009-occupancy-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal009-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0-M3 do Goal010: ensaio da migração da sessão de importação
    // única contra o estoque legado do protocolo bidirecional anterior
    // (MigrationJob em cinco estados, MigrationConflict, ExternalEntityMap),
    // em banco próprio e descartável, passo único aditivo. Prova
    // preservação linha a linha, classificação conservadora do job legado
    // sem criar nem consumir conclusão de importação, e repetição sem
    // mudança. M4 (corte contra a origem real) não é exercitado aqui.
    {
      name: "rehearse:goal010-import-session-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal010-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal011: ensaio das migrations de estilo de conversa com
    // tres valores nos dois bancos que declaram o enum "AiTone" — IA (tres
    // passos: vocabulario, backfill, default) e BFF (dois passos: vocabulario,
    // backfill, sem default). Dois bancos proprios e descartaveis, derivados
    // do mesmo alvo ja validado. Prova backfill linha a linha, leitura do
    // valor legado depois do corte e repeticao sem mudanca de estado.
    {
      name: "rehearse:goal011-ai-style-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal011-ai-style-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal012: ensaio da migração de conhecimento por serviço
    // (KnowledgeDocument.serviceId), memória do cliente (CustomerMemory) e
    // propósito do AiRun (AiRun.kind) contra estoque legado, em banco próprio
    // e descartável, sem depender da extensão pgvector. Expande também o
    // banco de durabilidade da IA (Goal004) com a mesma migração, antes da
    // suíte de persistência logo abaixo.
    {
      name: "rehearse:goal012-knowledge-memory-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal012-knowledge-memory-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal013: ensaio da migração de kinds de mídia
    // (Message.kind), MessageAttachment e purga do base64 embutido do
    // ProcessedEvent concluído, contra estoque legado, em banco próprio e
    // descartável. Expande também o banco de durabilidade da IA (Goal004)
    // com a mesma migração, antes da suíte de persistência mais abaixo.
    {
      name: "rehearse:goal013-media-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal013-media-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal019: ensaio da migration da execução do teste real
    // (`ActivationTestRun`, `ActivationTestMilestone`) contra um tenant que já
    // existia, em banco próprio e descartável — aditividade, ausência de
    // backfill, uma execução viva por tenant e marco sem fonte impossível.
    // Expande também o banco de durabilidade da IA (Goal004) com a mesma
    // migração, antes da suíte de persistência mais abaixo.
    {
      name: "rehearse:goal019-activation-test-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal019-activation-test-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal021: ensaio da migration de lembretes no Scheduling
    // (`ReminderSettings`, `ReminderRule`, `Appointment.notifiableVersion`,
    // `AppointmentNotificationIntent`) contra estoque legado, em banco próprio
    // e descartável, passo único aditivo. Prova aditividade coluna a coluna,
    // ausência de backfill (nenhum atendimento existente ganha lembrete
    // retroativo), a impossibilidade do terceiro lembrete, o dedupe por
    // inserção duplicada — inclusive do aviso de alteração, com posição
    // própria e não nula — e repetição sem mudança.
    {
      name: "rehearse:goal021-reminder-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal021-reminder-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal022: ensaio da migration da central de notificacoes
    // no BFF (`TenantNotification`, `NotificationPreference`,
    // `NotificationSyncState`) contra estoque legado de negocios, em banco
    // próprio e descartável, passo único aditivo. Prova aditividade coluna a
    // coluna, ausência de backfill, o dedupe por (tenantId, dedupeKey) por
    // inserção duplicada — a mesma chave que `createMany({ skipDuplicates })`
    // usa em produção —, vocabulário fechado de kind/level/shape, no máximo
    // uma preferência e um cursor por negócio, cascata de negócio removido
    // e repetição sem mudança.
    {
      name: "rehearse:goal022-notification-center-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal022-notification-center-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal023: ensaio das quatro migrations de retencao
    // configuravel e purga de conteudo multistore (BFF `RetentionSettings` e
    // `RetentionSweepState`, IA `Conversation.contentExpiredThrough`,
    // Scheduling indice `tenantId/state/settledAt`), tres bancos próprios e
    // descartáveis. Prova aditividade, ausência de backfill, cascata onde há
    // FK de tenant e — o que nenhum ensaio anterior deste Goal prova — que
    // reaplicar qualquer uma das quatro sobre banco já migrado não falha nem
    // muda uma linha (a divergência que o review022 registrou).
    {
      name: "rehearse:goal023-retention-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal023-retention-migration-rehearsal.mjs"],
      env,
    },
    // Gate M0/M1 do Goal027: ensaio da migration que trava
    // `CalendarSettings.source` em `ATENDLY` no Scheduling, em banco próprio e
    // descartável. É a primeira migration do repositório que REESCREVE dado
    // existente, e o ensaio prova coluna a coluna o que mudou e o que não
    // mudou: negócio já `ATENDLY` intocado (nem `updatedAt` se move), negócios
    // `MINHA_AGENDA` reescritos com a contagem REPORTADA, negócio sem linha
    // continua sem, `MigrationJob` com `source`/`target` legados preservado
    // (é por ele que o enum mantém os dois valores, D-026), nada apagado, a
    // constraint `CalendarSettings_source_atendly_check` recusando `UPDATE` e
    // `INSERT` reais com `23514` — contra um valor que o mesmo banco aceitava
    // antes da migration — e segunda execução sem efeito.
    {
      name: "rehearse:goal027-calendar-source-migration",
      cwd: ".",
      command: "node",
      args: ["scripts/goal027-calendar-source-migration-rehearsal.mjs"],
      env,
    },
    // Ensaio de release do Goal028: o historico COMPLETO de migrations dos
    // tres servicos aplicado DO ZERO em banco vazio e descartavel proprio.
    // Os ensaios por Goal acima exercitam UMA migration cada um sobre um
    // recorte de schema reconstruido a mao; nenhum deles prova que
    // `prisma migrate deploy` leva um banco vazio ate o schema vigente, que e
    // o que a primeira subida de producao faz. Prova, por servico, que a
    // contagem de migrations aplicadas bate com o numero de diretorios lido da
    // arvore, que nenhuma ficou pela metade ou revertida, que a segunda
    // execucao nao aplica nada e que o banco migrado nao divergiu do
    // `schema.prisma`.
    {
      name: "rehearse:goal028-release-migrations",
      cwd: ".",
      command: "node",
      args: ["scripts/goal028-release-rehearsal.mjs"],
      env,
    },
    // Ensaio de dump/restore do Goal028: dado real semeado em cadeia nos tres
    // bancos que o passo acima acaba de migrar do zero, `pg_dump` em formato
    // custom, `pg_restore` em banco NOVO e comparacao entre origem e destino —
    // contagem por tabela, `_prisma_migrations`, indices, constraints nomeadas
    // e enums. Depende do passo anterior de proposito: ele produz os bancos de
    // origem. Prova, por tentativa real de `UPDATE` contra o banco RESTAURADO,
    // que `CalendarSettings_source_atendly_check` sobrevive ao restore e ainda
    // recusa `MINHA_AGENDA` com `23514`. Ausencia de `pg_dump`/`pg_restore` no
    // PATH e recusa com exit 2, nunca skip.
    {
      name: "rehearse:goal028-restore",
      cwd: ".",
      command: "node",
      args: ["scripts/goal028-restore-rehearsal.mjs"],
      env,
    },
    // Identidade de cliente contra PostgreSQL real: telefone compartilhado,
    // cliente sem telefone, criação só na confirmação e isolamento por tenant.
    // Não pertence ao core porque exige banco.
    {
      // Checkout limpo não tem `apps/scheduling-service/src/generated/prisma`.
      name: "generate:scheduling-prisma-client",
      cwd: "apps/scheduling-service",
      command: "npx",
      args: ["prisma", "generate"],
      env,
    },
    {
      name: "provision:scheduling-test-database",
      cwd: ".",
      command: "node",
      args: ["scripts/provision-scheduling-test-database.mjs"],
      env,
    },
    {
      name: "test:scheduling-integration",
      cwd: "apps/scheduling-service",
      command: "npx",
      args: ["vitest", "run", "--dir", "tests/integration"],
      env,
    },
    // Ensaio da reconciliação dono/réplica do fuso do negócio (Goal029/D-010):
    // duas bases descartáveis PRÓPRIAS (não as de cima), estado semeado com
    // divergência real entre BusinessProfile.timezone e CalendarSettings.
    // timezone, leitura reconciliadora real exercida contra um
    // scheduling-service real numa porta efêmera, convergência provada por
    // leitura direta das duas bases. Ausência de pg/prisma/tsx é recusa com
    // exit 2, nunca skip.
    {
      name: "rehearse:goal029-timezone-reconciliation",
      cwd: ".",
      command: "node",
      args: ["scripts/goal029-timezone-reconciliation-rehearsal.mjs"],
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
    // Purga de conteúdo de conversa (Goal023) contra o mesmo banco: o que a
    // purga apaga, e sobretudo o que ela não alcança — não classificado,
    // órfão de sessão, dentro do prazo e o negócio vizinho. Passo próprio
    // porque apagar dado de cliente não é "mais um caso de durabilidade".
    {
      name: "test:ai-orchestrator-content-purge",
      cwd: "apps/ai-orchestrator",
      command: "npx",
      args: ["vitest", "run", "tests/retention"],
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
    // Ensaio do percurso ponta a ponta do Goal030: mesmo tenant exercitado nas
    // etapas 6 a 11 contra BFF, Scheduling e IA reais, em três bancos
    // descartáveis, com controle negativo, idempotência e contagens por etapa.
    {
      name: "rehearse:goal030-mvp-journey",
      cwd: ".",
      command: "node",
      args: ["scripts/goal030-mvp-journey-rehearsal.mjs"],
      env,
    },
    // Ensaio da resposta automática do Goal032: webhook real, worker de inbox
    // real e o grafo de IA real, contra um banco PostgreSQL descartável
    // próprio, com prova positiva e os cinco elos de controle negativo
    // (human-control, ignore-ai, idempotency, supersede, group).
    // Fecha a lacuna que o ensaio do Goal030 deixou declarada em aberto.
    {
      name: "rehearse:goal032-auto-reply",
      cwd: ".",
      command: "node",
      args: ["scripts/goal032-auto-reply-rehearsal.mjs"],
      env,
    },
    // Ensaio do gate renderizado nas telas AUTENTICADAS (Goal033, A-02 da
    // auditoria final): três bancos descartáveis próprios, os três serviços
    // reais em processo, um negócio semeado inteiramente pelas rotas do
    // produto e o frontend publicado, construído com NEXT_PUBLIC_BFF_URL
    // embutida e servido em loopback, medido pelo gate autenticado do
    // Playwright depois de uma sessão de verdade estabelecida em /login.
    {
      name: "rehearse:goal033-authenticated-ui",
      cwd: ".",
      command: "node",
      args: ["scripts/goal033-authenticated-ui-rehearsal.mjs"],
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
