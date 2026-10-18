import { randomUUID } from "node:crypto";

import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import type {
  SendTextInput,
  SendTextResult,
} from "../channel/ports/WhatsAppProvider.js";
import { isSandboxException } from "./sandbox-phone.js";
import {
  readTenantSandbox,
  resolveSandboxRecipientPhone,
  SANDBOX_STATE_UNAVAILABLE_CODE,
  type SandboxRecipientPrisma,
  type TenantSandboxPrisma,
  type TenantSandboxState,
} from "./tenant-sandbox.js";

/** Prefixo do id de transporte de toda saida suprimida pelo sandbox. */
export const SANDBOX_MESSAGE_ID_PREFIX = "sandbox-";

/** Por que a saida nao foi ao WhatsApp. Gravado em `rawPayload.avenlySandbox`. */
export type SandboxSuppressionReason =
  | "no_exceptions"
  | "not_exception"
  | "recipient_phone_unknown";

/** O que o sandbox decidiu para um envio. */
export type SandboxDecision =
  | { deliver: true }
  | { deliver: false; reason: SandboxSuppressionReason };

export interface SandboxGateDeps {
  tenantId: string;
  loadState: () => Promise<TenantSandboxState>;
  resolveRecipientPhone: (to: string) => Promise<string | null>;
  logger?: DiagnosticLogger;
  now?: () => Date;
}

/**
 * Modo sandbox do negocio (D-199), na porta do transporte.
 *
 * O `EvolutionProvider` de quem fala com cliente — resposta da IA, mensagem
 * da profissional pelo app, lembrete e aviso de alteracao — recebe um gate e
 * o consulta antes de qualquer outra coisa, envio a envio, lendo o estado
 * gravado na hora (desligar vale no proximo envio, sem cache):
 *
 * - sandbox desligado → segue o envio de sempre, com as travas globais
 *   (`WHATSAPP_OUTBOUND_DISABLED`) intactas;
 * - ligado e destinatario numa excecao → envio real, pelas mesmas travas;
 * - ligado e qualquer outro destinatario (inclusive LID sem telefone
 *   conhecido) → o Evolution Go **nao** e chamado — nem "digitando…", que vai
 *   no mesmo pedido — e o resultado volta como envio feito, com id
 *   `sandbox-…` e a marca em `raw.avenlySandbox`, que vira
 *   `Message.rawPayload`. A linha fica `SENT`, igual a um envio real.
 *
 * Fecha na falha: estado que nao pode ser lido (banco fora, coluna ausente)
 * nao envia de verdade nem finge envio. O erro tem codigo proprio e a saida
 * fica `FAILED` com motivo (`classifySendFailure`): nunca vaza mensagem para
 * cliente de um negocio que pode estar em teste, e nunca mostra sucesso que
 * nao aconteceu.
 */
export class SandboxGate {
  private readonly logger: DiagnosticLogger;
  private readonly now: () => Date;

  constructor(private readonly deps: SandboxGateDeps) {
    this.logger = deps.logger ?? noopDiagnosticLogger;
    this.now = deps.now ?? (() => new Date());
  }

  async decide(to: string): Promise<SandboxDecision> {
    let state: TenantSandboxState;
    try {
      state = await this.deps.loadState();
    } catch (error) {
      this.logger.error(
        {
          tenantId: this.deps.tenantId,
          to: maskPhone(to),
          err: toErrorMessage(error),
        },
        "Sandbox state could not be read; outbound refused (fail closed)",
      );
      throw new AppError("AI sandbox state could not be read.", {
        statusCode: 503,
        code: SANDBOX_STATE_UNAVAILABLE_CODE,
      });
    }
    if (!state.enabled) return { deliver: true };
    if (state.exceptionPhones.length === 0) {
      return { deliver: false, reason: "no_exceptions" };
    }
    let phone: string | null;
    try {
      phone = await this.deps.resolveRecipientPhone(to);
    } catch (error) {
      // Sem saber quem e, nao e excecao: bloquear e o lado seguro.
      this.logger.warn(
        {
          tenantId: this.deps.tenantId,
          to: maskPhone(to),
          err: toErrorMessage(error),
        },
        "Sandbox could not resolve the recipient phone; treating as not an exception",
      );
      phone = null;
    }
    if (!phone) return { deliver: false, reason: "recipient_phone_unknown" };
    return isSandboxException(phone, state.exceptionPhones)
      ? { deliver: true }
      : { deliver: false, reason: "not_exception" };
  }

  /**
   * `null`: o envio segue para o transporte. Resultado: o envio foi
   * suprimido, e e isto que quem enviou recebe no lugar da resposta do Go.
   */
  async intercept(
    input: Pick<SendTextInput, "to" | "correlationId" | "requestId">,
  ): Promise<SendTextResult | null> {
    const decision = await this.decide(input.to);
    if (decision.deliver) return null;
    const messageId = `${SANDBOX_MESSAGE_ID_PREFIX}${input.correlationId ?? randomUUID()}`;
    this.logger.info(
      {
        tenantId: this.deps.tenantId,
        to: maskPhone(input.to),
        correlationId: input.correlationId,
        requestId: input.requestId,
        reason: decision.reason,
        messageId,
      },
      "Sandbox suppressed an outbound WhatsApp message",
    );
    return {
      provider: "evolution-go",
      messageId,
      raw: {
        avenlySandbox: {
          suppressed: true,
          reason: decision.reason,
          suppressedAt: this.now().toISOString(),
        },
      },
    };
  }
}

/**
 * O gate do negocio, lendo o estado e resolvendo LID pelo banco. Os tres
 * pontos que falam com cliente (grafo da IA, mensagem da profissional e
 * lembrete/aviso) montam o `EvolutionProvider` com ele.
 */
export function tenantSandboxGate(input: {
  prisma: TenantSandboxPrisma & SandboxRecipientPrisma;
  tenantId: string;
  logger?: DiagnosticLogger;
}): SandboxGate {
  return new SandboxGate({
    tenantId: input.tenantId,
    logger: input.logger,
    loadState: () => readTenantSandbox(input.prisma, input.tenantId),
    resolveRecipientPhone: (to) =>
      resolveSandboxRecipientPhone(input.prisma, input.tenantId, to),
  });
}
