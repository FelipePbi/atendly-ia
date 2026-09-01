import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import {
  type AiTenantSettings,
  normalizeAiSettings,
} from "../tenant-config/ai-settings.js";
import {
  type BusinessContext,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";
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
}

export interface UpdateAiTenantConfigInput {
  tenantId: string;
  enabled: boolean;
  tone: "PROFESSIONAL_OBJECTIVE" | "LIGHT_CLOSE";
  promptVersion: string;
  businessContext: BusinessContext;
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
      },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        provider: EVOLUTION_PROVIDER,
        externalInstanceId: input.externalInstanceId,
        displayName: input.displayName,
      },
    });

    await this.prisma.aiTenantConfig.upsert({
      where: { tenantId: input.tenantId },
      update: {},
      create: { tenantId: input.tenantId },
    });

    return connection;
  }

  async updateAiTenantConfig(input: UpdateAiTenantConfigInput) {
    return this.prisma.aiTenantConfig.upsert({
      where: { tenantId: input.tenantId },
      update: {
        enabled: input.enabled,
        tone: input.tone,
        promptVersion: input.promptVersion,
        settings: input.businessContext,
      },
      create: {
        tenantId: input.tenantId,
        enabled: input.enabled,
        tone: input.tone,
        promptVersion: input.promptVersion,
        settings: input.businessContext,
      },
    });
  }

  async resolveEvolutionInbound(input: {
    message: MappedChannelInboundMessage;
    requestId: string;
    businessContext?: BusinessContext;
    aiSettings?: AiTenantSettings;
  }): Promise<ChannelInboundMessage> {
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

    const config = await this.prisma.aiTenantConfig.findUnique({
      where: { tenantId: connection.tenantId },
    });
    const aiSettings = normalizeAiSettings({
      aiEnabled: config?.enabled ?? false,
      tone: config?.tone ?? "LIGHT_CLOSE",
    });

    return {
      ...input.message,
      tenantId: connection.tenantId,
      channelId: connection.id,
      userId: connection.userId,
      requestId: input.requestId,
      businessContext:
        input.businessContext ?? normalizeBusinessContext(config?.settings),
      aiSettings: input.aiSettings ?? aiSettings,
    };
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
