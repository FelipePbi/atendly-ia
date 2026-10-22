// Respostas fixas de GET por alvo do `visual:compare` (Goal106, Goal113).
//
// Cobre a parte pura que decide o que o instrumento aceita e o que serve:
// `responses` só aceita GET com caminho em /v1/; recusa outro método, caminho
// fora de /v1/ e campo desconhecido; o alvo sem `responses` não recebe resposta
// fixa; e a resposta só vale para o caminho exato. O `route.fulfill` em si
// roda no navegador e é medido pela execução 2 do visual:compare.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { trackNetworkIdle } from "../visual-compare.mjs";
import {
  bffPathname,
  hasHeldResponse,
  isHeldRequest,
  pickFixedResponse,
  resolveRelativeDays,
  validateResponses,
  validateTargetResponses,
} from "../lib/visual-responses.mjs";

const TARGET = { code: "W1", file: "Mais-WhatsApp-Importacao-Conta.dc.html" };
const OK = { method: "GET", path: "/v1/whatsapp", json: { data: { status: "CONNECTED" }, requestId: "x" } };

test("responses aceita GET com caminho em /v1/", () => {
  const [entry] = validateResponses([OK], TARGET);
  assert.deepEqual(entry, OK);
  assert.equal(validateResponses([{ ...OK, path: "/v1/conversations/ignored-contacts" }], TARGET).length, 1);
  assert.deepEqual(validateResponses([], TARGET), []);
});

test("responses recusa método que não é GET, com erro que nomeia o alvo", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "get", undefined]) {
    assert.throws(
      () => validateResponses([{ ...OK, method }], TARGET),
      (error) => /alvo W1/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /só "GET"/.test(error.message),
      `método ${String(method)} deveria ser recusado`,
    );
  }
});

test("responses recusa caminho fora de /v1/ ou com query", () => {
  for (const bad of ["/whatsapp", "/v2/whatsapp", "v1/whatsapp", "/v1/", "/v1", "/api/bff/v1/whatsapp", "/v1/whatsapp?x=1", "/v1/whatsapp#a", "/v1/what sapp", "https://example.test/v1/whatsapp", undefined, 7]) {
    assert.throws(
      () => validateResponses([{ ...OK, path: bad }], TARGET),
      (error) => /alvo W1/.test(error.message) && /responses\[0\]\.path/.test(error.message),
      `caminho ${String(bad)} deveria ser recusado`,
    );
  }
});

test("responses recusa campo desconhecido e item sem json", () => {
  assert.throws(
    () => validateResponses([{ ...OK, retry: 2 }], TARGET),
    (error) => /campo desconhecido "retry"/.test(error.message) && /alvo W1/.test(error.message),
  );
  assert.throws(() => validateResponses([{ method: "GET", path: "/v1/whatsapp" }], TARGET), /não tem "json"/);
  assert.throws(() => validateResponses({}, TARGET), /precisa ser uma lista/);
  assert.throws(() => validateResponses(["GET /v1/whatsapp"], TARGET), /precisa ser um objeto/);
});

test("responses aceita status de 400 a 599 e, ausente, não inventa um", () => {
  for (const status of [400, 503, 599]) {
    const [entry] = validateResponses([{ ...OK, status }], TARGET);
    assert.equal(entry.status, status);
  }
  const [plain] = validateResponses([OK], TARGET);
  assert.equal("status" in plain, false);
});

test("responses recusa status fora de 400 a 599 ou não inteiro, com erro que nomeia o alvo e o item", () => {
  for (const status of [200, 399, 600, "503", 503.5, null, NaN, undefined]) {
    assert.throws(
      () => validateResponses([OK, { ...OK, status }], TARGET),
      (error) => /alvo W1/.test(error.message) && /responses\[1\]\.status/.test(error.message),
      `status ${String(status)} deveria ser recusado`,
    );
  }
});

test("responses recusa status com método que não é GET", () => {
  assert.throws(
    () => validateResponses([{ ...OK, method: "POST", status: 503 }], TARGET),
    (error) => /alvo W1/.test(error.message) && /responses\[0\]\.method/.test(error.message),
  );
});

// Resposta retida (Goal148): o pedido fica pendente até o fim da captura.
const HELD_TARGET = {
  code: "CL9",
  file: "Clientes.dc.html",
  steps: [{ waitFor: "Carregando clientes" }],
};
const HELD = { method: "GET", path: "/v1/customers", hold: true };

test("responses aceita { method: GET, path, hold: true } em alvo com passo waitFor, sem json nem status", () => {
  const [entry] = validateResponses([HELD], HELD_TARGET);
  assert.deepEqual(entry, HELD);
  assert.equal("json" in entry, false);
  assert.equal("status" in entry, false);
  assert.deepEqual(validateResponses([OK, HELD], HELD_TARGET), [OK, HELD]);
});

test("responses recusa hold que não seja true, com erro que nomeia o alvo e o item", () => {
  for (const hold of [false, "true", 1, null, undefined, {}, []]) {
    assert.throws(
      () => validateResponses([OK, { ...HELD, hold }], HELD_TARGET),
      (error) => /alvo CL9/.test(error.message) && /responses\[1\]\.hold/.test(error.message),
      `hold ${String(hold)} deveria ser recusado`,
    );
  }
});

test("responses recusa hold com json ou com status, com erro que nomeia o alvo e o item", () => {
  for (const extra of [{ json: {} }, { json: { data: [] } }, { status: 503 }, { json: {}, status: 503 }]) {
    assert.throws(
      () => validateResponses([{ ...HELD, ...extra }], HELD_TARGET),
      (error) => /alvo CL9/.test(error.message) && /responses\[0\]/.test(error.message) && /"hold" e "(json|status)"/.test(error.message),
      `hold com ${Object.keys(extra).join("+")} deveria ser recusado`,
    );
  }
});

test("responses recusa hold com método que não é GET, também em alvo público", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "get", undefined]) {
    assert.throws(
      () => validateResponses([{ ...HELD, method }], HELD_TARGET),
      (error) => /alvo CL9/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /"hold"/.test(error.message),
      `hold com método ${String(method)} deveria ser recusado`,
    );
  }
  assert.throws(
    () => validateResponses([{ method: "POST", path: "/v1/auth/login", hold: true }], { ...HELD_TARGET, session: false }),
    (error) => /alvo CL9/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /"hold"/.test(error.message),
  );
});

test("responses recusa entrada sem json e sem hold, e mantém as regras de caminho e de campo na entrada retida", () => {
  assert.throws(() => validateResponses([{ method: "GET", path: "/v1/customers" }], HELD_TARGET), /alvo CL9.*responses\[0\] não tem "json"/);
  assert.throws(() => validateResponses([{ ...HELD, path: "/v1/customers?x=1" }], HELD_TARGET), /responses\[0\]\.path/);
  assert.throws(() => validateResponses([{ ...HELD, path: "/customers" }], HELD_TARGET), /responses\[0\]\.path/);
  assert.throws(() => validateResponses([{ ...HELD, retry: 1 }], HELD_TARGET), /campo desconhecido "retry"/);
});

test("responses recusa o alvo com entrada retida e sem passo waitFor obrigatório", () => {
  const refused = (target) => assert.throws(
    () => validateResponses([OK, HELD], target),
    (error) => /alvo CL9/.test(error.message) && /responses\[1\]/.test(error.message) && /waitFor/.test(error.message),
  );
  refused({ code: "CL9", file: "Clientes.dc.html" });
  refused({ code: "CL9", file: "Clientes.dc.html", steps: [] });
  refused({ code: "CL9", file: "Clientes.dc.html", steps: [{ wait: 500 }, { click: "Carregando clientes" }] });
  refused({ code: "CL9", file: "Clientes.dc.html", steps: [{ waitFor: "Carregando clientes", optional: true }] });
  refused({ code: "CL9", file: "Clientes.dc.html", steps: [{ waitFor: "" }] });
  assert.throws(() => validateTargetResponses([{ code: "CL9", file: "Clientes.dc.html", responses: [HELD] }]), /alvo CL9.*waitFor/);
  assert.equal(validateResponses([HELD], { ...HELD_TARGET, steps: [{ click: "Mais" }, { waitFor: "Carregando clientes" }] }).length, 1);
  // Sem entrada retida, o alvo não precisa de passo algum.
  assert.equal(validateResponses([OK], TARGET).length, 1);
});

test("isHeldRequest casa a entrada retida pelo método e pelo caminho exato, sem a query, e não casa entrada com json", () => {
  const target = { ...HELD_TARGET, responses: validateResponses([OK, HELD], HELD_TARGET) };
  assert.equal(isHeldRequest(target, "GET", "/v1/customers"), true);
  assert.equal(isHeldRequest(target, "GET", bffPathname("http://localhost:3100/api/bff/v1/customers?search=ana")), true);
  for (const other of ["/v1/customers/", "/v1/customers/abc", "/v1/customer", "/V1/customers", "/v1/status"]) {
    assert.equal(isHeldRequest(target, "GET", other), false, `${other} não deveria casar`);
  }
  for (const method of ["POST", "PATCH", "DELETE", "get"]) {
    assert.equal(isHeldRequest(target, method, "/v1/customers"), false, `${method} não deveria casar`);
  }
  assert.equal(isHeldRequest(target, "GET", "/v1/whatsapp"), false, "entrada com json não é retida");
  assert.equal(isHeldRequest(target, "GET", null), false);
  assert.equal(isHeldRequest(target, "GET", undefined), false);
  assert.equal(isHeldRequest({ ...HELD_TARGET }, "GET", "/v1/customers"), false);
  assert.equal(isHeldRequest({ ...HELD_TARGET, responses: [] }, "GET", "/v1/customers"), false);
});

test("hasHeldResponse só vale para o alvo com ao menos uma entrada retida; pickFixedResponse nunca serve a retida", () => {
  const held = { ...HELD_TARGET, responses: validateResponses([OK, HELD], HELD_TARGET) };
  assert.equal(hasHeldResponse(held), true);
  assert.equal(hasHeldResponse({ ...TARGET, responses: validateResponses([OK], TARGET) }), false);
  assert.equal(hasHeldResponse({ ...TARGET, responses: [] }), false);
  assert.equal(hasHeldResponse(TARGET), false);
  assert.equal(hasHeldResponse(undefined), false);
  assert.equal(pickFixedResponse(held, "GET", "/v1/customers"), null);
  assert.equal(pickFixedResponse(held, "GET", "/v1/whatsapp"), held.responses[0]);
});

function fakePage() {
  const page = new EventEmitter();
  page.on = page.addListener.bind(page);
  return page;
}

function fakeRequest(method, url) {
  return { method: () => method, url: () => url };
}

const BASE = "http://localhost:3100/api/bff";

test("trackNetworkIdle: o pedido retido fica pendente e não segura a espera da rede", async () => {
  const target = { ...HELD_TARGET, responses: validateResponses([OK, HELD], HELD_TARGET) };
  const page = fakePage();
  const network = trackNetworkIdle(page, target, { quietMs: 40, timeoutMs: 1000, pollMs: 5 });
  page.emit("request", fakeRequest("GET", `${BASE}/v1/customers?limit=50`));
  const started = Date.now();
  await network.idle();
  assert.ok(Date.now() - started >= 35, "a espera respeita o tempo sem pedido pendente");
  // O pedido retido nunca termina (sem finished nem failed): a espera segue válida.
  await network.idle();
});

test("trackNetworkIdle: pedido não retido em andamento segura a espera até terminar, e o silêncio conta a partir daí", async () => {
  const target = { ...HELD_TARGET, responses: validateResponses([HELD], HELD_TARGET) };
  const page = fakePage();
  const network = trackNetworkIdle(page, target, { quietMs: 40, timeoutMs: 1000, pollMs: 5 });
  const status = fakeRequest("GET", `${BASE}/v1/status`);
  page.emit("request", fakeRequest("GET", `${BASE}/v1/customers`));
  page.emit("request", status);
  let done = false;
  const waiting = network.idle().then(() => { done = true; });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(done, false, "o GET /v1/status segue em andamento");
  const finishedAt = Date.now();
  page.emit("requestfinished", status);
  await waiting;
  assert.ok(Date.now() - finishedAt >= 35, "o silêncio conta a partir do fim do último pedido");
});

test("trackNetworkIdle: outro método no mesmo caminho não é retido; pedido que falha libera a espera", async () => {
  const target = { ...HELD_TARGET, responses: validateResponses([HELD], HELD_TARGET) };
  const page = fakePage();
  const network = trackNetworkIdle(page, target, { quietMs: 20, timeoutMs: 400, pollMs: 5 });
  const post = fakeRequest("POST", `${BASE}/v1/customers`);
  page.emit("request", post);
  await assert.rejects(() => network.idle(), /alvo CL9 \(Clientes\.dc\.html\).*POST .*\/v1\/customers/);
  page.emit("requestfailed", post);
  await network.idle();
});

test("trackNetworkIdle: sem a rede ociosa no prazo, o erro nomeia o alvo e os pedidos abertos", async () => {
  const target = { ...HELD_TARGET, responses: validateResponses([HELD], HELD_TARGET) };
  const page = fakePage();
  const network = trackNetworkIdle(page, target, { quietMs: 20, timeoutMs: 80, pollMs: 5 });
  page.emit("request", fakeRequest("GET", `${BASE}/v1/status`));
  await assert.rejects(
    () => network.idle(),
    (error) => /alvo CL9 \(Clientes\.dc\.html\)/.test(error.message) && /80 ms/.test(error.message) && /1 pedido\(s\) em andamento: GET .*\/v1\/status/.test(error.message),
  );
});

const PUBLIC_TARGET = { code: "L2", file: "Login-Erro.dc.html", session: false };
const LOGIN_POST = { method: "POST", path: "/v1/auth/login", json: { error: { code: "INVALID_CREDENTIALS" } }, status: 401 };

test("responses aceita POST sob /v1/auth/ só em alvo público (session:false)", () => {
  const [entry] = validateResponses([LOGIN_POST], PUBLIC_TARGET);
  assert.deepEqual(entry, LOGIN_POST);
  const { status: _status, ...withoutStatus } = LOGIN_POST;
  const [noStatus] = validateResponses([withoutStatus], PUBLIC_TARGET);
  assert.equal("status" in noStatus, false);
  assert.equal(validateResponses([{ ...OK, path: "/v1/auth/session" }, LOGIN_POST], PUBLIC_TARGET).length, 2);
});

test("responses recusa POST em alvo com sessão, mesmo sob /v1/auth/, com a mensagem de só GET", () => {
  for (const session of [undefined, true]) {
    assert.throws(
      () => validateResponses([LOGIN_POST], { ...TARGET, session }),
      (error) => /alvo W1/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /só "GET"/.test(error.message),
    );
  }
});

test("responses recusa POST de alvo público fora de /v1/auth/, nomeando o alvo e o motivo", () => {
  for (const bad of ["/v1/customers", "/v1/authx/login", "/v1/auth", "/auth/login", "/api/bff/v1/auth/login", undefined]) {
    assert.throws(
      () => validateResponses([{ ...LOGIN_POST, path: bad }], PUBLIC_TARGET),
      (error) => /alvo L2/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /\/v1\/auth\//.test(error.message) && !/só "GET"/.test(error.message),
      `POST ${String(bad)} deveria ser recusado`,
    );
  }
});

test("responses recusa PUT, PATCH e DELETE também em alvo público", () => {
  for (const method of ["PUT", "PATCH", "DELETE", "post", undefined]) {
    assert.throws(
      () => validateResponses([{ ...LOGIN_POST, method }], PUBLIC_TARGET),
      (error) => /alvo L2/.test(error.message) && /responses\[0\]\.method/.test(error.message) && /só "GET"/.test(error.message),
      `método ${String(method)} deveria ser recusado`,
    );
  }
});

test("POST em alvo público ainda passa pelas demais regras (json, status, campo)", () => {
  assert.throws(() => validateResponses([{ method: "POST", path: "/v1/auth/login" }], PUBLIC_TARGET), /não tem "json"/);
  assert.throws(() => validateResponses([{ ...LOGIN_POST, status: 200 }], PUBLIC_TARGET), /responses\[0\]\.status/);
  assert.throws(() => validateResponses([{ ...LOGIN_POST, retry: 1 }], PUBLIC_TARGET), /campo desconhecido "retry"/);
});

test("pickFixedResponse serve o POST declarado só ao POST, e o GET só ao GET", () => {
  const post = { ...LOGIN_POST, json: { error: { code: "X" } } };
  const get = { method: "GET", path: "/v1/auth/login", json: { data: {} } };
  const only = { ...PUBLIC_TARGET, responses: validateResponses([post], PUBLIC_TARGET) };
  assert.equal(pickFixedResponse(only, "POST", "/v1/auth/login"), only.responses[0]);
  assert.equal(pickFixedResponse(only, "GET", "/v1/auth/login"), null);
  assert.equal(pickFixedResponse(only, "POST", "/v1/auth/logout"), null);
  const both = { ...PUBLIC_TARGET, responses: validateResponses([get, post], PUBLIC_TARGET) };
  assert.equal(pickFixedResponse(both, "GET", "/v1/auth/login").json.data !== undefined, true);
  assert.equal(pickFixedResponse(both, "POST", "/v1/auth/login").status, 401);
});

test("pickFixedResponse devolve o item com o status declarado", () => {
  const target = { ...TARGET, responses: validateResponses([{ ...OK, status: 503 }], TARGET) };
  assert.equal(pickFixedResponse(target, "GET", "/v1/whatsapp").status, 503);
});

test("validateTargetResponses recusa o arquivo inteiro por um item ruim e deixa passar alvo sem responses", () => {
  const plain = { code: "A1", file: "Agenda.dc.html" };
  assert.deepEqual(validateTargetResponses([plain]), [plain]);
  assert.equal(plain.responses, undefined);
  assert.throws(() => validateTargetResponses([plain, { ...TARGET, responses: [{ ...OK, method: "POST" }] }]), /alvo W1/);
});

test("o alvo sem responses não recebe resposta fixa", () => {
  const plain = { code: "M1", file: "Mais-Negocio-Agenda-IA.dc.html" };
  assert.equal(pickFixedResponse(plain, "GET", "/v1/whatsapp"), null);
  assert.equal(pickFixedResponse({ ...plain, responses: [] }, "GET", "/v1/whatsapp"), null);
});

test("a resposta só vale para o método e o caminho exatos", () => {
  const target = { ...TARGET, responses: validateResponses([OK], TARGET) };
  assert.equal(pickFixedResponse(target, "GET", "/v1/whatsapp"), target.responses[0]);
  for (const other of ["/v1/whatsapp/qr", "/v1/whatsapp/", "/v1/whatsappx", "/v1/status", "/v1", "/V1/whatsapp"]) {
    assert.equal(pickFixedResponse(target, "GET", other), null, `${other} não deveria casar`);
  }
  for (const method of ["POST", "DELETE", "PUT"]) {
    assert.equal(pickFixedResponse(target, method, "/v1/whatsapp"), null, `${method} não deveria casar`);
  }
  assert.equal(pickFixedResponse(target, "GET", null), null);
});

test("bffPathname tira /api/bff e ignora a query; fora do proxy devolve null", () => {
  assert.equal(bffPathname("http://localhost:3100/api/bff/v1/whatsapp"), "/v1/whatsapp");
  assert.equal(bffPathname("http://localhost:3100/api/bff/v1/whatsapp?refresh=1"), "/v1/whatsapp");
  assert.equal(bffPathname("http://localhost:3100/api/bff/v1/whatsapp/qr"), "/v1/whatsapp/qr");
  assert.equal(bffPathname("http://localhost:3100/configuracoes/whatsapp"), null);
  assert.equal(bffPathname("http://localhost:3100/api/bffx/v1/whatsapp"), null);
});

function declaringTargets() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json");
  const targets = validateTargetResponses(JSON.parse(readFileSync(file, "utf8")).targets);
  return targets.filter((target) => target.responses !== undefined);
}

test("resolveRelativeDays troca {today}, {today-N} e {today+N} pelo dia semeado e deixa o resto igual", () => {
  const json = { data: [{ at: "{today}T13:42:00-03:00", before: "{today-1}T19:20:00-03:00", month: "{today-5}T08:00:00-03:00" }], n: 3, flag: null };
  assert.deepEqual(resolveRelativeDays(json, "2026-10-04"), {
    data: [{ at: "2026-10-04T13:42:00-03:00", before: "2026-10-03T19:20:00-03:00", month: "2026-09-29T08:00:00-03:00" }],
    n: 3,
    flag: null,
  });
  assert.equal(resolveRelativeDays("{today-4}", "2026-03-02"), "2026-02-26");
  assert.equal(resolveRelativeDays("{today+3}", "2026-02-27"), "2026-03-02");
  assert.equal(resolveRelativeDays("{today+0}", "2026-10-04"), "2026-10-04");
  assert.deepEqual(resolveRelativeDays({ at: "{today+2}T15:30:00-03:00", back: "{today-2}", now: "{today}" }, "2026-10-04"), { at: "2026-10-06T15:30:00-03:00", back: "2026-10-02", now: "2026-10-04" });
  for (const malformed of ["{today+}", "{today+x}", "{today+-1}", "{today*2}", "{today++1}", "{Today+1}"]) {
    assert.equal(resolveRelativeDays(malformed, "2026-10-04"), malformed, `${malformed} não é token e fica como veio`);
  }
  assert.deepEqual(resolveRelativeDays({ a: "2026-09-18T13:42:00.000Z" }, undefined), { a: "2026-09-18T13:42:00.000Z" });
  assert.throws(() => resolveRelativeDays({ a: "{today}" }, undefined), /não informou o dia/);
  assert.equal(json.data[0].at, "{today}T13:42:00-03:00");
});

test("targets.json: só W1 a W3, R2, I1, AG2, NT2, 2.6, 2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9, 2.I10, 4.4, 4.5, 4.7 a 4.9, A2, A12, C1 a C4, CL1, CL2, CL3, CL8, CL9, CL10, K1 a K6, H1 a H5 e H7, L2 e L7, S2, S7 e S9 declaram responses", () => {
  const declaring = declaringTargets();
  assert.deepEqual(declaring.map((target) => target.code).sort(), ["2.6", "2.I10", "2.I3", "2.I4", "2.I5", "2.I6", "2.I7", "2.I8", "2.I9", "4.4", "4.5", "4.7", "4.8", "4.9", "A12", "A2", "AG2", "C1", "C2", "C3", "C4", "CL1", "CL10", "CL2", "CL3", "CL8", "CL9", "H1", "H2", "H3", "H4", "H5", "H7", "I1", "K1", "K2", "K3", "K4", "K5", "K6", "L2", "L7", "NT2", "R2", "S2", "S7", "S9", "W1", "W2", "W3"]);
  for (const target of declaring) {
    const owner = ["2.I3", "2.I4", "2.I5", "2.I6", "2.I7", "2.I8", "2.I9", "2.I10"].includes(target.code)
      ? "Onboarding-2-Importacao.dc.html"
      : ["W1", "W2", "W3", "R2", "I1"].includes(target.code)
      ? "Mais-WhatsApp-Importacao-Conta.dc.html"
      : target.code === "AG2"
        ? "Mais-Negocio-Agenda-IA.dc.html"
        : target.code === "NT2"
          ? "Notificacoes.dc.html"
          : target.code === "2.6"
            ? "Onboarding-1-Negocio-e-Agenda.dc.html"
            : ["4.4", "4.5", "4.7", "4.8", "4.9"].includes(target.code)
              ? "Onboarding-3-IA-e-WhatsApp.dc.html"
              : ["L2", "L7"].includes(target.code)
                ? "Login.dc.html"
                : target.code.startsWith("H")
                  ? "Home.dc.html"
                  : target.code.startsWith("A")
                    ? "Agenda.dc.html"
                    : target.code.startsWith("CL")
                      ? "Clientes.dc.html"
                      : target.code.startsWith("S")
                        ? "Servicos.dc.html"
                        : "Conversas-e-Chat.dc.html";
    assert.equal(target.file, owner, `${target.code} declara responses no arquivo errado`);
    const postOwners = ["L2", "L7"];
    for (const entry of target.responses) {
      assert.equal(entry.method, postOwners.includes(target.code) ? "POST" : "GET");
      if (entry.hold === true) continue;
      assert.equal(typeof entry.json.requestId, "string");
    }
  }
});

test("targets.json: o 2.I7 só declara os dois GET, com o caminho exato do andamento, e não tem passo", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  const t27 = owners.find((target) => target.code === "2.I7");
  assert.equal(t27.label, "Importando");
  assert.equal(t27.route, "/onboarding/importacao");
  assert.equal(t27.account, "onboarding");
  assert.equal(t27.steps, undefined, "2.I7: nenhum passo, nada toca em controle que grava");
  const sessionId = "visual-compare-import-executing";
  assert.deepEqual(
    t27.responses.map((entry) => `${entry.method} ${entry.path}`),
    ["GET /v1/calendar/imports", `GET /v1/calendar/imports/${sessionId}/progress`],
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/calendar/imports", `/v1/calendar/imports/${sessionId}/progress`, `/v1/calendar/imports/${sessionId}/execute`]) {
      assert.equal(pickFixedResponse(t27, method, route), null, `2.I7: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of [`/v1/calendar/imports/${sessionId}/preview`, "/v1/calendar/imports/visual-compare-import-ready/progress", "/v1/status", "/v1/onboarding"]) {
    assert.equal(pickFixedResponse(t27, "GET", other), null, `2.I7: ${other} não é do alvo`);
  }
  for (const owner of owners.filter((target) => target.code !== "2.I7")) {
    assert.ok(!JSON.stringify(owner.responses).includes(sessionId), `${owner.code} não usa a sessão do 2.I7`);
  }
});

test("targets.json: 2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de responses em Onboarding-2-Importacao.dc.html; o 2.I10 só declara o GET de /v1/calendar/imports, com a sessão própria, e não tem passo", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  assert.deepEqual(owners.map((target) => target.code), ["2.I3", "2.I4", "2.I5", "2.I6", "2.I7", "2.I8", "2.I9", "2.I10"]);
  const t210 = owners.find((target) => target.code === "2.I10");
  assert.equal(t210.label, "Importação concluída");
  assert.equal(t210.route, "/onboarding/importacao");
  assert.equal(t210.account, "onboarding");
  assert.equal(t210.steps, undefined, "2.I10: nenhum passo, nada toca em Continuar");
  assert.deepEqual(
    t210.responses.map((entry) => `${entry.method} ${entry.path}`),
    ["GET /v1/calendar/imports"],
  );
  assert.equal(typeof t210.responses[0].json.requestId, "string");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(pickFixedResponse(t210, method, "/v1/calendar/imports"), null, `2.I10: ${method} /v1/calendar/imports não deveria casar`);
  }
  for (const other of ["/v1/onboarding", "/v1/calendar/imports/visual-compare-import-done/progress", "/v1/calendar/imports/visual-compare-import-done/preview", "/v1/status"]) {
    assert.equal(pickFixedResponse(t210, "GET", other), null, `2.I10: ${other} vem da conta de onboarding`);
  }
  const sessionId = "visual-compare-import-done";
  for (const owner of owners.filter((target) => target.code !== "2.I10")) {
    assert.ok(!JSON.stringify(owner.responses).includes(sessionId), `${owner.code} não usa a sessão do 2.I10`);
  }
});

test("targets.json: 2.I8 e 2.I9 só declaram os quatro GET da sessão pendente; o 2.I8 não tem passo e o 2.I9 só clica em \"Concluir importação\"", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  const [t28, t29] = ["2.I8", "2.I9"].map((code) => owners.find((target) => target.code === code));
  const sessionId = "visual-compare-import-pending";
  const expected = [
    "GET /v1/calendar/imports",
    `GET /v1/calendar/imports/${sessionId}/progress`,
    `GET /v1/calendar/imports/${sessionId}/categories/SERVICE/items`,
    `GET /v1/calendar/imports/${sessionId}/categories/CUSTOMER/items`,
  ];
  assert.equal(t28.label, "Pendências da importação");
  assert.equal(t29.label, "Confirmar conclusão");
  for (const target of [t28, t29]) {
    assert.equal(target.route, "/onboarding/importacao");
    assert.equal(target.account, "onboarding");
    assert.deepEqual(target.responses.map((entry) => `${entry.method} ${entry.path}`), expected, `${target.code}: só os quatro GET`);
    for (const entry of target.responses) assert.equal(typeof entry.json.requestId, "string");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const route of [`/v1/calendar/imports/${sessionId}/execute`, `/v1/calendar/imports/${sessionId}/complete`, "/v1/calendar/imports", `/v1/calendar/imports/${sessionId}/progress`]) {
        assert.equal(pickFixedResponse(target, method, route), null, `${target.code}: ${method} ${route} não deveria casar`);
      }
    }
    for (const other of [`/v1/calendar/imports/${sessionId}/preview`, `/v1/calendar/imports/${sessionId}/categories/AVAILABILITY/items`, "/v1/onboarding", "/v1/status"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${target.code}: ${other} não é do alvo`);
    }
  }
  assert.equal(t28.steps, undefined, "2.I8: nenhum passo, a tela abre parada e nada nela é tocado");
  assert.deepEqual(t29.steps, [{ clickRole: { role: "button", name: "Concluir importação" } }], "2.I9: só o clique em Concluir importação do rodapé");
  assert.deepEqual(t29.responses, t28.responses, "2.I8 e 2.I9 têm as mesmas respostas");
  for (const owner of owners.filter((target) => !["2.I8", "2.I9"].includes(target.code))) {
    assert.ok(!JSON.stringify(owner.responses).includes(sessionId), `${owner.code} não usa a sessão do 2.I8 e do 2.I9`);
  }
});

test("targets.json: o 2.I6 só declara os quatro GET da sessão de conflitos e só clica em \"Revisar conflitos\"", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  const t26 = owners.find((target) => target.code === "2.I6");
  assert.ok(t26, "2.I6 precisa declarar responses");
  const sessionId = "visual-compare-import-conflicts";
  assert.equal(t26.label, "Conflitos da importação");
  assert.equal(t26.route, "/onboarding/importacao");
  assert.equal(t26.account, "onboarding");
  assert.deepEqual(
    t26.responses.map((entry) => `${entry.method} ${entry.path}`),
    [
      "GET /v1/calendar/imports",
      `GET /v1/calendar/imports/${sessionId}/preview`,
      `GET /v1/calendar/imports/${sessionId}/categories/SERVICE/items`,
      `GET /v1/calendar/imports/${sessionId}/categories/CUSTOMER/items`,
    ],
    "2.I6: só os quatro GET",
  );
  for (const entry of t26.responses) assert.equal(typeof entry.json.requestId, "string");
  assert.deepEqual(t26.steps, [{ clickRole: { role: "button", name: "Revisar conflitos" } }], "2.I6: só o clique em Revisar conflitos");
  assert.ok(!t26.notes.includes("ReplaceAccountZone"), "2.I6: a ReplaceAccountZone não aparece no modo de conflitos, então as notes não a declaram");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/calendar/imports", `/v1/calendar/imports/${sessionId}/preview`, `/v1/calendar/imports/${sessionId}/items/1/decision`, `/v1/calendar/imports/${sessionId}/complete`]) {
      assert.equal(pickFixedResponse(t26, method, route), null, `2.I6: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of [`/v1/calendar/imports/${sessionId}/progress`, `/v1/calendar/imports/${sessionId}/categories/AVAILABILITY/items`, "/v1/onboarding", "/v1/status"]) {
    assert.equal(pickFixedResponse(t26, "GET", other), null, `2.I6: ${other} não é do alvo`);
  }
  for (const owner of owners.filter((target) => target.code !== "2.I6")) {
    assert.ok(!JSON.stringify(owner.responses).includes(sessionId), `${owner.code} não usa a sessão do 2.I6`);
  }
  const origem = JSON.stringify(JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets.filter((target) => target.code === "I1").map((target) => target.responses));
  assert.ok(!origem.includes(sessionId), "I1 não usa a sessão do 2.I6");
});

test("targets.json: L2 e L7 são os donos de responses em Login.dc.html, com o POST do próprio caminho", () => {
  const declaring = declaringTargets().filter((target) => target.file === "Login.dc.html");
  assert.deepEqual(declaring.map((target) => target.code).sort(), ["L2", "L7"]);
  const [l2, l7] = ["L2", "L7"].map((code) => declaring.find((target) => target.code === code));
  for (const target of [l2, l7]) {
    assert.equal(target.session, false, `${target.code} é tela pública`);
    assert.equal(target.responses.length, 1);
    assert.ok(target.steps.every((step) => step.optional !== true), `${target.code}: sem o estado a captura tem de falhar`);
  }
  assert.deepEqual(
    { method: l2.responses[0].method, path: l2.responses[0].path, status: l2.responses[0].status },
    { method: "POST", path: "/v1/auth/login", status: 401 },
  );
  assert.deepEqual(Object.keys(l2.responses[0].json).sort(), ["error", "requestId"]);
  assert.equal(l2.responses[0].json.error.code, "UNAUTHORIZED");
  assert.deepEqual(
    { method: l7.responses[0].method, path: l7.responses[0].path, status: l7.responses[0].status },
    { method: "POST", path: "/v1/auth/reset-password", status: undefined },
  );
  assert.deepEqual(l7.responses[0].json.data, { ok: true });
  assert.equal(typeof l7.responses[0].json.requestId, "string");
  assert.equal(pickFixedResponse(l2, "POST", "/v1/auth/login"), l2.responses[0]);
  assert.equal(pickFixedResponse(l2, "GET", "/v1/auth/login"), null);
  assert.equal(pickFixedResponse(l7, "POST", "/v1/auth/reset-password"), l7.responses[0]);
  assert.equal(pickFixedResponse(l7, "POST", "/v1/auth/login"), null);
});

test("targets.json: L2 preenche e-mail e senha, envia com Enter e espera o erro; L6 e L7 usam o mesmo token fixo", () => {
  const all = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets;
  const byCode = (code) => all.find((target) => target.code === code && target.file === "Login.dc.html");
  const [l2, l6, l7] = ["L2", "L6", "L7"].map(byCode);
  assert.equal(l2.route, "/login");
  assert.deepEqual(l2.steps.map((step) => step.fill?.label ?? step.press ?? step.waitFor), ["E-mail", "Senha", "Enter", "E-mail ou senha não conferem"]);
  assert.equal(l2.steps[1].fill.value.length, 8);
  assert.equal(l6.responses, undefined);
  assert.equal(l6.route, l7.route);
  assert.match(l6.route, /^\/nova-senha\?token=[\w-]+$/);
  assert.deepEqual(l6.steps.map((step) => step.fill.label), ["Nova senha"]);
  assert.deepEqual(l7.steps.map((step) => step.fill?.label ?? step.press ?? step.waitFor), ["Nova senha", "Enter", "Senha redefinida"]);
  for (const target of [l2, l6, l7]) assert.match(target.notes, /[Dd]ivergência declarada/);
});

test("targets.json: W1 declara o GET do WhatsApp e o da lista dos ignorados, e I1 só o seu GET", () => {
  const [w1, i1] = ["W1", "I1"].map((code) => declaringTargets().find((target) => target.code === code));
  assert.deepEqual(w1.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/whatsapp", "GET /v1/conversations/ignored-contacts"]);
  assert.equal(i1.responses.length, 1);
  const [whatsapp] = w1.responses;
  assert.equal(whatsapp.path, "/v1/whatsapp");
  assert.equal(whatsapp.json.data.status, "CONNECTED");
  assert.equal(whatsapp.json.data.phoneNumber, "5511987654321");
  assert.equal(whatsapp.json.data.connectedAt, "2026-09-18T15:00:00.000Z");
  assert.equal(typeof whatsapp.json.data.id, "string");
  assert.equal(typeof whatsapp.json.data.updatedAt, "string");

  const [imports] = i1.responses;
  assert.equal(imports.path, "/v1/calendar/imports");
  const { right, session, history } = imports.json.data;
  assert.equal(session, null);
  assert.equal(right.available, false);
  assert.equal(right.completedAt, "2026-09-18T13:42:00.000Z");
  assert.equal(history.status, "COMPLETED");
  assert.equal(history.completedAt, "2026-09-18T13:42:00.000Z");
  const imported = Object.fromEntries(history.categories.map((category) => [category.category, category.imported]));
  assert.equal(imported.SERVICE, 12);
  assert.equal(imported.CUSTOMER, 386);
  assert.equal(imported.FUTURE_APPOINTMENT, 42);
  assert.equal(imported.PAST_APPOINTMENT, 1400);
  assert.ok(imported.AVAILABILITY > 0);
  assert.equal(history.pendingAcceptance.pendingCount, 3);
});

function settingsSheetTarget(code) {
  const target = declaringTargets().find((candidate) => candidate.code === code && candidate.file === "Mais-WhatsApp-Importacao-Conta.dc.html");
  assert.ok(target, `alvo Mais-WhatsApp:${code} sem responses`);
  return target;
}

test("targets.json: W2 e R2 declaram só GET e abrem a folha por passos obrigatórios", () => {
  const w2 = settingsSheetTarget("W2");
  const r2 = settingsSheetTarget("R2");
  assert.equal(w2.route, "/configuracoes/whatsapp");
  assert.deepEqual(w2.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/whatsapp", "GET /v1/conversations/ignored-contacts"]);
  assert.deepEqual(w2.responses[0], settingsSheetTarget("W1").responses[0]);
  assert.equal(r2.route, "/configuracoes/conversas");
  assert.deepEqual(r2.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/settings/retention"]);
  const retention = r2.responses[0].json.data;
  assert.equal(retention.commercialRetentionDays, 90);
  assert.equal(retention.personalRetentionDays, 30);
  assert.equal(retention.unclassifiedRetentionFollows, "COMMERCIAL");
  assert.deepEqual(retention.retentionDaysOptions, [30, 90, 180, 365]);
  for (const target of [w2, r2]) {
    assert.ok(target.steps.length > 0, `${target.code}: sem passos a folha não abre`);
    assert.ok(target.steps.every((step) => step.optional !== true), `${target.code}: sem a folha a captura tem de falhar`);
    assert.match(target.notes, /[Dd]ivergência declarada/);
  }
  assert.equal(w2.steps[0].clickRole.name, "Desconectar WhatsApp");
  assert.deepEqual(r2.steps.map((step) => step.clickRole?.name ?? step.click), ["30 dias", "Salvar", "Guardar conversas comerciais por 30 dias?"]);
});

test("targets.json: W3 só declara o GET da lista dos ignorados, não tem passo e a lista do W1 e do W2 são os dois primeiros itens dele", () => {
  const w3 = settingsSheetTarget("W3");
  assert.equal(w3.label, "WhatsApp · contatos ignorados");
  assert.equal(w3.route, "/configuracoes/whatsapp/contatos-ignorados");
  assert.equal(w3.steps, undefined, "W3: nenhum passo, nada toca em Remover, Ignorar nem Adicionar");
  assert.deepEqual(w3.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/conversations/ignored-contacts"]);
  const [list] = w3.responses;
  assert.equal(list.json.data.total, list.json.data.items.length);
  assert.deepEqual(list.json.data.items.map((item) => item.displayName), ["Mãe", "Dudu ❤️", "Renata"]);
  for (const code of ["W1", "W2"]) {
    const owner = settingsSheetTarget(code);
    const fixed = owner.responses.find((entry) => entry.path === "/v1/conversations/ignored-contacts");
    assert.deepEqual(fixed.json.data.items, list.json.data.items.slice(0, 2), `${code}: os dois primeiros do W3`);
    assert.equal(fixed.json.data.total, 2);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(pickFixedResponse(w3, method, "/v1/conversations/ignored-contacts"), null, `W3: ${method} não deveria casar`);
  }
  assert.equal(pickFixedResponse(w3, "GET", "/v1/conversations"), null, "W3: a busca vazia não lê conversa");
  assert.equal(pickFixedResponse(w3, "GET", "/v1/whatsapp"), null, "W3: o estado do número vem da conta de teste");
  assert.match(w3.notes, /[Dd]ivergência declarada/);
});

test("targets.json: AG2 é o único dono de responses em Mais-Negocio-Agenda-IA.dc.html, com o GET dos lembretes e sem passos", () => {
  const owners = declaringTargets().filter((target) => target.file === "Mais-Negocio-Agenda-IA.dc.html");
  assert.deepEqual(owners.map((target) => target.code), ["AG2"]);
  const [ag2] = owners;
  assert.equal(ag2.route, "/configuracoes/agenda/lembretes");
  assert.equal(ag2.clock, "13:45");
  assert.equal(ag2.steps, undefined, "AG2: sem passos, nenhum toque pode gravar");
  assert.match(ag2.notes, /Nenhum passo toca "Salvar"/);
  assert.deepEqual(ag2.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/settings/reminders"]);
  assert.deepEqual(ag2.responses[0].json.data, {
    configured: true,
    confirmationEnabled: true,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1440 }],
  });
  assert.equal(pickFixedResponse(ag2, "GET", "/v1/settings/reminders"), ag2.responses[0]);
  for (const method of ["PATCH", "PUT", "POST"]) assert.equal(pickFixedResponse(ag2, method, "/v1/settings/reminders"), null);
  assert.equal(pickFixedResponse(ag2, "GET", "/v1/settings"), null, "o estilo e o fuso da prévia vêm da conta de teste");
});

test("targets.json: NT2 é o único dono de responses em Notificacoes.dc.html, só com os três GET, a lista vazia, o status ativo e os passos do sino", () => {
  const owners = declaringTargets().filter((target) => target.file === "Notificacoes.dc.html");
  assert.deepEqual(owners.map((target) => target.code), ["NT2"]);
  const [nt2] = owners;
  assert.equal(nt2.label, "Notificações · vazio");
  assert.equal(nt2.route, "/inicio");
  assert.equal(nt2.clock, "10:30");
  assert.deepEqual(
    nt2.responses.map((entry) => `${entry.method} ${entry.path}`).sort(),
    ["GET /v1/notifications", "GET /v1/notifications/summary", "GET /v1/status"],
  );
  for (const entry of nt2.responses) {
    assert.ok(!entry.path.includes("?"), `${entry.path} precisa ser caminho exato`);
    assert.equal(typeof entry.json.requestId, "string");
  }
  const bodies = new Map(nt2.responses.map((entry) => [entry.path, resolveRelativeDays(entry.json, "2026-10-05").data]));
  assert.deepEqual(bodies.get("/v1/notifications"), { total: 0, limit: 20, offset: 0, items: [] });
  assert.deepEqual(bodies.get("/v1/notifications/summary"), {
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
  const status = bodies.get("/v1/status");
  assert.equal(status.whatsapp.status, "CONNECTED");
  assert.equal(typeof status.whatsapp.phoneNumber, "string");
  assert.ok(!Number.isNaN(Date.parse(status.whatsapp.checkedAt)), "checkedAt precisa ser data válida");
  assert.equal(status.ai.state, "ACTIVE");
  assert.equal(status.ai.effectiveEnabled, true);
  assert.equal(status.degraded, false);
  assert.deepEqual(
    nt2.steps.map((step) => [step.clickRole.role, step.clickRole.name, step.optional]),
    [["button", "Notificações", true], ["link", "Notificações", true]],
    "NT2: só os passos sobre o sino, como o NT1",
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/notifications", "/v1/notifications/read", "/v1/notifications/preferences", "/v1/status"]) {
      assert.equal(pickFixedResponse(nt2, method, route), null, `NT2: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of ["/v1/notifications/preferences", "/v1/settings", "/v1/dashboard", "/v1/whatsapp"]) {
    assert.equal(pickFixedResponse(nt2, "GET", other), null, `NT2: ${other} vem da conta de teste`);
  }
});

test("targets.json: CL8 é o único alvo com responses em Clientes.dc.html além de CL1, CL2, CL3, CL9 e CL10, só declara GET e não tem passo", () => {
  const owners = declaringTargets().filter((target) => target.file === "Clientes.dc.html");
  assert.deepEqual(owners.map((target) => target.code).sort(), ["CL1", "CL10", "CL2", "CL3", "CL8", "CL9"]);
  const cl8 = owners.find((target) => target.code === "CL8");
  assert.equal(cl8.label, "Cliente · responsável");
  assert.equal(cl8.route, "/clientes/detalhes?id=visual-compare-cl8-pedro");
  assert.equal(cl8.steps, undefined, "CL8: nenhum passo, nada toca em Confirmar nem em Remover");
  assert.deepEqual(
    cl8.responses.map((entry) => `${entry.method} ${entry.path}`),
    [
      "GET /v1/status",
      "GET /v1/customers/visual-compare-cl8-pedro",
      "GET /v1/customers/visual-compare-cl8-pedro/memory",
      "GET /v1/conversations",
      "GET /v1/customers",
    ],
  );
  for (const entry of cl8.responses) {
    assert.equal(entry.method, "GET");
    assert.equal(entry.status, undefined);
    assert.equal(typeof entry.json.requestId, "string");
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/customers/visual-compare-cl8-pedro", "/v1/customers/visual-compare-cl8-pedro/primary-guardian", "/v1/customers/visual-compare-cl8-pedro/primary-guardian/confirm", "/v1/customers/visual-compare-cl8-pedro/memory", "/v1/customers"]) {
      assert.equal(pickFixedResponse(cl8, method, route), null, `CL8: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of ["/v1/customers/visual-compare-cl8-pedro/summary", "/v1/customers/visual-compare-cl8-pedro/primary-guardian", "/v1/settings", "/v1/calendar"]) {
    assert.equal(pickFixedResponse(cl8, "GET", other), null, `CL8: ${other} vem da conta de teste`);
  }
  assert.match(cl8.notes, /Goal144/);
  assert.match(cl8.notes, /Nenhum passo grava/);
});

test("targets.json: CL8 dá dependents Pedro Souza à Maria e guardian Maria Souza ao Pedro na lista, sem a divergência 5 nas notes", () => {
  const cl8 = declaringTargets().find((target) => target.file === "Clientes.dc.html" && target.code === "CL8");
  const items = cl8.responses.find((entry) => entry.path === "/v1/customers").json.data.items;
  const maria = items.find((item) => item.name === "Maria Souza");
  const pedro = items.find((item) => item.name === "Pedro Souza");
  assert.deepEqual(maria.dependents, [{ id: pedro.id, name: "Pedro Souza" }], "CL8: a Maria agenda para Pedro Souza");
  assert.equal(maria.guardian, undefined);
  assert.equal(pedro.phone, null);
  assert.deepEqual(pedro.guardian, { id: maria.id, name: "Maria Souza" });
  assert.equal(pedro.dependents, undefined);
  assert.doesNotMatch(cl8.notes, /a lista não traz de quem o cliente é responsável/);
  assert.doesNotMatch(cl8.notes, /\(Goal121\)/);
  assert.match(cl8.notes, /Goal150/);
});

test("targets.json: CL3 dá dependents Pedro Souza à Maria e guardian Maria ao Pedro; CL1 dá guardian Maria Souza ao Pedro sem telefone, só GET", () => {
  const owners = declaringTargets().filter((target) => target.file === "Clientes.dc.html");
  const list = (code) => {
    const target = owners.find((entry) => entry.code === code);
    for (const entry of target.responses) assert.equal(entry.method, "GET", `${code}: só GET`);
    return target.responses.find((entry) => entry.path === "/v1/customers").json.data.items;
  };
  const cl3 = list("CL3");
  const maria = cl3.find((item) => item.name === "Maria Souza");
  const pedro3 = cl3.find((item) => item.name === "Pedro Souza");
  assert.deepEqual(maria.dependents, [{ id: pedro3.id, name: "Pedro Souza" }], "CL3: a Maria agenda para Pedro Souza");
  assert.equal(pedro3.phone, null);
  assert.deepEqual(pedro3.guardian, { id: maria.id, name: "Maria Souza" });
  const cl1 = list("CL1");
  const pedro1 = cl1.find((item) => item.name === "Pedro Souza");
  assert.equal(pedro1.phone, null, "CL1: o Pedro não tem telefone");
  assert.equal(pedro1.guardian.name, "Maria Souza", "CL1: Maria Souza agenda por ele");
  assert.equal(cl1.length, 8);
  assert.equal(cl1[cl1.length - 1].name, null, "CL1: o cadastro sem nome fecha a lista");
});

test("targets.json: NT1 continua sem responses, com a lista da conta visual", () => {
  const nt1 = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets.find(
    (target) => target.code === "NT1" && target.file === "Notificacoes.dc.html",
  );
  assert.ok(nt1);
  assert.equal(nt1.responses, undefined);
});

test("targets.json: 4.4, 4.5, 4.7, 4.8 e 4.9 são os donos de responses em Onboarding-3-IA-e-WhatsApp.dc.html; 4.9 só com os dois GET, a execução SUCCEEDED, o status ativo e sem passos; o 4.10 não declara responses", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-3-IA-e-WhatsApp.dc.html");
  assert.deepEqual(owners.map((target) => target.code).sort(), ["4.4", "4.5", "4.7", "4.8", "4.9"]);
  const t49 = owners.find((target) => target.code === "4.9");
  assert.equal(t49.label, "IA ativa");
  assert.equal(t49.route, "/onboarding/teste-real-sucesso");
  assert.equal(t49.account, "onboarding");
  assert.equal(t49.steps, undefined, "4.9: nenhum passo, nada toca em Ir para o início");
  assert.deepEqual(
    t49.responses.map((entry) => `${entry.method} ${entry.path}`).sort(),
    ["GET /v1/activation-test", "GET /v1/status"],
  );
  const bodies = new Map(t49.responses.map((entry) => [entry.path, resolveRelativeDays(entry.json, "2026-10-06").data]));
  const run = bodies.get("/v1/activation-test");
  assert.equal(run.state, "SUCCEEDED");
  assert.equal(run.terminal, true);
  assert.equal(run.cleanupState, "CLEAN");
  assert.deepEqual(
    run.milestones.map((milestone) => [milestone.milestone, milestone.reached]),
    [["MESSAGE_SENT", true], ["SERVICE_IDENTIFIED", true], ["PRICE_INFORMED", true], ["AVAILABILITY_CHECKED", true], ["SLOT_SELECTED", true], ["APPOINTMENT_CONFIRMED", true]],
  );
  for (const field of ["id", "state", "terminal", "startedAt", "finishedAt", "pausedAt", "currentStep", "completedStep", "attempts", "maxAttempts", "failedStep", "failedStepLabel", "failureCode", "appointmentId", "channelId", "supersededByChannelChange", "cleanupState", "cleanupAt", "cleanupResidue", "milestones"]) {
    assert.ok(field in run, `4.9: a execução precisa trazer ${field}`);
  }
  assert.ok(!Number.isNaN(Date.parse(run.startedAt)) && !Number.isNaN(Date.parse(run.finishedAt)));
  const status = bodies.get("/v1/status");
  assert.equal(status.whatsapp.status, "CONNECTED");
  assert.equal(status.whatsapp.phoneNumber, "5511987654321");
  assert.equal(status.ai.state, "ACTIVE");
  assert.equal(status.ai.effectiveEnabled, true);
  assert.equal(status.degraded, false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/activation-test", "/v1/activation-test/restart", "/v1/status"]) {
      assert.equal(pickFixedResponse(t49, method, route), null, `4.9: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of ["/v1/settings", "/v1/whatsapp", "/v1/onboarding"]) {
    assert.equal(pickFixedResponse(t49, "GET", other), null, `4.9: ${other} vem da conta de onboarding`);
  }
  const t410 = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets.find(
    (target) => target.code === "4.10" && target.file === "Onboarding-3-IA-e-WhatsApp.dc.html",
  );
  assert.ok(t410);
  assert.equal(t410.route, "/onboarding/whatsapp-concluido");
  assert.equal(t410.responses, undefined);
  assert.equal(t410.steps, undefined);
});

test("targets.json: 4.7 e 4.8 declaram só o GET de /v1/activation-test, sem passos, no estado de cada quadro (RUNNING e FAILED); o 4.9 mantém os dois GET e o 4.10 segue sem responses", () => {
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-3-IA-e-WhatsApp.dc.html");
  const byCode = new Map(owners.map((target) => [target.code, target]));
  const expectedRoutes = new Map([
    ["4.7", "/onboarding/teste-real-progresso"],
    ["4.8", "/onboarding/teste-real-falha"],
  ]);
  const runs = new Map();
  for (const [code, route] of expectedRoutes) {
    const target = byCode.get(code);
    assert.ok(target, `${code} precisa declarar responses`);
    assert.equal(target.route, route);
    assert.equal(target.account, "onboarding");
    assert.equal(target.steps, undefined, `${code}: nenhum passo, nada toca em botão que grava`);
    assert.deepEqual(
      target.responses.map((entry) => `${entry.method} ${entry.path}`),
      ["GET /v1/activation-test"],
      `${code}: só o GET da execução`,
    );
    runs.set(code, resolveRelativeDays(target.responses[0].json, "2026-10-06").data);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const other of ["/v1/activation-test", "/v1/activation-test/restart"]) {
        assert.equal(pickFixedResponse(target, method, other), null, `${code}: ${method} ${other} não deveria casar`);
      }
    }
    for (const other of ["/v1/status", "/v1/settings", "/v1/whatsapp", "/v1/onboarding"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${code}: ${other} vem da conta de onboarding`);
    }
  }
  const running = runs.get("4.7");
  assert.equal(running.state, "RUNNING");
  assert.equal(running.terminal, false);
  assert.equal(running.cleanupState, "PENDING");
  assert.equal(running.failureCode, null);
  const failed = runs.get("4.8");
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.terminal, true);
  assert.equal(failed.failureCode, "ACTIVATION_TEST_AI_DID_NOT_ACT");
  assert.equal(failed.cleanupState, "CLEAN");
  for (const run of [running, failed]) {
    assert.deepEqual(
      run.milestones.map((milestone) => [milestone.milestone, milestone.reached]),
      [["MESSAGE_SENT", true], ["SERVICE_IDENTIFIED", true], ["PRICE_INFORMED", true], ["AVAILABILITY_CHECKED", false], ["SLOT_SELECTED", false], ["APPOINTMENT_CONFIRMED", false]],
    );
    assert.ok(!Number.isNaN(Date.parse(run.startedAt)));
  }
  assert.deepEqual(
    byCode.get("4.9").responses.map((entry) => `${entry.method} ${entry.path}`).sort(),
    ["GET /v1/activation-test", "GET /v1/status"],
  );
  assert.equal(byCode.has("4.10"), false);
  assert.equal(byCode.has("4.6"), false);
});

test("targets.json: 4.4 e 4.5 declaram só o GET de cada quadro, sem passos, e o 4.2 continua sem responses", () => {
  const targets = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets;
  const onboarding = (code) => targets.find((target) => target.code === code && target.file === "Onboarding-3-IA-e-WhatsApp.dc.html");
  const t44 = onboarding("4.4");
  const t45 = onboarding("4.5");
  assert.ok(t44 && t45, "4.4 e 4.5 precisam estar em targets.json");
  assert.equal(t44.route, "/onboarding/whatsapp-conectar");
  assert.equal(t45.route, "/onboarding/contatos-ignorados");
  for (const target of [t44, t45]) {
    assert.equal(target.account, "onboarding");
    assert.equal(target.steps, undefined, `${target.code}: nenhum passo, nada toca em controle que grava`);
    assert.equal(target.responses.length, 1, `${target.code}: um único GET`);
    assert.equal(target.responses[0].method, "GET");
    assert.ok(target.notes.includes("Goal129"), `${target.code}: as notes declaram as divergências do Goal129`);
  }
  assert.equal(t44.responses[0].path, "/v1/whatsapp");
  assert.equal(t45.responses[0].path, "/v1/conversations");
  const connection = t44.responses[0].json.data;
  assert.equal(connection.status, "CONNECTED");
  assert.equal(connection.phoneNumber, "5511987654321");
  const conversations = resolveRelativeDays(t45.responses[0].json, "2026-10-06").data;
  assert.deepEqual(conversations.map((conversation) => conversation.customerName), ["Mãe", "Dudu ❤️", "Tia Lú", "Ana Paula", "Marcos Vieira"]);
  assert.deepEqual(conversations.filter((conversation) => conversation.ignored === true).map((conversation) => conversation.customerName), ["Mãe", "Dudu ❤️"]);
  assert.deepEqual(conversations.filter((conversation) => conversation.customerId).map((conversation) => conversation.customerName), ["Ana Paula"]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const [target, route] of [[t44, "/v1/whatsapp"], [t44, "/v1/whatsapp/disconnect"], [t45, "/v1/conversations"], [t45, "/v1/conversations/visual-compare-conversation-mae/ignore"], [t45, "/v1/conversations/ignored-contacts"]]) {
      assert.equal(pickFixedResponse(target, method, route), null, `${target.code}: ${method} ${route} não deveria casar`);
    }
  }
  for (const other of ["/v1/status", "/v1/settings", "/v1/onboarding"]) {
    assert.equal(pickFixedResponse(t44, "GET", other), null, `4.4: ${other} vem da conta de onboarding`);
    assert.equal(pickFixedResponse(t45, "GET", other), null, `4.5: ${other} vem da conta de onboarding`);
  }
  assert.equal(pickFixedResponse(t44, "GET", "/v1/conversations"), null);
  assert.equal(pickFixedResponse(t45, "GET", "/v1/whatsapp"), null);
  const t42 = onboarding("4.2");
  assert.ok(t42);
  assert.equal(t42.route, "/onboarding/whatsapp-conectar");
  assert.equal(t42.responses, undefined, "4.2 mede a fase de consentimento da conta parada, sem número");
  assert.equal(t42.steps, undefined);
});

const CONFIRMING_NAMES =["desconectar", "excluir minha conta", "reduzir os dois prazos"];

function confirmsRecordedAction(step) {
  const labels = [step.clickRole?.name, step.click].filter((label) => typeof label === "string");
  return labels.some((label) => {
    const name = label.trim().toLowerCase();
    return CONFIRMING_NAMES.includes(name) || name.startsWith("reduzir para");
  });
}

test("targets.json: nenhum passo de captura confirma ação gravada (Desconectar, Excluir minha conta, Reduzir…)", () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json");
  const targets = JSON.parse(readFileSync(file, "utf8")).targets;
  for (const target of targets) {
    for (const [index, step] of (target.steps ?? []).entries()) {
      assert.equal(
        confirmsRecordedAction(step),
        false,
        `alvo ${target.code} (${target.file}): steps[${index}] ${JSON.stringify(step)} toca o botão que confirma uma ação gravada; responses só cobre GET e o toque gravaria na conta visual`,
      );
      if (step.press !== undefined && index > 0) {
        assert.equal(
          confirmsRecordedAction(target.steps[index - 1]),
          false,
          `alvo ${target.code}: steps[${index}] press logo depois de um passo que dá foco a um botão que confirma ação gravada`,
        );
      }
    }
  }
});

const SAVE_ONLY_OPENS_SHEET = ["R2"];

function clicksSave(step) {
  return step.clickRole?.name?.trim().toLowerCase() === "salvar";
}

function savesRecordedSettings(target, step, index) {
  if (target.responses === undefined || !clicksSave(step)) return false;
  if (!SAVE_ONLY_OPENS_SHEET.includes(target.code)) return true;
  const next = target.steps[index + 1];
  return next === undefined || typeof next.click !== "string" || confirmsRecordedAction(next);
}

test("targets.json: nenhum passo toca \"Salvar\" em alvo com responses (o PATCH gravaria na conta visual)", () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json");
  const targets = validateTargetResponses(JSON.parse(readFileSync(file, "utf8")).targets);
  for (const target of targets) {
    for (const [index, step] of (target.steps ?? []).entries()) {
      assert.equal(
        savesRecordedSettings(target, step, index),
        false,
        `alvo ${target.code} (${target.file}): steps[${index}] ${JSON.stringify(step)} toca "Salvar" em alvo com responses; responses só cobre GET e o toque gravaria na conta visual`,
      );
    }
  }
});

test("a regra de \"Salvar\" recusa o toque em alvo com responses e só deixa passar o que abre a folha de confirmação (R2)", () => {
  const save = { clickRole: { role: "button", name: "Salvar" } };
  const responses = [OK];
  assert.equal(savesRecordedSettings({ code: "AG2", responses, steps: [save] }, save, 0), true);
  assert.equal(savesRecordedSettings({ code: "AG2", responses, steps: [{ clickRole: { role: "button", name: " salvar " } }] }, { clickRole: { role: "button", name: " salvar " } }, 0), true);
  assert.equal(savesRecordedSettings({ code: "AG3", steps: [save] }, save, 0), false, "sem responses o alvo não tem resposta fixa a proteger");
  assert.equal(savesRecordedSettings({ code: "AG2", responses, steps: [{ click: "Lembretes" }] }, { click: "Lembretes" }, 0), false);
  const sheet = { click: "Guardar conversas comerciais por 30 dias?" };
  assert.equal(savesRecordedSettings({ code: "R2", responses, steps: [save, sheet] }, save, 0), false);
  assert.equal(savesRecordedSettings({ code: "R2", responses, steps: [save] }, save, 0), true, "R2 sem o passo da folha depois de Salvar");
  assert.equal(savesRecordedSettings({ code: "R2", responses, steps: [save, { click: "Reduzir os dois prazos" }] }, save, 0), true);
});

test("a regra dos passos reconhece os botões que confirmam e deixa passar os que só abrem a folha", () => {
  for (const name of ["Desconectar", "Excluir minha conta", "Reduzir os dois prazos", "Reduzir para 30 dias", "Reduzir para 1 ano"]) {
    assert.equal(confirmsRecordedAction({ clickRole: { role: "button", name } }), true, name);
  }
  assert.equal(confirmsRecordedAction({ click: "Excluir minha conta" }), true);
  for (const name of ["Desconectar WhatsApp", "Excluir conta", "Salvar", "Manter conectado", "Desconectar o WhatsApp?"]) {
    assert.equal(confirmsRecordedAction({ clickRole: { role: "button", name } }), false, name);
  }
  assert.equal(confirmsRecordedAction({ click: "Desconectar o WhatsApp?" }), false);
  assert.equal(confirmsRecordedAction({ press: "Enter" }), false);
});

function conversationFrame(code) {
  const target = declaringTargets().find((candidate) => candidate.code === code && candidate.file === "Conversas-e-Chat.dc.html");
  assert.ok(target, `alvo Conversas:${code} sem responses`);
  assert.equal(target.route, "/conversas");
  assert.equal(target.clock, "13:45");
  assert.deepEqual(target.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/conversations", "GET /v1/status"]);
  const [conversations, status] = target.responses.map((entry) => resolveRelativeDays(entry.json, "2026-10-04"));
  assert.equal(status.data.whatsapp.status, "CONNECTED");
  assert.equal(status.data.whatsapp.phoneNumber, "5511987654321");
  assert.equal(status.data.ai.state, "ACTIVE");
  assert.equal(status.data.degraded, false);
  return { target, rows: conversations.data };
}

test("targets.json: Conversas:C1 tem os grupos do quadro Comercial", () => {
  const { rows } = conversationFrame("C1");
  assert.deepEqual(rows.map((row) => row.customerName), ["Ana Paula", "Fernanda Lima", "Marcos Vieira", "Juliana Mendes", "Pedro Alves", "Bia Castro"]);
  assert.ok(rows.every((row) => row.category === "COMMERCIAL"));
  const waiting = rows.filter((row) => row.status === "HUMAN_HANDOFF" && row.humanHandoff);
  assert.deepEqual(waiting.map((row) => row.customerName), ["Fernanda Lima", "Marcos Vieira"]);
  assert.equal(waiting[0].handoffReason, null);
  assert.equal(waiting[1].handoffReason, "pediu desconto");
  const now = Date.parse("2026-10-04T13:45:00-03:00");
  assert.equal(Math.round((now - Date.parse(waiting[0].updatedAt)) / 60_000), 12);
  assert.equal(Math.round((now - Date.parse(waiting[1].updatedAt)) / 60_000), 34);
  const byName = Object.fromEntries(rows.map((row) => [row.customerName, row]));
  assert.equal(byName["Ana Paula"].updatedAt, "2026-10-04T13:42:00-03:00");
  assert.equal(byName["Juliana Mendes"].handling, "HUMAN");
  assert.equal(byName["Juliana Mendes"].lastMessage.direction, "OUTBOUND");
  assert.equal(byName["Bia Castro"].updatedAt, "2026-10-03T19:20:00-03:00");
  for (const name of ["Ana Paula", "Juliana Mendes", "Pedro Alves"]) {
    assert.ok(Date.parse(byName[name].session.expiresAt) > now, `${name} precisa de sessão viva às 13:45`);
  }
  const times = rows.map((row) => Date.parse(row.updatedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "a lista vem do mais recente para o mais antigo, como o BFF");
});

test("targets.json: Conversas:C2 e C3 abrem a aba e trazem as linhas do quadro", () => {
  const c2 = conversationFrame("C2");
  assert.deepEqual(c2.target.steps, [{ clickRole: { name: "Não classificadas", role: "tab" } }]);
  assert.ok(c2.rows.every((row) => row.category === "UNCLASSIFIED" && row.ignored === false));
  assert.deepEqual(c2.rows.map((row) => row.customerName), [null, "Renata", null]);
  assert.deepEqual(c2.rows.map((row) => row.externalContactId), ["5511976543210", "5511900000007", "5521998881122"]);
  assert.deepEqual(c2.rows.map((row) => row.lastMessage.body), ["Oi", "Oi Camila, tudo bem? 🙂", "Bom dia"]);

  const c3 = conversationFrame("C3");
  assert.deepEqual(c3.target.steps, [{ clickRole: { name: "Pessoal", role: "tab" } }]);
  assert.ok(c3.rows.every((row) => row.category === "PERSONAL"));
  assert.deepEqual(c3.rows.map((row) => [row.customerName, row.ignored]), [["Mãe", true], ["Dudu ❤️", true], ["Tia Lú", false], ["Renata", false]]);
});

test("targets.json: a resposta fixa de Conversas vale para qualquer query do mesmo caminho", () => {
  for (const code of ["C2", "C3"]) {
    const { target, rows } = conversationFrame(code);
    const own = pickFixedResponse(target, "GET", "/v1/conversations");
    assert.equal(resolveRelativeDays(own.json, "2026-10-04").data.length, rows.length);
    assert.ok(target.responses.every((entry) => !("query" in entry)));
  }
});

test("targets.json: Conversas:C4 serve a lista vazia com o WhatsApp conectado", () => {
  const { rows, target } = conversationFrame("C4");
  assert.deepEqual(rows, []);
  assert.equal(target.steps, undefined);
});

function chatFrame(code, extraPaths = []) {
  const target = declaringTargets().find((candidate) => candidate.code === code && candidate.file === "Conversas-e-Chat.dc.html");
  assert.ok(target, `alvo Conversas:${code} sem responses`);
  const id = /^\/conversas\/([^/?#]+)$/.exec(target.route)?.[1];
  assert.ok(id, `${code}: route precisa ser /conversas/{id fixo}, veio ${target.route}`);
  assert.equal(target.clock, "13:45");
  assert.deepEqual(
    target.responses.map((entry) => `${entry.method} ${entry.path}`),
    ["GET /v1/conversations", `GET /v1/conversations/${id}`, `GET /v1/conversations/${id}/messages`, `GET /v1/conversations/${id}/events`, "GET /v1/status", ...extraPaths],
  );
  const [list, conversation, messages, events, status, ...extras] = target.responses.map((entry) => resolveRelativeDays(entry.json, "2026-10-04"));
  assert.equal(status.data.whatsapp.status, "CONNECTED");
  assert.equal(status.data.degraded, false);
  assert.equal(conversation.data.id, id);
  assert.ok(list.data.some((row) => row.id === id), `${code}: a lista da coluna precisa trazer a conversa aberta`);
  return { target, id, conversation: conversation.data, messages: messages.data, events: events.data, extras };
}

test("targets.json: Chat:K1 a K4 abrem /conversas/{id fixo} com a conversa, as mensagens, os eventos, a lista e o status", () => {
  for (const code of ["K1", "K2", "K3", "K4"]) {
    const { target, messages } = chatFrame(code);
    assert.equal(target.steps, undefined);
    assert.ok(messages.length >= 3, `${code}: mensagens do quadro`);
    const times = messages.map((message) => Date.parse(message.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `${code}: mensagens da mais antiga para a mais nova`);
    assert.ok(times.every((time) => time <= Date.parse("2026-10-04T13:45:00-03:00")), `${code}: nenhuma mensagem depois do clock`);
  }
});

test("targets.json: K1 traz IA atendendo, a reserva viva às 13:45 e o agendamento criado", () => {
  const { conversation, messages, events } = chatFrame("K1");
  assert.equal(conversation.handling, "AI");
  assert.equal(conversation.humanHandoff, false);
  assert.deepEqual(messages.map((message) => message.source), ["CUSTOMER", "AI", "CUSTOMER", "AI", "CUSTOMER", "AI", "CUSTOMER", "AI"]);
  assert.deepEqual(events.map((event) => event.type), ["HOLD_PLACED", "APPOINTMENT_CREATED"]);
  assert.ok(Date.parse(events[0].holdExpiresAt) > Date.parse("2026-10-04T13:45:00-03:00"), "a reserva precisa estar viva às 13:45");
  assert.equal(events[0].holdExpiresAt, "2026-10-04T13:46:00-03:00");
  assert.equal(events[0].startTime, "15:30");
  assert.equal(events[1].startTime, "15:30");
  assert.ok(events[1].appointmentId);
});

test("targets.json: K2 aguarda a profissional há 12 min com imagem recebida", () => {
  const { conversation, messages, events } = chatFrame("K2");
  assert.equal(conversation.status, "HUMAN_HANDOFF");
  assert.equal(conversation.humanHandoff, true);
  assert.ok(conversation.handoffReason);
  assert.equal(Math.round((Date.parse("2026-10-04T13:45:00-03:00") - Date.parse(conversation.updatedAt)) / 60_000), 12);
  const image = messages.find((message) => message.kind === "IMAGE");
  assert.equal(image.attachment.kind, "IMAGE");
  assert.equal(image.attachment.mediaAvailable, true);
  assert.deepEqual(events, []);
});

test("targets.json: K3 tem a profissional atendendo, o áudio com transcrição e a hora em que assumiu", () => {
  const { conversation, messages } = chatFrame("K3");
  assert.equal(conversation.handling, "HUMAN");
  assert.equal(conversation.session.humanHandlingSince, "2026-10-04T12:02:00-03:00");
  const audio = messages.find((message) => message.kind === "AUDIO");
  assert.equal(audio.attachment.durationSeconds, 14);
  assert.equal(audio.attachment.transcriptStatus, "DONE");
  assert.match(audio.attachment.transcript, /hidratação junto com a escova/);
  assert.equal(messages.filter((message) => message.source === "OWNER").length, 2);
});

test("targets.json: K4 é conversa pessoal ignorada", () => {
  const { conversation, messages } = chatFrame("K4");
  assert.equal(conversation.category, "PERSONAL");
  assert.equal(conversation.ignored, true);
  assert.equal(conversation.customerName, "Mãe");
  assert.deepEqual(messages.map((message) => message.source), ["CUSTOMER", "OWNER", "CUSTOMER"]);
});

test("targets.json: K6 abre o menu da Renata não classificada e toca em Marcar como pessoal", () => {
  const { target, conversation, messages, events } = chatFrame("K6");
  assert.equal(target.label, "Chat · opções");
  assert.deepEqual(target.steps, [{ clickRole: { name: "Mais ações", role: "button" } }, { click: "Marcar como pessoal" }]);
  assert.equal(conversation.customerName, "Renata");
  assert.equal(conversation.category, "UNCLASSIFIED");
  assert.equal(conversation.ignored, false);
  assert.equal(conversation.humanHandoff, false);
  assert.notEqual(conversation.handling, "HUMAN");
  assert.deepEqual(messages.map((message) => message.body), ["Oi Camila, tudo bem? 🙂"]);
  assert.deepEqual(events, []);
  for (const entry of target.responses) assert.equal(entry.method, "GET");
});

test("targets.json: K5 abre a folha do cliente pelo nome do cabeçalho, com cliente e agendamentos só de GET", () => {
  const { target, id, conversation, messages, events, extras } = chatFrame("K5", ["GET /v1/customers/visual-compare-k5-customer", "GET /v1/appointments"]);
  assert.equal(target.label, "Chat · detalhe do cliente");
  assert.deepEqual(target.steps, [{ clickRole: { name: "Ana Paula", role: "button" } }]);
  assert.equal(id, "visual-compare-c1-ana");
  assert.equal(conversation.customerName, "Ana Paula");
  assert.equal(conversation.customerId, "visual-compare-k5-customer");
  assert.equal(conversation.contactCategory, null);
  assert.equal(messages.length, 2);
  assert.deepEqual(events, []);
  for (const entry of target.responses) assert.equal(entry.method, "GET");
  const raw = JSON.stringify(target.responses);
  assert.match(raw, /{today}/);
  assert.match(raw, /{today-50}/);
  const [customer, appointments] = extras;
  assert.equal(customer.data.id, conversation.customerId);
  assert.equal(customer.data.name, "Ana Paula");
  assert.equal(customer.data.nextAppointment.date, "2026-10-04");
  assert.equal(customer.data.lastAppointment.date, "2026-08-15");
  assert.equal(appointments.data.length, 2);
  for (const appointment of appointments.data) {
    assert.equal(appointment.customerId, conversation.customerId);
    assert.equal(appointment.services[0].name, "Corte feminino");
  }
  assert.equal(appointments.data.at(-1).finalValue, null);
  assert.equal(appointments.data[0].finalValue, 90);
});

test("targets.json: a resposta de cada Chat só vale para o GET exato da sua conversa", () => {
  for (const code of ["K1", "K2", "K3", "K4", "K6"]) {
    const { target, id } = chatFrame(code);
    for (const own of [`/v1/conversations/${id}`, `/v1/conversations/${id}/messages`, `/v1/conversations/${id}/events`]) {
      assert.ok(pickFixedResponse(target, "GET", own), `${code}: ${own} precisa casar`);
    }
    for (const other of [`/v1/conversations/${id}/messages/x/media`, `/v1/conversations/${id}/suggestions`, `/v1/conversations/outra/messages`, "/v1/whatsapp"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${code}: ${other} não deveria casar`);
    }
    for (const method of ["POST", "PUT", "DELETE"]) {
      assert.equal(pickFixedResponse(target, method, `/v1/conversations/${id}/messages`), null, `${code}: ${method} não deveria casar`);
      assert.equal(pickFixedResponse(target, method, `/v1/conversations/${id}/suggestions`), null);
    }
  }
});

test("targets.json: a resposta de cada Conversas só vale para o seu GET exato", () => {
  for (const code of ["C1", "C2", "C3", "C4"]) {
    const { target } = conversationFrame(code);
    assert.ok(pickFixedResponse(target, "GET", "/v1/conversations"));
    assert.ok(pickFixedResponse(target, "GET", "/v1/status"));
    for (const other of ["/v1/whatsapp", "/v1/conversations/ignored-contacts", "/v1/conversations/visual-compare-c1-ana", "/v1/notifications"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${code}: ${other} não deveria casar`);
    }
    assert.equal(pickFixedResponse(target, "PUT", "/v1/conversations"), null);
  }
});

function homeFrame(code) {
  const target = declaringTargets().find((candidate) => candidate.code === code && candidate.file === "Home.dc.html");
  assert.ok(target, `${code} precisa declarar responses para a Home`);
  assert.equal(target.route, "/inicio");
  assert.match(target.clock, /^\d{2}:\d{2}$/);
  const bodies = new Map();
  for (const entry of target.responses) {
    assert.equal(entry.method, "GET", `${code}: só GET`);
    assert.ok(!entry.path.includes("?") && entry.path.startsWith("/v1/"), `${code}: ${entry.path} precisa ser caminho exato em /v1/`);
    assert.ok(!bodies.has(entry.path), `${code}: ${entry.path} repetido`);
    bodies.set(entry.path, resolveRelativeDays(entry.json, "2026-10-05").data);
  }
  return { target, bodies };
}

test("targets.json: H2, H4, H5 e H7 abrem a Home com GET exato de dashboard e status", () => {
  for (const code of ["H2", "H4", "H5", "H7"]) {
    const { target, bodies } = homeFrame(code);
    assert.equal(target.label, { H2: "Home · pendências", H4: "Home · checklist", H5: "Home · IA pausada", H7: "Home · pausar IA" }[code]);
    assert.ok(bodies.has("/v1/dashboard"), `${code}: falta /v1/dashboard`);
    assert.ok(bodies.has("/v1/status"), `${code}: falta /v1/status`);
    for (const path of ["/v1/dashboard", "/v1/status"]) {
      assert.ok(pickFixedResponse(target, "GET", path), `${code}: ${path} precisa casar`);
    }
    for (const other of ["/v1/dashboard/extra", "/v1/whatsapp", "/v1/conversations", "/v1/notifications"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${code}: ${other} não deveria casar`);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(pickFixedResponse(target, method, "/v1/dashboard"), null, `${code}: ${method} não deveria casar`);
      assert.equal(pickFixedResponse(target, method, "/v1/settings"), null, `${code}: ${method} não deveria casar`);
    }
  }
});

test("targets.json: H1 e H3 fixam só GET /v1/status, com a IA ligada e o WhatsApp desconectado", () => {
  for (const code of ["H1", "H3"]) {
    const { target, bodies } = homeFrame(code);
    assert.equal(target.label, { H1: "Home · IA ativa", H3: "Home · WhatsApp desconectado" }[code]);
    assert.deepEqual(target.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/status"]);
    const status = bodies.get("/v1/status");
    assert.equal(status.ai.state, "ACTIVE");
    assert.equal(status.ai.effectiveEnabled, true);
    assert.equal(status.whatsapp.status, "DISCONNECTED");
    for (const other of ["/v1/dashboard", "/v1/settings", "/v1/services"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${code}: ${other} vem da conta de teste`);
    }
  }
});

test("targets.json: H2 traz as duas pendências de conversa, o serviço sem duração e três atendimentos restantes", () => {
  const { bodies } = homeFrame("H2");
  const dashboard = bodies.get("/v1/dashboard");
  assert.equal(dashboard.ai.data.conversationsNeedingAttentionCount, 2);
  assert.deepEqual(dashboard.ai.data.conversationsNeedingAttention.map((item) => item.customerName), ["Fernanda Lima", "Marcos Vieira"]);
  assert.deepEqual(dashboard.scheduling.data.todayAppointments.map((item) => item.startTime), ["14:00", "15:00", "16:30"]);
  const pending = bodies.get("/v1/services").items.filter((service) => service.needsReview);
  assert.deepEqual(pending.map((service) => [service.name, service.durationMinutes]), [["Design de sobrancelha", null]]);
  assert.equal(bodies.get("/v1/status").ai.state, "ACTIVE");
  assertServiceColors("H2", bodies);
});

function assertServiceColors(code, bodies) {
  const colors = new Map(bodies.get("/v1/services").items.map((service) => [service.id, service.colorToken ?? null]));
  const appointments = bodies.get("/v1/dashboard").scheduling.data.todayAppointments;
  for (const appointment of appointments) {
    assert.ok(appointment.services.length > 0, `${code}: ${appointment.startTime} precisa de serviço para ter traço`);
    for (const service of appointment.services) {
      assert.ok(colors.get(service.serviceId), `${code}: ${service.name} (${service.serviceId}) precisa de colorToken no catálogo`);
    }
  }
  const juliana = appointments.find((appointment) => appointment.customer?.name === "Juliana Mendes");
  assert.deepEqual(
    juliana.services.map((service) => [service.name, colors.get(service.serviceId)]),
    [["Escova", "AMBER"], ["Hidratação", "EMERALD"]],
    `${code}: o traço de Juliana Mendes é dividido em laranja e verde`,
  );
}

test("targets.json: H4 tem checklist com dois de quatro passos e a IA desligada", () => {
  const { bodies } = homeFrame("H4");
  const capabilities = bodies.get("/v1/dashboard").scheduling.data.calendar.capabilities;
  assert.equal(capabilities.aiActivationReady, true);
  assert.equal(capabilities.hoursConfigured, true);
  assert.equal(capabilities.activationTestCompleted, false);
  const status = bodies.get("/v1/status");
  assert.equal(status.whatsapp.status, "DISCONNECTED");
  assert.equal(status.whatsapp.phoneNumber, null);
  assert.equal(status.ai.state, "OFF");
  assert.deepEqual(bodies.get("/v1/dashboard").scheduling.data.todayAppointments, []);
});

test("targets.json: H5 traz ai.pausedAt em /v1/settings, com checklist completo, a IA desligada e sem o compromisso pessoal", () => {
  const { bodies } = homeFrame("H5");
  const settings = bodies.get("/v1/settings");
  assert.equal(settings.ai.enabled, false);
  assert.equal(settings.ai.pausedAt, "2026-10-05T09:12:00-03:00");
  const capabilities = bodies.get("/v1/dashboard").scheduling.data.calendar.capabilities;
  assert.equal(capabilities.aiActivationReady && capabilities.hoursConfigured && capabilities.activationTestCompleted, true);
  assert.equal(bodies.get("/v1/status").ai.state, "OFF");
  assert.equal(bodies.get("/v1/status").whatsapp.status, "CONNECTED");
  const dashboard = bodies.get("/v1/dashboard");
  assert.deepEqual(dashboard.scheduling.data.todayAppointments.map((item) => item.startTime), ["10:00", "14:00", "15:00"]);
  assert.ok(
    dashboard.scheduling.data.todayAppointments.every((item) => item.customer && item.title !== "Dentista"),
    "H5: o compromisso pessoal não é atendimento; o dashboard não o traz",
  );
  assert.equal(dashboard.scheduling.data.appointmentsToday, 3);
  assertServiceColors("H5", bodies);
  assert.deepEqual(
    [dashboard.scheduling.data.appointmentsThisWeek, dashboard.ai.data.aiAppointmentsThisWeek, dashboard.ai.data.conversationsTakenOverThisWeek],
    [12, 8, 2],
  );
});

test("targets.json: H7 abre a confirmação de pausa por steps com a IA ativa e a pausa em branco", () => {
  const { target, bodies } = homeFrame("H7");
  assert.equal(target.steps.length, 1);
  assert.equal(target.steps[0].clickRole.name, "Pausar");
  assert.equal(target.steps[0].clickRole.role, "button");
  assert.notEqual(target.steps[0].optional, true, "H7: sem o botão Pausar a captura tem de falhar");
  assert.equal(bodies.get("/v1/status").ai.state, "ACTIVE");
  const settings = bodies.get("/v1/settings");
  assert.equal(settings.ai.enabled, true);
  assert.equal(settings.ai.pausedAt, null);
  assert.equal(bodies.get("/v1/dashboard").ai.data.automatedConversationsToday, 3);
  assert.equal(bodies.get("/v1/dashboard").scheduling.data.todayAppointments.length, 5);
  assertServiceColors("H7", bodies);
});

function agendaTarget(code, route = "/agenda") {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json");
  const targets = validateTargetResponses(JSON.parse(readFileSync(file, "utf8")).targets);
  const target = targets.find((candidate) => candidate.code === code && candidate.file === "Agenda.dc.html");
  assert.ok(target, `alvo Agenda:${code} ausente`);
  assert.equal(target.route, route);
  assert.equal(target.clock, "13:45");
  return target;
}

function agendaBodies(target) {
  return new Map((target.responses ?? []).map((entry) => [entry.path, entry.json]));
}

function assertGetOnlyExactPaths(target) {
  for (const entry of target.responses ?? []) {
    assert.equal(entry.method, "GET");
    assert.match(entry.path, /^\/v1\/[^?#\s]+$/);
    assert.equal(typeof entry.json.requestId, "string");
  }
}

test("targets.json: Agenda:A2 cai num dia sem atendimento e sem regra ativa, qualquer que seja o dia semeado", () => {
  const target = agendaTarget("A2");
  assertGetOnlyExactPaths(target);
  assert.deepEqual(
    target.responses.map((entry) => `${entry.method} ${entry.path}`).sort(),
    ["GET /v1/appointments", "GET /v1/availability-exceptions", "GET /v1/settings", "GET /v1/time-blocks"],
  );
  const bodies = agendaBodies(target);
  assert.deepEqual(bodies.get("/v1/appointments").data, []);
  assert.deepEqual(bodies.get("/v1/time-blocks").data, []);
  assert.deepEqual(bodies.get("/v1/availability-exceptions").data, []);
  const { availability } = bodies.get("/v1/settings").data;
  assert.deepEqual(availability.rules.filter((rule) => rule.active), []);
  const next = target.steps.at(-1);
  assert.equal(next.clickRole.name, "Próximo dia");
  assert.equal(next.clickRole.role, "button");
  assert.notEqual(next.optional, true, "A2: sem 'Próximo dia' a captura tem de falhar, não cair no dia de hoje");
});

test("targets.json: Agenda:A3 abre o calendário pelo título e A4 abre o menu Novo, sem responses e sem passo opcional", () => {
  const a3 = agendaTarget("A3");
  const a4 = agendaTarget("A4");
  assert.equal(a3.responses, undefined);
  assert.equal(a4.responses, undefined);
  const a3Step = a3.steps.at(-1);
  assert.equal(a3Step.clickRole.name, "Abrir calendário");
  assert.equal(a3Step.clickRole.role, "button");
  assert.notEqual(a3Step.optional, true);
  const a4Step = a4.steps.at(-1);
  assert.equal(a4Step.clickRole.name, "Novo");
  assert.equal(a4Step.clickRole.role, "button");
  assert.notEqual(a4Step.optional, true);
});

test("targets.json: Agenda:A7 leva ao conflito do formulário pelos passos, sem responses e com o waitFor obrigatório", () => {
  const target = agendaTarget("A7", "/agenda/novo");
  assert.equal(target.label, "Novo agendamento · conflito");
  assert.equal(target.responses, undefined);
  assert.deepEqual(
    target.steps.map((step) => step.click ?? step.fill?.label ?? step.waitFor),
    ["Ana Paula", "Hidratação", "Outro horário", "Outro horário, fora dos oferecidos", "Usar este horário", "Esse horário já está ocupado"],
  );
  assert.equal(target.steps.find((step) => step.fill).fill.value, "16:30");
  const wait = target.steps.at(-1);
  assert.equal(wait.waitFor, "Esse horário já está ocupado");
  assert.notEqual(wait.optional, true, "A7: sem o conflito a captura tem de falhar, não sair com o formulário livre");
  assert.ok(target.steps.every((step) => step.optional !== true));
});

test("targets.json: Agenda:A12 abre a Semana com o domingo oculto e sem regra no domingo", () => {
  const target = agendaTarget("A12");
  assertGetOnlyExactPaths(target);
  assert.deepEqual(
    target.responses.map((entry) => `${entry.method} ${entry.path}`).sort(),
    ["GET /v1/settings", "GET /v1/settings/agenda-view"],
  );
  const bodies = agendaBodies(target);
  assert.deepEqual(bodies.get("/v1/settings/agenda-view").data.hiddenWeekdays, [0]);
  const { rules } = bodies.get("/v1/settings").data.availability;
  assert.deepEqual(rules.filter((rule) => rule.active).map((rule) => rule.dayOfWeek).sort(), [1, 2, 3, 4, 5, 6]);
  assert.equal(rules.some((rule) => rule.dayOfWeek === 0), false);
  assert.deepEqual(target.steps.map((step) => [step.clickRole.role, step.clickRole.name]), [["tab", "Semana"], ["button", "Seg–Sáb"]]);
  assert.ok(target.steps.every((step) => step.optional !== true));
});

test("targets.json: 2.6 é o único dono de responses em Onboarding-1-Negocio-e-Agenda.dc.html, só com o GET /v1/onboarding e sem passos; o 2.7 não declara responses nem passos", () => {
  const all = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets;
  const inFile = all.filter((target) => target.file === "Onboarding-1-Negocio-e-Agenda.dc.html");
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-1-Negocio-e-Agenda.dc.html");
  assert.deepEqual(owners.map((target) => target.code), ["2.6"]);
  const [t26] = owners;
  const t27 = inFile.find((target) => target.code === "2.7");
  assert.ok(t27, "2.7 precisa estar em targets.json");
  assert.equal(t26.route, "/onboarding/horarios");
  assert.equal(t27.route, t26.route);
  for (const target of [t26, t27]) {
    assert.equal(target.account, "onboarding");
    assert.equal(target.steps, undefined, `${target.code}: nenhum passo, nada toca em controle que grava`);
  }
  assert.equal(t27.responses, undefined, "2.7: a conta de onboarding já tem o horário do quadro");
  assert.equal(t27.label, "Horários por dia");
  assert.deepEqual(t26.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/onboarding"]);
  assert.equal(typeof t26.responses[0].json.requestId, "string");
  assert.equal(pickFixedResponse(t26, "GET", "/v1/onboarding"), t26.responses[0]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(pickFixedResponse(t26, method, "/v1/onboarding"), null, `2.6: ${method} /v1/onboarding não deveria casar`);
  }
  for (const other of ["/v1/onboarding/complete", "/v1/settings", "/v1/whatsapp"]) {
    assert.equal(pickFixedResponse(t26, "GET", other), null, `2.6: ${other} vem da conta de onboarding`);
  }
  assert.equal(pickFixedResponse(t27, "GET", "/v1/onboarding"), null, "2.7: a leitura vem da conta de onboarding");
  for (const code of ["2.3", "2.4", "2.5"]) {
    const other = inFile.find((target) => target.code === code);
    assert.ok(other, `${code} precisa continuar em targets.json`);
    assert.equal(other.responses, undefined, `${code} continua sem responses`);
    assert.equal(other.steps, undefined, `${code} continua sem passos`);
  }
});

test("targets.json: 2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de responses em Onboarding-2-Importacao.dc.html; o 2.I3 só com o GET /v1/calendar/imports e sem passos; o 2.I4 só com os dois GET (estado e prévia do caminho exato) e sem passos; o 2.I5 com os mesmos dois GET e só o clickRole em \"Escolher o que importar\"; o 2.I7 é provado no teste seguinte; o 2.I2 não declara responses e só tem os três passos permitidos", () => {
  const all = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json"), "utf8")).targets;
  const inFile = all.filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  const owners = declaringTargets().filter((target) => target.file === "Onboarding-2-Importacao.dc.html");
  assert.deepEqual(owners.map((target) => target.code), ["2.I3", "2.I4", "2.I5", "2.I6", "2.I7", "2.I8", "2.I9", "2.I10"]);
  const [t2i3, t2i4, t2i5] = owners;
  const t2i2 = inFile.find((target) => target.code === "2.I2");
  assert.ok(t2i2, "2.I2 precisa estar em targets.json");
  for (const target of [t2i2, t2i3]) {
    assert.equal(target.route, "/onboarding/importacao");
    assert.equal(target.account, "onboarding");
  }
  assert.equal(t2i3.steps, undefined, "2.I3: nenhum passo, a tela abre sozinha na análise");
  assert.deepEqual(t2i3.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/calendar/imports"]);
  assert.equal(typeof t2i3.responses[0].json.requestId, "string");
  assert.equal(pickFixedResponse(t2i3, "GET", "/v1/calendar/imports"), t2i3.responses[0]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(pickFixedResponse(t2i3, method, "/v1/calendar/imports"), null, `2.I3: ${method} /v1/calendar/imports não deveria casar`);
  }
  for (const other of ["/v1/calendar/imports/visual-compare-import-analyzing/preview", "/v1/calendar/imports/visual-compare-import-analyzing/progress", "/v1/settings"]) {
    assert.equal(pickFixedResponse(t2i3, "GET", other), null, `2.I3: ${other} não é servido`);
  }
  const previewPath = "/v1/calendar/imports/visual-compare-import-ready/preview";
  for (const target of [t2i4, t2i5]) {
    assert.equal(target.route, "/onboarding/importacao");
    assert.equal(target.account, "onboarding");
    assert.deepEqual(target.responses.map((entry) => `${entry.method} ${entry.path}`), ["GET /v1/calendar/imports", `GET ${previewPath}`], `${target.code}: só os dois GET`);
    for (const entry of target.responses) assert.equal(typeof entry.json.requestId, "string");
    assert.equal(pickFixedResponse(target, "GET", "/v1/calendar/imports"), target.responses[0]);
    assert.equal(pickFixedResponse(target, "GET", previewPath), target.responses[1]);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(pickFixedResponse(target, method, "/v1/calendar/imports"), null, `${target.code}: ${method} /v1/calendar/imports não deveria casar`);
      assert.equal(pickFixedResponse(target, method, previewPath), null, `${target.code}: ${method} da prévia não deveria casar`);
    }
    for (const other of ["/v1/calendar/imports/visual-compare-import-analyzing/preview", "/v1/calendar/imports/visual-compare-import/preview", "/v1/calendar/imports/visual-compare-import-ready/progress", "/v1/settings"]) {
      assert.equal(pickFixedResponse(target, "GET", other), null, `${target.code}: ${other} não é servido`);
    }
  }
  assert.equal(t2i4.steps, undefined, "2.I4: nenhum passo, a tela abre sozinha no resumo");
  assert.deepEqual(t2i5.steps.map((step) => Object.keys(step)), [["clickRole"]], "2.I5: só o clickRole");
  assert.deepEqual(t2i5.steps[0].clickRole, { role: "button", name: "Escolher o que importar" });
  assert.notEqual(t2i5.steps[0].optional, true);
  assert.doesNotMatch(JSON.stringify(t2i5.steps), /Importar|Conectar|checkbox|Enter/);
  assert.equal(t2i2.responses, undefined, "2.I2: a conta de onboarding não tem sessão de importação");
  assert.deepEqual(
    t2i2.steps.map((step) => Object.keys(step)),
    [["clickRole"], ["fill"], ["fill"]],
    "2.I2: só clickRole e fill, sem press nem click",
  );
  assert.deepEqual(t2i2.steps[0].clickRole, { role: "button", name: "Continuar" });
  assert.deepEqual(t2i2.steps.slice(1).map((step) => step.fill.label), ["E-mail do Minha Agenda", "Senha"]);
  assert.ok(t2i2.steps.every((step) => step.optional !== true));
  assert.ok(t2i2.steps[2].fill.value.length === 8, "2.I2: a senha do passo tem oito caracteres");
  const touched = JSON.stringify(t2i2.steps);
  assert.doesNotMatch(touched, /Analisar meus dados|Enter|Conectar/);
  const origem = inFile.find((target) => target.code === "2.I1");
  assert.ok(origem, "2.I1 precisa continuar em targets.json");
  assert.equal(origem.responses, undefined, "2.I1 continua sem responses");
  assert.equal(origem.steps, undefined, "2.I1 continua sem passos");
});

test("targets.json: CL9 é o único alvo com entrada retida, retém só GET /v1/customers, tem o GET /v1/status conectado, só GET e o passo waitFor", () => {
  const all = declaringTargets();
  const holders = all.filter((target) => hasHeldResponse(target));
  assert.deepEqual(holders.map((target) => target.code), ["CL9"]);
  const cl9 = holders[0];
  assert.equal(cl9.file, "Clientes.dc.html");
  assert.equal(cl9.label, "Clientes · carregando");
  assert.equal(cl9.route, "/clientes");
  assert.deepEqual(
    cl9.responses.map((entry) => `${entry.method} ${entry.path}${entry.hold ? " (retida)" : ""}`),
    ["GET /v1/status", "GET /v1/customers (retida)"],
  );
  for (const entry of cl9.responses) assert.equal(entry.method, "GET");
  const held = cl9.responses.filter((entry) => entry.hold === true);
  assert.equal(held.length, 1);
  assert.equal(held[0].json, undefined);
  assert.equal(held[0].status, undefined);
  const status = cl9.responses.find((entry) => entry.path === "/v1/status");
  assert.equal(status.json.data.whatsapp.status, "CONNECTED");
  assert.equal(typeof status.json.requestId, "string");
  const cl10 = all.find((target) => target.code === "CL10");
  assert.deepEqual(status, cl10.responses.find((entry) => entry.path === "/v1/status"), "CL9 usa o mesmo GET /v1/status do CL10");
  assert.equal(isHeldRequest(cl9, "GET", "/v1/customers"), true);
  assert.equal(isHeldRequest(cl9, "GET", "/v1/status"), false);
  assert.equal(isHeldRequest(cl9, "POST", "/v1/customers"), false);
  assert.equal(pickFixedResponse(cl9, "GET", "/v1/customers"), null);
  assert.deepEqual(cl9.steps, [{ waitFor: "Carregando clientes" }]);
  assert.match(cl9.notes, /retido/);
  assert.match(cl9.notes, /FREEZE_CSS/);
});

test("targets.json: S9 dá o Corte feminino de 45 min e R$ 90 no id da rota, só GET, e os passos chegam ao título do quadro", () => {
  const s9 = declaringTargets().find((target) => target.file === "Servicos.dc.html" && target.code === "S9");
  assert.equal(s9.label, "Serviço · descartar alterações");
  assert.equal(s9.route, "/servicos/editar?id=visual-compare-s9");
  assert.deepEqual(
    s9.responses.map((entry) => `${entry.method} ${entry.path}`),
    ["GET /v1/status", "GET /v1/services", "GET /v1/services/visual-compare-s9/ai-instruction"],
  );
  for (const entry of s9.responses) {
    assert.equal(entry.method, "GET");
    assert.equal(entry.status, undefined);
    assert.equal(typeof entry.json.requestId, "string");
  }
  const status = s9.responses.find((entry) => entry.path === "/v1/status");
  assert.equal(status.json.data.whatsapp.status, "CONNECTED");
  const catalogue = s9.responses.find((entry) => entry.path === "/v1/services").json.data;
  assert.equal(catalogue.editable, true);
  const corte = catalogue.items.find((item) => item.id === "visual-compare-s9");
  assert.equal(corte.name, "Corte feminino");
  assert.equal(corte.durationMinutes, 45);
  assert.equal(corte.priceType, "FIXED");
  assert.equal(corte.price, 90);
  assert.equal(corte.colorToken, "SKY");
  assert.equal(corte.needsReview, false);
  assert.deepEqual(s9.responses.find((entry) => entry.path.endsWith("/ai-instruction")).json.data, { content: "" });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/v1/services", "/v1/services/visual-compare-s9", "/v1/services/visual-compare-s9/ai-instruction"]) {
      assert.equal(pickFixedResponse(s9, method, route), null, `S9: ${method} ${route} não deveria casar`);
    }
  }
  assert.equal(pickFixedResponse(s9, "GET", "/v1/settings"), null, "S9: /v1/settings vem da conta de teste");
  const last = s9.steps[s9.steps.length - 1];
  assert.deepEqual(last, { waitFor: "Salvar antes de sair?" });
  assert.ok(s9.steps.some((step) => step.clickRole?.name === "Aumentar duração"), "S9: a duração sobe a 50 min");
  assert.ok(s9.steps.some((step) => step.clickRole?.name === "Voltar para serviços" && step.clickRole.role === "link"), "S9: clica no x da barra");
  assert.deepEqual(s9.steps.filter((step) => step.press).map((step) => step.press), ["Control+A", "9", "5"], "S9: o preço vai a R$ 95");
  assert.equal(s9.steps.some((step) => step.clickRole?.name === "Salvar alterações" || step.clickRole?.name === "Descartar"), false, "S9: nenhum passo grava nem descarta");
  assert.match(s9.notes, /Goal151/);
});
