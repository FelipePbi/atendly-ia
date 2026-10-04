import type { AssistantService } from "../assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { TenantExecutionContext } from "../tenant-config/tenant-execution-context.js";
import type {
  ActivationTestReplyDelivery,
  ActivationTestReplyPort,
} from "./ActivationTestReplySender.js";

/**
 * Uma chamada de ferramenta que a IA registrou no turno.
 *
 * `id` e a linha de `AiToolCall`: e ela que serve de fato para o marco. Nao ha
 * aqui nenhum campo que a execucao do teste possa preencher por conta propria
 * — se a IA nao chamou a ferramenta, nao existe linha, e nao existe marco.
 */
export interface ActivationTestAiToolCall {
  id: string;
  name: string;
  status: string;
  result: unknown;
}

/** O que a IA fez com a mensagem do cliente simulado. */
export interface ActivationTestAiTurn {
  /** Mensagem do cliente simulado, gravada pela porta de entrada da IA. */
  clientMessageId: string;
  conversationId: string;
  /** Resposta que a **IA** compos e gravou. Nunca texto do teste. */
  aiMessageId: string;
  aiText: string;
  toolCalls: ActivationTestAiToolCall[];
  /**
   * Entrega da resposta pelo canal do tenant.
   *
   * Ausente so quando nao houve resposta para entregar. Quem decide marco
   * continua lendo o banco; este campo existe para o log e para o dublê nao
   * precisar adivinhar o que aconteceu com o transporte.
   */
  aiDelivery?: ActivationTestReplyDelivery;
}

export interface ActivationTestAiDeliverInput {
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  /** Instancia de WhatsApp do tenant, que recebe a mensagem de teste. */
  instanceId: string;
  /** Numero da plataforma: e dele que a mensagem do cliente simulado chega. */
  fromPhone: string;
  text: string;
  externalMessageId: string;
}

/**
 * A porta por onde o teste real **exercita a IA**.
 *
 * Esta porta existe por uma razao de produto, nao de arquitetura: o Goal019
 * pede prova de que a IA atende, e um teste em que o proprio servico compoe a
 * resposta "da IA" nao prova nada — ele prova que o servico sabe escrever
 * texto. Aqui a mensagem do cliente simulado entra pela mesma porta de entrada
 * de qualquer mensagem, o mesmo agente decide, as mesmas ferramentas escrevem
 * na agenda, e o que volta e o que a IA realmente fez.
 *
 * O dublê que os testes injetam substitui o **modelo**, nunca a maquina de
 * estados: quem decide o que aconteceu continua sendo o registro gravado.
 */
export interface ActivationTestAiPort {
  deliver(input: ActivationTestAiDeliverInput): Promise<ActivationTestAiTurn>;
}

export interface ActivationTestAiDriverDeps {
  /**
   * Porta de entrada da IA, nos dois passos que `handleIncomingText` executa
   * em sequencia: gravar a mensagem que entrou e rodar o turno sobre ela.
   *
   * Sao dois porque o teste precisa do **id da linha do cliente**, e so o
   * primeiro passo devolve esse id; `handleIncomingText` o descarta e devolve
   * apenas a linha da IA. Sem ele a limpeza nao teria o que remover da fala do
   * cliente simulado (Goal019, blocker 1 da rodada 3). O caminho e o mesmo do
   * atendimento real — `handleIncomingText` nao faz nada alem destes dois
   * passos.
   */
  assistant: Pick<AssistantService, "recordInboundText" | "handleBufferedText">;
  /**
   * Contexto do negocio e configuracao da IA do tenant.
   *
   * Obrigatorio. Sem ele `prepareGraphTurn` normaliza um contexto vazio,
   * `businessContextConfigured` fica falso e **todo** turno vira a decisao
   * imediata de contexto incompleto: a IA nao consulta catalogo, nao consulta
   * agenda e nao confirma agendamento nenhum, entao o teste real nunca
   * conseguiria terminar bem em producao (Goal019, blocker 1 da rodada 2).
   */
  tenantContext: (tenantId: string) => Promise<TenantExecutionContext>;
  /**
   * Saida da resposta da IA pelo canal do tenant.
   *
   * Obrigatoria pelo mesmo motivo: a porta de entrada grava a resposta e
   * **nao** envia — o envio e um no do grafo. Sem esta porta a conversa de
   * teste acumula `Message{source: AI, deliveryState: PENDING}` e nada chega
   * ao WhatsApp do negocio (Goal019, blocker 2 da rodada 2).
   */
  replySender: ActivationTestReplyPort;
  /**
   * Leitura das chamadas de ferramenta do turno. Separada do assistente
   * porque o que interessa aqui e o **registro**, nao o retorno em memoria:
   * marco sem linha gravada nao e marco.
   */
  readToolCalls: (input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }) => Promise<ActivationTestAiToolCall[]>;
  now?: () => Date;
}

/**
 * Implementacao de producao: entrega a mensagem a `AssistantService` e le o
 * que a IA registrou.
 *
 * A mensagem chega marcada como vinda do numero da plataforma, que e o
 * "cliente" desta conversa. Nada aqui contorna o caminho normal: nao ha
 * prompt especial, nao ha ferramenta exclusiva do teste e nao ha atalho que
 * pule o agente.
 */
export class ActivationTestAiDriver implements ActivationTestAiPort {
  private readonly assistant: ActivationTestAiDriverDeps["assistant"];
  private readonly tenantContext: ActivationTestAiDriverDeps["tenantContext"];
  private readonly replySender: ActivationTestReplyPort;
  private readonly readToolCalls: ActivationTestAiDriverDeps["readToolCalls"];
  private readonly now: () => Date;

  constructor(deps: ActivationTestAiDriverDeps) {
    this.assistant = deps.assistant;
    this.tenantContext = deps.tenantContext;
    this.replySender = deps.replySender;
    this.readToolCalls = deps.readToolCalls;
    this.now = deps.now ?? (() => new Date());
  }

  async deliver(
    input: ActivationTestAiDeliverInput,
  ): Promise<ActivationTestAiTurn> {
    const since = this.now();
    // O mesmo contexto que o webhook do canal monta para qualquer cliente: o
    // teste nao pode entregar a mensagem com menos informacao do que o
    // atendimento real recebe, senao ele nao prova nada sobre o atendimento.
    const tenant = await this.tenantContext(input.tenantId);
    const channelMessage: ChannelInboundMessage = {
      provider: "evolution-go",
      instanceId: input.instanceId,
      messageId: input.externalMessageId,
      chatId: `${input.fromPhone}@s.whatsapp.net`,
      customerPhone: input.fromPhone,
      customerName: ACTIVATION_TEST_CLIENT_NAME,
      fromMe: false,
      isGroup: false,
      kind: "text",
      text: input.text,
      raw: { activationTest: true },
      tenantId: input.tenantId,
      channelId: input.channelId,
      userId: input.userId,
      requestId: input.requestId,
      businessContext: tenant.businessContext,
      aiSettings: tenant.aiSettings,
    };

    const incoming = {
      phone: input.fromPhone,
      text: input.text,
      channelMessage,
      whatsappMessageId: input.externalMessageId,
      customerName: ACTIVATION_TEST_CLIENT_NAME,
      businessContext: tenant.businessContext,
      aiSettings: tenant.aiSettings,
    };

    // Gravar e rodar o turno, nesta ordem, e exatamente o que
    // `handleIncomingText` faz — aqui os dois passos ficam a vista porque o
    // primeiro devolve o id da linha do cliente, que a execucao precisa
    // registrar para poder remover depois.
    const recorded = await this.assistant.recordInboundText(incoming);
    const reply = await this.assistant.handleBufferedText({
      ...incoming,
      messageRecordIds: [recorded.messageRecordId],
    });

    return {
      // O id da **linha gravada** da fala do cliente, nunca o id externo da
      // mensagem no WhatsApp: a limpeza remove `Message` por chave primaria, e
      // o id externo nunca casaria com nenhuma linha (Goal019, blocker 1 da
      // rodada 3).
      clientMessageId: recorded.messageRecordId,
      conversationId: reply.conversationId,
      aiMessageId: reply.messageRecordId,
      aiText: reply.text,
      toolCalls: await this.readToolCalls({
        tenantId: input.tenantId,
        conversationId: reply.conversationId,
        since,
      }),
      aiDelivery: await this.deliverReply(input, reply),
    };
  }

  /**
   * Entrega a resposta da IA ao cliente simulado, pelo canal do tenant.
   *
   * `handleBufferedText` gravou a linha em `PENDING` e parou ai — o envio e um
   * no do grafo, e o grafo nao roda neste caminho. Enviar aqui e o que faz a
   * conversa de teste existir do lado de fora: sem isto o negocio veria o
   * cliente simulado falando sozinho no proprio WhatsApp.
   *
   * Sem resposta nao ha o que entregar, e isso nao e erro: a IA silenciosa e
   * resultado legitimo, que o passo seguinte transforma em falha nomeada.
   */
  private async deliverReply(
    input: ActivationTestAiDeliverInput,
    reply: {
      conversationId: string;
      messageRecordId: string;
      text: string;
      correlationId?: string;
    },
  ): Promise<ActivationTestReplyDelivery | undefined> {
    if (!reply.messageRecordId || !reply.text.trim()) return undefined;
    return this.replySender.sendAiReply({
      tenantId: input.tenantId,
      channelId: input.channelId,
      conversationId: reply.conversationId,
      messageRecordId: reply.messageRecordId,
      text: reply.text,
      correlationId: reply.correlationId ?? reply.messageRecordId,
      // O destino e o numero da plataforma porque e ele que faz o papel de
      // cliente nesta conversa. Nao ha aqui destino livre.
      to: input.fromPhone,
      quotedMessageId: input.externalMessageId,
      requestId: input.requestId,
    });
  }
}

/** Nome do cliente simulado, o mesmo que a limpeza reconhece pelos IDs. */
export const ACTIVATION_TEST_CLIENT_NAME = "Avenly (teste)";

/** Ferramentas cujo uso sustenta cada marco do vault. */
export const ACTIVATION_TEST_TOOL_NAMES = {
  /** A IA consultou o catalogo para identificar o servico perguntado. */
  SERVICE: "list_services",
  /** A IA consultou a agenda. */
  AVAILABILITY: "get_availability",
  /** A IA confirmou o agendamento. */
  APPOINTMENT: "create_appointment",
} as const;

/**
 * Agendamento criado pela IA, lido do resultado gravado da ferramenta.
 *
 * `null` quando a chamada existiu mas nao confirmou nada — `create_appointment`
 * tambem serve para **preparar**, e preparar nao e confirmar. Ler o id daqui e
 * o que garante que o marco aponta para o agendamento que a IA criou, nao para
 * um que o teste tenha criado por fora.
 */
export function appointmentIdFromToolCall(
  toolCall: ActivationTestAiToolCall,
): string | null {
  if (toolCall.name !== ACTIVATION_TEST_TOOL_NAMES.APPOINTMENT) return null;
  const result = toolCall.result;
  if (typeof result !== "object" || result === null) return null;
  const appointment = (result as Record<string, unknown>).appointment;
  if (typeof appointment !== "object" || appointment === null) return null;
  const id = (appointment as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : null;
}
