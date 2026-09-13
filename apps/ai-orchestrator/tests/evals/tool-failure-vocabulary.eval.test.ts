/**
 * Evals do vocabulário de falha das tools (Goal011, critério 7 do aceite),
 * no nível da conversa.
 *
 * `tests/tools/scheduling-infrastructure-error.test.ts` prova a fronteira
 * diretamente em `executeGraphTools`. Aqui a mesma fronteira é observada de
 * onde ela importa: **o que o modelo recebeu no contexto do turno seguinte** e
 * **o que saiu para a cliente**.
 *
 * - Infraestrutura (auth interna, timeout, 5xx): o modelo vê código genérico
 *   e mensagem sem nenhum detalhe do problema real; o detalhe fica no log,
 *   com `requestId` e `aiRunId`.
 * - Domínio: o modelo vê o código próprio e a mensagem real, porque é com
 *   isso que ele oferece alternativa em vez de encerrar a conversa.
 */
import { describe, expect, it } from "vitest";

import { DomainError, InfrastructureError } from "../../src/lib/errors.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

/** Qualquer palavra que denuncie infraestrutura para quem lê a conversa. */
const VOCABULARIO_DE_INFRA =
  /auth|token|credencial|timeout|502|503|500|5xx|upstream|gateway|ECONNREFUSED|scheduling service/i;

describe("falha de infraestrutura não vira assunto da conversa", () => {
  it("política: detalhe de infraestrutura não chega ao modelo nem à cliente; vai para o log", async () => {
    const detalheReal =
      "Scheduling Service authentication is not configured (HTTP 502 upstream timeout).";
    const world = createEvalWorld({
      gateway: {
        listActiveServices: async () => {
          throw new InfrastructureError(detalheReal, {
            code: "SCHEDULING_AUTH_MISSING",
            statusCode: 502,
          });
        },
      },
    });

    const reply = await world.send({
      cliente: "Quanto custa a Aplicacao 5D?",
      modelo: [
        {
          nota: "consulta o catalogo real",
          toolCalls: [
            {
              id: "call-list-services-infra",
              name: "list_services",
              args: { includePrices: true },
            },
          ],
        },
        {
          nota: "segue a conversa sem interpretar o problema tecnico",
          decision: {
            action: "send_message",
            messages: [
              "Nao consegui puxar os valores agora. Posso tentar de novo em instantes ou chamar a equipe pra te responder.",
            ],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.8,
          },
        },
      ],
    });

    // O que voltou ao contexto do modelo no turno seguinte.
    const [resultado] = world.model.resultadosDeTool(1);
    expect(resultado.parsed).toMatchObject({
      ok: false,
      error: { code: "TOOL_INFRASTRUCTURE_ERROR" },
    });
    expect(resultado.content).not.toContain(detalheReal);
    expect(resultado.content).not.toMatch(VOCABULARIO_DE_INFRA);
    expect(reply.text).not.toMatch(VOCABULARIO_DE_INFRA);

    // O detalhe real existe — só que no log, com a correlação que permite
    // achar o turno.
    const registro = world.logger.error.mock.calls.find(
      ([contexto]) =>
        typeof contexto === "object" &&
        contexto !== null &&
        String((contexto as Record<string, unknown>).error ?? "").includes(
          detalheReal,
        ),
    );
    expect(
      registro,
      "falha de infraestrutura precisa aparecer no log",
    ).toBeDefined();
    expect(registro?.[0]).toMatchObject({
      requestId: "request-1",
      aiRunId: "ai-run-1",
      toolName: "list_services",
      infrastructure: true,
    });
  });
});

describe("falha de domínio continua sendo assunto da conversa", () => {
  it("política: erro de domínio chega ao modelo com código próprio e permite oferecer alternativa", async () => {
    const mensagemDeDominio =
      "Esse horario acabou de ser reservado por outra pessoa.";
    const world = createEvalWorld({
      gateway: {
        createHold: async () => {
          throw new DomainError(mensagemDeDominio, {
            code: "SLOT_UNAVAILABLE",
            statusCode: 409,
          });
        },
      },
      slots: [
        { date: "2026-06-08", startTime: "15:00", endTime: "16:00" },
        { date: "2026-06-08", startTime: "16:30", endTime: "17:30" },
      ],
    });

    const reply = await world.send({
      cliente: "Quero a Aplicacao 5D segunda as 13:30",
      modelo: [
        {
          nota: "tenta preparar o horario pedido",
          toolCalls: [
            {
              id: "call-prepare-dominio",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-1",
                date: "2026-06-08",
                startTime: "13:30",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "com o codigo de dominio na mao, busca alternativa",
          toolCalls: [
            {
              id: "call-availability-alternativa",
              name: "get_availability",
              args: { serviceId: "service-1", startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: "oferece as alternativas reais",
          decision: {
            action: "send_message",
            messages: [
              "Esse horario acabou de sair. Na segunda ainda tenho 15:00 e 16:30 — algum desses serve?",
            ],
            conversationStage: "WAITING_CLIENT_SLOT_CHOICE",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    const [tentativa] = world.model.resultadosDeTool(1);
    expect(tentativa.parsed).toMatchObject({
      ok: false,
      error: { code: "SLOT_UNAVAILABLE", message: mensagemDeDominio },
    });

    expect(world.execucoes()).toMatchObject([
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "SLOT_UNAVAILABLE",
      },
      { name: "get_availability", status: "SUCCEEDED", ok: true },
    ]);
    // Domínio não é motivo para handoff nem para rascunho fantasma.
    expect(world.rascunho()).toBeUndefined();
    expect(world.handoffs()).toEqual([]);
    expect(reply.text).toContain("15:00");
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
