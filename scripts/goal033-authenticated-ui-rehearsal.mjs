#!/usr/bin/env node

// Ensaio do Goal033 (WU-02): a pilha real de pé, com dado de verdade, e o
// frontend publicado servido em loopback para que o gate renderizado meça as
// telas AUTENTICADAS — as que o gate público do Goal031 nunca alcançou, porque
// ele não tem sessão (A-02 da auditoria final).
//
// O que este arquivo faz, na ordem em que faz:
//
//   1. recusa qualquer destino que não seja um PostgreSQL descartável em
//      loopback, ANTES de qualquer conexão, `DROP` ou subprocesso;
//   2. recria três bancos descartáveis próprios e aplica o histórico
//      versionado de migrations de cada serviço do zero;
//   3. sobe os três serviços próprios REAIS em processo, na ordem das
//      dependências (Scheduling, IA, BFF), todos em `127.0.0.1`;
//   4. semeia o negócio pelas ROTAS DO PRODUTO, por HTTP real, a partir de
//      `POST /v1/auth/register`;
//   5. constrói o frontend com `NEXT_PUBLIC_BFF_URL` embutida e o serve em
//      loopback;
//   6. executa o gate autenticado do Playwright contra esse servidor.
//
// Regras que este arquivo cumpre, e que são o motivo de ele existir:
//
// - **Porta fixa e declarada para o BFF.** `NEXT_PUBLIC_*` é embutida no
//   `next build`, então a URL do BFF precisa estar decidida ANTES do build.
//   Porta ocupada é recusa com mensagem própria; não existe fallback para
//   outra porta, porque a porta que o build embutiu seria a errada e a tela
//   mediria um produto que não fala com serviço nenhum.
// - **`FRONTEND_ORIGIN` recebe a origem exata do servidor do gate.** O CORS do
//   BFF (`origin: [env.FRONTEND_ORIGIN]`, `credentials: true`) e o cookie de
//   sessão já são configuráveis por ambiente; porta distinta no mesmo host não
//   é cross-site, então `SameSite=lax` continua valendo. **Nenhum arquivo de
//   `apps/bff`, `apps/ai-orchestrator` ou `apps/scheduling-service` é tocado
//   por este Goal** — o que muda é configuração, nunca código de produção.
// - **Semeadura pelas rotas do produto.** Conta e sessão por
//   `POST /v1/auth/register`; onboarding pelos quatro blocos até
//   `POST /v1/onboarding/complete`; catálogo por `POST /v1/services`; cliente
//   por `POST /v1/customers`; atendimento no dia medido por
//   `POST /v1/appointments`, sobre o horário que `GET /v1/availability`
//   ofereceu; canal do WhatsApp por `POST /v1/whatsapp/connect` e
//   `GET /v1/whatsapp`; notificação materializada por `GET /v1/notifications`;
//   mensagem saída por `POST /v1/conversations/:id/messages`.
//   **Não há nenhum `INSERT` direto neste ensaio**, e por isso não há nenhum
//   caso a nomear: toda linha semeada nasceu de uma rota do produto ou do
//   caminho durável real de entrada de mensagem.
// - **A mensagem ENTRANTE é entrada externa**, e entra como o provedor a
//   entrega: `POST /webhooks/evolution` por HTTP real contra a IA real, que
//   persiste antes de responder `202`. O lote é reivindicado pela inbox real e
//   gravado na conversa pelo `AssistantService` real. O laço da inbox fica
//   desligado de propósito — ligado, ele chamaria o provedor de LLM para
//   redigir resposta automática, que é escopo do Goal032 e não deste.
// - **Fronteira externa nunca é chamada.** Nenhum endereço fora de loopback.
//   Dois dublês, ambos declarados:
//
//     * **Evolution Go.** Um servidor HTTP em loopback responde ao que o
//       produto chama para criar instância, conectar, ler QR, ler status e
//       enviar texto. Nenhuma instância remota existe, e a credencial de
//       instância é sintética. É ele que permite o número aparecer conectado
//       na tela e a mensagem SAÍDA existir pelo caminho humano de produção.
//     * **Provedor de LLM.** O `ModelProvider` entregue ao `AssistantService`
//       **lança** se for chamado, e `OPENAI_BASE_URL` aponta para uma porta de
//       loopback onde nada escuta. O caminho exercitado (`recordInboundText`)
//       não passa pelo modelo: o dublê é o que transforma "nenhuma chamada a
//       provedor de LLM" em asserção, em vez de promessa.
//
// - **Nenhuma sessão fabricada.** Este arquivo não assina cookie, não escreve
//   `storageState` e não chama a rota de sessão para montar contexto de
//   browser: ele semeia a conta e entrega e-mail e senha ao gate, que digita
//   os dois em `/login`. Quem estabelece a sessão do browser é o formulário.
//
// Limite declarado: este ensaio NÃO exercita a resposta automática da IA
// (grafo, modelo e envio automático pelo transporte) e não afirma nada sobre
// ela — isso é o Goal032. A mensagem saída aqui é a da profissional, pelo
// caminho humano.
//
// Contrato com o gate autenticado (o spec do Playwright lê estas variáveis):
//
//   GOAL033_GATE_BASE_URL   origem do frontend servido (http://127.0.0.1:PORT)
//   GOAL033_BFF_URL         origem do BFF, a mesma embutida no build
//   GOAL033_EMAIL           e-mail da conta semeada, digitado em /login
//   GOAL033_PASSWORD        senha da conta semeada, digitada em /login
//   GOAL033_MEASURED_DATE   dia (YYYY-MM-DD) com atendimento semeado
//   GOAL033_SEED            JSON com os nomes semeados (negócio, cliente,
//                           serviço, contato), para asserção de conteúdo
//   GOAL033_RUN_ID          identificador desta execução; o gate digita a
//                           sessão uma vez e a reusa entre os testes, e é ele
//                           que impede a execução seguinte de herdar o cookie
//
// Configuração deste arquivo, toda opcional: `GOAL033_BFF_PORT` e
// `GOAL033_FRONTEND_PORT` (as duas portas fixas) e `GOAL033_PLAYWRIGHT_CONFIG`
// (a configuração do gate autenticado, relativa à raiz do repositório).
//
// Códigos de saída: 0 sucesso, 1 falha de asserção, 2 recusa (destino
// inválido, porta ocupada ou dependência ausente). Sem caminho de skip.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createTcpServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isMain } from "./lib/gate.mjs";
import {
  extractRetriedTests,
  formatRetriesMessage,
  readPlaywrightReport,
} from "./lib/playwright-report.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

/**
 * As duas portas fixas do ensaio.
 *
 * A do BFF é fixa por necessidade, não por gosto: `NEXT_PUBLIC_BFF_URL` é
 * embutida no `next build`, e um `port: 0` daria ao BFF uma porta que o bundle
 * já construído não conhece. A do frontend é fixa pelo mesmo motivo espelhado:
 * ela é a origem exata que o BFF precisa autorizar em `FRONTEND_ORIGIN` antes
 * de o primeiro `Set-Cookie` sair.
 *
 * Os defaults ficam fora da faixa do gate público (3210) e do `npm run dev`
 * (3001) para que um servidor esquecido em outra janela não seja adotado em
 * silêncio — porta ocupada aqui é recusa, nunca reuso.
 */
export const DEFAULT_BFF_PORT = 3320;
export const DEFAULT_FRONTEND_PORT = 3310;

// Sintéticos e de uso único deste ensaio: nunca derivam de segredo real e
// nunca são impressos.
const INTERNAL_TOKEN = "goal033-authenticated-ui-rehearsal-internal-token";
const SESSION_SECRET = "goal033-authenticated-ui-rehearsal-session-secret";
// Senha da conta semeada. Ela é entregue ao gate por ambiente, porque o gate
// precisa DIGITÁ-LA em `/login` — é esse o ponto do Goal —, e não aparece em
// nenhuma linha de log deste arquivo.
const ACCOUNT_PASSWORD = "goal033-authenticated-ui-rehearsal-password";
// Senha da SEGUNDA conta (Goal065/WU-05), que para no meio do onboarding.
// Mesmo contrato que `ACCOUNT_PASSWORD`: só viaja por ambiente, digitada em
// `/login` pelo gate, nunca logada.
const ONBOARDING_ACCOUNT_PASSWORD =
  "goal033-authenticated-ui-rehearsal-onboarding-password";
// Fronteira do WhatsApp, toda sintética. O token do webhook é o que a IA exige
// de quem entrega evento (e o mesmo que o BFF registra no dublê); as chaves
// cifram a projeção da credencial de instância dentro dos bancos descartáveis.
const WEBHOOK_TOKEN = "goal033-authenticated-ui-rehearsal-webhook-token";
const EVOLUTION_API_KEY = "goal033-authenticated-ui-rehearsal-evolution-key";
const CREDENTIAL_KEY_ID = "goal033";
// Exatamente 32 bytes em base64, fixos e sintéticos: banco descartável, chave
// descartável. O tamanho não é escolha — material com outro tamanho é
// descartado em silêncio pelos dois serviços, e a cifra ficaria sem chave.
// (`goal033-authenticated-ui-key-032`, 32 bytes exatos: a variante terminada
// em `-key-32` tem 31 e era descartada por `parseKeys`, deixando o cofre
// vazio e `POST /v1/whatsapp/connect` em 503 CREDENTIAL_UNAVAILABLE.)
const CREDENTIAL_KEY = "Z29hbDAzMy1hdXRoZW50aWNhdGVkLXVpLWtleS0wMzI=";
// Chave sintética da fronteira do OpenAI. Ela nunca sai para a internet: o
// único destino configurado é uma porta de loopback onde nada escuta.
const OPENAI_KEY = "goal033-authenticated-ui-rehearsal-openai-key";
// Instância do WhatsApp que o dublê devolve ao `POST /instance/create`. É este
// identificador que o BFF projeta na IA e é por ele que o webhook do contato
// encontra o tenant — ele precisa ser o mesmo nos dois lugares.
const INSTANCE_ID = "goal033-authenticated-ui-instance";

/**
 * Ambiente do frontend e do gate: o deste processo MENOS tudo o que pertence
 * à pilha.
 *
 * Nem o servidor do produto nem o browser falam com banco, e nenhum dos dois
 * precisa de segredo de serviço. Repassar a string de conexão ou o segredo de
 * sessão para eles seria espalhar credencial por processos que não têm uso
 * para ela — e a string de conexão acabaria num log de Playwright.
 */
const STACK_ONLY_ENV = Object.freeze([
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "GOAL033_BFF_DB_URL",
  "GOAL033_SCHEDULING_DB_URL",
  "GOAL033_AI_DB_URL",
  "BFF_TEST_DATABASE_URL",
  "JWT_SECRET",
  "INTERNAL_SERVICE_TOKEN",
  "AI_ORCHESTRATOR_PROVISIONING_TOKEN",
  "AI_ORCHESTRATOR_COMMAND_TOKEN",
  "SCHEDULING_SERVICE_COMMAND_TOKEN",
  "WHATSAPP_CREDENTIAL_KEYS",
  "CHANNEL_CREDENTIAL_KEYS",
  "EVOLUTION_WEBHOOK_TOKEN",
  "EVOLUTION_WEBHOOK_SECRET",
  "EVOLUTION_API_KEY",
  "EVOLUTION_GO_API_KEY",
  "OPENAI_API_KEY",
]);

function frontendEnvironment(extra) {
  const environment = { ...process.env, ...extra };
  for (const key of STACK_ONLY_ENV) delete environment[key];
  return environment;
}

/** Teto do `next build`. Build de frontend é lento; pendurar o gate é pior. */
const BUILD_TIMEOUT_MS = 10 * 60 * 1_000;
/** Teto da subida do servidor do frontend, e intervalo entre duas sondagens. */
const FRONTEND_READY_TIMEOUT_MS = 120_000;
const FRONTEND_POLL_INTERVAL_MS = 250;

export class AuthenticatedUiRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthenticatedUiRehearsalError";
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
    `goal033:authenticated-ui-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal033:authenticated-ui-rehearsal FAILED — ${redactConnectionStrings(message)}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Falha do ensaio dentro do subprocesso: derruba a pilha e, com ela, o gate. */
function step(condition, message) {
  if (!condition) throw new AuthenticatedUiRehearsalError(message);
}

function bffRequire() {
  return createRequire(path.join(repositoryRoot, "apps", "bff", "package.json"));
}

function frontendDir() {
  return path.join(repositoryRoot, "apps", "frontend");
}

/**
 * O negócio semeado. Fixture de **entrada** — o que uma pessoa digitaria —,
 * nunca de estado: nada aqui é escrito direto no banco.
 *
 * A disponibilidade cobre os sete dias, de 00:00 a 23:59, por um motivo só: o
 * dia medido é HOJE, e uma grade de dias úteis deixaria o gate sem atendimento
 * para mostrar sempre que a execução caísse num sábado. Não é afrouxamento de
 * regra de produto — é a agenda que este negócio de ensaio declara.
 */
export const SEED = Object.freeze({
  email: "goal033-authenticated-ui@example.invalid",
  // Nome do dono da conta (Goal064/WU-01), exigido por POST /v1/auth/register.
  ownerName: "Telas Goal033",
  businessName: "Estúdio Goal033 Telas",
  businessCategory: "Beleza e estética",
  timezone: "America/Sao_Paulo",
  modalities: Object.freeze(["ON_SITE"]),
  address: "Rua do Ensaio, 33 — Sala 3",
  tone: "BALANCED",
  onboardingService: Object.freeze({
    name: "Corte",
    durationMinutes: 30,
    priceType: "FIXED",
    price: 90,
  }),
  catalogService: Object.freeze({
    name: "Coloração completa",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 240,
    colorToken: "VIOLET",
    description: "Coloração com avaliação prévia.",
  }),
  // Serviço só do caso de duração do Goal058 (QA SV-01): o gate o abre por
  // clique, salva 45 minutos pelo formulário e o devolve aos 60 com que nasceu
  // — a duração do serviço do onboarding que a revisão local não conseguiu
  // salvar de novo. Nenhuma outra medida o nomeia, então editá-lo não muda o
  // que o resto do gate mede.
  durationService: Object.freeze({
    name: "Escova modelada",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 120,
  }),
  availabilityDays: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
  availabilityStartTime: "00:00",
  availabilityEndTime: "23:59",
  customer: Object.freeze({
    name: "Marta Nogueira",
    phone: "+5511990000033",
  }),
  contact: Object.freeze({
    phone: "5511990000034",
    name: "Nina das Telas",
    text: "Oi! Queria marcar uma coloração para a próxima semana.",
    messageId: "goal033-authenticated-ui-inbound-1",
  }),
  ownerReply: "Claro! Consigo te atender essa semana, posso confirmar?",
});

/**
 * A SEGUNDA conta do ensaio (Goal065/WU-05): para no meio do onboarding, de
 * propósito, para o gate medir as etapas que só uma sessão sem onboarding
 * concluído alcança. Só o bloco de negócio é gravado — nome, segmento,
 * "Local próprio" e endereço — e nada mais: nem fonte da agenda, nem
 * serviço, nem disponibilidade, nem tom da IA, nem WhatsApp. A conta
 * PRINCIPAL (`SEED` acima) e as 75 medidas que ela já sustenta não mudam;
 * esta é uma conta e um tenant à parte, semeada depois, pelas mesmas rotas
 * do produto.
 *
 * "Local próprio" é a modalidade porque o vault só oferece "Endereço" como
 * etapa quando ela está selecionada — sem isso o gate mediria uma etapa que
 * o produto não considera alcançável.
 */
export const ONBOARDING_SEED = Object.freeze({
  email: "goal033-onboarding-gate@example.invalid",
  ownerName: "Onboarding Goal065",
  businessName: "Estúdio Goal065 Onboarding",
  businessCategory: "Estética",
  timezone: "America/Sao_Paulo",
  address: "Rua do Onboarding, 65 — Sala 1",
});

/**
 * Valida o alvo e monta o plano do ensaio, sem tocar em banco nem subprocesso.
 * Três bancos PRÓPRIOS e descartáveis são derivados do mesmo alvo já
 * validado — nunca as bases compartilhadas do resto do gate.
 */
export function resolveRehearsalPlan(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new AuthenticatedUiRehearsalError(
      "BFF_TEST_DATABASE_URL is not set. This rehearsal refuses to run: it will not fall back to any app .env or to an inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AuthenticatedUiRehearsalError(
      "BFF_TEST_DATABASE_URL is not a valid URL.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new AuthenticatedUiRehearsalError(
      `BFF_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new AuthenticatedUiRehearsalError(
      `Host "${host}" is not loopback. This rehearsal drops and recreates whole databases and only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1).`,
    );
  }

  const baseDatabase = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!baseDatabase) {
    throw new AuthenticatedUiRehearsalError(
      "BFF_TEST_DATABASE_URL must name a database.",
    );
  }
  if (!DISPOSABLE_NAME.test(baseDatabase)) {
    throw new AuthenticatedUiRehearsalError(
      `Database "${baseDatabase}" is not recognised as disposable. This rehearsal issues DROP DATABASE and must never touch a shared or product database; the name must contain "test".`,
    );
  }

  const port = url.port || "5432";
  const bff = derivedTarget(raw, baseDatabase, "goal033_bff", host, port);
  const scheduling = derivedTarget(
    raw,
    baseDatabase,
    "goal033_scheduling",
    host,
    port,
  );
  const ai = derivedTarget(raw, baseDatabase, "goal033_ai", host, port);

  const maintenance = new URL(raw);
  maintenance.pathname = "/postgres";

  return {
    maintenance: maintenance.href,
    host,
    port,
    bff,
    scheduling,
    ai,
    ports: resolveGatePorts(environment),
  };
}

function derivedTarget(raw, baseDatabase, suffix, host, port) {
  const database = `${baseDatabase}_${suffix}`;
  // O nome derivado também passa pela allowlist: se o sufixo apagasse a marca
  // de descarte, o DROP seguinte seria cego.
  if (!DISPOSABLE_NAME.test(database)) {
    throw new AuthenticatedUiRehearsalError(
      `Derived database "${database}" is not recognised as disposable.`,
    );
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
 * As duas portas fixas, resolvidas a partir do ambiente. Valor inválido é
 * recusa com mensagem própria: cair no default depois de alguém ter declarado
 * uma porta seria decidir por quem chamou.
 */
export function resolveGatePorts(environment = process.env) {
  const bff = fixedPort(environment, "GOAL033_BFF_PORT", DEFAULT_BFF_PORT);
  const frontend = fixedPort(
    environment,
    "GOAL033_FRONTEND_PORT",
    DEFAULT_FRONTEND_PORT,
  );
  if (bff === frontend) {
    throw new AuthenticatedUiRehearsalError(
      `GOAL033_BFF_PORT and GOAL033_FRONTEND_PORT are both ${bff}. The BFF and the gate's server are two servers and need two ports.`,
    );
  }
  return {
    bff,
    frontend,
    bffUrl: `http://127.0.0.1:${bff}`,
    frontendUrl: `http://127.0.0.1:${frontend}`,
  };
}

function fixedPort(environment, key, fallback) {
  const raw = environment[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new AuthenticatedUiRehearsalError(
      `${key} must be an integer TCP port between 1 and 65535, got "${raw}".`,
    );
  }
  return value;
}

/**
 * Exige, ANTES de qualquer conexão, que as dependências existam: o driver
 * `pg`, a CLI do Prisma de cada serviço, `tsx` (os três apps são TypeScript e
 * sobem sob ele), o Next e o Playwright do frontend. Ausência é recusa com
 * exit 2, nunca skip.
 */
export function assertRequiredBinaries() {
  try {
    bffRequire().resolve("pg");
  } catch {
    throw new AuthenticatedUiRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
  try {
    bffRequire().resolve("tsx/package.json");
  } catch {
    throw new AuthenticatedUiRehearsalError(
      "tsx is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal — it drives the stack, which boots the real BFF, the real Scheduling service and the real AI orchestrator under a TypeScript loader.",
    );
  }
  for (const [appDir, hint] of [
    ["bff", "npm ci --prefix apps/bff"],
    ["scheduling-service", "npm ci --prefix apps/scheduling-service"],
    ["ai-orchestrator", "npm ci --prefix apps/ai-orchestrator"],
  ]) {
    try {
      createRequire(
        path.join(repositoryRoot, "apps", appDir, "package.json"),
      ).resolve("prisma/package.json");
    } catch {
      throw new AuthenticatedUiRehearsalError(
        `The Prisma CLI is not installed for apps/${appDir}. Run \`${hint}\` before this rehearsal.`,
      );
    }
  }
  // O cliente Prisma da IA é gerado, não versionado: sem ele o serviço nem
  // importa. Recusa, nunca skip — e a mensagem nomeia o passo do gate que o
  // produz, para não haver dúvida sobre o que rodar antes.
  if (
    !existsSync(
      path.join(
        repositoryRoot,
        "apps",
        "ai-orchestrator",
        "src",
        "generated",
        "prisma",
        "client.ts",
      ),
    )
  ) {
    throw new AuthenticatedUiRehearsalError(
      "The generated Prisma client of apps/ai-orchestrator is missing. Run `npx prisma generate` in apps/ai-orchestrator — it is the `generate:ai-orchestrator-prisma-client` step of validate:integration — before this rehearsal.",
    );
  }
  if (!existsSync(nextBinary())) {
    throw new AuthenticatedUiRehearsalError(
      "Next is not installed for apps/frontend. Run `npm ci --prefix apps/frontend` before this rehearsal — it builds and serves the product the authenticated gate measures.",
    );
  }
  if (!existsSync(playwrightCli())) {
    throw new AuthenticatedUiRehearsalError(
      "@playwright/test is not installed for apps/frontend. Run `npm ci --prefix apps/frontend` before this rehearsal.",
    );
  }
  if (!existsSync(playwrightConfig())) {
    throw new AuthenticatedUiRehearsalError(
      `The authenticated gate configuration was not found at ${path.relative(repositoryRoot, playwrightConfig())}. This rehearsal boots the stack for that gate and refuses to run without it.`,
    );
  }
}

function nextBinary() {
  return path.join(frontendDir(), "node_modules", "next", "dist", "bin", "next");
}

function playwrightCli() {
  return path.join(
    frontendDir(),
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );
}

function playwrightConfig() {
  const declared = process.env.GOAL033_PLAYWRIGHT_CONFIG?.trim();
  return declared
    ? path.resolve(repositoryRoot, declared)
    : path.join(frontendDir(), "playwright.authenticated.config.ts");
}

/**
 * O relatório JSON que `playwright.authenticated.config.ts` já escreve
 * (`reporter: [..., ["json", { outputFile: "./e2e-results/authenticated/results.json" }]]`).
 * Fixo, não derivado de `GOAL033_PLAYWRIGHT_CONFIG`: nenhuma configuração
 * declara outro caminho hoje, e o objetivo desta unidade é ler o que o gate
 * autenticado escreve, não generalizar para uma configuração hipotética.
 */
function authenticatedGateReportPath() {
  return path.join(frontendDir(), "e2e-results", "authenticated", "results.json");
}

/**
 * Lê e decodifica o relatório JSON do gate autenticado, pelo leitor
 * compartilhado em `./lib/playwright-report.mjs`. Ausente, ilegível ou de
 * outra execução é `AuthenticatedUiRehearsalError`, nunca silêncio.
 *
 * `notBeforeMs`, quando informado, é o instante (epoch ms) em que ESTA
 * execução começou a rodar o gate — segunda linha de defesa contra o
 * relatório velho que `runAuthenticatedGate` já tenta apagar antes de subir o
 * Playwright, para o caso raro de o apagamento falhar em silêncio ou o
 * processo ser interrompido antes de escrever o seu.
 */
export function readGateReport(reportPath, notBeforeMs) {
  return readPlaywrightReport(reportPath, {
    notBeforeMs,
    ErrorClass: AuthenticatedUiRehearsalError,
    gateLabel: "the authenticated gate",
    runLabel: "this rehearsal's gate",
  });
}

export { extractRetriedTests };

function describeRetries(retried) {
  return `goal033:authenticated-ui-rehearsal ${formatRetriesMessage("authenticated gate", retried)}`;
}

/**
 * Recusa, ANTES de criar banco, quando o servidor não oferece a extensão que
 * o histórico de migrations da IA exige (`CREATE EXTENSION vector`). Exit 2
 * com mensagem própria, nunca skip.
 */
export async function assertVectorExtensionAvailable(maintenanceUrl) {
  const { Client } = bffRequire()("pg");
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  let available;
  try {
    const result = await maintenance.query(
      "SELECT name FROM pg_available_extensions WHERE name = $1",
      ["vector"],
    );
    available = result.rows.length > 0;
  } finally {
    await maintenance.end();
  }
  if (!available) {
    throw new AuthenticatedUiRehearsalError(
      "The target server does not offer the `vector` extension, which the AI orchestrator migrations require through CREATE EXTENSION. Install pgvector in this PostgreSQL installation and run the rehearsal again.",
    );
  }
}

/**
 * Recusa, ANTES de recriar banco, quando uma das duas portas fixas já está
 * ocupada.
 *
 * Não há fallback por desenho: a porta do BFF é embutida no bundle do frontend
 * pelo `next build`, e a do frontend é a origem que o BFF autoriza. Escolher
 * outra porta em silêncio produziria um produto que não fala com o serviço, ou
 * um serviço que recusa a origem — e o gate mediria a tela de erro achando que
 * mediu a tela pedida.
 */
export async function assertPortsFree(ports) {
  await assertPortFree(ports.bff, "GOAL033_BFF_PORT", "the BFF");
  await assertPortFree(
    ports.frontend,
    "GOAL033_FRONTEND_PORT",
    "the gate's frontend server",
  );
}

function assertPortFree(port, key, label) {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();
    // Sem `close()` aqui de propósito: o servidor nunca chegou a escutar, e
    // fechar o que não abriu emitiria um segundo `error` sem ouvinte.
    probe.once("error", (error) => {
      reject(
        new AuthenticatedUiRehearsalError(
          error.code === "EADDRINUSE"
            ? `127.0.0.1:${port} is already in use and it is the fixed port of ${label} (${key}). This rehearsal never falls back to another port: the BFF port is baked into the frontend bundle by \`next build\` and the frontend port is the exact origin the BFF authorises. Free the port, or declare another one in ${key}, and run again.`
            : `Could not probe 127.0.0.1:${port}, the fixed port of ${label} (${key}): ${error.message}`,
        ),
      );
    });
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve());
    });
  });
}

async function recreateDatabase(maintenanceUrl, database) {
  const { Client } = bffRequire()("pg");
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  try {
    const quoted = `"${database.replace(/"/gu, '""')}"`;
    // FORCE derruba conexão remanescente de uma execução anterior — é o que
    // torna a segunda execução seguida independente da primeira.
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${quoted}`);
    await maintenance.query(`ALTER DATABASE ${quoted} SET TimeZone = 'UTC'`);
  } finally {
    await maintenance.end();
  }
}

/**
 * `prisma migrate deploy` do histórico versionado de um serviço contra o seu
 * banco descartável. Comando entregue como string única ao shell porque `npx`
 * no Windows é um script `.cmd` e o Node recusa executá-lo sem shell.
 */
function runPrisma(appDir, url) {
  const environment = {
    ...process.env,
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
  };
  const outcome = spawnSync("npx prisma migrate deploy", {
    cwd: path.join(repositoryRoot, "apps", appDir),
    env: environment,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(
      `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`,
    ).trim(),
  };
}

/** Contagem de linhas por tabela, com `pg` puro. */
async function countRows(url, tables) {
  const { Client } = bffRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const counts = {};
    for (const table of tables) {
      const result = await client.query(
        `SELECT count(*)::int AS total FROM "${table}"`,
      );
      counts[table] = result.rows[0].total;
    }
    return counts;
  } finally {
    await client.end();
  }
}

const BFF_SEED_TABLES = Object.freeze([
  "User",
  "Tenant",
  "TenantMember",
  "BusinessProfile",
  "UserSession",
  "TenantNotification",
  "WhatsAppInstance",
]);
const SCHEDULING_SEED_TABLES = Object.freeze([
  "CalendarSettings",
  "AvailabilityRule",
  "Service",
  "Customer",
  "Appointment",
  "AppointmentItem",
]);
/**
 * A única linha que o histórico de migrations da IA cria sozinho: o canal
 * legado `legacy-evolution-channel`, do tenant `legacy-unassigned`, INATIVO.
 * Declarada aqui para que "banco vazio" continue significando "nada foi
 * semeado por fora das rotas".
 */
const AI_BASELINE_ROWS = Object.freeze({ ChannelConnection: 1 });
const AI_SEED_TABLES = Object.freeze([
  "ChannelConnection",
  "Contact",
  "Conversation",
  "ConversationSession",
  "Message",
  "ProcessedEvent",
]);

/** Linhas além do que o histórico de migrations cria por conta própria. */
function unexpectedRows(counts, baseline = {}) {
  return Object.entries(counts).filter(
    ([table, total]) => total !== (baseline[table] ?? 0),
  );
}

// --- Data de parede do negócio ---------------------------------------------
//
// O dia medido é HOJE na parede do negócio, que é o que as rotas aceitam
// (`YYYY-MM-DD`) e o que a Agenda abre. Converter por `Date` local do processo
// colocaria o fuso da máquina no meio.

export function localIsoDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

// --- Dublê do Evolution Go --------------------------------------------------
//
// É o único serviço substituído, e ele é **externo**: o `EvolutionClient` do
// BFF e o `EvolutionProvider` da IA que falam com ele são os de produção, e o
// que muda é só o endereço. Nenhuma instância remota é criada, consultada ou
// apagada, e nenhuma mensagem sai da máquina.

export function createEvolutionDouble() {
  const calls = [];
  const unexpected = [];
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);
      const route = `${request.method} ${url.pathname}`;
      calls.push({ route, at: new Date().toISOString() });

      if (request.method === "POST" && url.pathname === "/instance/create") {
        // O identificador devolvido aqui é o que o BFF grava como
        // `evolutionInstanceId` e projeta na IA: é por ele que o webhook do
        // contato encontra o negócio.
        reply(response, 200, {
          data: {
            id: INSTANCE_ID,
            name: typeof body?.name === "string" ? body.name : INSTANCE_ID,
            token: typeof body?.token === "string" ? body.token : undefined,
            status: "created",
          },
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/instance/connect") {
        reply(response, 200, { data: { connected: true } });
        return;
      }
      if (request.method === "GET" && url.pathname === "/instance/qr") {
        reply(response, 200, { data: { code: "goal033-synthetic-qr-code" } });
        return;
      }
      if (request.method === "GET" && url.pathname === "/instance/status") {
        reply(response, 200, {
          data: {
            connected: true,
            loggedIn: true,
            name: SEED.businessName,
            myJid: `${SEED.customer.phone.replace(/\D/gu, "")}@s.whatsapp.net`,
            status: "open",
          },
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/send/text") {
        reply(response, 200, {
          messageId: `goal033-transport-${calls.length}`,
        });
        return;
      }

      unexpected.push({ route, at: new Date().toISOString() });
      reply(response, 404, {
        error: "goal033 evolution double: unexpected route",
      });
    })();
  });

  return {
    calls,
    unexpected,
    listen: () => listenOnLoopback(server, "Evolution"),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function reply(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

/** Sobe um servidor HTTP em loopback e confere o endereço efetivo. */
function listenOnLoopback(server, label) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(
          new AuthenticatedUiRehearsalError(
            `The ${label} double did not report a TCP address.`,
          ),
        );
        return;
      }
      // Conferido no endereço **efetivo**, não no pedido: é o que transforma
      // "escuta em loopback" em fato observado.
      if (address.address !== "127.0.0.1") {
        reject(
          new AuthenticatedUiRehearsalError(
            `The ${label} double bound to ${address.address}, which is not 127.0.0.1. This rehearsal never listens outside loopback.`,
          ),
        );
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

// --- Cliente HTTP da semeadura ---------------------------------------------
//
// Cofre de cookies e token de CSRF, como um browser faria: o ensaio semeia
// pelo MESMO caminho que o frontend publicado usa, e não por atalho interno.

function createSeedClient(baseUrl, origin, cookieNames) {
  const jar = new Map();
  let csrfToken = null;

  function cookieHeader() {
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  function absorb(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const header = response.headers.get(cookieNames.csrfHeader);
    if (header) csrfToken = header;
  }

  async function request(method, route, options = {}) {
    const headers = { accept: "application/json", origin };
    if (jar.size > 0) headers.cookie = cookieHeader();
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (csrfToken) headers[cookieNames.csrfHeader] = csrfToken;
    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
    absorb(response);
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  }

  return {
    request,
    hasSessionCookie: () => jar.has(cookieNames.session),
  };
}

function issuesOf(payload) {
  const issues = payload?.error?.details?.issues;
  return Array.isArray(issues) ? [...issues].sort() : null;
}

// --- A metade `--stack`: a pilha real, a semeadura e o gate -----------------

async function runStackChild() {
  const bffDbUrl = process.env.GOAL033_BFF_DB_URL;
  const schedulingDbUrl = process.env.GOAL033_SCHEDULING_DB_URL;
  const aiDbUrl = process.env.GOAL033_AI_DB_URL;
  const resultFile = process.env.GOAL033_RESULT_FILE;
  const ports = resolveGatePorts(process.env);

  const evolution = createEvolutionDouble();
  const evolutionBaseUrl = await evolution.listen();

  process.env.NODE_ENV = "test";
  process.env.INTERNAL_SERVICE_TOKEN = INTERNAL_TOKEN;
  // Os laços de fundo dos três serviços ficam desligados. Não é conveniência:
  // o laço da inbox chamaria o provedor de LLM para redigir resposta
  // automática — que é o Goal032, não este —, a entrega de notificações
  // chamaria o transporte por conta própria, e a varredura de retenção e a
  // purga de conta apagariam o que o gate precisa encontrar na tela.
  process.env.CALENDAR_AUTO_COMPLETE_ENABLED = "false";
  process.env.INBOX_WORKER_ENABLED = "false";
  process.env.NOTIFICATION_DELIVERY_ENABLED = "false";
  process.env.RETENTION_SWEEP_ENABLED = "false";
  process.env.ACCOUNT_PURGE_ENABLED = "false";
  // Fronteira do LLM: chave sintética e endereço de loopback onde nada escuta.
  // Nenhum caminho deste ensaio a chama; se algum passasse a chamar, a chamada
  // morreria aqui dentro em vez de sair da máquina.
  process.env.OPENAI_API_KEY = OPENAI_KEY;
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:1";

  // Os três serviços próprios sobem aqui, na ordem das dependências:
  // Scheduling (não chama ninguém), IA (chama o Scheduling) e BFF (chama os
  // dois). Cada um captura a própria string de conexão no import do seu
  // `config/env`, e é por isso que `DATABASE_URL` é trocada entre um import e
  // o outro: é o que dá a cada serviço o seu banco descartável.
  process.env.DATABASE_URL = schedulingDbUrl;
  process.env.DIRECT_DATABASE_URL = schedulingDbUrl;

  const { buildApp: buildSchedulingApp } = await import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        "apps",
        "scheduling-service",
        "src",
        "app",
        "build-app.ts",
      ),
    ).href
  );
  const schedulingApp = await buildSchedulingApp();
  const schedulingAddress = await schedulingApp.listen({
    host: "127.0.0.1",
    port: 0,
  });

  const aiSource = (...segments) =>
    pathToFileURL(
      path.join(repositoryRoot, "apps", "ai-orchestrator", "src", ...segments),
    ).href;

  process.env.DATABASE_URL = aiDbUrl;
  process.env.DIRECT_DATABASE_URL = aiDbUrl;
  process.env.SCHEDULING_SERVICE_BASE_URL = schedulingAddress;
  process.env.EVOLUTION_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  process.env.EVOLUTION_BASE_URL = evolutionBaseUrl;
  process.env.EVOLUTION_API_KEY = EVOLUTION_API_KEY;
  process.env.CHANNEL_CREDENTIAL_KEYS = `${CREDENTIAL_KEY_ID}:${CREDENTIAL_KEY}`;
  process.env.CHANNEL_CREDENTIAL_ACTIVE_KEY_ID = CREDENTIAL_KEY_ID;

  const { buildApp: buildAiApp } = await import(aiSource("app.ts"));
  // Importados agora, enquanto a conexão vigente ainda é a da IA: o cliente
  // Prisma dela nasce no import de `db/prisma.ts`, e este é o mesmo módulo que
  // o serviço já está usando — não um segundo cliente montado por fora.
  const { prisma: aiPrisma } = await import(aiSource("db", "prisma.ts"));
  const { InboxStore, inboxRetryPolicyFromEnv } = await import(
    aiSource("modules", "inbox", "InboxStore.ts")
  );
  const { ChannelConnectionService } = await import(
    aiSource("modules", "channel", "ChannelConnectionService.ts")
  );
  const { mapEvolutionInbound } = await import(
    aiSource(
      "modules",
      "channel",
      "adapters",
      "evolution",
      "EvolutionInboundMapper.ts",
    )
  );
  const { AssistantService } = await import(
    aiSource("modules", "assistant", "assistant.service.ts")
  );
  const { PrismaGraphRuntime } = await import(
    aiSource("modules", "graph", "graph-runtime.ts")
  );
  const { SessionService } = await import(
    aiSource("modules", "session", "SessionService.ts")
  );

  const aiApp = await buildAiApp();
  const aiAddress = await aiApp.listen({ host: "127.0.0.1", port: 0 });

  process.env.DATABASE_URL = bffDbUrl;
  process.env.DIRECT_DATABASE_URL = bffDbUrl;
  process.env.AI_ORCHESTRATOR_BASE_URL = aiAddress;
  process.env.EVOLUTION_GO_BASE_URL = evolutionBaseUrl;
  process.env.EVOLUTION_GO_API_KEY = EVOLUTION_API_KEY;
  process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_TOKEN;
  process.env.WHATSAPP_CREDENTIAL_KEYS = `${CREDENTIAL_KEY_ID}:${CREDENTIAL_KEY}`;
  process.env.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID = CREDENTIAL_KEY_ID;
  // Fixo e sintético: o BFF assina a sessão que ele mesmo emite, e herdar um
  // segredo de `.env` faria o ensaio depender de configuração local.
  process.env.JWT_SECRET = SESSION_SECRET;
  // A origem EXATA do servidor do gate. É ela que o CORS do BFF autoriza e a
  // única de onde o browser do Playwright vai falar.
  process.env.FRONTEND_ORIGIN = ports.frontendUrl;
  process.env.COOKIE_SECURE = "false";
  process.env.COOKIE_SAME_SITE = "lax";

  const bffSource = (...segments) =>
    pathToFileURL(path.join(repositoryRoot, "apps", "bff", "src", ...segments))
      .href;

  const { buildApp: buildBffApp } = await import(bffSource("app.ts"));
  const { env } = await import(bffSource("config", "env.ts"));
  const { CURRENT_LEGAL_VERSIONS } = await import(
    bffSource("config", "legal-versions.ts")
  );

  const bffApp = await buildBffApp();
  // Porta FIXA: é a que já está embutida em `NEXT_PUBLIC_BFF_URL` no build do
  // frontend. Ocupada, o ensaio cai com mensagem própria — nunca com outra
  // porta, que o bundle não conheceria.
  let bffAddress;
  try {
    bffAddress = await bffApp.listen({ host: "127.0.0.1", port: ports.bff });
  } catch (error) {
    throw new AuthenticatedUiRehearsalError(
      error?.code === "EADDRINUSE"
        ? `The BFF could not take 127.0.0.1:${ports.bff}, its fixed port (GOAL033_BFF_PORT): the address is already in use. This rehearsal never falls back to another port — that port is baked into the frontend bundle by \`next build\`.`
        : `The BFF could not listen on 127.0.0.1:${ports.bff}: ${error?.message ?? error}`,
    );
  }
  if (bffAddress !== ports.bffUrl) {
    throw new AuthenticatedUiRehearsalError(
      `The BFF reported ${bffAddress}, which is not the declared ${ports.bffUrl}. The gate's frontend would talk to nobody.`,
    );
  }

  const { Client } = bffRequire()("pg");
  const bffDb = new Client({ connectionString: bffDbUrl });
  const schedulingDb = new Client({ connectionString: schedulingDbUrl });
  const aiDb = new Client({ connectionString: aiDbUrl });
  await Promise.all([bffDb.connect(), schedulingDb.connect(), aiDb.connect()]);

  const cookieNames = {
    session: env.SESSION_COOKIE_NAME,
    csrf: env.CSRF_COOKIE_NAME,
    csrfHeader: env.CSRF_HEADER_NAME.toLowerCase(),
  };
  const client = createSeedClient(bffAddress, ports.frontendUrl, cookieNames);

  // O único substituto do provedor de modelo existe para LANÇAR: se o caminho
  // exercitado chamasse o modelo, a semeadura cairia com mensagem própria em
  // vez de sair calada para a internet.
  const ai = {
    address: aiAddress,
    prisma: aiPrisma,
    mapEvolutionInbound,
    inbox: new InboxStore(aiPrisma, inboxRetryPolicyFromEnv()),
    channelConnections: new ChannelConnectionService(aiPrisma),
    runtime: new PrismaGraphRuntime(aiPrisma),
    sessions: new SessionService(aiPrisma),
    assistant: new AssistantService(aiPrisma, undefined, {
      invoke: async () => {
        throw new AuthenticatedUiRehearsalError(
          "the declared model double was invoked while seeding. This rehearsal never talks to an LLM provider: the automatic answer is Goal032's subject, not this one's.",
        );
      },
    }),
  };

  let frontend = null;
  const result = { ports: { bff: ports.bff, frontend: ports.frontend } };

  try {
    result.seed = await seedTenant(client, ai, {
      bffDb,
      schedulingDb,
      aiDb,
      legalVersions: CURRENT_LEGAL_VERSIONS,
    });
    result.onboardingSeed = await seedOnboardingAccount(
      () => createSeedClient(bffAddress, ports.frontendUrl, cookieNames),
      CURRENT_LEGAL_VERSIONS,
    );

    result.build = buildFrontend(ports);
    frontend = await startFrontend(ports);
    result.frontend = { url: ports.frontendUrl, pid: frontend.pid };

    result.gate = await runAuthenticatedGate(ports, result.seed, result.onboardingSeed);
    result.evolutionDouble = {
      calls: evolution.calls.length,
      unexpected: evolution.unexpected,
    };
    if (evolution.unexpected.length > 0) {
      throw new AuthenticatedUiRehearsalError(
        `the Evolution double received ${evolution.unexpected.length} unexpected request(s): ${evolution.unexpected
          .map((entry) => entry.route)
          .join(", ")}. The rehearsal only declares the routes the product calls.`,
      );
    }
    if (result.gate.status !== 0) {
      throw new AuthenticatedUiRehearsalError(
        `the authenticated gate failed with exit ${result.gate.status}. Its output is above, in full.`,
      );
    }
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.error =
      error instanceof Error
        ? redactConnectionStrings(error.message)
        : String(error);
    throw error;
  } finally {
    if (frontend) stopFrontend(frontend);
    if (resultFile) {
      writeFileSync(resultFile, JSON.stringify(result), "utf8");
    }
    await Promise.allSettled([
      bffDb.end(),
      schedulingDb.end(),
      aiDb.end(),
      bffApp.close(),
      aiApp.close(),
      schedulingApp.close(),
      evolution.close(),
    ]);
  }
}

/**
 * A semeadura inteira, pelas rotas do produto e por HTTP real.
 *
 * Não existe `INSERT` direto aqui. Cada linha que o gate vai encontrar na tela
 * nasceu de uma rota pública do BFF ou — no caso da mensagem entrante, que é
 * entrada EXTERNA — do caminho durável real da IA, do webhook à conversa.
 */
async function seedTenant(client, ai, { bffDb, schedulingDb, aiDb, legalVersions }) {
  // 1. Conta e sessão pelo caminho de produção.
  const registered = await client.request("POST", "/v1/auth/register", {
    body: {
      email: SEED.email,
      name: SEED.ownerName,
      password: ACCOUNT_PASSWORD,
      confirmPassword: ACCOUNT_PASSWORD,
      termsAccepted: true,
      termsVersion: legalVersions.termsVersion,
      privacyPolicyVersion: legalVersions.privacyPolicyVersion,
    },
  });
  step(
    registered.status === 201,
    `seed: POST /v1/auth/register answered ${registered.status}, expected 201`,
  );
  const userId = registered.payload?.data?.user?.id ?? null;
  const tenantId = registered.payload?.data?.tenant?.id ?? null;
  step(
    Boolean(userId) && Boolean(tenantId) && client.hasSessionCookie(),
    "seed: register did not return a user id, a tenant id and a session cookie",
  );

  // 2. Onboarding nos quatro blocos, até a conclusão aceita.
  for (const [label, body] of [
    [
      "business",
      {
        business: {
          name: SEED.businessName,
          category: SEED.businessCategory,
          timezone: SEED.timezone,
          modalities: [...SEED.modalities],
          address: SEED.address,
        },
      },
    ],
    ["calendar", { calendar: { source: "ATENDLY" } }],
    [
      "operation",
      {
        service: { ...SEED.onboardingService },
        availability: {
          rules: SEED.availabilityDays.map((dayOfWeek) => ({
            dayOfWeek,
            startTime: SEED.availabilityStartTime,
            endTime: SEED.availabilityEndTime,
            active: true,
          })),
        },
      },
    ],
    ["ai", { ai: { tone: SEED.tone } }],
  ]) {
    const block = await client.request("PATCH", "/v1/onboarding", { body });
    step(
      block.status === 200,
      `seed: the ${label} onboarding block answered ${block.status}, expected 200`,
    );
  }
  const completed = await client.request("POST", "/v1/onboarding/complete");
  const pending = issuesOf(completed.payload);
  step(
    completed.status === 200,
    `seed: POST /v1/onboarding/complete answered ${completed.status}, expected 200` +
      (pending ? ` (issues: ${pending.join(", ")})` : ""),
  );

  // 3. Central de notificações, lida ANTES de conectar o WhatsApp: a condição
  //    `WHATSAPP_DISCONNECTED` é a notificação que a tela `/notificacoes` vai
  //    mostrar, e ela continua no histórico depois de resolvida — conectar o
  //    número em seguida não esvazia a tela.
  //
  //    Quem materializa condição de canal é `GET /v1/status`, nunca a rota da
  //    central: `reconcileNotificationCenter` cuida das espécies que dependem
  //    de Scheduling e da IA, e `reconcileStatusConditions` — que só roda
  //    dentro do status — é quem abre `WHATSAPP_DISCONNECTED` a partir do que
  //    aquela requisição acabou de verificar. Sem esta leitura, a central
  //    responderia 200 com lista vazia e o gate mediria a tela vazia.
  const status = await client.request("GET", "/v1/status");
  step(
    status.status === 200,
    `seed: GET /v1/status answered ${status.status}, expected 200`,
  );
  step(
    status.payload?.data?.whatsapp?.status === "DISCONNECTED",
    `seed: GET /v1/status reported WhatsApp as ${status.payload?.data?.whatsapp?.status ?? "null"} before the channel was connected, expected DISCONNECTED — nothing would open the condition the notification centre shows`,
  );

  const notifications = await client.request("GET", "/v1/notifications");
  step(
    notifications.status === 200,
    `seed: GET /v1/notifications answered ${notifications.status}, expected 200`,
  );
  const materialised = notifications.payload?.data?.items ?? [];
  step(
    materialised.length > 0,
    "seed: no notification was materialised into the centre; the /notificacoes screen would be measured empty",
  );

  // 4. Canal do WhatsApp pelo caminho de produção, contra o dublê. O vínculo
  //    conectado é o que permite a mensagem SAÍDA existir pela rota humana.
  const connect = await client.request("POST", "/v1/whatsapp/connect", {
    body: { mode: "QR", consentAccepted: true },
  });
  step(
    connect.status === 201,
    `seed: POST /v1/whatsapp/connect answered ${connect.status}, expected 201`,
  );
  const whatsapp = await client.request("GET", "/v1/whatsapp");
  step(
    whatsapp.status === 200 && whatsapp.payload?.data?.status === "CONNECTED",
    `seed: GET /v1/whatsapp answered ${whatsapp.status} with status ${whatsapp.payload?.data?.status ?? "null"}, expected 200/CONNECTED`,
  );

  // 5. Catálogo e cliente.
  const service = await client.request("POST", "/v1/services", {
    body: { ...SEED.catalogService, active: true },
  });
  step(
    service.status === 201,
    `seed: POST /v1/services answered ${service.status}, expected 201`,
  );
  const serviceId = service.payload?.data?.id ?? null;

  const durationService = await client.request("POST", "/v1/services", {
    body: { ...SEED.durationService, active: true },
  });
  step(
    durationService.status === 201,
    `seed: POST /v1/services (duration case) answered ${durationService.status}, expected 201`,
  );

  const customer = await client.request("POST", "/v1/customers", {
    body: { ...SEED.customer },
  });
  step(
    customer.status === 201,
    `seed: POST /v1/customers answered ${customer.status}, expected 201`,
  );
  const customerId = customer.payload?.data?.id ?? null;
  step(
    Boolean(serviceId) && Boolean(customerId),
    "seed: the catalogue service and the customer did not both return an id",
  );

  // 6. Atendimento no PRIMEIRO horário livre a partir de agora. O horário não
  //    é escolhido por este arquivo: ele sai de `GET /v1/availability`, que é
  //    a mesma oferta que a interface mostra, e vem em ordem cronológica —
  //    `offered[0]` é sempre o mais cedo. A janela pedida cobre dois dias, não
  //    um: a grade termina às 23:59, então perto da virada a duração do
  //    serviço pode não caber mais no dia corrente e o primeiro horário livre
  //    vira o começo do dia seguinte. Isso não atrasa a medição: a subida do
  //    frontend (`next build` + servidor) que roda depois desta semeadura
  //    sempre consome minutos, e é esse intervalo que garante que "amanhã" já
  //    virou "hoje" pelo relógio do navegador quando o Playwright olha para a
  //    Agenda — por isso `measuredDate` vem do slot escolhido, nunca de
  //    `new Date()` congelado no instante da semeadura.
  const queryStartDate = localIsoDate(new Date(), SEED.timezone);
  const availabilityRoute =
    `/v1/availability?serviceIds=${encodeURIComponent(serviceId)}` +
    `&startDate=${queryStartDate}&days=2&maxSlots=100`;
  const availability = await client.request("GET", availabilityRoute);
  step(
    availability.status === 200,
    `seed: GET /v1/availability answered ${availability.status}, expected 200`,
  );
  const offered = availability.payload?.data ?? [];
  step(
    Array.isArray(offered) && offered.length > 0,
    `seed: the agenda offered no slot across the two days starting ${queryStartDate}. The seeded availability covers every day of the week, so an empty two-day window means the calendar has no capacity at all.`,
  );
  const slot = offered[0];
  const measuredDate = slot.date;
  const appointment = await client.request("POST", "/v1/appointments", {
    body: {
      serviceIds: [serviceId],
      date: slot.date,
      startTime: slot.startTime,
      customerId,
      comments: "Agendado pela semeadura do Goal033.",
    },
    idempotencyKey: `goal033-appointment-${slot.date}-${slot.startTime}`,
  });
  step(
    appointment.status === 201,
    `seed: POST /v1/appointments answered ${appointment.status}, expected 201`,
  );
  const appointmentId = appointment.payload?.data?.id ?? null;
  step(
    Boolean(appointmentId),
    "seed: POST /v1/appointments did not return an id",
  );

  // 7. Mensagem ENTRANTE pelo caminho durável real. O webhook é entrada
  //    externa e por isso o ensaio o fabrica; tudo depois dele é produto.
  const conversationId = await seedInboundMessage(ai);

  // 8. Conversa lida pelo contrato público, categorizada e com mensagem SAÍDA
  //    pela rota humana — a mesma que a profissional usa na tela.
  const listed = await client.request("GET", "/v1/conversations");
  step(
    listed.status === 200,
    `seed: GET /v1/conversations answered ${listed.status}, expected 200`,
  );
  const conversations = listed.payload?.data ?? [];
  step(
    conversations.some((entry) => entry.id === conversationId),
    "seed: the contact's conversation did not show up in GET /v1/conversations",
  );

  const categorised = await client.request(
    "PUT",
    `/v1/conversations/${conversationId}/category`,
    { body: { category: "COMMERCIAL" } },
  );
  step(
    categorised.status === 200,
    `seed: PUT /v1/conversations/:id/category answered ${categorised.status}, expected 200`,
  );

  const sent = await client.request(
    "POST",
    `/v1/conversations/${conversationId}/messages`,
    { body: { text: SEED.ownerReply } },
  );
  step(
    sent.status === 201 || sent.status === 202,
    `seed: POST /v1/conversations/:id/messages answered ${sent.status}, expected 201 or 202`,
  );

  // 9. Ledger de agenda desta conversa (Goal070 §5): um AiRun com três
  //    AiToolCall de `create_appointment`, direto por `pg` no banco
  //    descartável da IA. Não existe rota de produto para plantar um `prepare`
  //    já vencido ou um `hold` no futuro sem confirmar — só o modelo real, em
  //    conversa real, produz isso — então esta semeadura é a única do ensaio
  //    que não passa por uma rota, e é só de teste: nenhuma rota nova nem
  //    caminho de escrita novo nasce em `apps/` por causa dela.
  const channelRow = await aiDb.query(
    `SELECT "id" FROM "ChannelConnection" WHERE "tenantId" = $1 LIMIT 1`,
    [tenantId],
  );
  const channelId = channelRow.rows[0]?.id ?? null;
  step(
    Boolean(channelId),
    "seed: no ChannelConnection found for the tenant; the ledger event seed needs one",
  );
  await seedConversationEventLedger(aiDb, {
    tenantId,
    channelId,
    conversationId,
    appointmentId,
    appointmentDate: measuredDate,
    appointmentStartTime: slot.startTime,
    seededAt: new Date(),
  });

  // O que ficou gravado, lido no banco do serviço DONO de cada dado. Resposta
  // `200` não é evidência de persistência.
  const users = await bffDb.query(`SELECT count(*)::int AS total FROM "User"`);
  const notificationRows = await bffDb.query(
    `SELECT count(*)::int AS total FROM "TenantNotification"`,
  );
  const customers = await schedulingDb.query(
    `SELECT count(*)::int AS total FROM "Customer"`,
  );
  const services = await schedulingDb.query(
    `SELECT count(*)::int AS total FROM "Service"`,
  );
  const appointments = await schedulingDb.query(
    `SELECT count(*)::int AS total FROM "Appointment"`,
  );
  const messages = await aiDb.query(
    `SELECT "direction"::text AS "direction", count(*)::int AS "total"
       FROM "Message" GROUP BY "direction"`,
  );
  const byDirection = Object.fromEntries(
    messages.rows.map((row) => [row.direction, row.total]),
  );
  step(
    (byDirection.INBOUND ?? 0) >= 1 && (byDirection.OUTBOUND ?? 0) >= 1,
    `seed: the conversation must carry at least one inbound and one outbound message, found ${JSON.stringify(byDirection)}`,
  );

  return {
    tenantId,
    userId,
    email: SEED.email,
    measuredDate,
    bookedSlot: { date: slot.date, startTime: slot.startTime },
    conversationId,
    counts: {
      users: users.rows[0].total,
      notifications: notificationRows.rows[0].total,
      customers: customers.rows[0].total,
      services: services.rows[0].total,
      appointments: appointments.rows[0].total,
      messagesByDirection: byDirection,
    },
    // Nomes que o gate usa para afirmar que a tela carregou o conteúdo real, e
    // não o esqueleto.
    content: {
      businessName: SEED.businessName,
      customerName: SEED.customer.name,
      serviceName: SEED.catalogService.name,
      contactName: SEED.contact.name,
      inboundText: SEED.contact.text,
      durationServiceName: SEED.durationService.name,
      durationServiceMinutes: SEED.durationService.durationMinutes,
    },
  };
}

/**
 * Semeia a SEGUNDA conta (Goal065/WU-05), pelas rotas do produto, e para no
 * meio do onboarding de propósito: registra a conta e grava só o bloco de
 * negócio (nome, segmento, "Local próprio" e endereço). Nunca chama
 * `PATCH /v1/onboarding` de novo nem `POST /v1/onboarding/complete` — é isso
 * que mantém a sessão em `phase: "onboarding"` para o gate autenticado
 * medir, navegando direto para a URL de cada etapa.
 *
 * `createClient` é uma fábrica, não a instância: esta conta precisa do
 * próprio cofre de cookies, separado do cliente que semeou a conta
 * principal.
 */
async function seedOnboardingAccount(createClient, legalVersions) {
  const client = createClient();
  const registered = await client.request("POST", "/v1/auth/register", {
    body: {
      email: ONBOARDING_SEED.email,
      name: ONBOARDING_SEED.ownerName,
      password: ONBOARDING_ACCOUNT_PASSWORD,
      confirmPassword: ONBOARDING_ACCOUNT_PASSWORD,
      termsAccepted: true,
      termsVersion: legalVersions.termsVersion,
      privacyPolicyVersion: legalVersions.privacyPolicyVersion,
    },
  });
  step(
    registered.status === 201,
    `seed(onboarding): POST /v1/auth/register answered ${registered.status}, expected 201`,
  );
  step(
    client.hasSessionCookie(),
    "seed(onboarding): register did not return a session cookie",
  );

  const business = await client.request("PATCH", "/v1/onboarding", {
    body: {
      business: {
        address: ONBOARDING_SEED.address,
        category: ONBOARDING_SEED.businessCategory,
        modalities: ["ON_SITE"],
        name: ONBOARDING_SEED.businessName,
        timezone: ONBOARDING_SEED.timezone,
      },
    },
  });
  step(
    business.status === 200,
    `seed(onboarding): the business onboarding block answered ${business.status}, expected 200`,
  );

  return { email: ONBOARDING_SEED.email, password: ONBOARDING_ACCOUNT_PASSWORD };
}

/** Corpo do webhook do Evolution Go, no formato que o adaptador mapeia. */
function inboundWebhookPayload() {
  const { contact } = SEED;
  return {
    event: "Message",
    instanceId: INSTANCE_ID,
    data: {
      Info: {
        ID: contact.messageId,
        Chat: `${contact.phone}@s.whatsapp.net`,
        Sender: `${contact.phone}@s.whatsapp.net`,
        PushName: contact.name,
        Type: "text",
      },
      Message: { conversation: contact.text },
    },
  };
}

/**
 * A mensagem do contato, do webhook até a conversa, pelo código de produção.
 *
 * A IA persiste ANTES de responder `202`; o lote é reivindicado pela inbox
 * real, com lease real; a mensagem é mapeada pelo adaptador real e gravada
 * pelo `AssistantService` real. O laço de fundo está desligado, então quem
 * reivindica é este arquivo — e o relógio adiantado substitui a espera pela
 * janela de agrupamento, que é entrada externa como qualquer relógio.
 */
async function seedInboundMessage(ai) {
  const webhook = await fetch(
    new URL(
      `/webhooks/evolution?token=${encodeURIComponent(WEBHOOK_TOKEN)}`,
      ai.address,
    ),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inboundWebhookPayload()),
    },
  );
  step(
    webhook.status === 202,
    `seed: POST /webhooks/evolution answered ${webhook.status}, expected 202`,
  );

  const claim = await ai.inbox.claimNext({
    owner: "goal033-authenticated-ui",
    leaseMs: 120_000,
    groupWindowMs: 60_000,
    batchLimit: 10,
    now: new Date(Date.now() + 5 * 60 * 1_000),
  });
  step(
    claim !== null && claim.events.length > 0,
    "seed: the durable inbox handed no batch over; the contact message was never claimable",
  );

  let conversationId = null;
  for (const event of claim.events) {
    const mapped = ai.mapEvolutionInbound(event.rawPayload);
    step(
      mapped !== null,
      "seed: a stored inbound event no longer maps to a message",
    );
    const context = await ai.channelConnections.resolveEvolutionInboundContext({
      message: mapped,
      requestId: "goal033-authenticated-ui-dispatch",
    });
    // A ordem é a do caminho de produção, e ela importa: conversa, depois
    // sessão, depois mensagem.
    const resolvedConversationId = await ai.runtime.resolveConversationId(
      context.message,
    );
    await ai.sessions.resolveContext({
      tenantId: context.message.tenantId,
      channelId: context.message.channelId,
      conversationId: resolvedConversationId,
      externalContactId: context.message.customerPhone,
      customerName: context.message.customerName,
    });
    const recorded = await ai.assistant.recordInboundText({
      phone: context.message.customerPhone,
      text: context.message.text,
      channelMessage: context.message,
      customerName: context.message.customerName,
    });
    conversationId = recorded?.conversationId ?? conversationId;
  }
  await ai.inbox.complete({
    ids: claim.events.map((event) => event.id),
    leaseToken: claim.leaseToken,
    status: "DONE",
    result: { kind: "message", size: claim.events.length },
  });

  step(
    Boolean(conversationId),
    "seed: the inbound message was not recorded into any conversation",
  );
  return conversationId;
}

// --- Ledger sintético de eventos de agenda (Goal070 §5) ---------------------
//
// A conversa semeada ganha um `AiRun` com três `AiToolCall` de
// `create_appointment`, na ordem que faz `deriveConversationEvents`
// (`apps/ai-orchestrator/src/modules/conversations/conversation-events.ts`)
// produzir as três linhas que o Goal070 exige na tela: um `prepare` cujo
// hold ainda não venceu, um `confirm` que criou o agendamento real desta
// conversa, e um segundo `prepare` cujo hold já venceu sem confirmação.
//
// A ordem cronológica importa: o `confirm` vem DEPOIS do primeiro `prepare`
// e ANTES do segundo, para consumir o hold do primeiro — que por isso nunca
// aparece como vencido — sem tocar no hold do segundo, que fica livre para
// vencer. `buildConversationEventToolCalls` é puro — sem banco, sem relógio
// de parede — para que o teste do ensaio prove a forma e a ordem sem subir a
// pilha.
//
// Não existe rota de produto que plante um hold já vencido ou um hold futuro
// sem confirmar: só o modelo real, numa conversa real, produz isso. Por isso
// esta é a única semeadura do ensaio que não passa por uma rota — e é só de
// teste, sem rota nova nem caminho de escrita novo em `apps/`.

export function buildConversationEventToolCalls({
  conversationId,
  appointmentId,
  appointmentDate,
  appointmentStartTime,
  seededAt,
}) {
  const prepareFutureAt = new Date(seededAt.getTime() - 30 * 60_000);
  const confirmAt = new Date(seededAt.getTime() - 20 * 60_000);
  const prepareExpiredAt = new Date(seededAt.getTime() - 10 * 60_000);

  return [
    {
      id: `${conversationId}-goal070-prepare-future`,
      name: "create_appointment",
      status: "SUCCEEDED",
      arguments: { action: "prepare" },
      result: {
        ok: true,
        data: {
          pendingAction: { date: appointmentDate, startTime: "09:00" },
          hold: {
            id: `${conversationId}-goal070-hold-future`,
            // Bem além do teto de subida do frontend
            // (`FRONTEND_READY_TIMEOUT_MS`) e da execução do gate: precisa
            // continuar no futuro quando o Playwright abrir a tela, não só no
            // instante da semeadura.
            expiresAt: new Date(
              seededAt.getTime() + 24 * 60 * 60_000,
            ).toISOString(),
          },
        },
      },
      createdAt: prepareFutureAt,
      completedAt: prepareFutureAt,
    },
    {
      id: `${conversationId}-goal070-confirm`,
      name: "create_appointment",
      status: "SUCCEEDED",
      arguments: { action: "confirm" },
      result: {
        ok: true,
        data: {
          appointment: {
            id: appointmentId,
            date: appointmentDate,
            startTime: appointmentStartTime,
          },
        },
      },
      createdAt: confirmAt,
      completedAt: confirmAt,
    },
    {
      id: `${conversationId}-goal070-prepare-expired`,
      name: "create_appointment",
      status: "SUCCEEDED",
      arguments: { action: "prepare" },
      result: {
        ok: true,
        data: {
          pendingAction: { date: appointmentDate, startTime: "17:00" },
          hold: {
            id: `${conversationId}-goal070-hold-expired`,
            // Já vencido no instante da semeadura, então segue vencido em
            // qualquer instante em que o gate rodar depois.
            expiresAt: new Date(
              seededAt.getTime() - 5 * 60_000,
            ).toISOString(),
          },
        },
      },
      createdAt: prepareExpiredAt,
      completedAt: prepareExpiredAt,
    },
  ];
}

/**
 * Grava o `AiRun` e os três `AiToolCall` direto por `pg`, no banco
 * descartável da IA.
 */
async function seedConversationEventLedger(aiDb, {
  tenantId,
  channelId,
  conversationId,
  appointmentId,
  appointmentDate,
  appointmentStartTime,
  seededAt,
}) {
  const toolCalls = buildConversationEventToolCalls({
    conversationId,
    appointmentId,
    appointmentDate,
    appointmentStartTime,
    seededAt,
  });
  const aiRunId = `${conversationId}-goal070-airun`;

  await aiDb.query(
    `INSERT INTO "AiRun"
       ("id", "tenantId", "channelId", "conversationId", "provider", "model",
        "promptVersion", "inputMessageIds", "status", "kind", "startedAt", "completedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      aiRunId,
      tenantId,
      channelId,
      conversationId,
      "openai",
      "goal033-authenticated-ui-rehearsal",
      "goal033-authenticated-ui-rehearsal",
      [],
      "SUCCEEDED",
      "TURN",
      toolCalls[0].createdAt,
      toolCalls[toolCalls.length - 1].completedAt,
    ],
  );

  for (const call of toolCalls) {
    await aiDb.query(
      `INSERT INTO "AiToolCall"
         ("id", "tenantId", "aiRunId", "name", "arguments", "result", "status", "createdAt", "completedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        call.id,
        tenantId,
        aiRunId,
        call.name,
        call.arguments,
        call.result,
        call.status,
        call.createdAt,
        call.completedAt,
      ],
    );
  }
}

// --- Frontend: build com a URL embutida, e servidor em loopback -------------

/**
 * `next build` com `NEXT_PUBLIC_BFF_URL` no ambiente.
 *
 * É aqui que a porta fixa do BFF deixa de ser configuração e vira parte do
 * bundle: depois deste passo, mudar a porta do BFF não muda o produto que o
 * gate mede. O binário é chamado pelo Node diretamente, sem shell — é o que
 * torna o encerramento previsível nas três plataformas.
 */
function buildFrontend(ports) {
  console.log(
    `goal033:authenticated-ui-rehearsal building the frontend with NEXT_PUBLIC_BFF_URL=${ports.bffUrl}`,
  );
  const outcome = spawnSync(process.execPath, [nextBinary(), "build"], {
    cwd: frontendDir(),
    env: frontendEnvironment({
      NEXT_PUBLIC_BFF_URL: ports.bffUrl,
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
    }),
    stdio: "inherit",
    timeout: BUILD_TIMEOUT_MS,
  });
  if (outcome.error) {
    throw new AuthenticatedUiRehearsalError(
      `next build failed to start: ${outcome.error.message}`,
    );
  }
  if (outcome.status !== 0) {
    throw new AuthenticatedUiRehearsalError(
      `next build failed with exit ${outcome.status}. The authenticated gate has no product to measure.`,
    );
  }
  return { bffUrl: ports.bffUrl, status: outcome.status };
}

/**
 * Serve o build em `127.0.0.1`, na porta fixa declarada.
 *
 * `-H 127.0.0.1` em vez do `npm run start` do app, que publica em `0.0.0.0`:
 * este ensaio não escuta fora de loopback em lugar nenhum, e a origem exata é
 * a que o BFF autorizou em `FRONTEND_ORIGIN`.
 */
async function startFrontend(ports) {
  const child = spawn(
    process.execPath,
    [nextBinary(), "start", "-H", "127.0.0.1", "-p", String(ports.frontend)],
    {
      cwd: frontendDir(),
      env: frontendEnvironment({
        NEXT_PUBLIC_BFF_URL: ports.bffUrl,
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
      }),
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  let exited = null;
  child.once("exit", (code, signal) => {
    exited = { code, signal };
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < FRONTEND_READY_TIMEOUT_MS) {
    if (exited) {
      throw new AuthenticatedUiRehearsalError(
        `the frontend server died before answering, exit ${exited.code ?? exited.signal}. Its fixed port is ${ports.frontend} (GOAL033_FRONTEND_PORT).`,
      );
    }
    try {
      const response = await fetch(new URL("/login", ports.frontendUrl), {
        redirect: "manual",
      });
      if (response.status < 500) {
        console.log(
          `goal033:authenticated-ui-rehearsal frontend serving at ${ports.frontendUrl} after ${Date.now() - startedAt} ms`,
        );
        return child;
      }
    } catch {
      // Ainda subindo: a próxima sondagem tenta de novo.
    }
    await delay(FRONTEND_POLL_INTERVAL_MS);
  }

  stopFrontend(child);
  throw new AuthenticatedUiRehearsalError(
    `the frontend server did not answer at ${ports.frontendUrl} within ${FRONTEND_READY_TIMEOUT_MS} ms.`,
  );
}

function stopFrontend(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * O gate autenticado do Playwright, contra o servidor que este ensaio subiu.
 *
 * Tudo o que o spec precisa saber viaja por ambiente, e as credenciais viajam
 * para serem DIGITADAS em `/login` — não há cookie montado, `storageState`
 * fabricado nem chamada à rota de sessão para montar contexto.
 *
 * **Assíncrono por necessidade, não por estilo.** O BFF real escuta DENTRO
 * deste processo (é ele quem chama `buildServer().listen()`), e `spawnSync`
 * bloqueia o laço de eventos até o subprocesso terminar: com ele, o browser
 * abria `/login`, disparava `GET /v1/auth/session` para 3320 e ficava esperando
 * uma resposta que só sairia quando o próprio Playwright acabasse. Cada teste
 * morria no teto de 180s dentro de `page.goto(..., "networkidle")`, sem nunca
 * medir nada. Com `spawn` + `await`, o laço continua livre e o BFF responde
 * enquanto o gate roda.
 */
function runAuthenticatedGate(ports, seed, onboardingSeed) {
  const configPath = playwrightConfig();
  console.log(
    `goal033:authenticated-ui-rehearsal running the authenticated gate (${path.relative(repositoryRoot, configPath)}) against ${ports.frontendUrl}`,
  );
  // Apaga o relatório de uma execução anterior ANTES de subir o Playwright: um
  // relatório que sobrevive a esta linha só pode ter sido escrito por ESTA
  // execução. `notBeforeMs` é a segunda linha de defesa, para o caso raro de o
  // apagamento falhar ou o processo cair antes de o Playwright escrever o seu.
  rmSync(authenticatedGateReportPath(), { force: true });
  const notBeforeMs = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli(), "test", `--config=${configPath}`],
      {
        cwd: frontendDir(),
        env: frontendEnvironment({
          GOAL033_GATE_BASE_URL: ports.frontendUrl,
          GOAL033_BFF_URL: ports.bffUrl,
          GOAL033_EMAIL: SEED.email,
          GOAL033_PASSWORD: ACCOUNT_PASSWORD,
          GOAL033_MEASURED_DATE: seed.measuredDate,
          GOAL033_SEED: JSON.stringify(seed.content),
          // A SEGUNDA conta (Goal065/WU-05), parada no meio do onboarding —
          // digitada em /login como a primeira, sem cookie fabricado.
          GOAL033_ONBOARDING_EMAIL: onboardingSeed.email,
          GOAL033_ONBOARDING_PASSWORD: onboardingSeed.password,
          // Identificador desta execução. O gate digita a sessão uma vez e a
          // reusa entre os testes (a rota de login do produto aceita dez
          // tentativas por IP a cada quinze minutos, e são trinta e cinco
          // testes); o identificador é o que impede a execução seguinte — com
          // bancos recriados do zero — de herdar o cookie da anterior.
          GOAL033_RUN_ID: `${Date.now()}-${process.pid}`,
          NEXT_PUBLIC_BFF_URL: ports.bffUrl,
        }),
        stdio: "inherit",
      },
    );
    child.on("error", (error) => {
      reject(
        new AuthenticatedUiRehearsalError(
          `the authenticated gate failed to start: ${error.message}`,
        ),
      );
    });
    child.on("close", (status, signal) => {
      let retried;
      try {
        retried = extractRetriedTests(
          readGateReport(authenticatedGateReportPath(), notBeforeMs),
        );
      } catch (error) {
        reject(error);
        return;
      }
      console.log(describeRetries(retried));
      resolve({
        config: path.relative(repositoryRoot, configPath),
        baseUrl: ports.frontendUrl,
        // Morto por sinal não tem código de saída: 1 mantém a falha visível
        // em vez de virar `null` e passar por sucesso.
        status: status ?? (signal ? 1 : 0),
        retries: { count: retried.length, tests: retried },
      });
    });
  });
}

// --- A metade pai: destino, bancos, migrations e o subprocesso --------------

/**
 * Roda a pilha num subprocesso `tsx`: este mesmo arquivo, reinvocado com
 * `--stack`. É o único jeito de subir os três apps TypeScript reais sem
 * duplicar a lógica deles aqui.
 */
function runStack(plan, resultFile) {
  const scriptPath = fileURLToPath(import.meta.url);
  const cwd = path.join(repositoryRoot, "apps", "bff");
  // Caminho relativo com barra normal: evita qualquer questão de escape de
  // barra invertida na string de comando entregue ao shell.
  const relativeScriptPath = path
    .relative(cwd, scriptPath)
    .split(path.sep)
    .join("/");

  const environment = {
    ...process.env,
    GOAL033_BFF_DB_URL: plan.bff.url,
    GOAL033_SCHEDULING_DB_URL: plan.scheduling.url,
    GOAL033_AI_DB_URL: plan.ai.url,
    GOAL033_BFF_PORT: String(plan.ports.bff),
    GOAL033_FRONTEND_PORT: String(plan.ports.frontend),
    GOAL033_RESULT_FILE: resultFile,
  };

  const outcome = spawnSync(`npx tsx ${relativeScriptPath} --stack`, {
    cwd,
    env: environment,
    // Herdado de propósito: o build do frontend e o gate levam minutos, e a
    // saída real deles é a evidência que o relatório do Goal pede. Segurar
    // tudo em memória para imprimir no fim esconderia o progresso.
    stdio: "inherit",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, detail: `failed to start: ${outcome.error.message}` };
  }
  if (outcome.signal) {
    return { status: null, detail: `terminated by signal ${outcome.signal}` };
  }
  return { status: outcome.status, detail: `exit code ${outcome.status}` };
}

export async function rehearse(plan) {
  await recreateDatabase(plan.maintenance, plan.bff.database);
  await recreateDatabase(plan.maintenance, plan.scheduling.database);
  await recreateDatabase(plan.maintenance, plan.ai.database);

  for (const [appDir, target, label] of [
    ["bff", plan.bff, "BFF"],
    ["scheduling-service", plan.scheduling, "Scheduling"],
    ["ai-orchestrator", plan.ai, "AI"],
  ]) {
    const migration = runPrisma(appDir, target.url);
    if (
      !assert(
        migration.status === 0,
        `prisma migrate deploy failed for the ${label} rehearsal database, exit ${migration.status}\n${migration.output}`,
      )
    ) {
      return;
    }
  }

  // Nada é semeado por fora: a semeadura precisa encontrar os três bancos
  // vazios, ou o que o gate mede teria sido montado por baixo das rotas.
  const emptyBff = await countRows(plan.bff.url, BFF_SEED_TABLES);
  const emptyScheduling = await countRows(
    plan.scheduling.url,
    SCHEDULING_SEED_TABLES,
  );
  const emptyAi = await countRows(plan.ai.url, AI_SEED_TABLES);
  const seeded = [
    ...unexpectedRows(emptyBff),
    ...unexpectedRows(emptyScheduling),
    ...unexpectedRows(emptyAi, AI_BASELINE_ROWS),
  ];
  if (
    !assert(
      seeded.length === 0,
      `the rehearsal must start from empty databases; found rows already present in ${seeded
        .map(([table, total]) => `${table}=${total}`)
        .join(", ")}`,
    )
  ) {
    return;
  }
  console.log(
    "goal033:authenticated-ui-rehearsal the three databases start empty across " +
      `${BFF_SEED_TABLES.length + SCHEDULING_SEED_TABLES.length + AI_SEED_TABLES.length} tables — everything the gate sees is seeded through product routes`,
  );

  const resultFile = path.join(
    resultDirectory(),
    "goal033-authenticated-ui-rehearsal.json",
  );
  let outcome;
  try {
    outcome = runStack(plan, resultFile);
    const report = readResult(resultFile);
    if (report?.seed) {
      console.log(
        "goal033:authenticated-ui-rehearsal seeded through product routes: " +
          `${report.seed.counts.users} account, ${report.seed.counts.services} service(s), ` +
          `${report.seed.counts.customers} customer(s), ${report.seed.counts.appointments} appointment(s) on ` +
          `${report.seed.measuredDate}, ${report.seed.counts.notifications} notification(s), ` +
          `messages ${JSON.stringify(report.seed.counts.messagesByDirection)}`,
      );
    }
    if (report?.gate) {
      console.log(
        `goal033:authenticated-ui-rehearsal authenticated gate: ${report.gate.config} against ${report.gate.baseUrl}, exit ${report.gate.status}`,
      );
      console.log(describeRetries(report.gate.retries?.tests ?? []));
    }
    if (
      !assert(
        outcome.status === 0,
        `the authenticated rehearsal (the real BFF on a fixed port, the real Scheduling service, the real AI orchestrator, the built frontend and the authenticated gate) failed: ${outcome.detail}` +
          (report?.error ? `\n${report.error}` : ""),
      )
    ) {
      return;
    }
    if (
      !assert(
        report?.ok === true,
        "the rehearsal subprocess exited 0 without reporting a successful run; nothing proves the gate ran",
      )
    ) {
      return;
    }
  } finally {
    rmSync(resultFile, { force: true });
  }
}

function resultDirectory() {
  const directory = path.join(os.tmpdir(), "goal033-authenticated-ui");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function readResult(resultFile) {
  if (!existsSync(resultFile)) return null;
  try {
    return JSON.parse(readFileSync(resultFile, "utf8"));
  } catch {
    return null;
  }
}

export async function main() {
  let plan;
  try {
    // O destino vem PRIMEIRO, antes até da conferência de dependências: a
    // recusa que este ensaio precisa garantir é a do alvo, e ela não pode
    // depender de qual binário está instalado na máquina.
    plan = resolveRehearsalPlan();
    assertRequiredBinaries();
    // Antes de qualquer conexão: as duas portas fixas precisam estar livres,
    // ou o produto medido não seria o produto. Só então o alvo é consultado —
    // sem pgvector o histórico da IA para no meio, e o ensaio recusa em vez de
    // fingir que a pilha subiu.
    await assertPortsFree(plan.ports);
    await assertVectorExtensionAvailable(plan.maintenance);
  } catch (error) {
    if (error instanceof AuthenticatedUiRehearsalError) refuse(error.message);
    throw error;
  }

  console.log(
    `goal033:authenticated-ui-rehearsal target: BFF ${plan.bff.label}, Scheduling ${plan.scheduling.label}, AI ${plan.ai.label}`,
  );
  console.log(
    `goal033:authenticated-ui-rehearsal fixed ports: BFF ${plan.ports.bffUrl} (baked into NEXT_PUBLIC_BFF_URL), gate server ${plan.ports.frontendUrl} (FRONTEND_ORIGIN)`,
  );

  try {
    await rehearse(plan);
  } catch (error) {
    if (error instanceof AuthenticatedUiRehearsalError) refuse(error.message);
    console.error(
      `goal033:authenticated-ui-rehearsal FAILED — ${redactConnectionStrings(error.stack ?? error.message)}`,
    );
    process.exitCode = 1;
  }

  if (process.exitCode) {
    console.error(
      "goal033:authenticated-ui-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "\ngoal033:authenticated-ui-rehearsal PASSED — against three disposable PostgreSQL databases that started empty, the real " +
        "BFF (on its fixed, declared port), the real Scheduling service and the real AI orchestrator came up on 127.0.0.1; a single " +
        "business was seeded entirely through the product's own routes, from POST /v1/auth/register to a completed onboarding, a " +
        "catalogue service, a customer, an appointment on the measured day, a connected WhatsApp channel, a materialised " +
        "notification and a conversation carrying the contact's inbound message and the owner's outbound reply; the frontend was " +
        "built with NEXT_PUBLIC_BFF_URL pointing at that very port and served in loopback; and the authenticated gate measured the " +
        "product with a session it established by typing the seeded credentials into /login. No session was fabricated, no address " +
        "outside loopback was used, and neither a real LLM provider nor a real WhatsApp was ever called.",
    );
  }
}

if (process.argv[2] === "--stack") {
  // A metade `--stack` não tem caminho de recusa própria: quem validou o
  // destino foi o pai. O que ela precisa garantir é que nenhuma string de
  // conexão saia na saída de erro.
  try {
    await runStackChild();
    // Rede de segurança, e nada além disso: o trabalho já terminou e o
    // resultado já está no arquivo. Se um driver deixar conexão remanescente
    // segurando o laço de eventos, o gate não fica pendurado por causa disso.
    // O timer é `unref`ado, então ele não adia a saída natural.
    setTimeout(() => process.exit(0), 5_000).unref();
  } catch (error) {
    console.error(
      `goal033:authenticated-ui-rehearsal FAILED — ${redactConnectionStrings(
        error?.stack ?? error?.message ?? String(error),
      )}`,
    );
    process.exit(1);
  }
} else if (isMain(import.meta.url)) {
  await main();
}
