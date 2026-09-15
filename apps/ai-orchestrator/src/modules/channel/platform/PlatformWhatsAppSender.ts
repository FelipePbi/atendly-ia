import {
  type PlatformWhatsAppConfig,
  requirePlatformWhatsAppConfig,
} from "../../../config/platform-whatsapp.js";
import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
} from "../../../lib/diagnostic-log.js";
import { AppError } from "../../../lib/errors.js";
import { normalizePhone } from "../../../lib/phone.js";
import { EvolutionProvider } from "../adapters/evolution/EvolutionProvider.js";
import type {
  SendTextResult,
  WhatsAppProvider,
} from "../ports/WhatsAppProvider.js";

/** Destino invalido para o remetente da plataforma. */
export const PLATFORM_TEST_RECIPIENT_INVALID =
  "PLATFORM_TEST_RECIPIENT_INVALID";

/**
 * Destino do remetente da plataforma: o tenant que esta executando um teste.
 *
 * O numero nao e parametro livre — ele so existe amarrado a uma execucao
 * (`runId`) de um tenant. E por isso que este remetente nao e um caminho
 * generico de envio: nao ha como pedir "envie para este numero" sem afirmar
 * qual execucao de teste justifica o envio.
 */
export interface PlatformTestRecipient {
  tenantId: string;
  /** Execucao do teste real que autoriza o envio. */
  runId: string;
  /** Numero do proprio tenant sob teste. */
  phone: string;
}

export interface PlatformTestMessage {
  text: string;
  correlationId?: string;
  requestId?: string;
}

/**
 * Como o provider da plataforma e construido a partir da configuracao.
 *
 * Existe para os testes trocarem o transporte por um duble da porta sem tocar
 * em rede; o caminho de producao usa o adapter Evolution vigente.
 */
export type PlatformProviderFactory = (
  config: PlatformWhatsAppConfig,
  logger: DiagnosticLogger,
) => WhatsAppProvider;

const defaultProviderFactory: PlatformProviderFactory = (config, logger) =>
  new EvolutionProvider(logger, config.credential, config.instanceId);

/**
 * Remetente do numero oficial da Atendly.
 *
 * Mais um uso da porta `WhatsAppProvider` ja existente, nunca um transporte
 * novo. A credencial vem da configuracao do servico
 * (`config/platform-whatsapp.ts`) e nao tem relacao alguma com a projecao
 * cifrada do vinculo do tenant: este remetente nao consulta banco, nao cria
 * nem le `ChannelConnection` e nao aparece em listagem de conexoes de negocio.
 */
export class PlatformWhatsAppSender {
  constructor(
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly providerFactory: PlatformProviderFactory = defaultProviderFactory,
  ) {}

  /**
   * Envia pelo numero da plataforma para o tenant sob teste.
   *
   * Sem configuracao a chamada e recusada com
   * `PLATFORM_NUMBER_NOT_CONFIGURED` antes de qualquer provider existir.
   */
  async sendToTenantUnderTest(
    recipient: PlatformTestRecipient,
    message: PlatformTestMessage,
  ): Promise<SendTextResult> {
    const config = requirePlatformWhatsAppConfig();
    const to = assertTenantUnderTest(recipient, config);

    this.logger.info(
      {
        tenantId: recipient.tenantId,
        runId: recipient.runId,
        to: maskPhone(to),
        textLength: message.text.length,
        requestId: message.requestId,
      },
      "PlatformWhatsAppSender sending activation test message",
    );

    const provider = this.providerFactory(config, this.logger);
    return provider.sendText({
      to,
      text: message.text,
      correlationId: message.correlationId,
      requestId: message.requestId,
    });
  }
}

function assertTenantUnderTest(
  recipient: PlatformTestRecipient,
  config: PlatformWhatsAppConfig,
): string {
  if (!recipient.tenantId.trim() || !recipient.runId.trim()) {
    throw new AppError(
      "Platform sender requires the tenant and the activation test run that justify the send.",
      { statusCode: 400, code: PLATFORM_TEST_RECIPIENT_INVALID },
    );
  }

  const to = normalizePhone(recipient.phone ?? "");
  if (!to) {
    throw new AppError("Platform sender requires the tenant phone number.", {
      statusCode: 400,
      code: PLATFORM_TEST_RECIPIENT_INVALID,
    });
  }

  // Enviar para o proprio numero da plataforma nao e teste de tenant nenhum:
  // seria o unico destino alcancavel sem um tenant sob teste do outro lado.
  if (to === config.number) {
    throw new AppError(
      "Platform sender only sends to the tenant running an activation test.",
      { statusCode: 400, code: PLATFORM_TEST_RECIPIENT_INVALID },
    );
  }

  return to;
}
