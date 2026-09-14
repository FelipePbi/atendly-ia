/**
 * Evals de sugestão ao atendimento humano (Goal012/WU-04, critérios 6 e 9 do
 * aceite), no nível da bancada de evals — não substitui
 * `tests/tools/suggestion-out-of-reach.test.ts`, que já prova tool a tool que
 * nenhum caminho com efeito existe no binding; aqui a transcrição roda pelo
 * mesmo `AssistantService` e pelo mesmo gateway em memória do resto da
 * bancada, com asserção de alcance que **conta** os alcances.
 *
 * Dois casos:
 *
 * 1. A sugestão sai sem efeito, sem envio e sem rascunho: nenhum hold, nenhum
 *    agendamento, nenhuma `Message`, nenhum `pendingAction` — só leitura
 *    alcança a agenda, e a contagem prova que a leitura de fato aconteceu.
 * 2. A mesma transcrição, nos três estilos, produz a mesma sugestão
 *    **operacional**: mesmo binding somente leitura oferecido ao modelo,
 *    mesmos alcances à agenda, nenhum efeito em nenhum dos três — só o texto
 *    de estilo no prompt muda.
 */
import { describe, expect, it } from "vitest";

import type { AiConversationStyle } from "../../src/modules/tenant-config/ai-settings.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

function cenarioEmAtendimentoHumano(style: AiConversationStyle = "BALANCED") {
  return createEvalWorld({
    style,
    session: { category: "COMMERCIAL", humanHandling: true },
    aiTenantConfig: { enabled: true, tone: style },
  });
}

describe("sugestão sem efeito, sem envio e sem rascunho", () => {
  it("política: gera sugestões só de leitura, sem hold, sem agendamento, sem Message e sem pendingAction", async () => {
    const world = cenarioEmAtendimentoHumano();
    world.store.messages.push({
      id: "message-seed-1",
      conversationId: world.conversationId,
      direction: "INBOUND",
      role: "user",
      body: "Quanto custa a Aplicacao 5D?",
      createdAt: new Date("2026-06-08T09:00:00.000Z"),
    });

    world.model.carregar([
      {
        nota: "le catalogo e disponibilidade antes de sugerir, sem preparar nada",
        toolCalls: [
          { id: "call-list", name: "list_services", args: {} },
          {
            id: "call-availability",
            name: "get_availability",
            args: { serviceId: "service-1", startDate: "2026-06-08" },
          },
        ],
      },
      {
        nota: "devolve ate 3 sugestoes em texto, sem nenhuma tool de efeito",
        text: JSON.stringify({
          suggestions: [
            "Oi! A Aplicacao 5D custa R$ 190. Quer que eu veja um horario pra voce?",
            "Tenho horario na segunda as 13:30, se quiser aproveitar.",
          ],
        }),
      },
    ]);

    const result = await world.generateSuggestions();

    // Mesma checagem de `send()`: o roteiro deste turno precisa ter sido
    // todo consumido, senão o caso está afirmando menos do que escreveu.
    expect(world.model.passosPendentes()).toEqual([]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);

    // Alcance de leitura contado: "nada com efeito" não pode ser verdade só
    // porque nada foi tocado.
    expect(world.agenda.membros().length).toBeGreaterThan(0);
    expect(world.agenda.membros()).toEqual(
      expect.arrayContaining(["listActiveServices", "getAvailableSlotsForServices"]),
    );
    expect(world.agenda.effects.createHold).toEqual([]);
    expect(world.agenda.efeitosComConsequencia()).toEqual([]);

    // Nenhuma Message de saída e nenhum rascunho: a sugestão nunca é turno.
    expect(world.store.messages.filter((m) => m.direction === "OUTBOUND")).toEqual([]);
    expect(world.rascunho()).toBeUndefined();

    // Auditoria: AiRun com kind SUGGESTION, nada mais.
    expect(world.aiRuns()).toHaveLength(1);
    expect(world.aiRuns()[0]).toMatchObject({ kind: "SUGGESTION", status: "SUCCEEDED" });
    expect(result.aiRunId).toBe(world.aiRuns()[0]?.id);
  });
});

describe("sugestão recusa mensagem do cliente não textual", () => {
  it("política: sem texto do cliente para embasar, a porta recusa antes de chamar o modelo", async () => {
    const world = cenarioEmAtendimentoHumano();
    // Mídia (imagem, áudio, etc.) grava `body` vazio no estoque — o mesmo
    // formato que `InboundMessageProcessor`/`MessageGraphWorkflow` persistem
    // para uma mensagem sem texto.
    world.store.messages.push({
      id: "message-seed-1",
      conversationId: world.conversationId,
      direction: "INBOUND",
      role: "user",
      body: "",
      createdAt: new Date("2026-06-08T09:00:00.000Z"),
    });

    const result = await world.generateSuggestions();

    expect(result).toEqual({ ok: false, reason: "NO_TEXTUAL_MESSAGE" });
    expect(world.model.calls).toEqual([]);
    expect(world.aiRuns()).toHaveLength(0);
  });

  it("política: recusa com imagem, mesma sem legenda, antes de chamar o modelo (Goal013/WU-05)", async () => {
    const world = cenarioEmAtendimentoHumano();
    world.store.messages.push({
      id: "message-seed-image",
      conversationId: world.conversationId,
      direction: "INBOUND",
      role: "user",
      body: "",
      kind: "IMAGE",
      createdAt: new Date("2026-06-08T09:00:00.000Z"),
    });

    const result = await world.generateSuggestions();

    expect(result).toEqual({ ok: false, reason: "NO_TEXTUAL_MESSAGE" });
    expect(world.model.calls).toEqual([]);
    expect(world.aiRuns()).toHaveLength(0);
  });
});

describe("sugestão aceita a transcrição concluída do último áudio (Goal013/WU-05)", () => {
  it("política: áudio transcrito vale como texto do cliente, marcado como transcrição automática", async () => {
    const world = cenarioEmAtendimentoHumano();
    // Áudio persiste com `body` vazio (mesmo formato do turno normal); o
    // texto vem da transcrição concluída no attachment, não da Message.
    world.store.messages.push({
      id: "message-seed-audio",
      conversationId: world.conversationId,
      direction: "INBOUND",
      role: "user",
      body: "",
      kind: "AUDIO",
      createdAt: new Date("2026-06-08T09:00:00.000Z"),
    });
    world.store.attachments.push({
      id: "attachment-seed-audio",
      tenantId: world.tenantId,
      messageId: "message-seed-audio",
      kind: "AUDIO",
      transcriptStatus: "DONE",
      transcript: "Quanto custa a Aplicacao 5D?",
    });

    world.model.carregar([
      {
        nota: "le disponibilidade antes de sugerir, a partir do audio transcrito",
        toolCalls: [
          {
            id: "call-availability",
            name: "get_availability",
            args: { serviceId: "service-1", startDate: "2026-06-08" },
          },
        ],
      },
      {
        nota: "devolve sugestoes em texto",
        text: JSON.stringify({
          suggestions: ["Tenho horario na segunda as 13:30 para a Aplicacao 5D."],
        }),
      },
    ]);

    const result = await world.generateSuggestions();

    expect(world.model.passosPendentes()).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.length).toBeGreaterThan(0);
    // O texto que chegou ao modelo carrega o marcador de audio transcrito,
    // igual ao turno normal (`AUDIO_TURN_MARKER`), nunca a transcricao crua.
    expect(
      world.model
        .chamada(0)
        .messages.some((message) =>
          message.content.includes("[audio transcrito]"),
        ),
    ).toBe(true);
  });

  it("política: audio sem transcricao concluida (falhou/pendente/nunca chegou) continua sem texto", async () => {
    const world = cenarioEmAtendimentoHumano();
    world.store.messages.push({
      id: "message-seed-audio-failed",
      conversationId: world.conversationId,
      direction: "INBOUND",
      role: "user",
      body: "",
      kind: "AUDIO",
      createdAt: new Date("2026-06-08T09:00:00.000Z"),
    });
    world.store.attachments.push({
      id: "attachment-seed-audio-failed",
      tenantId: world.tenantId,
      messageId: "message-seed-audio-failed",
      kind: "AUDIO",
      transcriptStatus: "FAILED",
      transcript: null,
    });

    const result = await world.generateSuggestions();

    expect(result).toEqual({ ok: false, reason: "NO_TEXTUAL_MESSAGE" });
    expect(world.model.calls).toEqual([]);
  });
});

describe("estilo não muda a sugestão operacional", () => {
  it("política: a mesma transcrição produz o mesmo binding, os mesmos alcances e nenhum efeito nos três estilos", async () => {
    const ESTILOS: AiConversationStyle[] = ["PROFESSIONAL", "BALANCED", "CASUAL"];
    const execucoes = [];

    for (const style of ESTILOS) {
      const world = cenarioEmAtendimentoHumano(style);
      world.store.messages.push({
        id: `message-seed-${style}`,
        conversationId: world.conversationId,
        direction: "INBOUND",
        role: "user",
        body: "Quanto custa a Aplicacao 5D?",
        createdAt: new Date("2026-06-08T09:00:00.000Z"),
      });
      world.model.carregar([
        {
          nota: `le disponibilidade antes de sugerir (estilo ${style})`,
          toolCalls: [
            {
              id: "call-availability",
              name: "get_availability",
              args: { serviceId: "service-1", startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: `devolve sugestoes em texto (estilo ${style})`,
          text: JSON.stringify({
            suggestions: ["Tenho horario na segunda as 13:30 para a Aplicacao 5D."],
          }),
        },
      ]);

      const result = await world.generateSuggestions();
      expect(
        world.model.passosPendentes(),
        `Passos do roteiro nao exercitados no estilo ${style}`,
      ).toEqual([]);
      execucoes.push({ style, world, result });
    }

    const assinaturas = execucoes.map(({ world }) => ({
      toolNames: world.model.chamada(0).toolNames.slice().sort(),
      membros: world.agenda.membros(),
      efeitos: world.agenda.efeitosComConsequencia(),
      createHold: world.agenda.effects.createHold,
    }));

    // A transcrição precisa ter feito alguma coisa, senão comparar nadas
    // iguais não prova nada.
    expect(assinaturas[0].membros.length).toBeGreaterThan(0);
    expect(assinaturas[1]).toEqual(assinaturas[0]);
    expect(assinaturas[2]).toEqual(assinaturas[0]);

    for (const { result } of execucoes) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.suggestions.length).toBeGreaterThan(0);
    }

    // E os três turnos rodaram mesmo com estilos diferentes no prompt.
    const BLOCO_DE_ESTILO: Record<AiConversationStyle, string> = {
      PROFESSIONAL: "Estilo: profissional.",
      BALANCED: "Estilo: equilibrado.",
      CASUAL: "Estilo: descontraido.",
    };
    for (const [index, execucao] of execucoes.entries()) {
      const prompt = execucao.world.model.chamada(0).instructions;
      expect(prompt).toContain(BLOCO_DE_ESTILO[ESTILOS[index]]);
      expect(prompt).toContain("MODO SUGESTAO");
    }
    const versoes = execucoes.map(({ result }) => (result.ok ? result.promptVersion : null));
    expect(new Set(versoes).size).toBe(ESTILOS.length);
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
