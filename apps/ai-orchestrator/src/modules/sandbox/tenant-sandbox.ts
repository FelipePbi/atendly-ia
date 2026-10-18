import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import {
  jidDigits,
  normalizeSandboxPhone,
  SANDBOX_MAX_EXCEPTION_PHONES,
} from "./sandbox-phone.js";

/** Estado do modo sandbox do negocio (D-199). */
export interface TenantSandboxState {
  enabled: boolean;
  /** 55 + DDD + numero, so digitos, sem repeticao. */
  exceptionPhones: string[];
  updatedAt: Date | null;
}

export const SANDBOX_OFF: TenantSandboxState = {
  enabled: false,
  exceptionPhones: [],
  updatedAt: null,
};

/** Codigo da recusa de envio quando o estado do sandbox nao pode ser lido. */
export const SANDBOX_STATE_UNAVAILABLE_CODE = "AI_SANDBOX_STATE_UNAVAILABLE";

/** Codigo da recusa de escrita para negocio ainda sem configuracao projetada. */
export const SANDBOX_CONFIG_NOT_PROJECTED_CODE = "AI_TENANT_CONFIG_NOT_PROJECTED";

export type TenantSandboxPrisma = Pick<PrismaClient, "aiTenantConfig">;

/**
 * Le o estado gravado. Sem linha de configuracao o sandbox nunca foi ligado
 * (ligar cria a linha), entao vale desligado. Erro de leitura sobe: quem
 * envia decide fechar (ver {@link SandboxWhatsAppProvider}).
 */
export async function readTenantSandbox(
  prisma: TenantSandboxPrisma,
  tenantId: string,
): Promise<TenantSandboxState> {
  const row = await prisma.aiTenantConfig.findUnique({
    where: { tenantId },
    select: {
      sandboxEnabled: true,
      sandboxExceptionPhones: true,
      sandboxUpdatedAt: true,
    },
  });
  if (!row) return SANDBOX_OFF;
  return {
    // So `true` liga: valor ausente ou estranho nunca vira sandbox ligado por
    // engano, e a leitura que falha de verdade e erro, nao `false`.
    enabled: row.sandboxEnabled === true,
    exceptionPhones: Array.isArray(row.sandboxExceptionPhones)
      ? row.sandboxExceptionPhones.filter(
          (phone): phone is string => typeof phone === "string",
        )
      : [],
    updatedAt: row.sandboxUpdatedAt ?? null,
  };
}

/** Entrada da escrita: ausente preserva o gravado. */
export interface TenantSandboxUpdate {
  enabled?: boolean;
  exceptionPhones?: string[];
}

/**
 * Normaliza a lista de excecoes. Numero que nao e brasileiro valido e recusado
 * (nunca descartado em silencio: quem digitou precisa saber); repeticao, com
 * ou sem o 9o digito, fica uma vez so.
 */
export function normalizeExceptionPhones(phones: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of phones) {
    const phone = normalizeSandboxPhone(raw);
    if (!phone) {
      throw new AppError("Sandbox exception phone is not a valid number.", {
        statusCode: 400,
        code: "AI_SANDBOX_INVALID_PHONE",
      });
    }
    const key = phone.length === 13 ? `${phone.slice(0, 4)}${phone.slice(5)}` : phone;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phone);
  }
  if (result.length > SANDBOX_MAX_EXCEPTION_PHONES) {
    throw new AppError("Too many sandbox exception phones.", {
      statusCode: 400,
      code: "AI_SANDBOX_TOO_MANY_EXCEPTIONS",
      details: { max: SANDBOX_MAX_EXCEPTION_PHONES },
    });
  }
  return result;
}

export async function writeTenantSandbox(
  prisma: TenantSandboxPrisma,
  tenantId: string,
  update: TenantSandboxUpdate,
  now: Date = new Date(),
): Promise<TenantSandboxState> {
  const exceptionPhones =
    update.exceptionPhones === undefined
      ? undefined
      : normalizeExceptionPhones(update.exceptionPhones);
  const data = {
    ...(update.enabled === undefined ? {} : { sandboxEnabled: update.enabled }),
    ...(exceptionPhones === undefined
      ? {}
      : { sandboxExceptionPhones: exceptionPhones }),
    sandboxUpdatedAt: now,
  };
  // So atualiza: a linha nasce da projecao do BFF (ou do vinculo do canal).
  // Cria-la aqui faria `GET /internal/ai-tenant-config` deixar de devolver
  // `null` para um negocio nunca projetado, e a reconciliacao do BFF trata
  // esse `null` como "projetar tudo". Quem recebe a recusa projeta e repete.
  const existing = await prisma.aiTenantConfig.findUnique({
    where: { tenantId },
    select: { tenantId: true },
  });
  if (!existing) {
    throw new AppError("AI tenant config has not been projected yet.", {
      statusCode: 409,
      code: SANDBOX_CONFIG_NOT_PROJECTED_CODE,
    });
  }
  const row = await prisma.aiTenantConfig.update({
    where: { tenantId },
    data,
    select: {
      sandboxEnabled: true,
      sandboxExceptionPhones: true,
      sandboxUpdatedAt: true,
    },
  });
  return {
    enabled: row.sandboxEnabled,
    exceptionPhones: row.sandboxExceptionPhones,
    updatedAt: row.sandboxUpdatedAt,
  };
}

export type SandboxRecipientPrisma = Pick<PrismaClient, "message">;

/** Quantas mensagens recebidas o resolvedor de LID olha, das mais novas. */
const LID_LOOKUP_LIMIT = 20;

/**
 * Telefone do destinatario, para comparar com as excecoes.
 *
 * O destino do envio (`to`) e o `externalContactId` da conversa: o telefone
 * quando o WhatsApp o mandou, ou os digitos do LID (`...@lid`) quando nao
 * mandou (ver `resolveContactJid` em `EvolutionInboundMapper`). Os digitos
 * sozinhos nao dizem qual dos dois sao, entao a pergunta vai as mensagens
 * recebidas do proprio negocio, do mesmo jeito que o mapper resolve:
 *
 * - nenhuma mensagem com chat ou remetente `<digitos>@lid` → nao e LID, e o
 *   proprio numero (lembrete com o telefone da agenda cai aqui);
 * - e LID → o telefone e o `SenderAlt` (recebida) ou `RecipientAlt` (enviada
 *   pelo proprio numero) de alguma dessas mensagens;
 * - e LID sem telefone conhecido → `null`: quem chama trata como fora das
 *   excecoes (bloqueia).
 */
export async function resolveSandboxRecipientPhone(
  prisma: SandboxRecipientPrisma,
  tenantId: string,
  to: string,
): Promise<string | null> {
  const digits = jidDigits(to);
  if (!digits) return null;
  const lidJid = `${digits}@lid`;
  const rows = await prisma.message.findMany({
    where: {
      tenantId,
      OR: [
        { rawPayload: { path: ["data", "Info", "Chat"], equals: lidJid } },
        { rawPayload: { path: ["data", "Info", "Sender"], equals: lidJid } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: LID_LOOKUP_LIMIT,
    select: { rawPayload: true },
  });
  if (rows.length === 0) return digits;
  for (const row of rows) {
    const phone = alternatePhone(row.rawPayload);
    if (phone) return phone;
  }
  return null;
}

function alternatePhone(raw: unknown): string | null {
  const info = recordAt(recordAt(raw, "data"), "Info");
  if (!info) return null;
  // So o lado do contato, como o mapper: na mensagem enviada pelo proprio
  // numero, `SenderAlt` e o telefone da profissional — que costuma estar nas
  // excecoes — e usa-lo faria a mensagem sair para a cliente.
  const alternate = info.IsFromMe === true ? info.RecipientAlt : info.SenderAlt;
  if (typeof alternate !== "string" || !alternate.endsWith("@s.whatsapp.net")) {
    return null;
  }
  return jidDigits(alternate) || null;
}

function recordAt(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "object" && next !== null && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : undefined;
}
