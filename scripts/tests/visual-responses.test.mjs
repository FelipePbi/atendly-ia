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

test("targets.json: só W1, I1, C1 a C4, K1 a K6 e H1 a H5 e H7 declaram responses", () => {
  const declaring = declaringTargets();
  assert.deepEqual(declaring.map((target) => target.code).sort(), ["C1", "C2", "C3", "C4", "H1", "H2", "H3", "H4", "H5", "H7", "I1", "K1", "K2", "K3", "K4", "K5", "K6", "W1"]);
  for (const target of declaring) {
    const owner = ["W1", "I1"].includes(target.code)
      ? "Mais-WhatsApp-Importacao-Conta.dc.html"
      : target.code.startsWith("H")
        ? "Home.dc.html"
        : "Conversas-e-Chat.dc.html";
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
