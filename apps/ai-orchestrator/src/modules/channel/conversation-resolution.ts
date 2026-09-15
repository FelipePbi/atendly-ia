import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Identidade da conversa de um canal: o par (vinculo, contato externo).
 *
 * `externalContactId` e o telefone **ja normalizado**, exatamente como o
 * mapeamento de entrada o grava (`EvolutionInboundMapper`); a chave unica
 * `(tenantId, channelId, externalContactId)` e quem garante que dois caminhos
 * nunca criam duas conversas para a mesma pessoa.
 */
export interface ChannelConversationScope {
  tenantId: string;
  channelId: string;
  externalContactId: string;
  customerName?: string | null;
}

export interface ResolvedChannelConversation {
  id: string;
  externalContactId: string;
  customerName: string | null;
}

/** Recorte do Prisma que a resolucao usa. */
export type ConversationResolutionPrisma = Pick<PrismaClient, "conversation">;

/**
 * **A** forma de uma conversa de canal passar a existir.
 *
 * Nasceu dentro do processamento de entrada (`PrismaGraphRuntime`) e foi
 * extraida aqui porque o Goal021 precisa entregar lembrete na mesma conversa
 * em que o cliente responde — e uma segunda forma de criar conversa
 * significaria, na pratica, duas conversas com a mesma pessoa e uma resposta
 * "sim" que chega do lado errado. Quem entrega nao inventa conversa: usa
 * esta.
 *
 * O upsert nao mexe em `status`, `humanHandoff` nem `handoffPausedUntil`: a
 * conversa existente e reencontrada exatamente como esta. Reativar conversa e
 * decisao do turno de entrada (`upsertActiveConversation`), nunca efeito
 * colateral de resolver a identidade.
 */
export async function resolveChannelConversation(
  prisma: ConversationResolutionPrisma,
  scope: ChannelConversationScope,
): Promise<ResolvedChannelConversation> {
  const conversation = await prisma.conversation.upsert({
    where: {
      tenantId_channelId_externalContactId: {
        tenantId: scope.tenantId,
        channelId: scope.channelId,
        externalContactId: scope.externalContactId,
      },
    },
    update: {
      customerName: scope.customerName ?? undefined,
    },
    create: {
      tenantId: scope.tenantId,
      channelId: scope.channelId,
      externalContactId: scope.externalContactId,
      customerName: scope.customerName ?? null,
      state: {},
    },
  });
  return {
    id: conversation.id,
    externalContactId: conversation.externalContactId,
    customerName: conversation.customerName,
  };
}
