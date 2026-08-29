import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import {
  type BusinessSettingsDTO,
  normalizeBusinessSettings,
} from "../business-settings/business-settings.js";
import {
  normalizeVirtualAttendantSettings,
  type VirtualAttendantSettingsDTO,
} from "../virtual-attendant/virtual-attendant.js";
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
  businessSettings: BusinessSettingsDTO;
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
        settings: input.businessSettings,
      },
      create: {
        tenantId: input.tenantId,
        enabled: input.enabled,
        tone: input.tone,
        promptVersion: input.promptVersion,
        settings: input.businessSettings,
      },
    });
  }

  async resolveEvolutionInbound(input: {
    message: MappedChannelInboundMessage;
    requestId: string;
    businessSettings?: BusinessSettingsDTO;
    virtualAttendantSettings?: VirtualAttendantSettingsDTO;
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
    const virtualAttendantSettings = normalizeVirtualAttendantSettings({
      aiEnabled: config?.enabled ?? false,
      tone: config?.tone ?? "LIGHT_CLOSE",
    });

    return {
      ...input.message,
      tenantId: connection.tenantId,
      channelId: connection.id,
      userId: connection.userId,
      requestId: input.requestId,
      businessSettings:
        input.businessSettings ?? normalizeBusinessSettings(config?.settings),
      virtualAttendantSettings:
        input.virtualAttendantSettings ?? virtualAttendantSettings,
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
