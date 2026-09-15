import { describe, expect, it } from "vitest";

import {
  ACTIVATION_TEST_CLIENT_NAME,
  type ActivationTestAiDeliverInput,
  ActivationTestAiDriver,
} from "../../src/modules/activation-test/ActivationTestAiDriver.js";
import type {
  ActivationTestReplyDelivery,
  ActivationTestReplyInput,
} from "../../src/modules/activation-test/ActivationTestReplySender.js";
import type {
  AssistantReply,
  IncomingAssistantMessage,
} from "../../src/modules/assistant/assistant.service.js";
import { businessContextConfigured } from "../../src/modules/tenant-config/business-context.js";
import type { TenantExecutionContext } from "../../src/modules/tenant-config/tenant-execution-context.js";

const TENANT = "tenant-activation";
const PLATFORM_NUMBER = "5511911112222";

/** Configuracao real de um negocio que ja preencheu o onboarding. */
const TENANT_CONTEXT: TenantExecutionContext = {
  businessContext: {
    version: 3,
    businessName: "Studio Ana",
    timezone: "America/Sao_Paulo",
    segment: "Beleza",
    modalities: ["ON_SITE"],
    address: "Rua das Flores, 100",
  },
  aiSettings: { aiEnabled: false, tone: "CASUAL" },
};

/**
 * O assistente dublado: guarda o que recebeu e devolve o que a IA teria
 * gravado, incluindo a linha em `PENDING` que `completeGraphTurn` cria.
 *
 * Os dois passos sao dublados separados porque e assim que a producao os
 * expoe: `recordInboundText` grava a fala do cliente e devolve o id **dessa
 * linha**, e `handleBufferedText` roda o turno e devolve o id da linha da IA.
 * Os ids sao diferentes de proposito — e diferentes do id externo da mensagem
 * no WhatsApp — para que um teste consiga distinguir os tres.
 */
class AssistantDouble {
  readonly calls: IncomingAssistantMessage[] = [];
  readonly bufferedCalls: (IncomingAssistantMessage & {
    messageRecordIds: string[];
  })[] = [];
  inboundMessageRecordId = "message-client-1";
  reply: AssistantReply = {
    text: "Corte custa R$ 120,00.",
    conversationId: "conversation-1",
    messageRecordId: "message-ai-1",
    correlationId: "ai-correlation-1",
  };

  async recordInboundText(
    input: IncomingAssistantMessage,
  ): Promise<Pick<AssistantReply, "conversationId" | "messageRecordId">> {
    this.calls.push(input);
    return {
      conversationId: this.reply.conversationId,
      messageRecordId: this.inboundMessageRecordId,
    };
  }

  async handleBufferedText(
    input: IncomingAssistantMessage & { messageRecordIds: string[] },
  ): Promise<AssistantReply> {
    this.bufferedCalls.push(input);
    return this.reply;
  }
}

/** Porta de saida do canal do tenant, dublada: nada toca rede aqui. */
class ReplySenderDouble {
  readonly sends: ActivationTestReplyInput[] = [];
  result: ActivationTestReplyDelivery = { state: "SENT" };

  async sendAiReply(
    input: ActivationTestReplyInput,
  ): Promise<ActivationTestReplyDelivery> {
    this.sends.push(input);
    return this.result;
  }
}

function build(context: TenantExecutionContext = TENANT_CONTEXT) {
  const assistant = new AssistantDouble();
  const replySender = new ReplySenderDouble();
  const tenantContextCalls: string[] = [];
  const driver = new ActivationTestAiDriver({
    assistant,
    tenantContext: async (tenantId) => {
      tenantContextCalls.push(tenantId);
      return context;
    },
    replySender,
    readToolCalls: async () => [],
  });
  return { assistant, driver, replySender, tenantContextCalls };
}

const input: ActivationTestAiDeliverInput = {
  tenantId: TENANT,
  channelId: "channel-1",
  userId: "user-1",
  requestId: "request-1",
  instanceId: "instance-1",
  fromPhone: PLATFORM_NUMBER,
  text: "Oi! Quanto custa Corte?",
  externalMessageId: "external-1",
};

/**
 * A IA precisa receber o contexto do negocio (Goal019, blocker 1 da rodada 2).
 *
 * `prepareGraphTurn` decide pelo `businessContext`: quando ele nao chega,
 * `businessContextConfigured` e falso e **todo** turno vira a decisao imediata
 * de contexto incompleto — a IA nao consulta catalogo, nao consulta agenda e
 * nao confirma agendamento, entao o teste real nunca poderia terminar bem em
 * producao. Estes testes falham se o contexto parar de ser entregue.
 */
describe("o teste real entrega a mensagem com o contexto do negocio", () => {
  it("passa businessContext e aiSettings do tenant, no payload e na chamada", async () => {
    const { assistant, driver, tenantContextCalls } = build();

    await driver.deliver(input);

    expect(tenantContextCalls).toEqual([TENANT]);
    const call = assistant.calls[0];
    expect(call.businessContext).toEqual(TENANT_CONTEXT.businessContext);
    expect(call.aiSettings).toEqual(TENANT_CONTEXT.aiSettings);
    // O mesmo contexto viaja no `ChannelInboundMessage`, como no webhook.
    expect(call.channelMessage?.businessContext).toEqual(
      TENANT_CONTEXT.businessContext,
    );
    expect(call.channelMessage?.aiSettings).toEqual(TENANT_CONTEXT.aiSettings);
  });

  it("o contexto entregue e reconhecido como configurado pelo predicado de producao", async () => {
    const { assistant, driver } = build();

    await driver.deliver(input);

    const call = assistant.calls[0];
    // Esta e a checagem que decide o turno em `prepareGraphTurn`. Sem o
    // contexto ela seria falsa e a IA responderia "contexto incompleto".
    expect(businessContextConfigured(call.businessContext!)).toBe(true);
  });

  it("entrega a mensagem como cliente do tenant, nunca como mensagem do proprio negocio", async () => {
    const { assistant, driver } = build();

    await driver.deliver(input);

    const call = assistant.calls[0];
    expect(call.channelMessage?.fromMe).toBe(false);
    expect(call.channelMessage?.customerName).toBe(ACTIVATION_TEST_CLIENT_NAME);
  });
});

/**
 * A execucao precisa saber o **id da linha** que ela criou (Goal019, blocker 1
 * da rodada 3; criterio 14 e secao 6 do Goal).
 *
 * A limpeza remove `Message` por chave primaria, com os ids que a execucao
 * gravou. Enquanto o turno devolvia o id externo da mensagem no WhatsApp — que
 * em producao e o id do provedor ou o `correlationId` do envio —, nenhuma
 * dessas linhas casava com nada e a fala do cliente simulado ficava para
 * sempre na conversa do negocio. Estes testes falham se o id voltar a ser o
 * externo.
 */
describe("o turno devolve o id das linhas gravadas", () => {
  it("clientMessageId e a linha que a porta de entrada gravou, nao o id externo", async () => {
    const { assistant, driver } = build();

    const turn = await driver.deliver(input);

    expect(turn.clientMessageId).toBe("message-client-1");
    expect(turn.clientMessageId).not.toBe(input.externalMessageId);
    // O id externo continua viajando como id da mensagem no WhatsApp: ele
    // identifica a mensagem no transporte, nao a linha no banco.
    expect(assistant.calls[0].channelMessage?.messageId).toBe(
      input.externalMessageId,
    );
  });

  it("aiMessageId continua sendo a linha que a IA gravou", async () => {
    const { driver } = build();

    const turn = await driver.deliver(input);

    expect(turn.aiMessageId).toBe("message-ai-1");
    expect(turn.clientMessageId).not.toBe(turn.aiMessageId);
  });

  it("o turno roda sobre a linha que acabou de ser gravada", async () => {
    const { assistant, driver } = build();

    await driver.deliver(input);

    // O mesmo encadeamento de `handleIncomingText`: o id gravado entra no
    // turno. Sem isto o `AiRun` apontaria para mensagem nenhuma.
    expect(assistant.bufferedCalls).toHaveLength(1);
    expect(assistant.bufferedCalls[0].messageRecordIds).toEqual([
      "message-client-1",
    ]);
  });
});

/**
 * A resposta da IA sai pelo canal do tenant (Goal019, blocker 2 da rodada 2).
 *
 * `handleIncomingText` grava a resposta em `deliveryState: PENDING` e para ai;
 * o envio e um no do grafo, que este caminho nao executa. Sem o envio daqui, o
 * negocio veria o cliente simulado falando sozinho no proprio WhatsApp.
 */
describe("a resposta da IA sai pelo canal do tenant", () => {
  it("envia a linha que a IA gravou para o numero da plataforma", async () => {
    const { driver, replySender } = build();

    const turn = await driver.deliver(input);

    expect(replySender.sends).toHaveLength(1);
    const sent = replySender.sends[0];
    expect(sent.tenantId).toBe(TENANT);
    expect(sent.channelId).toBe("channel-1");
    expect(sent.messageRecordId).toBe("message-ai-1");
    expect(sent.text).toBe("Corte custa R$ 120,00.");
    // O destino e o cliente simulado — o numero da plataforma —, e o
    // `correlationId` e o da propria linha, para o recibo reconciliar.
    expect(sent.to).toBe(PLATFORM_NUMBER);
    expect(sent.correlationId).toBe("ai-correlation-1");
    expect(turn.aiDelivery).toEqual({ state: "SENT" });
  });

  it("IA silenciosa nao gera envio: nao ha resposta para entregar", async () => {
    const { assistant, driver, replySender } = build();
    assistant.reply = {
      text: "",
      conversationId: "conversation-1",
      messageRecordId: "",
    };

    const turn = await driver.deliver(input);

    expect(replySender.sends).toHaveLength(0);
    expect(turn.aiDelivery).toBeUndefined();
  });

  it("entrega nao confirmada volta como estado, nao como sucesso silencioso", async () => {
    const { driver, replySender } = build();
    replySender.result = { state: "FAILED", detail: "transport_rejected" };

    const turn = await driver.deliver(input);

    expect(turn.aiDelivery).toEqual({
      state: "FAILED",
      detail: "transport_rejected",
    });
  });
});
