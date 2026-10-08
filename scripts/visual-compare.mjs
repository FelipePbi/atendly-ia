#!/usr/bin/env node
// Comparação visual com o protótipo aprovado.
//
// Renderiza, na MESMA largura e altura, o quadro do protótipo
// (`docs/design-reference/claude-design/prototype/project/*.dc.html`) e a
// tela correspondente do app, e grava para cada alvo:
//
//   apps/frontend/e2e-results/visual/<alvo>/prototype.png
//   apps/frontend/e2e-results/visual/<alvo>/app.png
//   apps/frontend/e2e-results/visual/<alvo>/diff.png          (pixels diferentes em vermelho)
//   apps/frontend/e2e-results/visual/<alvo>/side-by-side.png  (protótipo | app | diferenças)
//   apps/frontend/e2e-results/visual/REPORT.md                (resumo desta execução)
//
// Existe para que quem implementa e quem revisa uma tela VEJA a referência e o
// resultado, em vez de reconstruir a interface a partir de uma descrição. A
// porcentagem de pixels diferentes é um indicador de tendência, não um gate:
// dados de conta diferentes dos do protótipo sempre produzem algum diff. O
// julgamento é olhar as imagens.
//
// O app é o do diretório em que o script roda (worktree do Goal): sobe um
// `next dev` próprio em porta livre, apontando para o BFF local já em
// execução. A conta usada é uma conta local de teste dedicada, criada e
// semeada pelas rotas do produto na primeira execução, com dados fictícios
// que espelham os do protótipo.
//
// Uso:
//   npm run visual:compare -- --target A6
//   npm run visual:compare -- --target A6,CL1 --device mobile
//   npm run visual:compare -- --all
//   npm run visual:compare -- --list
//   npm run visual:compare -- --target A6 --app-url http://localhost:3001
//
// Variáveis opcionais: VISUAL_BFF_URL (padrão http://localhost:3002),
// VISUAL_BFF_ORIGIN (padrão: FRONTEND_ORIGIN de apps/bff/.env ou
// http://localhost:3001).

import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { bffPathname, hasHeldResponse, isHeldRequest, pickFixedResponse, resolveRelativeDays, validateTargetResponses } from "./lib/visual-responses.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_DIR = path.join(ROOT, "apps", "frontend");
const PROTOTYPE_DIR = path.join(ROOT, "docs", "design-reference", "claude-design", "prototype", "project");
const TARGETS_FILE = path.join(FRONTEND_DIR, "e2e", "visual", "targets.json");
const OUT_DIR = path.join(FRONTEND_DIR, "e2e-results", "visual");

const requireFrontend = createRequire(path.join(FRONTEND_DIR, "package.json"));

/**
 * As quatro classes de quadro do protótipo e o viewport do app que corresponde
 * a cada uma. No celular, o quadro tem 874px de altura e os 62px de cima são a
 * barra de status do iPhone (21 + 22 + 19 em `ios-frame.jsx`): eles são
 * recortados, e o app é renderizado com os 812px restantes.
 */
export const DEVICES = Object.freeze({
  mobile: { width: 402, height: 812, prototypeCropTop: 62, suffix: null },
  "tablet-portrait": { width: 768, height: 1024, prototypeCropTop: 0, suffix: "Portrait" },
  "tablet-landscape": { width: 1024, height: 768, prototypeCropTop: 0, suffix: "Landscape" },
  desktop: { width: 1366, height: 768, prototypeCropTop: 0, suffix: "Desktop" },
});

const VISUAL_ACCOUNT = Object.freeze({
  email: "visual-prototipo-v2@example.invalid",
  // Conta local de teste, só existe no banco de desenvolvimento.
  password: "visual-prototipo-local-2026",
});

/** Conta parada no meio do onboarding, para os quadros `/onboarding/*`. */
const VISUAL_ONBOARDING_ACCOUNT = Object.freeze({
  email: "visual-prototipo-onboarding-v3@example.invalid",
  password: "visual-prototipo-local-2026",
});

/**
 * Páginas do protótipo cujas versões tablet/desktop têm outro nome de arquivo.
 */
const DEVICE_FILE_BASE = Object.freeze({
  "Conversas-e-Chat": "Conversas",
  "Mais-Negocio-Agenda-IA": "Configuracoes",
  "Mais-WhatsApp-Importacao-Conta": "Configuracoes",
});

// ---------------------------------------------------------------------------
// Argumentos e alvos

function parseArgs(argv) {
  const args = { targets: [], devices: null, all: false, list: false, appUrl: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${value} precisa de um valor`);
      return argv[index];
    };
    if (value === "--target" || value === "-t") args.targets.push(...next().split(",").map((item) => item.trim()).filter(Boolean));
    else if (value === "--device" || value === "-d") args.devices = next().split(",").map((item) => item.trim()).filter(Boolean);
    else if (value === "--all") args.all = true;
    else if (value === "--list") args.list = true;
    else if (value === "--app-url") args.appUrl = next().replace(/\/$/, "");
    else if (!value.startsWith("-")) args.targets.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    else throw new Error(`argumento desconhecido: ${value}`);
  }
  for (const device of args.devices ?? []) {
    if (!DEVICES[device]) throw new Error(`device desconhecido: ${device} (conhecidos: ${Object.keys(DEVICES).join(", ")})`);
  }
  return args;
}

export function loadTargets() {
  const raw = JSON.parse(readFileSync(TARGETS_FILE, "utf8"));
  return validateTargetResponses(raw.targets);
}

/**
 * Resolve o que o usuário pediu em pares (alvo, device). Um código pode ser
 * ambíguo entre arquivos (`S1` existe em Agenda e em Serviços): aí se escreve
 * `Servicos:S1`.
 */
export function selectRuns(targets, args) {
  const chosen = args.all
    ? targets
    : args.targets.map((wanted) => {
        const [module, code] = wanted.includes(":") ? wanted.split(":") : [null, wanted];
        const matches = targets.filter(
          (target) => target.code.toLowerCase() === code.toLowerCase()
            && (!module || target.file.toLowerCase().startsWith(module.toLowerCase())),
        );
        if (matches.length === 0) throw new Error(`alvo ${wanted} não está em ${path.relative(ROOT, TARGETS_FILE)} (use --list)`);
        if (matches.length > 1) {
          throw new Error(`alvo ${wanted} é ambíguo: ${matches.map((m) => `${m.file.replace(/\.dc\.html$/, "")}:${m.code}`).join(", ")}`);
        }
        return matches[0];
      });
  const runs = [];
  for (const target of chosen) {
    const devices = target.devices ?? Object.keys(DEVICES);
    for (const device of devices) {
      if (args.devices && !args.devices.includes(device)) continue;
      runs.push({ target, device });
    }
  }
  return runs;
}

export function runKey(target, device) {
  const module = target.file.replace(/\.dc\.html$/, "").toLowerCase();
  return `${module}-${target.code}-${device}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ---------------------------------------------------------------------------
// Infra: portas, servidor do protótipo, next dev

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function startPrototypeServer() {
  const port = await freePort();
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const file = path.normalize(path.join(PROTOTYPE_DIR, pathname));
    if (!file.startsWith(PROTOTYPE_DIR) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function readBffEnv() {
  const file = path.join(ROOT, "apps", "bff", ".env");
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && ["FRONTEND_ORIGIN", "PORT", "SESSION_COOKIE_NAME", "CSRF_HEADER_NAME"].includes(match[1])) {
      values[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
  return values;
}

/**
 * `next dev` reescreve `next-env.d.ts` (e às vezes `tsconfig.json`) ao subir.
 * Os dois são arquivos versionados: o conteúdo original é devolvido ao fim,
 * para que a comparação nunca apareça como alteração do worktree.
 */
function guardTrackedFiles() {
  const files = ["next-env.d.ts", "tsconfig.json", "AGENTS.md", "CLAUDE.md"].map((name) => path.join(FRONTEND_DIR, name));
  const saved = files.filter(existsSync).map((file) => ({ file, bytes: readFileSync(file) }));
  // Cópia em disco também: se este processo for morto sem chance de rodar o
  // `finally`, o vigia (startWatchdog) devolve os arquivos a partir dela.
  const backupDir = path.join(OUT_DIR, ".guard");
  mkdirSync(backupDir, { recursive: true });
  const backups = saved.map(({ file, bytes }) => {
    const backup = path.join(backupDir, path.basename(file));
    writeFileSync(backup, bytes);
    return { file, backup };
  });
  const restore = () => {
    for (const { file, bytes } of saved) {
      try {
        if (!readFileSync(file).equals(bytes)) writeFileSync(file, bytes);
      } catch {
        writeFileSync(file, bytes);
      }
    }
  };
  restore.backups = backups;
  return restore;
}

/**
 * Vigia destacado: se este script morrer sem rodar o `finally` (o Bash do
 * modelo estourou o tempo e matou o processo, por exemplo), o `next dev` que
 * ele subiu ficaria vivo para sempre, segurando memória. O vigia não é filho
 * na árvore que é morta: confere a cada 2 s se este processo ainda existe e,
 * quando não existe, derruba a árvore do `next dev` e devolve os arquivos
 * versionados que ele reescreve. Sai sozinho quando o `next dev` termina.
 */
function startWatchdog(childPid, backups) {
  const code = `
    const { execFileSync } = require("node:child_process");
    const fs = require("node:fs");
    const [parent, child, backups] = [Number(process.argv[1]), Number(process.argv[2]), JSON.parse(process.argv[3])];
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const timer = setInterval(() => {
      if (alive(parent)) {
        // Com o script vivo, quem limpa é ele; o vigia só sai se o next já acabou.
        if (!alive(child)) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      if (alive(child)) {
        try {
          if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          else process.kill(child, "SIGKILL");
        } catch {}
      }
      // O script morreu sem o finally: os arquivos versionados voltam daqui,
      // tenha o next morrido junto ou não.
      for (const { file, backup } of backups) { try { fs.copyFileSync(backup, file); } catch {} }
    }, 2000);
  `;
  const watchdog = spawn(process.execPath, ["-e", code, String(process.pid), String(childPid), JSON.stringify(backups)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  watchdog.unref();
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`next dev saiu com código ${child.exitCode} antes de responder`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} não respondeu em ${timeoutMs / 1000}s (${lastError?.message ?? "sem resposta"})`);
}

async function startFrontend(bffUrl) {
  const port = await freePort();
  const appUrl = `http://localhost:${port}`;
  const restore = guardTrackedFiles();
  const nextBin = requireFrontend.resolve("next/dist/bin/next");
  const log = [];
  // Turbopack recusa `node_modules` que aponte para fora da raiz (junção de um
  // worktree para o checkout principal); nesse caso, VISUAL_NEXT_BUNDLER=webpack.
  const bundler = process.env.VISUAL_NEXT_BUNDLER === "webpack" ? ["--webpack"] : [];
  const child = spawn(process.execPath, [nextBin, "dev", ...bundler, "-p", String(port)], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      BFF_BASE_URL: bffUrl,
      NEXT_PUBLIC_BFF_URL: `${appUrl}/api/bff`,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const keep = (chunk) => {
    log.push(String(chunk));
    if (log.length > 200) log.shift();
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  startWatchdog(child.pid, restore.backups);
  const stop = async () => {
    if (child.exitCode === null) {
      if (process.platform === "win32") {
        await new Promise((resolve) => spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on("exit", resolve));
      } else {
        child.kill("SIGTERM");
      }
    }
    restore();
  };
  try {
    await waitForHttp(`${appUrl}/login`, 180_000, child);
  } catch (error) {
    await stop();
    throw new Error(`${error.message}\n--- next dev ---\n${log.join("").slice(-3000)}`);
  }
  return { appUrl, stop };
}

// ---------------------------------------------------------------------------
// Conta de teste e semeadura pelas rotas do produto

function createClient(baseUrl, origin, csrfHeader) {
  const jar = new Map();
  let csrfToken = null;
  async function request(method, route, body, extraHeaders = {}) {
    const headers = { accept: "application/json", origin, ...extraHeaders };
    if (jar.size > 0) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    if (body !== undefined) headers["content-type"] = "application/json";
    if (csrfToken) headers[csrfHeader] = csrfToken;
    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const header = response.headers.get(csrfHeader);
    if (header) csrfToken = header;
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  }
  return { request, cookies: () => [...jar] };
}

function expectStatus(result, expected, label) {
  const ok = Array.isArray(expected) ? expected.includes(result.status) : result.status === expected;
  if (!ok) {
    const detail = JSON.stringify(result.payload)?.slice(0, 400);
    throw new Error(`semeadura: ${label} respondeu ${result.status} (esperado ${expected}) ${detail ?? ""}`);
  }
  return result.payload?.data ?? null;
}

async function ensureOnboardingAccount(client) {
  const login = await client.request("POST", "/v1/auth/login", {
    email: VISUAL_ONBOARDING_ACCOUNT.email,
    password: VISUAL_ONBOARDING_ACCOUNT.password,
  });
  if (login.status === 200) return;
  const seed = await import(pathToFileURL(path.join(ROOT, "scripts", "lib", "visual-seed.mjs")).href);
  const { CURRENT_LEGAL_VERSIONS } = await import(pathToFileURL(path.join(ROOT, "packages", "legal-contract", "index.js")).href);
  await seed.seedOnboardingAccount(client, { account: VISUAL_ONBOARDING_ACCOUNT, legalVersions: CURRENT_LEGAL_VERSIONS, expectStatus });
}

async function ensureVisualAccount(client) {
  const login = await client.request("POST", "/v1/auth/login", {
    email: VISUAL_ACCOUNT.email,
    password: VISUAL_ACCOUNT.password,
  });
  const seed = await import(pathToFileURL(path.join(ROOT, "scripts", "lib", "visual-seed.mjs")).href);
  if (login.status === 200) {
    await seed.ensureVisualCatalogue(client, { expectStatus });
    return { created: false, day: await seed.ensureVisualDay(client) };
  }
  if (![400, 401, 404].includes(login.status)) {
    throw new Error(`login da conta visual respondeu ${login.status}: ${JSON.stringify(login.payload)?.slice(0, 300)}`);
  }
  const { CURRENT_LEGAL_VERSIONS } = await import(pathToFileURL(path.join(ROOT, "packages", "legal-contract", "index.js")).href);
  await seed.seedVisualAccount(client, { account: VISUAL_ACCOUNT, legalVersions: CURRENT_LEGAL_VERSIONS, expectStatus });
  await seed.ensureVisualCatalogue(client, { expectStatus });
  return { created: true, day: await seed.ensureVisualDay(client) };
}

// ---------------------------------------------------------------------------
// Captura

const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
  caret-color: transparent !important;
}
nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
`;

async function settle(page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(250);
}

async function capturePrototype(browser, prototypeUrl, target, device, file) {
  const spec = DEVICES[device];
  const base = target.file.replace(/\.dc\.html$/, "");
  const pageFile = spec.suffix
    ? `${DEVICE_FILE_BASE[base] ?? base}${spec.suffix === "Desktop" ? "-Desktop" : "-Tablet"}.dc.html`
    : target.file;
  const resolvedFile = target.files?.[device] ?? pageFile;
  const context = await browser.newContext({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(`${prototypeUrl}/${resolvedFile}`, { waitUntil: "load" });
    await page.waitForSelector("#dc-root [data-screen-label]", { timeout: 60_000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await settle(page);
    const label = target.label;
    const suffix = spec.suffix;
    const handle = await page.evaluateHandle(
      ({ label, suffix }) => {
        const all = [...document.querySelectorAll("#dc-root [data-screen-label]")];
        const want = (element) => {
          const value = element.getAttribute("data-screen-label");
          return suffix ? value.endsWith(` / ${label} / ${suffix}`) : value === label;
        };
        const found = all.filter(want);
        if (found.length !== 1) return { error: `${found.length} quadros com o rótulo "${label}"${suffix ? ` / ${suffix}` : ""}` };
        const frame = found[0];
        const device = frame.closest('[data-om-starter="ios-frame"]');
        if (device) {
          device.style.borderRadius = "0";
          device.style.boxShadow = "none";
          for (const child of device.children) {
            if (getComputedStyle(child).position === "absolute") child.style.visibility = "hidden";
          }
        } else {
          frame.style.border = "0";
          frame.style.borderRadius = "0";
        }
        return frame;
      },
      { label, suffix },
    );
    const value = await handle.jsonValue().catch(() => null);
    if (value && value.error) throw new Error(`protótipo ${resolvedFile}: ${value.error}`);
    const element = handle.asElement();
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const box = await element.boundingBox();
    const cropTop = target.prototypeCropTop?.[device] ?? spec.prototypeCropTop;
    await page.screenshot({
      path: file,
      clip: { x: Math.round(box.x), y: Math.round(box.y) + cropTop, width: spec.width, height: spec.height },
      animations: "disabled",
    });
    return { file: resolvedFile, frameSize: `${Math.round(box.width)}×${Math.round(box.height)}` };
  } finally {
    await context.close();
  }
}

const HELD_QUIET_MS = 500;
const HELD_IDLE_TIMEOUT_MS = 30_000;

/**
 * Espera da rede para o alvo com entrada retida (`responses` com `hold`). O
 * `networkidle` do Playwright nunca chega com um pedido que não termina, então
 * a rede é contada à mão: os pedidos em andamento, menos os que casam com uma
 * entrada retida. `idle()` resolve quando nenhum pedido não retido está em
 * andamento há `quietMs` (o mesmo critério do `networkidle`), ou lança, com o
 * alvo e os pedidos que seguiam abertos, se passar de `timeoutMs`. Os ouvintes
 * precisam ser ligados antes da navegação.
 */
export function trackNetworkIdle(page, target, { quietMs = HELD_QUIET_MS, timeoutMs = HELD_IDLE_TIMEOUT_MS, pollMs = 50 } = {}) {
  const pending = new Set();
  let lastEvent = Date.now();
  const held = (request) => isHeldRequest(target, request.method(), bffPathname(request.url()));
  const started = (request) => {
    if (held(request)) return;
    pending.add(request);
    lastEvent = Date.now();
  };
  const ended = (request) => {
    if (pending.delete(request)) lastEvent = Date.now();
  };
  page.on("request", started);
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  return {
    async idle() {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (pending.size === 0 && Date.now() - lastEvent >= quietMs) return;
        if (Date.now() >= deadline) {
          const open = [...pending].slice(0, 5).map((request) => `${request.method()} ${request.url()}`).join(", ");
          throw new Error(`alvo ${target.code} (${target.file}): a rede não ficou ociosa em ${timeoutMs} ms, sem contar os pedidos retidos; ${pending.size} pedido(s) em andamento: ${open}`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    },
  };
}

/**
 * Leva a tela ao estado do quadro. Um passo `optional` que não encontra o
 * elemento é registrado e pulado: a captura sai mesmo assim, e o aviso diz
 * que o estado pode não ser o do quadro. `settleNetwork` é a espera depois de
 * cada passo; o padrão é o `networkidle` de sempre.
 */
async function runSteps(page, steps = [], settleNetwork = () => page.waitForLoadState("networkidle").catch(() => {})) {
  const skipped = [];
  for (const step of steps) {
    const timeout = step.timeout ?? 8_000;
    try {
      if (step.click) await page.getByText(step.click, { exact: step.exact ?? false }).first().click({ timeout });
      else if (step.clickRole) await page.getByRole(step.clickRole.role, { name: step.clickRole.name }).first().click({ timeout });
      else if (step.fill) await page.getByLabel(step.fill.label).first().fill(step.fill.value, { timeout });
      else if (step.press) await page.keyboard.press(step.press);
      else if (step.waitFor) await page.getByText(step.waitFor).first().waitFor({ timeout });
      else if (step.wait) await page.waitForTimeout(step.wait);
      else throw new Error(`passo desconhecido: ${JSON.stringify(step)}`);
    } catch (error) {
      if (!step.optional) throw error;
      skipped.push(JSON.stringify(step));
    }
    await settleNetwork();
  }
  return skipped;
}

async function captureApp(browser, appUrl, session, target, device, file) {
  const spec = DEVICES[device];
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    hasTouch: device === "mobile",
    isMobile: false,
  });
  // `session: false` mede a tela pública sem sessão; `account: "onboarding"`
  // usa a conta parada no meio do onboarding.
  const cookies = target.session === false
    ? []
    : target.account === "onboarding" ? session.onboardingCookies : session.cookies;
  if (cookies.length > 0) await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: appUrl })));
  // A proteção de CSRF do BFF compara a origem com FRONTEND_ORIGIN; o app
  // desta comparação roda em outra porta, então a origem é reescrita.
  await context.route("**/api/bff/**", (route) => {
    const headers = { ...route.request().headers(), origin: session.origin };
    return route.continue({ headers });
  });
  // Resposta fixa de GET declarada pelo alvo (`responses`); registrada depois
  // da reescrita de origem para ter precedência. O que não casa segue para ela.
  if (target.responses?.length) {
    await context.route("**/api/bff/**", (route) => {
      const request = route.request();
      // Retido: nem fulfill, nem continue, nem fallback. O pedido fica pendente
      // até o contexto fechar e não chega ao BFF.
      if (isHeldRequest(target, request.method(), bffPathname(request.url()))) return undefined;
      const fixed = pickFixedResponse(target, request.method(), bffPathname(request.url()));
      if (!fixed) return route.fallback();
      return route.fulfill({ status: fixed.status ?? 200, contentType: "application/json", body: JSON.stringify(resolveRelativeDays(fixed.json, session.today)) });
    });
  }
  const page = await context.newPage();
  // Alvo com entrada retida: `load` na abertura e a rede ociosa contada sem os
  // pedidos retidos. Sem entrada retida, a captura é a de sempre (`networkidle`).
  const network = hasHeldResponse(target) ? trackNetworkIdle(page, target) : null;
  if (target.clock && session.today) {
    // Hora do quadro (ex.: a linha de "agora" da Agenda às 13:45), no dia semeado.
    await page.clock.setFixedTime(new Date(`${session.today}T${target.clock}:00-03:00`));
  }
  try {
    let route = target.route;
    if (route.includes("{")) {
      route = route.replace(/\{(\w+)\}/g, (_, key) => {
        if (!session.ids[key]) throw new Error(`rota ${target.route} precisa de ${key}, que a semeadura não registrou`);
        return session.ids[key];
      });
    }
    await page.goto(`${appUrl}${route}`, { waitUntil: network ? "load" : "networkidle", timeout: 120_000 });
    if (network) await network.idle();
    if (target.session !== false && new URL(page.url()).pathname.startsWith("/login") && !route.startsWith("/login")) {
      throw new Error(`app redirecionou ${route} para /login: a sessão da conta visual não foi aceita`);
    }
    await page.addStyleTag({ content: FREEZE_CSS });
    const skipped = await runSteps(page, target.steps, network ? () => network.idle() : undefined);
    await settle(page);
    await page.screenshot({ path: file, animations: "disabled" });
    return { url: page.url().replace(appUrl, ""), skipped };
  } finally {
    await context.close();
  }
}

/**
 * Diferença e composição feitas num canvas do próprio Chromium: nenhuma
 * dependência de imagem nova no repositório.
 */
async function compose(browser, prototypeFile, appFile, diffFile, sideFile, title) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    const toDataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
    const result = await page.evaluate(
      async ({ prototype, app, title }) => {
        const load = (src) => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
        const [a, b] = await Promise.all([load(prototype), load(app)]);
        const width = Math.max(a.width, b.width);
        const height = Math.max(a.height, b.height);
        const canvasOf = (image) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, width, height);
        };
        const pa = canvasOf(a);
        const pb = canvasOf(b);
        const diff = new ImageData(width, height);
        let changed = 0;
        for (let i = 0; i < pa.data.length; i += 4) {
          const delta = Math.max(
            Math.abs(pa.data[i] - pb.data[i]),
            Math.abs(pa.data[i + 1] - pb.data[i + 1]),
            Math.abs(pa.data[i + 2] - pb.data[i + 2]),
          );
          if (delta > 40) {
            changed += 1;
            diff.data[i] = 220; diff.data[i + 1] = 30; diff.data[i + 2] = 30; diff.data[i + 3] = 255;
          } else {
            const gray = 0.3 * pb.data[i] + 0.59 * pb.data[i + 1] + 0.11 * pb.data[i + 2];
            const light = 255 - (255 - gray) * 0.25;
            diff.data[i] = light; diff.data[i + 1] = light; diff.data[i + 2] = light; diff.data[i + 3] = 255;
          }
        }
        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = width;
        diffCanvas.height = height;
        diffCanvas.getContext("2d").putImageData(diff, 0, 0);

        const vertical = width > 820;
        const gap = 24;
        const header = 44;
        const panels = [["Protótipo", a], ["App", b], ["Diferenças", diffCanvas]];
        const side = document.createElement("canvas");
        side.width = vertical ? width + gap * 2 : width * 3 + gap * 4;
        side.height = vertical ? (height + header) * 3 + gap * 4 + 36 : height + header + gap * 2 + 36;
        const ctx = side.getContext("2d");
        ctx.fillStyle = "#3a3632";
        ctx.fillRect(0, 0, side.width, side.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 18px system-ui, sans-serif";
        ctx.fillText(title, gap, 26);
        panels.forEach(([label, image], index) => {
          const x = vertical ? gap : gap + index * (width + gap);
          const y = vertical ? 36 + gap + index * (height + header + gap) : 36 + gap;
          ctx.fillStyle = "#ffffff";
          ctx.font = "600 20px system-ui, sans-serif";
          ctx.fillText(label, x, y + 26);
          ctx.drawImage(image, x, y + header);
        });
        return {
          ratio: changed / (width * height),
          sizeMismatch: a.width !== b.width || a.height !== b.height ? `${a.width}×${a.height} vs ${b.width}×${b.height}` : null,
          diff: diffCanvas.toDataURL("image/png"),
          side: side.toDataURL("image/png"),
        };
      },
      { prototype: toDataUrl(prototypeFile), app: toDataUrl(appFile), title },
    );
    writeFileSync(diffFile, Buffer.from(result.diff.split(",")[1], "base64"));
    writeFileSync(sideFile, Buffer.from(result.side.split(",")[1], "base64"));
    return { ratio: result.ratio, sizeMismatch: result.sizeMismatch };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------

function writeReport(rows) {
  const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
  const lines = [
    "# Comparação visual com o protótipo",
    "",
    `Execução: ${new Date().toISOString()}`,
    "",
    "Abra `side-by-side.png` de cada alvo (protótipo | app | diferenças). Para detalhe, abra `prototype.png` e `app.png` em resolução cheia.",
    "A porcentagem é tendência, não gate: dados da conta diferentes dos do protótipo também geram diferença.",
    "",
    "| Alvo | Quadro | Rota | Diff | Lado a lado |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    if (row.error) {
      lines.push(`| ${row.key} | ${row.target.code} · ${row.target.label} | ${row.target.route} | ERRO | ${row.error.replace(/\|/g, "/").split("\n")[0]} |`);
    } else {
      lines.push(`| ${row.key} | ${row.prototype.file} · ${row.target.label} | ${row.app.url} | ${(row.ratio * 100).toFixed(1)}%${row.sizeMismatch ? ` (tamanhos ${row.sizeMismatch})` : ""} | ${rel(row.side)} |`);
    }
  }
  const skipped = rows.filter((row) => row.app?.skipped?.length).map((row) => `- ${row.key}: ${row.app.skipped.join("; ")}`);
  if (skipped.length > 0) lines.push("", "## Passos não encontrados no app (a tela pode não estar no estado do quadro)", "", ...skipped);
  const notes = rows.filter((row) => row.target.notes).map((row) => `- ${row.key}: ${row.target.notes}`);
  if (notes.length > 0) lines.push("", "## Diferenças esperadas (estado da conta de teste, não do código)", "", ...[...new Set(notes)]);
  writeFileSync(path.join(OUT_DIR, "REPORT.md"), `${lines.join("\n")}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = loadTargets();
  if (args.list) {
    for (const target of targets) {
      console.log(`${target.file.replace(/\.dc\.html$/, "")}:${target.code}\t${target.route}\t${target.label}\t[${(target.devices ?? Object.keys(DEVICES)).join(", ")}]`);
    }
    return 0;
  }
  if (!args.all && args.targets.length === 0) {
    console.error("Informe --target <código> (ex.: --target A6) ou --all. Use --list para ver os alvos.");
    return 2;
  }
  const runs = selectRuns(targets, args);
  if (runs.length === 0) {
    console.error("Nenhum par alvo × device selecionado.");
    return 2;
  }

  const bffEnv = readBffEnv();
  const bffUrl = process.env.VISUAL_BFF_URL ?? `http://localhost:${bffEnv.PORT ?? 3002}`;
  const origin = process.env.VISUAL_BFF_ORIGIN ?? bffEnv.FRONTEND_ORIGIN ?? "http://localhost:3001";
  const csrfHeader = (bffEnv.CSRF_HEADER_NAME ?? "x-csrf-token").toLowerCase();

  try {
    const health = await fetch(`${bffUrl}/health`);
    if (health.status >= 500) throw new Error(`HTTP ${health.status}`);
  } catch (error) {
    console.error(`BFF local indisponível em ${bffUrl} (${error.message}). A comparação precisa do BFF de desenvolvimento rodando.`);
    return 3;
  }

  const client = createClient(bffUrl, origin, csrfHeader);
  const account = await ensureVisualAccount(client);
  const ids = {};
  if (runs.some(({ target }) => target.route.includes("{"))) {
    const { resolveVisualIds } = await import(pathToFileURL(path.join(ROOT, "scripts", "lib", "visual-seed.mjs")).href);
    Object.assign(ids, await resolveVisualIds(client));
  }
  const session = { cookies: client.cookies(), origin, ids };
  if (runs.some(({ target }) => target.account === "onboarding")) {
    const onboardingClient = createClient(bffUrl, origin, csrfHeader);
    await ensureOnboardingAccount(onboardingClient);
    session.onboardingCookies = onboardingClient.cookies();
  }
  console.log(`conta visual: ${VISUAL_ACCOUNT.email}${account.created ? " (criada e semeada agora)" : ""}`);
  for (const warning of account.day?.warnings ?? []) console.log(`  aviso da semeadura: ${warning}`);
  session.today = account.day?.today;

  const { chromium } = requireFrontend("@playwright/test");
  const prototype = await startPrototypeServer();
  const frontend = args.appUrl ? { appUrl: args.appUrl, stop: async () => {} } : await startFrontend(bffUrl);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      frontend.stop().finally(() => process.exit(130));
    });
  }
  console.log(`app: ${frontend.appUrl} · protótipo: ${prototype.url}`);
  const browser = await chromium.launch();
  const rows = [];
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const { target, device } of runs) {
      const key = runKey(target, device);
      const dir = path.join(OUT_DIR, key);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const files = {
        prototype: path.join(dir, "prototype.png"),
        app: path.join(dir, "app.png"),
        diff: path.join(dir, "diff.png"),
        side: path.join(dir, "side-by-side.png"),
      };
      try {
        const proto = await capturePrototype(browser, prototype.url, target, device, files.prototype);
        const app = await captureApp(browser, frontend.appUrl, session, target, device, files.app);
        const title = `${target.code} · ${target.label} · ${device} (${DEVICES[device].width}×${DEVICES[device].height}) · app ${app.url}`;
        const measured = await compose(browser, files.prototype, files.app, files.diff, files.side, title);
        rows.push({ key, target, device, prototype: proto, app, ...measured, side: files.side });
        console.log(`${key}: diff ${(measured.ratio * 100).toFixed(1)}% → ${path.relative(ROOT, files.side)}`);
        for (const step of app.skipped) console.log(`  passo opcional não encontrado no app (estado pode diferir do quadro): ${step}`);
      } catch (error) {
        rows.push({ key, target, device, error: error.message });
        console.error(`${key}: ERRO ${error.message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
    await frontend.stop();
    await prototype.close();
  }
  writeReport(rows);
  console.log(`relatório: ${path.relative(ROOT, path.join(OUT_DIR, "REPORT.md"))}`);
  return rows.some((row) => row.error) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    },
  );
}
