#!/usr/bin/env node
import { createRequire } from "node:module";
import { CURRENT_LEGAL_VERSIONS } from "../packages/legal-contract/index.js";

const requireFromBff = createRequire(new URL("../apps/bff/package.json", import.meta.url));

const config = {
  frontendUrl: envUrl("FRONTEND_URL", "https://atendly-ia-frontend.onrender.com"),
  bffUrl: envUrl("BFF_URL", "https://atendly-ia-bff.onrender.com"),
  apiUrl: envUrl("API_URL", "https://atendimeto-ia.onrender.com"),
  evolutionUrl: envUrl("EVOLUTION_URL", "https://evolution-go-4pmo.onrender.com"),
  healthWorkerUrl: envUrl("HEALTH_WORKER_URL", "https://atendly-ia-health-worker.onrender.com"),
  runMutating: process.env.RUN_MUTATING === "1",
  bffDatabaseUrl: process.env.BFF_DATABASE_URL
};

const password = "CodexSmoke123!";
const results = [];

async function main() {
  await healthChecks();
  await negativeAuthChecks();

  if (config.runMutating) {
    if (!config.bffDatabaseUrl) {
      throw new Error("RUN_MUTATING=1 requires BFF_DATABASE_URL so temporary users can be removed.");
    }

    await authFlow("bff", config.bffUrl, "");
    await authFlow("frontend", config.frontendUrl, "/api");
    await whatsappFlow("bff", config.bffUrl, "");
    await whatsappFlow("frontend", config.frontendUrl, "/api");
  }

  printSummary();
}

async function healthChecks() {
  await expectFetch("frontend_login", `${config.frontendUrl}/login`, 200);
  await expectFetch("bff_health", `${config.bffUrl}/health`, 200);
  await expectFetch("api_health", `${config.apiUrl}/health`, 200);
  await expectFetch("evolution_health", `${config.evolutionUrl}/healthy`, 200);
  await expectFetch("health_worker_health", `${config.healthWorkerUrl}/health`, 200);
}

async function negativeAuthChecks() {
  await expectFetch("bff_me_without_session", `${config.bffUrl}/auth/me`, 401);
  await expectFetch("api_internal_without_token", `${config.apiUrl}/internal/handoffs`, 401);
  await expectFetch("evolution_without_apikey", `${config.evolutionUrl}/instance/status`, 401);
}

async function authFlow(label, baseUrl, prefix) {
  const email = `codex-${label}-auth-smoke-${Date.now()}@example.invalid`;
  let cookie = "";

  await cleanupUser(email);

  try {
    let response = await jsonRequest(`${baseUrl}${prefix}/auth/register`, {
      method: "POST",
      body: { email, password, confirmPassword: password, termsAccepted: true, ...CURRENT_LEGAL_VERSIONS },
      cookie
    });
    cookie = response.cookie || cookie;
    assertStatus(`${label}_register`, response.status, 201);

    response = await jsonRequest(`${baseUrl}${prefix}/auth/me`, { cookie });
    assertStatus(`${label}_me_after_register`, response.status, 200);

    response = await jsonRequest(`${baseUrl}${prefix}/auth/logout`, {
      method: "POST",
      body: {},
      cookie
    });
    assertStatus(`${label}_logout`, response.status, 200);

    response = await jsonRequest(`${baseUrl}${prefix}/auth/login`, {
      method: "POST",
      body: { email, password },
      cookie: ""
    });
    cookie = response.cookie || "";
    assertStatus(`${label}_login`, response.status, 200);

    response = await jsonRequest(`${baseUrl}${prefix}/auth/me`, { cookie });
    assertStatus(`${label}_me_after_login`, response.status, 200);
  } finally {
    await cleanupUser(email);
  }
}

async function whatsappFlow(label, baseUrl, prefix) {
  const email = `codex-${label}-wa-smoke-${Date.now()}@example.invalid`;
  let cookie = "";

  await cleanupUser(email);

  try {
    let response = await jsonRequest(`${baseUrl}${prefix}/auth/register`, {
      method: "POST",
      body: { email, password, confirmPassword: password, termsAccepted: true, ...CURRENT_LEGAL_VERSIONS },
      cookie
    });
    cookie = response.cookie || cookie;
    assertStatus(`${label}_wa_register`, response.status, 201);

    response = await jsonRequest(`${baseUrl}${prefix}/whatsapp/instance`, {
      method: "POST",
      body: {},
      cookie
    });
    assertStatus(`${label}_wa_create_instance`, response.status, 201);

    response = await jsonRequest(`${baseUrl}${prefix}/whatsapp/connect`, {
      method: "POST",
      body: {},
      cookie
    });
    assertStatus(`${label}_wa_connect`, response.status, 200);

    response = await jsonRequest(`${baseUrl}${prefix}/whatsapp/qr`, { cookie });
    assertStatus(`${label}_wa_qr`, response.status, 200);
    const qr = response.body?.data?.qrcode ?? response.body?.qrcode;
    record(`${label}_wa_qr_present`, Boolean(qr), qr ? "qr present" : "qr missing");

    response = await jsonRequest(`${baseUrl}${prefix}/whatsapp/status`, { cookie });
    assertStatus(`${label}_wa_status`, response.status, 200);

    response = await jsonRequest(`${baseUrl}${prefix}/whatsapp/instance`, {
      method: "DELETE",
      cookie
    });
    assertStatus(`${label}_wa_delete_instance`, response.status, 200);
  } finally {
    await cleanupUser(email);
  }
}

async function expectFetch(name, url, expectedStatus) {
  const startedAt = Date.now();
  const response = await fetchWithRetry(url);
  const sample = await response.text().catch(() => "");
  const ok = response.status === expectedStatus;
  record(name, ok, `status=${response.status} expected=${expectedStatus} ms=${Date.now() - startedAt} sample=${sample.slice(0, 80)}`);
}

async function fetchWithRetry(url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(attempt * 1_000);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonRequest(url, options = {}) {
  const headers = {};
  if (options.cookie) headers.cookie = options.cookie;
  const init = {
    method: options.method || "GET",
    headers,
    signal: AbortSignal.timeout(60_000)
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  return { status: response.status, body, cookie };
}

function assertStatus(name, status, expectedStatus) {
  record(name, status === expectedStatus, `status=${status} expected=${expectedStatus}`);
}

async function cleanupUser(email) {
  if (!config.bffDatabaseUrl) return;

  const { Client } = requireFromBff("pg");
  const client = new Client({ connectionString: config.bffDatabaseUrl });

  await client.connect();
  try {
    await client.query('delete from "User" where email = $1', [email]);
  } finally {
    await client.end();
  }
}

function record(name, ok, details) {
  results.push({ name, ok, details });
  console.log(JSON.stringify({ name, ok, details }));
}

function printSummary() {
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ total: results.length, failed: failed.length }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function envUrl(key, fallback) {
  return (process.env[key] || fallback).replace(/\/$/, "");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
