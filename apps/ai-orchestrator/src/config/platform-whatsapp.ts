import { AppError } from "../lib/errors.js";
import { normalizePhone } from "../lib/phone.js";
import { env } from "./env.js";

/**
 * Numero oficial da Atendly: configuracao do servico, nunca vinculo de tenant.
 *
 * `ChannelConnection` e unica por `(tenantId, provider)` e por
 * `(provider, externalInstanceId)`; a instancia da plataforma nao tem dono e
 * nao cabe nessas chaves. Ela e lida daqui, por resolvedor proprio, e nao passa
 * em momento algum pelo caminho que resolve credencial de negocio
 * (`ChannelConnectionService`), que continua saindo exclusivamente da projecao
 * cifrada do vinculo. Vinculo de negocio ausente segue sendo recusa: nao existe
 * queda para a credencial da plataforma.
 */
export const PLATFORM_NUMBER_NOT_CONFIGURED = "PLATFORM_NUMBER_NOT_CONFIGURED";

export interface PlatformWhatsAppConfig {
  /** Instancia oficial no transporte (nao e `externalInstanceId` de ninguem). */
  instanceId: string;
  /** Credencial da instancia oficial. Nunca sai daqui para log ou resposta. */
  credential: string;
  /** Numero da plataforma, so em digitos. */
  number: string;
}

type PlatformEnvKey =
  | "PLATFORM_WHATSAPP_INSTANCE_ID"
  | "PLATFORM_WHATSAPP_CREDENTIAL"
  | "PLATFORM_WHATSAPP_NUMBER";

const REQUIRED_KEYS: PlatformEnvKey[] = [
  "PLATFORM_WHATSAPP_INSTANCE_ID",
  "PLATFORM_WHATSAPP_CREDENTIAL",
  "PLATFORM_WHATSAPP_NUMBER",
];

function missingKeys(): PlatformEnvKey[] {
  return REQUIRED_KEYS.filter((key) => {
    const value = env[key];
    if (typeof value !== "string" || !value.trim()) return true;
    // Numero declarado sem digito nenhum e o mesmo que numero ausente.
    return key === "PLATFORM_WHATSAPP_NUMBER" && !normalizePhone(value);
  });
}

/**
 * Configuracao completa, ou `undefined` quando falta qualquer parte dela.
 *
 * Para quem so precisa decidir se o teste real pode ser oferecido; quem vai
 * executar usa {@link requirePlatformWhatsAppConfig} e recebe a recusa nomeada.
 */
export function readPlatformWhatsAppConfig():
  PlatformWhatsAppConfig | undefined {
  if (missingKeys().length > 0) return undefined;
  return {
    instanceId: env.PLATFORM_WHATSAPP_INSTANCE_ID.trim(),
    credential: env.PLATFORM_WHATSAPP_CREDENTIAL.trim(),
    number: normalizePhone(env.PLATFORM_WHATSAPP_NUMBER),
  };
}

export function isPlatformWhatsAppConfigured(): boolean {
  return missingKeys().length === 0;
}

/**
 * Configuracao da plataforma ou recusa identificavel.
 *
 * Sem configuracao **nao** existe provider silenciosamente inerte: quem pedir o
 * remetente da plataforma recebe `PLATFORM_NUMBER_NOT_CONFIGURED` e o teste real
 * e recusado, em vez de cair na demonstracao ou simular progresso.
 */
export function requirePlatformWhatsAppConfig(): PlatformWhatsAppConfig {
  const missing = missingKeys();
  if (missing.length > 0) {
    throw new AppError(
      "Atendly platform WhatsApp number is not configured for this environment.",
      {
        statusCode: 503,
        code: PLATFORM_NUMBER_NOT_CONFIGURED,
        // Nomes das chaves ausentes, nunca valor: a credencial nao vaza no erro.
        details: { missing },
      },
    );
  }

  return {
    instanceId: env.PLATFORM_WHATSAPP_INSTANCE_ID.trim(),
    credential: env.PLATFORM_WHATSAPP_CREDENTIAL.trim(),
    number: normalizePhone(env.PLATFORM_WHATSAPP_NUMBER),
  };
}
