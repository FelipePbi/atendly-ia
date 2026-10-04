// Respostas fixas de GET por alvo do `visual:compare` (Goal106, Goal113).
//
// Cobre a parte pura que decide o que o instrumento aceita e o que serve:
// `responses` só aceita GET com caminho em /v1/; recusa outro método, caminho
// fora de /v1/ e campo desconhecido; o alvo sem `responses` não recebe resposta
// fixa; e a resposta só vale para o caminho exato. O `route.fulfill` em si
// roda no navegador e é medido pela execução 2 do visual:compare.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  bffPathname,
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
    () => validateResponses([{ ...OK, status: 500 }], TARGET),
    (error) => /campo desconhecido "status"/.test(error.message) && /alvo W1/.test(error.message),
  );
  assert.throws(() => validateResponses([{ method: "GET", path: "/v1/whatsapp" }], TARGET), /não tem "json"/);
  assert.throws(() => validateResponses({}, TARGET), /precisa ser uma lista/);
  assert.throws(() => validateResponses(["GET /v1/whatsapp"], TARGET), /precisa ser um objeto/);
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

test("resolveRelativeDays troca {today} e {today-N} pelo dia semeado e deixa o resto igual", () => {
  const json = { data: [{ at: "{today}T13:42:00-03:00", before: "{today-1}T19:20:00-03:00", month: "{today-5}T08:00:00-03:00" }], n: 3, flag: null };
  assert.deepEqual(resolveRelativeDays(json, "2026-10-04"), {
    data: [{ at: "2026-10-04T13:42:00-03:00", before: "2026-10-03T19:20:00-03:00", month: "2026-09-29T08:00:00-03:00" }],
    n: 3,
    flag: null,
  });
  assert.equal(resolveRelativeDays("{today-4}", "2026-03-02"), "2026-02-26");
  assert.deepEqual(resolveRelativeDays({ a: "2026-09-18T13:42:00.000Z" }, undefined), { a: "2026-09-18T13:42:00.000Z" });
  assert.throws(() => resolveRelativeDays({ a: "{today}" }, undefined), /não informou o dia/);
  assert.equal(json.data[0].at, "{today}T13:42:00-03:00");
});

test("targets.json: só W1, I1, C1, C2, C3 e C4 declaram responses", () => {
  const declaring = declaringTargets();
  assert.deepEqual(declaring.map((target) => target.code).sort(), ["C1", "C2", "C3", "C4", "I1", "W1"]);
  for (const target of declaring) {
    const owner = ["W1", "I1"].includes(target.code) ? "Mais-WhatsApp-Importacao-Conta.dc.html" : "Conversas-e-Chat.dc.html";
    assert.equal(target.file, owner, `${target.code} declara responses no arquivo errado`);
    for (const entry of target.responses) {
      assert.equal(entry.method, "GET");
      assert.equal(typeof entry.json.requestId, "string");
    }
  }
});

test("targets.json: W1 e I1 declaram só o seu GET", () => {
  const [w1, i1] = ["W1", "I1"].map((code) => declaringTargets().find((target) => target.code === code));
  assert.equal(w1.responses.length, 1);
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
