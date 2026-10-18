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

/**
 * Celular brasileiro com e sem o 9o digito (`55 DD 9XXXX-XXXX` e
 * `55 DD XXXX-XXXX`). Outro numero volta sozinho.
 */
export function brazilianMobileVariants(digits: string): string[] {
  if (!digits.startsWith("55")) return [digits];
  if (digits.length === 13 && digits[4] === "9") {
    return [digits, `${digits.slice(0, 4)}${digits.slice(5)}`];
  }
  // Celular antigo de oito digitos comeca em 6 a 9; fixo (2 a 5) nao tem 9o.
  if (digits.length === 12 && /[6-9]/.test(digits[4] ?? "")) {
    return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`];
  }
  return [digits];
}

/**
 * O numero como o WhatsApp o identifica (o `Chat` que a Evolution devolve):
 * celulares de DDD 11 a 28 levam o 9o digito; de DDD 31 em diante, nao.
 */
export function whatsAppBrazilianKey(digits: string): string {
  const variants = brazilianMobileVariants(digits);
  if (variants.length === 1) return digits;
  const ddd = Number(digits.slice(2, 4));
  const wantsNinth = ddd >= 11 && ddd <= 28;
  return (
    variants.find((variant) => (variant.length === 13) === wantsNinth) ?? digits
  );
}

/**
 * Chave de conversa para um telefone que veio de fora do WhatsApp (a agenda,
 * por exemplo). Em 2026-10-18 lembretes e avisos abriam a conversa pelo
 * telefone da agenda com o 9o digito (`5555999837958`) enquanto o WhatsApp
 * chama a mesma pessoa de `555599837958`: duas conversas com a mesma cliente.
 * Conversa que ja existe em qualquer das duas formas vence; sem nenhuma, vale
 * a forma do WhatsApp.
 */
export async function resolveContactKeyForPhone(
  prisma: ConversationResolutionPrisma,
  scope: { tenantId: string; channelId: string; phone: string },
): Promise<string> {
  const variants = brazilianMobileVariants(scope.phone);
  if (variants.length === 1) return scope.phone;
  const preferred = whatsAppBrazilianKey(scope.phone);
  const existing = await prisma.conversation.findMany({
    where: {
      tenantId: scope.tenantId,
      channelId: scope.channelId,
      externalContactId: { in: variants },
    },
    select: { externalContactId: true },
    orderBy: { updatedAt: "desc" },
  });
  const keys = existing.map((conversation) => conversation.externalContactId);
  if (keys.includes(preferred)) return preferred;
  return keys[0] ?? preferred;
}
