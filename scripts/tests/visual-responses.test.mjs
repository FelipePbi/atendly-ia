// Respostas fixas de GET por alvo do `visual:compare` (Goal106).
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

test("targets.json: só o W1 declara responses, e só GET /v1/whatsapp conectado", () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "frontend", "e2e", "visual", "targets.json");
  const targets = validateTargetResponses(JSON.parse(readFileSync(file, "utf8")).targets);
  const declaring = targets.filter((target) => target.responses !== undefined);
  assert.deepEqual(declaring.map((target) => target.code), ["W1"]);
  assert.equal(declaring[0].file, "Mais-WhatsApp-Importacao-Conta.dc.html");
  assert.equal(declaring[0].responses.length, 1);
  const [only] = declaring[0].responses;
  assert.equal(only.method, "GET");
  assert.equal(only.path, "/v1/whatsapp");
  assert.equal(only.json.data.status, "CONNECTED");
  assert.equal(only.json.data.phoneNumber, "5511987654321");
  assert.equal(only.json.data.connectedAt, "2026-09-18T15:00:00.000Z");
  assert.equal(typeof only.json.data.id, "string");
  assert.equal(typeof only.json.data.updatedAt, "string");
  assert.equal(typeof only.json.requestId, "string");
});
