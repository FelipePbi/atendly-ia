import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { env } from "../../../config/env.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { channelMessageLogContext } from "../../../lib/diagnostic-log.js";
import { AppError, toErrorMessage } from "../../../lib/errors.js";
import { redactSensitive } from "../../../lib/redact.js";
import {
  buildConversationKey,
  technicalEventDisposition,
} from "../../inbox/inbox-policy.js";
import {
  conversationWindowPolicyFromEnv,
  type InboxPort,
  inboxRetryPolicyFromEnv,
  InboxStore,
} from "../../inbox/InboxStore.js";
import {
  classifyEvolutionEvent,
  inspectEvolutionInboundPayload,
  mapEvolutionInbound,
} from "../adapters/evolution/EvolutionInboundMapper.js";
import { ChannelConnectionService } from "../ChannelConnectionService.js";

export { buildInboundMessageProcessor } from "../inbound-processor-factory.js";

export interface EvolutionWebhookRouteOptions {
  inbox?: InboxPort;
  /** Acorda o loop local sem esperar o próximo tick. Nunca bloqueia o ACK. */
  onEventStored?: () => void;
}

/**
 * Recepção do webhook do Evolution Go.
 *
 * A ordem aqui é o item 1 do Goal004: sanear, classificar, **persistir** e só
 * então responder 202. Antes o ACK vinha primeiro e o processamento seguia numa
 * promise solta — uma queda entre as duas coisas perdia a mensagem do cliente
 * em silêncio, e o produtor já tinha recebido o ACK.
 *
 * Falha ao persistir devolve 5xx, para o produtor retentar. Duplicata devolve
 * 202 sem novo efeito. Evento que não é mensagem também recebe 2xx: recusá-lo
 * com 400 fazia o Go repetir cinco vezes algo que nunca seria aceito.
 */
export async function registerEvolutionWebhookRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  options: EvolutionWebhookRouteOptions = {},
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);
  const inbox = options.inbox ?? new InboxStore(prisma, inboxRetryPolicyFromEnv());

  app.post(
    "/webhooks/evolution",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isValidWebhookToken(request)) {
        app.log.warn(
          { requestId: request.id },
          "Evolution webhook rejected: invalid token",
        );
        return reply.code(401).send({ ok: false, error: "Unauthorized" });
      }

      // Saneamento antes de qualquer mapeamento: o payload que segue adiante —
      // e que termina em `rawPayload` de Message/ProcessedEvent — já não
      // carrega token, apikey nem authorization. Nada aqui é tratado como
      // autoridade: `instanceToken` no corpo é descartado junto.
      const payload = redactSensitive(request.body);
      const classification = classifyEvolutionEvent(payload);

      if (classification.kind === "invalid") {
        const inspection = inspectEvolutionInboundPayload(payload);
        app.log.warn(
          {
            requestId: request.id,
            reason: classification.reason,
            ...inspection,
          },
          "Evolution webhook ignored: payload is not a readable event",
        );
        return reply.code(400).send({
          ok: false,
          error: "Payload did not map to inbound message",
          inspection,
        });
      }

      if (classification.kind !== "message") {
        return await recordNonMessageEvent({
          app,
          reply,
          request,
          inbox,
          channelConnections,
          classification,
          payload,
          onEventStored: options.onEventStored,
        });
      }

      const mappedMessage = mapEvolutionInbound(payload);
      if (!mappedMessage) {
        const inspection = inspectEvolutionInboundPayload(payload);
        app.log.warn(
          { requestId: request.id, ...inspection },
          "Evolution webhook ignored: payload did not map to inbound message",
        );
        return reply.code(400).send({
          ok: false,
          error: "Payload did not map to inbound message",
          inspection,
        });
      }

      let message;
      try {
        ({ message } = await channelConnections.resolveEvolutionInboundContext({
          message: mappedMessage,
          requestId: request.id,
        }));
      } catch (error) {
        return replyUnavailableOwner({ app, reply, request, error });
      }

      const conversationKey = buildConversationKey({
        tenantId: message.tenantId,
        channelId: message.channelId,
        externalContactId: message.customerPhone,
      });

      // Nada de ACK sem linha gravada: se este await falhar, o erro sobe e o
      // produtor recebe 5xx para retentar.
      const stored = await inbox.record({
        tenantId: message.tenantId,
        channelId: message.channelId,
        eventKey: classification.eventKey ?? buildFallbackEventKey(message),
        messageId: message.messageId,
        eventType: "message",
        conversationKey,
        rawPayload: payload,
        availableInMs: initialWindowMs(message),
      });

      // Janela da conversa recalculada sobre o que esta gravado: um fragmento
      // novo estende a espera do grupo inteiro, e a primeira mensagem ambigua
      // de um contato sem historico e adiada em vez de respondida na hora.
      // Falhar aqui nao invalida o recebimento — a linha ja esta gravada e o
      // evento sai na janela minima.
      let window: Awaited<ReturnType<InboxPort["applyConversationWindow"]>> =
        null;
      if (!stored.duplicate && isFragmentableText(message)) {
        try {
          window = await inbox.applyConversationWindow({
            tenantId: message.tenantId,
            channelId: message.channelId,
            externalContactId: message.customerPhone,
            conversationKey,
            text: message.text ?? "",
            // Os fragmentos ja gravados sao relidos pelo mesmo mapeador do
            // provedor: e assim que a espera da mensagem ambigua enxerga que o
            // fragmento seguinte continua sendo saudacao.
            fragmentText: (rawPayload) =>
              mapEvolutionInbound(rawPayload)?.text ?? undefined,
            policy: conversationWindowPolicyFromEnv(),
          });
        } catch (error) {
          app.log.warn(
            { requestId: request.id, err: toErrorMessage(error) },
            "Evolution webhook could not extend the conversation window",
          );
        }
      }

      if (!stored.duplicate) {
        // Mensagem nova numa conversa que talvez esteja executando: pede
        // reavaliação da resposta ainda não enviada.
        try {
          await inbox.requestSupersede(conversationKey);
        } catch (error) {
          app.log.warn(
            { requestId: request.id, err: toErrorMessage(error) },
            "Evolution webhook could not flag the conversation for re-evaluation",
          );
        }
      }

      app.log.info(
        {
          requestId: request.id,
          duplicate: stored.duplicate,
          pendingFragments: window?.pendingFragments,
          ambiguousFirstContact: window?.ambiguousFirstContact,
          availableAt: window?.availableAt.toISOString(),
          ...channelMessageLogContext(message),
        },
        stored.duplicate
          ? "Evolution webhook acknowledged a duplicate event without new effect"
          : "Evolution webhook stored the inbound event before acknowledging",
      );

      if (!stored.duplicate) options.onEventStored?.();
      return reply.code(202).send({
        ok: true,
        received: true,
        duplicate: stored.duplicate,
      });
    },
  );
}

async function recordNonMessageEvent(input: {
  app: FastifyInstance;
  reply: FastifyReply;
  request: FastifyRequest;
  inbox: InboxPort;
  channelConnections: ChannelConnectionService;
  classification: ReturnType<typeof classifyEvolutionEvent>;
  payload: unknown;
  onEventStored?: () => void;
}): Promise<FastifyReply> {
  const { classification } = input;
  const isReceipt = classification.kind === "receipt";

  if (!isReceipt && technicalEventDisposition(classification.event) === "discard") {
    input.app.log.info(
      { requestId: input.request.id, event: classification.event },
      "Evolution webhook acknowledged and discarded a technical event by type",
    );
    return input.reply
      .code(202)
      .send({ ok: true, received: true, stored: false });
  }

  let connection;
  try {
    connection = await input.channelConnections.findActiveEvolutionConnection(
      classification.instanceId as string,
    );
  } catch (error) {
    return replyUnavailableOwner({
      app: input.app,
      reply: input.reply,
      request: input.request,
      error,
    });
  }
  const stored = await input.inbox.record({
    tenantId: connection.tenantId,
    channelId: connection.id,
    eventKey: classification.eventKey as string,
    messageId: classification.event ?? "unknown",
    eventType: isReceipt ? "receipt" : "technical",
    // Recibo e evento técnico não pertencem a uma conversa: reconciliam entrega
    // e histórico do canal, e não podem bloquear a fila de nenhuma conversa.
    conversationKey: null,
    rawPayload: input.payload,
    // Recibo vira trabalho — alimenta a reconciliação de entrega. Evento
    // técnico fica registrado, já concluído.
    status: isReceipt ? "RECEIVED" : "IGNORED",
  });

  input.app.log.info(
    {
      requestId: input.request.id,
      event: classification.event,
      kind: classification.kind,
      duplicate: stored.duplicate,
    },
    "Evolution webhook stored a non-message event before acknowledging",
  );

  if (isReceipt && !stored.duplicate) input.onEventStored?.();
  return input.reply.code(202).send({
    ok: true,
    received: true,
    stored: true,
    duplicate: stored.duplicate,
  });
}

/**
 * Instância sem vínculo ativo resolvido: nada pode ser persistido, porque o
 * evento não tem dono. A resposta é 503, não 404 — o vínculo pode estar sendo
 * provisionado neste instante, e 4xx é recusa definitiva para o produtor.
 */
function replyUnavailableOwner(input: {
  app: FastifyInstance;
  reply: FastifyReply;
  request: FastifyRequest;
  error: unknown;
}): FastifyReply {
  if (
    !(input.error instanceof AppError) ||
    input.error.code !== "CHANNEL_CONNECTION_NOT_FOUND"
  ) {
    throw input.error;
  }
  input.app.log.warn(
    { requestId: input.request.id, code: input.error.code },
    "Evolution webhook could not resolve the channel owner; asking the producer to retry",
  );
  return input.reply.code(503).send({
    ok: false,
    error: "Channel connection is not available yet",
    retryable: true,
  });
}

/**
 * Piso da janela, aplicado já no `record`: o evento nunca nasce reivindicável
 * antes da janela mínima. A extensão adaptativa e a espera da mensagem ambígua
 * vêm logo depois, em `applyConversationWindow`, que enxerga os fragmentos já
 * pendentes da mesma conversa.
 */
function initialWindowMs(message: {
  kind: string;
  text?: string;
  fromMe: boolean;
}): number {
  if (!isFragmentableText(message)) return 0;
  return Math.max(0, env.AI_DEBOUNCE_MIN_SECONDS) * 1000;
}

/** Só texto do cliente é agrupável: mídia e saída do dono não esperam janela. */
function isFragmentableText(message: {
  kind: string;
  text?: string;
  fromMe: boolean;
}): boolean {
  return !message.fromMe && message.kind === "text" && Boolean(message.text?.trim());
}

function buildFallbackEventKey(message: {
  provider: string;
  instanceId: string;
  messageId: string;
}): string {
  return `${message.provider}:${message.instanceId}:${message.messageId}`;
}

function isValidWebhookToken(request: FastifyRequest): boolean {
  if (!env.EVOLUTION_WEBHOOK_TOKEN) return false;

  const query = request.query as Record<string, string | undefined>;
  return query.token === env.EVOLUTION_WEBHOOK_TOKEN;
}
