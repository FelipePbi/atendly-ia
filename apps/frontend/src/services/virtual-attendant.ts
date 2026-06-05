import "server-only";

import type { Conversation, PersonaConversationImport, UserSettings, WhatsAppInstance } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import {
  buildPromptPreview,
  cleanVirtualAttendantText,
  getVirtualAttendantReadinessIssues,
  type ApiVirtualAttendantSettings,
  type CustomPersonaProfile,
  type CustomPersonaStatus,
  type PromptPreview,
  type VirtualAttendantSettingsPatch,
} from "@/lib/virtual-attendant";
import { prisma } from "@/lib/prisma";
import type { ApiBusinessSettings } from "@/lib/business-settings";

const MIN_CUSTOM_PERSONA_FILES = 3;
const MAX_TXT_FILE_SIZE_BYTES = 1_500_000;

type SettingsRecord = UserSettings & {
  identityMode?: string | null;
  assistantName?: string | null;
  assistantSex?: string | null;
  professionalSex?: string | null;
  personaType?: string | null;
  customInstructions?: string | null;
  activationMode?: string | null;
  awayTimeoutMinutes?: number | null;
  awayScope?: string | null;
  customPersonaStatus?: string | null;
  customPersonaProfileJson?: unknown;
  customPersonaGeneratedAt?: Date | null;
  virtualAttendantOnboardingCompleted?: boolean | null;
};

type ParsedWhatsAppMessage = {
  author: string;
  text: string;
};

type ParsedConversationFile = {
  fileName: string;
  fileSize: number;
  messages: ParsedWhatsAppMessage[];
  participants: string[];
};

export type PersonaImportDto = {
  id: string;
  fileName: string;
  fileSize: number | null;
  status: CustomPersonaStatus;
  extractedCount: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export type PersonaImportResult = {
  settings: ApiVirtualAttendantSettings;
  imports: PersonaImportDto[];
  importedCount: number;
  requiredCount: number;
  participantSelectionRequired: boolean;
  participants: string[];
  error?: string;
};

export type VirtualAttendantEligibility = {
  allowed: boolean;
  reason:
    | "allowed"
    | "ai_disabled"
    | "settings_incomplete"
    | "custom_persona_not_ready"
    | "away_timeout_not_reached";
  metadata?: Record<string, unknown>;
};

export async function getVirtualAttendantSettingsForUser(userId: string): Promise<SettingsRecord> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      aiEnabled: false,
      identityMode: "PROFESSIONAL",
      professionalSex: "FEMALE",
      activationMode: "ALWAYS",
      customPersonaStatus: "NOT_STARTED",
    },
  }) as Promise<SettingsRecord>;
}

export function virtualAttendantSettingsDto(settings: SettingsRecord | null | undefined): ApiVirtualAttendantSettings {
  const customPersonaProfile = parseCustomPersonaProfile(settings?.customPersonaProfileJson);
  const dto: ApiVirtualAttendantSettings = {
    aiEnabled: Boolean(settings?.aiEnabled),
    identityMode: settings?.identityMode === "SEPARATE_ASSISTANT" ? "SEPARATE_ASSISTANT" : "PROFESSIONAL",
    assistantName: settings?.assistantName?.trim() ?? "",
    assistantSex: settings?.assistantSex === "FEMALE" || settings?.assistantSex === "MALE" ? settings.assistantSex : null,
    professionalSex: settings?.professionalSex === "MALE" ? "MALE" : "FEMALE",
    personaType: isPersonaType(settings?.personaType) ? settings.personaType : null,
    customInstructions: settings?.customInstructions?.trim() ?? "",
    activationMode: settings?.activationMode === "AWAY_FROM_WHATSAPP" ? "AWAY_FROM_WHATSAPP" : "ALWAYS",
    awayTimeoutMinutes: settings?.awayTimeoutMinutes ?? null,
    awayScope: isAwayScope(settings?.awayScope) ? settings.awayScope : null,
    customPersonaStatus: isCustomPersonaStatus(settings?.customPersonaStatus)
      ? settings.customPersonaStatus
      : "NOT_STARTED",
    customPersonaProfile,
    customPersonaGeneratedAt: settings?.customPersonaGeneratedAt?.toISOString() ?? null,
    virtualAttendantOnboardingCompleted: Boolean(settings?.virtualAttendantOnboardingCompleted),
    configured: false,
    canEnable: false,
    readinessIssues: [],
    updatedAt: settings?.updatedAt?.toISOString() ?? null,
  };
  dto.readinessIssues = getVirtualAttendantReadinessIssues(dto);
  dto.configured = dto.readinessIssues.length === 0;
  dto.canEnable = dto.configured;
  return dto;
}

export async function updateVirtualAttendantSettingsForUser(
  userId: string,
  patch: VirtualAttendantSettingsPatch
): Promise<SettingsRecord> {
  const current = virtualAttendantSettingsDto(await getVirtualAttendantSettingsForUser(userId));
  const next = {
    ...current,
    ...patch,
    assistantName:
      patch.assistantName !== undefined ? cleanVirtualAttendantText(patch.assistantName) : current.assistantName,
    assistantSex: patch.assistantSex === undefined ? current.assistantSex : patch.assistantSex,
    professionalSex: patch.professionalSex ?? current.professionalSex,
    identityMode: patch.identityMode ?? current.identityMode,
    customInstructions:
      patch.customInstructions !== undefined
        ? sanitizeCustomInstructions(patch.customInstructions)
        : current.customInstructions,
    personaType: patch.personaType === undefined ? current.personaType : patch.personaType,
    awayScope: patch.awayScope === undefined ? current.awayScope : patch.awayScope,
    awayTimeoutMinutes:
      patch.awayTimeoutMinutes === undefined ? current.awayTimeoutMinutes : patch.awayTimeoutMinutes,
    activationMode: patch.activationMode ?? current.activationMode,
    virtualAttendantOnboardingCompleted:
      patch.virtualAttendantOnboardingCompleted ?? current.virtualAttendantOnboardingCompleted,
  };

  if (next.activationMode === "ALWAYS") {
    next.awayTimeoutMinutes = null;
    next.awayScope = null;
  }

  const readinessIssues = getVirtualAttendantReadinessIssues({
    assistantName: next.assistantName,
    assistantSex: next.assistantSex,
    identityMode: next.identityMode,
    personaType: next.personaType,
    activationMode: next.activationMode,
    awayTimeoutMinutes: next.awayTimeoutMinutes,
    awayScope: next.awayScope,
    customPersonaStatus: current.customPersonaStatus,
  });

  if ((next.aiEnabled || next.virtualAttendantOnboardingCompleted) && readinessIssues.length > 0) {
    throw new ApiError(readinessIssues[0], 409, { readinessIssues });
  }

  return prisma.userSettings.upsert({
    where: { userId },
    update: {
      aiEnabled: next.aiEnabled,
      identityMode: next.identityMode,
      assistantName: next.assistantName || null,
      assistantSex: next.assistantSex,
      professionalSex: next.professionalSex,
      personaType: next.personaType,
      customInstructions: next.customInstructions || null,
      activationMode: next.activationMode,
      awayTimeoutMinutes: next.awayTimeoutMinutes,
      awayScope: next.awayScope,
      virtualAttendantOnboardingCompleted: next.virtualAttendantOnboardingCompleted,
    },
    create: {
      userId,
      aiEnabled: next.aiEnabled,
      identityMode: next.identityMode,
      assistantName: next.assistantName || null,
      assistantSex: next.assistantSex,
      professionalSex: next.professionalSex,
      personaType: next.personaType,
      customInstructions: next.customInstructions || null,
      activationMode: next.activationMode,
      awayTimeoutMinutes: next.awayTimeoutMinutes,
      awayScope: next.awayScope,
      customPersonaStatus: "NOT_STARTED",
      virtualAttendantOnboardingCompleted: next.virtualAttendantOnboardingCompleted,
    },
  }) as Promise<SettingsRecord>;
}

export async function buildVirtualAttendantPromptPreviewForUser(input: {
  userId: string;
  businessSettings?: ApiBusinessSettings | null;
}): Promise<PromptPreview> {
  const settings = virtualAttendantSettingsDto(await getVirtualAttendantSettingsForUser(input.userId));
  return buildPromptPreview({ settings, businessSettings: input.businessSettings });
}

export async function recordOwnerManualActivity(input: {
  instanceId: string;
  conversationId: string;
  happenedAt?: Date;
}) {
  const happenedAt = input.happenedAt ?? new Date();
  await prisma.$transaction([
    prisma.whatsAppInstance.update({
      where: { id: input.instanceId },
      data: { lastOwnerActivityAt: happenedAt },
    }),
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastOwnerActivityAt: happenedAt },
    }),
  ]);
}

export function checkVirtualAttendantEligibility(input: {
  settings: SettingsRecord | ApiVirtualAttendantSettings | null | undefined;
  instance: (WhatsAppInstance & { lastOwnerActivityAt?: Date | null }) | null | undefined;
  conversation: (Conversation & { lastOwnerActivityAt?: Date | null }) | null | undefined;
  now?: Date;
}): VirtualAttendantEligibility {
  const settings =
    input.settings && "readinessIssues" in input.settings
      ? input.settings
      : virtualAttendantSettingsDto(input.settings as SettingsRecord | null | undefined);

  if (!settings.aiEnabled) {
    return { allowed: false, reason: "ai_disabled" };
  }

  const readinessIssues = getVirtualAttendantReadinessIssues(settings);
  if (readinessIssues.length > 0) {
    return {
      allowed: false,
      reason: settings.personaType === "CUSTOM" ? "custom_persona_not_ready" : "settings_incomplete",
      metadata: { readinessIssues },
    };
  }

  if (settings.activationMode !== "AWAY_FROM_WHATSAPP") {
    return { allowed: true, reason: "allowed" };
  }

  const timeoutMinutes = settings.awayTimeoutMinutes;
  if (!timeoutMinutes || timeoutMinutes < 1 || !settings.awayScope) {
    return {
      allowed: false,
      reason: "settings_incomplete",
      metadata: { readinessIssues: ["Configuração de ausência incompleta."] },
    };
  }

  const lastActivity =
    settings.awayScope === "GLOBAL" ? input.instance?.lastOwnerActivityAt : input.conversation?.lastOwnerActivityAt;
  if (!lastActivity) {
    return { allowed: true, reason: "allowed" };
  }

  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - lastActivity.getTime();
  const requiredMs = timeoutMinutes * 60_000;
  if (elapsedMs < requiredMs) {
    return {
      allowed: false,
      reason: "away_timeout_not_reached",
      metadata: {
        awayScope: settings.awayScope,
        awayTimeoutMinutes: timeoutMinutes,
        lastOwnerActivityAt: lastActivity.toISOString(),
        remainingSeconds: Math.ceil((requiredMs - elapsedMs) / 1000),
      },
    };
  }

  return { allowed: true, reason: "allowed" };
}

export async function listPersonaImportsForUser(userId: string): Promise<PersonaImportDto[]> {
  const imports = await prisma.personaConversationImport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return imports.map(personaImportDto);
}

export async function importPersonaConversations(input: {
  userId: string;
  files: File[];
  participantName?: string | null;
  businessName?: string | null;
  professionalName?: string | null;
}): Promise<PersonaImportResult> {
  await prisma.userSettings.upsert({
    where: { userId: input.userId },
    update: { customPersonaStatus: "PROCESSING" },
    create: {
      userId: input.userId,
      aiEnabled: false,
      activationMode: "ALWAYS",
      customPersonaStatus: "PROCESSING",
    },
  });

  const parsedFiles: ParsedConversationFile[] = [];
  const importRows: Array<{
    fileName: string;
    fileSize: number | null;
    status: CustomPersonaStatus;
    extractedCount: number | null;
    errorMessage: string | null;
  }> = [];

  for (const file of input.files) {
    const fileName = normalizeFileName(file.name);
    const fileSize = file.size;

    if (!fileName.toLowerCase().endsWith(".txt")) {
      importRows.push({
        fileName,
        fileSize,
        status: "FAILED",
        extractedCount: 0,
        errorMessage: "Envie somente arquivos .txt exportados do WhatsApp.",
      });
      continue;
    }

    if (fileSize > MAX_TXT_FILE_SIZE_BYTES) {
      importRows.push({
        fileName,
        fileSize,
        status: "FAILED",
        extractedCount: 0,
        errorMessage: "Arquivo TXT maior que o limite técnico permitido.",
      });
      continue;
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    const parsed = parseWhatsAppTxtExport(fileName, fileSize, text);
    if (parsed.messages.length === 0) {
      importRows.push({
        fileName,
        fileSize,
        status: "FAILED",
        extractedCount: 0,
        errorMessage: "Não foi possível encontrar mensagens textuais legíveis no arquivo.",
      });
      continue;
    }

    parsedFiles.push(parsed);
    importRows.push({
      fileName,
      fileSize,
      status: "PROCESSING",
      extractedCount: parsed.messages.length,
      errorMessage: null,
    });
  }

  if (parsedFiles.length < MIN_CUSTOM_PERSONA_FILES) {
    const imports = await persistPersonaImportRows(input.userId, markValidRows(importRows, "WAITING_UPLOADS"));
    const settings = await prisma.userSettings.update({
      where: { userId: input.userId },
      data: {
        customPersonaStatus: "WAITING_UPLOADS",
        customPersonaProfileJson: undefined,
        customPersonaGeneratedAt: null,
      },
    });

    return {
      settings: virtualAttendantSettingsDto(settings as SettingsRecord),
      imports,
      importedCount: parsedFiles.length,
      requiredCount: MIN_CUSTOM_PERSONA_FILES,
      participantSelectionRequired: false,
      participants: collectParticipants(parsedFiles),
      error: "Importe pelo menos 3 conversas TXT válidas.",
    };
  }

  const ownerParticipant = resolveOwnerParticipant({
    parsedFiles,
    participantName: input.participantName,
    businessName: input.businessName,
    professionalName: input.professionalName,
  });

  if (!ownerParticipant) {
    const imports = await persistPersonaImportRows(input.userId, markValidRows(importRows, "NEEDS_PARTICIPANT"));
    const settings = await prisma.userSettings.update({
      where: { userId: input.userId },
      data: {
        customPersonaStatus: "NEEDS_PARTICIPANT",
        customPersonaProfileJson: undefined,
        customPersonaGeneratedAt: null,
      },
    });

    return {
      settings: virtualAttendantSettingsDto(settings as SettingsRecord),
      imports,
      importedCount: parsedFiles.length,
      requiredCount: MIN_CUSTOM_PERSONA_FILES,
      participantSelectionRequired: true,
      participants: collectParticipants(parsedFiles),
    };
  }

  const ownerMessages = parsedFiles.flatMap((file) =>
    file.messages.filter((message) => sameParticipant(message.author, ownerParticipant)).map((message) => message.text)
  );
  const profile = buildCustomPersonaProfile(ownerMessages);

  const imports = await persistPersonaImportRows(input.userId, markValidRows(importRows, "READY"));
  const settings = await prisma.userSettings.update({
    where: { userId: input.userId },
    data: {
      personaType: "CUSTOM",
      customPersonaStatus: "READY",
      customPersonaProfileJson: profile,
      customPersonaGeneratedAt: new Date(),
    },
  });

  return {
    settings: virtualAttendantSettingsDto(settings as SettingsRecord),
    imports,
    importedCount: parsedFiles.length,
    requiredCount: MIN_CUSTOM_PERSONA_FILES,
    participantSelectionRequired: false,
    participants: collectParticipants(parsedFiles),
  };
}

export async function ensureCustomPersonaGeneration(userId: string): Promise<ApiVirtualAttendantSettings> {
  const settings = await getVirtualAttendantSettingsForUser(userId);
  const dto = virtualAttendantSettingsDto(settings);
  if (dto.customPersonaStatus === "READY" && dto.customPersonaProfile) {
    return dto;
  }

  throw new ApiError("Importe pelo menos 3 arquivos TXT válidos para gerar a persona personalizada.", 409, {
    customPersonaStatus: dto.customPersonaStatus,
  });
}

function personaImportDto(row: PersonaConversationImport): PersonaImportDto {
  return {
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    status: isCustomPersonaStatus(row.status) ? row.status : "FAILED",
    extractedCount: row.extractedCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

async function persistPersonaImportRows(
  userId: string,
  rows: Array<{
    fileName: string;
    fileSize: number | null;
    status: CustomPersonaStatus;
    extractedCount: number | null;
    errorMessage: string | null;
  }>
): Promise<PersonaImportDto[]> {
  await prisma.personaConversationImport.createMany({
    data: rows.map((row) => ({
      userId,
      ...row,
    })),
  });
  return listPersonaImportsForUser(userId);
}

function markValidRows(
  rows: Array<{
    fileName: string;
    fileSize: number | null;
    status: CustomPersonaStatus;
    extractedCount: number | null;
    errorMessage: string | null;
  }>,
  status: CustomPersonaStatus
) {
  return rows.map((row) => (row.status === "PROCESSING" ? { ...row, status } : row));
}

function parseCustomPersonaProfile(value: unknown): CustomPersonaProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<CustomPersonaProfile>;
  if (typeof record.generatedPersonaInstructions !== "string") return null;

  return {
    greetingStyle: String(record.greetingStyle ?? ""),
    formalityLevel:
      record.formalityLevel === "formal" || record.formalityLevel === "informal" ? record.formalityLevel : "balanced",
    emojiUsage:
      record.emojiUsage === "none" ||
      record.emojiUsage === "low" ||
      record.emojiUsage === "moderate" ||
      record.emojiUsage === "high"
        ? record.emojiUsage
        : "low",
    commonExpressions: Array.isArray(record.commonExpressions) ? record.commonExpressions.map(String).slice(0, 12) : [],
    schedulingStyle: String(record.schedulingStyle ?? ""),
    objectionHandlingStyle: String(record.objectionHandlingStyle ?? ""),
    closingStyle: String(record.closingStyle ?? ""),
    persuasionStyle: String(record.persuasionStyle ?? ""),
    messageLengthPreference:
      record.messageLengthPreference === "short" || record.messageLengthPreference === "long"
        ? record.messageLengthPreference
        : "medium",
    doList: Array.isArray(record.doList) ? record.doList.map(String).slice(0, 12) : [],
    avoidList: Array.isArray(record.avoidList) ? record.avoidList.map(String).slice(0, 12) : [],
    generatedPersonaInstructions: record.generatedPersonaInstructions,
  };
}

function sanitizeCustomInstructions(value: string | null | undefined): string {
  return cleanVirtualAttendantText(value)
    .replace(/\b(ignore|ignorar)\s+(todas\s+)?(as\s+)?regras\b/gi, "")
    .replace(/\b(sem|não|nao)\s+consultar\s+disponibilidade\b/gi, "")
    .trim();
}

function parseWhatsAppTxtExport(fileName: string, fileSize: number, content: string): ParsedConversationFile {
  const messages: ParsedWhatsAppMessage[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let current: ParsedWhatsAppMessage | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isWhatsAppSystemLine(line)) continue;

    const parsed = parseWhatsAppMessageLine(line);
    if (parsed) {
      if (!isIgnoredMessageText(parsed.text)) {
        current = parsed;
        messages.push(parsed);
      } else {
        current = null;
      }
      continue;
    }

    if (current && !isIgnoredMessageText(line)) {
      current.text = `${current.text}\n${line}`.trim();
    }
  }

  return {
    fileName,
    fileSize,
    messages,
    participants: [...new Set(messages.map((message) => message.author))],
  };
}

function parseWhatsAppMessageLine(line: string): ParsedWhatsAppMessage | null {
  const patterns = [
    /^\[(?:\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?\]\s*([^:]+):\s*(.+)$/u,
    /^(?:\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*([^:]+):\s*(.+)$/u,
    /^(?:\d{4}-\d{2}-\d{2}),?\s+\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*([^:]+):\s*(.+)$/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1] && match[2]) {
      return {
        author: match[1].trim(),
        text: match[2].trim(),
      };
    }
  }

  return null;
}

function isWhatsAppSystemLine(line: string): boolean {
  const normalized = line.toLowerCase();
  return (
    normalized.includes("mensagens e chamadas são protegidas") ||
    normalized.includes("messages and calls are end-to-end encrypted") ||
    normalized.includes("criou este grupo") ||
    normalized.includes("adicionou") ||
    normalized.includes("removeu") ||
    normalized.includes("alterou o assunto") ||
    normalized.includes("código de segurança")
  );
}

function isIgnoredMessageText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("mídia oculta") ||
    normalized.includes("midia oculta") ||
    normalized.includes("image omitted") ||
    normalized.includes("audio omitted") ||
    normalized.includes("video omitted") ||
    normalized.includes("sticker omitted") ||
    normalized.includes("document omitted") ||
    normalized.includes("arquivo anexado") ||
    normalized.includes("<attached:") ||
    normalized === "null"
  );
}

function collectParticipants(files: ParsedConversationFile[]): string[] {
  return [...new Set(files.flatMap((file) => file.participants))].sort((a, b) => a.localeCompare(b));
}

function resolveOwnerParticipant(input: {
  parsedFiles: ParsedConversationFile[];
  participantName?: string | null;
  businessName?: string | null;
  professionalName?: string | null;
}): string | null {
  const participants = collectParticipants(input.parsedFiles);
  if (participants.length === 0) return null;

  const explicit = input.participantName?.trim();
  if (explicit) {
    return participants.find((participant) => sameParticipant(participant, explicit)) ?? null;
  }

  const hints = [input.professionalName, input.businessName].map((value) => normalizeParticipant(value ?? "")).filter(Boolean);
  for (const participant of participants) {
    const normalized = normalizeParticipant(participant);
    if (hints.some((hint) => normalized.includes(hint) || hint.includes(normalized))) {
      return participant;
    }
  }

  return participants.length === 1 ? participants[0] : null;
}

function buildCustomPersonaProfile(messages: string[]): CustomPersonaProfile {
  const cleanMessages = messages.map(cleanVirtualAttendantText).filter(Boolean);
  const totalMessages = cleanMessages.length || 1;
  const averageLength = cleanMessages.reduce((sum, message) => sum + message.length, 0) / totalMessages;
  const emojiCount = cleanMessages.reduce((sum, message) => sum + countEmojis(message), 0);
  const emojiRatio = emojiCount / totalMessages;
  const formalCount = countMatches(cleanMessages, /\b(senhor|senhora|por gentileza|agradeço|estou à disposição)\b/gi);
  const informalCount = countMatches(cleanMessages, /\b(oii+|tá|ta|beleza|combinado|querida|amor|flor)\b/gi);
  const greetingExpressions = topExpressions(
    cleanMessages.filter((message) => /^(oi|olá|ola|bom dia|boa tarde|boa noite|oie|oii)/i.test(message)),
    4
  );
  const commonExpressions = topExpressions(cleanMessages, 8);

  const formalityLevel =
    formalCount > informalCount * 1.4 ? "formal" : informalCount > formalCount * 1.4 ? "informal" : "balanced";
  const emojiUsage = emojiRatio === 0 ? "none" : emojiRatio < 0.25 ? "low" : emojiRatio < 0.8 ? "moderate" : "high";
  const messageLengthPreference = averageLength < 80 ? "short" : averageLength > 180 ? "long" : "medium";

  return {
    greetingStyle: greetingExpressions.length
      ? `Costuma abrir com ${greetingExpressions.join(", ")}.`
      : "Cumprimenta de forma breve, natural e acolhedora.",
    formalityLevel,
    emojiUsage,
    commonExpressions,
    schedulingStyle:
      "Conduz para o agendamento aos poucos, confirmando serviço, dia, horário e valor antes de fechar.",
    objectionHandlingStyle:
      "Responde dúvidas com calma, acolhe inseguranças e evita pressionar a cliente.",
    closingStyle:
      "Finaliza confirmando próximos passos e mantendo abertura para a cliente chamar de novo.",
    persuasionStyle:
      "Usa persuasão leve, baseada em ajuda e clareza, sem prometer disponibilidade não confirmada.",
    messageLengthPreference,
    doList: [
      "Manter português brasileiro natural.",
      "Usar uma pergunta principal por vez.",
      "Adaptar vocabulário às expressões frequentes do negócio.",
      "Confirmar informações antes de agendar.",
    ],
    avoidList: [
      "Copiar mensagens sensíveis das conversas importadas.",
      "Exagerar em emojis ou exclamações.",
      "Inventar preços, serviços, políticas ou disponibilidade.",
      "Repetir o nome da IA em todas as mensagens.",
    ],
    generatedPersonaInstructions: [
      `Use um tom ${formalityLevel === "formal" ? "profissional e claro" : formalityLevel === "informal" ? "leve, próximo e natural" : "equilibrado, simpático e profissional"}.`,
      `Prefira mensagens ${messageLengthPreference === "short" ? "curtas" : messageLengthPreference === "long" ? "mais completas quando necessário" : "médias e objetivas"}.`,
      emojiUsage === "none"
        ? "Evite emojis."
        : emojiUsage === "low"
          ? "Use emojis raramente."
          : emojiUsage === "moderate"
            ? "Use emojis com moderação."
            : "Use emojis com cuidado para não parecer exagerado.",
      commonExpressions.length ? `Expressões recorrentes que podem inspirar o estilo: ${commonExpressions.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function topExpressions(messages: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const firstSentence = cleanVirtualAttendantText(message)
      .split(/[.!?\n]/)[0]
      ?.trim()
      .slice(0, 80);
    if (!firstSentence || firstSentence.length < 3) continue;
    counts.set(firstSentence, (counts.get(firstSentence) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([expression]) => expression);
}

function countMatches(messages: string[], regex: RegExp): number {
  return messages.reduce((sum, message) => sum + (message.match(regex)?.length ?? 0), 0);
}

function countEmojis(value: string): number {
  return value.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
}

function normalizeFileName(value: string): string {
  return value.split(/[\\/]/).at(-1)?.trim() || "conversa.txt";
}

function sameParticipant(left: string, right: string): boolean {
  return normalizeParticipant(left) === normalizeParticipant(right);
}

function normalizeParticipant(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function isPersonaType(value: unknown): value is ApiVirtualAttendantSettings["personaType"] & string {
  return value === "CORPORATE" || value === "WARM" || value === "CUSTOM";
}

function isAwayScope(value: unknown): value is ApiVirtualAttendantSettings["awayScope"] & string {
  return value === "GLOBAL" || value === "CONVERSATION";
}

function isCustomPersonaStatus(value: unknown): value is CustomPersonaStatus {
  return (
    value === "NOT_STARTED" ||
    value === "WAITING_UPLOADS" ||
    value === "PROCESSING" ||
    value === "READY" ||
    value === "FAILED" ||
    value === "NEEDS_PARTICIPANT"
  );
}
