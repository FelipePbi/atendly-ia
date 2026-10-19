import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  CHANNEL_CREDENTIAL_VERSION,
  openChannelCredential,
  sealChannelCredential,
} from "../../lib/channel-credentials.js";
import { AppError } from "../../lib/errors.js";
import type {
  AiConversationStyle,
  AiMessageDelivery,
  AiTenantSettings,
} from "../tenant-config/ai-settings.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
import { loadTenantExecutionContext } from "../tenant-config/tenant-execution-context.js";
import type {
  ChannelInboundMessage,
  MappedChannelInboundMessage,
} from "./domain/ChannelMessage.js";

const EVOLUTION_PROVIDER = "EVOLUTION_GO" as const;

export interface ProvisionEvolutionChannelInput {
  tenantId: string;
  userId: string;
  externalInstanceId: string;
  displayName?: string;
  /**
   * Projeção da credencial da instância, entregue pelo BFF no provisionamento.
   * Guardada cifrada e ligada ao vínculo; é a única origem aceita para o envio.
   */
  instanceCredential: string;
}

export interface UpdateAiTenantConfigInput {
  tenantId: string;
  enabled: boolean;
  tone: AiConversationStyle;
  promptVersion: string;
  businessContext: BusinessContext;
  /** Como as mensagens saem (D-208). Ausente preserva o gravado. */
  messageDelivery?: AiMessageDelivery;
}

export class ChannelConnectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async provisionEvolutionChannel(input: ProvisionEvolutionChannelInput) {
    const existingInstance = await this.prisma.channelConnection.findUnique({
      where: {
        provider_externalInstanceId: {
          provider: EVOLUTION_PROVIDER,
          externalInstanceId: input.externalInstanceId,
        },
      },
    });

    if (existingInstance && existingInstance.tenantId !== input.tenantId) {
      throw new AppError(
        "Evolution instance is already assigned to another tenant.",
        {
          statusCode: 409,
          code: "CHANNEL_INSTANCE_TENANT_CONFLICT",
        },
      );
    }

    const sealed = sealChannelCredential(input.instanceCredential, {
      tenantId: input.tenantId,
      externalInstanceId: input.externalInstanceId,
    });
    const credential = {
      credentialCipher: sealed.envelope,
      credentialKeyId: sealed.keyId,
      credentialVersion: sealed.version,
      credentialRotatedAt: new Date(),
    };

    const connection = await this.prisma.channelConnection.upsert({
      where: {
        tenantId_provider: {
          tenantId: input.tenantId,
          provider: EVOLUTION_PROVIDER,
        },
      },
      update: {
        userId: input.userId,
        externalInstanceId: input.externalInstanceId,
        displayName: input.displayName,
        status: "ACTIVE",
        ...credential,
      },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        provider: EVOLUTION_PROVIDER,
        externalInstanceId: input.externalInstanceId,
        displayName: input.displayName,
        ...credential,
      },
    });

    await this.prisma.aiTenantConfig.upsert({
      where: { tenantId: input.tenantId },
      update: {},
      create: { tenantId: input.tenantId },
    });

    return connection;
  }

  /**
   * Derruba o canal do negocio (Goal025/WU-02).
   *
   * Chamado quando o dono pede a exclusao da conta: a partir daqui o negocio
   * deixa de ter canal ativo, e `supersededByChannelChange` passa a valer para
   * qualquer execucao do teste real que tenha ligado a IA. E assim que a
   * nao-reativacao fica **verificavel** em vez de prometida — nenhum caminho
   * do produto religa a IA sem canal ativo.
   *
   * NAO APAGA A LINHA, de proposito: a purga (WU-05) e que apaga, depois do
   * prazo. Aqui o vinculo so deixa de estar `ACTIVE`, entao cancelar dentro do
   * prazo encontra o historico no lugar — e continua exigindo reconectar o
   * numero e refazer o teste, porque status `INACTIVE` nao volta sozinho.
   *
   * Idempotente: negocio sem canal, ou com canal ja inativo, devolve `0` e nao
   * e erro. Pedir exclusao duas vezes nao "derruba duas vezes".
   */
  async deactivateTenantChannels(tenantId: string): Promise<number> {
    const { count } = await this.prisma.channelConnection.updateMany({
      where: { tenantId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    return count;
  }

  async updateAiTenantConfig(input: UpdateAiTenantConfigInput) {
    return this.prisma.aiTenantConfig.upsert({
      where: { tenantId: input.tenantId },
      update: {
        enabled: input.enabled,
        tone: input.tone,
        promptVersion: input.promptVersion,
        settings: input.businessContext,
        ...(input.messageDelivery
          ? { messageDelivery: input.messageDelivery }
          : {}),
      },
      create: {
        tenantId: input.tenantId,
        enabled: input.enabled,
        tone: input.tone,
        promptVersion: input.promptVersion,
        settings: input.businessContext,
        ...(input.messageDelivery
          ? { messageDelivery: input.messageDelivery }
          : {}),
      },
    });
  }

  async resolveEvolutionInbound(input: {
    message: MappedChannelInboundMessage;
    requestId: string;
    businessContext?: BusinessContext;
    aiSettings?: AiTenantSettings;
  }): Promise<ChannelInboundMessage> {
    return (await this.resolveEvolutionInboundContext(input)).message;
  }

  /**
   * Mesma resolução do inbound, devolvendo também o vínculo persistido: a
   * credencial de resposta sai daqui, não do corpo do evento.
   */
  async resolveEvolutionInboundContext(input: {
    message: MappedChannelInboundMessage;
    requestId: string;
    businessContext?: BusinessContext;
    aiSettings?: AiTenantSettings;
  }): Promise<{
    message: ChannelInboundMessage;
    connection: {
      id: string;
      tenantId: string;
      externalInstanceId: string;
      credentialCipher: string | null;
      credentialVersion: number;
    };
  }> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: {
        provider_externalInstanceId: {
          provider: EVOLUTION_PROVIDER,
          externalInstanceId: input.message.instanceId,
        },
      },
    });

    if (!connection || connection.status !== "ACTIVE") {
      throw new AppError(
        "Active channel connection was not found for Evolution instance.",
        {
          statusCode: 404,
          code: "CHANNEL_CONNECTION_NOT_FOUND",
        },
      );
    }

    // Mesma montagem que a execucao do teste real usa
    // (`loadTenantExecutionContext`): os dois caminhos que entregam mensagem a
    // IA leem o contexto do negocio pelo mesmo lugar, de proposito.
    const { businessContext, aiSettings } = await loadTenantExecutionContext(
      this.prisma,
      connection.tenantId,
    );

    return {
      message: {
        ...input.message,
        tenantId: connection.tenantId,
        channelId: connection.id,
        userId: connection.userId,
        requestId: input.requestId,
        businessContext: input.businessContext ?? businessContext,
        aiSettings: input.aiSettings ?? aiSettings,
      },
      connection,
    };
  }

  /**
   * Vínculo ativo da instância, sem montar contexto de mensagem.
   *
   * Existe para os eventos que não são mensagem: recibo e evento técnico
   * precisam de dono (tenant e canal) para serem persistidos na inbox, mas não
   * têm contato, conversa nem texto para resolver.
   */
  async findActiveEvolutionConnection(externalInstanceId: string): Promise<{
    id: string;
    tenantId: string;
    externalInstanceId: string;
  }> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: {
        provider_externalInstanceId: {
          provider: EVOLUTION_PROVIDER,
          externalInstanceId,
        },
      },
      select: { id: true, tenantId: true, externalInstanceId: true, status: true },
    });
    if (!connection || connection.status !== "ACTIVE") {
      throw new AppError(
        "Active channel connection was not found for Evolution instance.",
        { statusCode: 404, code: "CHANNEL_CONNECTION_NOT_FOUND" },
      );
    }
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      externalInstanceId: connection.externalInstanceId,
    };
  }

  /**
   * Resolve a credencial de envio pelo vínculo, nunca por dado de requisição.
   *
   * Vínculo sem projeção — porque ainda não foi reprovisionado — falha aqui e
   * interrompe o envio. Não existe caminho que caia na chave global nem que
   * aceite um token vindo do corpo do webhook.
   */
  resolveChannelCredential(connection: {
    tenantId: string;
    externalInstanceId: string;
    credentialCipher: string | null;
    credentialVersion: number;
  }): string {
    if (
      !connection.credentialCipher ||
      connection.credentialVersion < CHANNEL_CREDENTIAL_VERSION
    ) {
      throw new AppError(
        "Channel credential is not provisioned for this connection.",
        {
          statusCode: 409,
          code: "CHANNEL_CREDENTIAL_NOT_PROVISIONED",
        },
      );
    }

    return openChannelCredential(connection.credentialCipher, {
      tenantId: connection.tenantId,
      externalInstanceId: connection.externalInstanceId,
    });
  }

  async resolveTenantEvolutionChannel(tenantId: string) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: {
        tenantId_provider: {
          tenantId,
          provider: EVOLUTION_PROVIDER,
        },
      },
    });
    if (!connection || connection.status !== "ACTIVE") {
      throw new AppError("Active Evolution channel was not found for tenant.", {
        statusCode: 404,
        code: "CHANNEL_CONNECTION_NOT_FOUND",
      });
    }
    return connection;
  }
}
