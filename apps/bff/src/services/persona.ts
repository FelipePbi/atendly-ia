import type {
  CustomPersonaStatus,
  PersonaConversationImport,
} from "../generated/prisma/client.js";
import { settingsDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { getPrisma } from "../lib/prisma.js";

const MIN_CUSTOM_PERSONA_FILES = 3;
const MAX_TXT_FILE_SIZE_BYTES = 1_500_000;

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

type CustomPersonaProfile = {
  greetingStyle: string;
  formalityLevel: "formal" | "balanced" | "informal";
  emojiUsage: "none" | "low" | "moderate" | "high";
  commonExpressions: string[];
  schedulingStyle: string;
  objectionHandlingStyle: string;
  closingStyle: string;
  persuasionStyle: string;
  messageLengthPreference: "short" | "medium" | "long";
  doList: string[];
  avoidList: string[];
  generatedPersonaInstructions: string;
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

export async function listPersonaImportsForUser(
  userId: string,
): Promise<PersonaImportDto[]> {
  const imports = await getPrisma().personaConversationImport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return imports.map(personaImportDto);
}

export async function importPersonaConversations(input: {
  userId: string;
  files: Array<{ name: string; size: number; text: string }>;
  participantName?: string | null;
  businessName?: string | null;
  professionalName?: string | null;
}) {
  const prisma = getPrisma();
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
        errorMessage: "Send only WhatsApp .txt export files.",
      });
      continue;
    }

    if (fileSize > MAX_TXT_FILE_SIZE_BYTES) {
      importRows.push({
        fileName,
        fileSize,
        status: "FAILED",
        extractedCount: 0,
        errorMessage: "TXT file exceeds the technical size limit.",
      });
      continue;
    }

    const parsed = parseWhatsAppTxtExport(fileName, fileSize, file.text);
    if (parsed.messages.length === 0) {
      importRows.push({
        fileName,
        fileSize,
        status: "FAILED",
        extractedCount: 0,
        errorMessage: "No readable text messages were found in this file.",
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
    const imports = await persistPersonaImportRows(
      input.userId,
      markValidRows(importRows, "WAITING_UPLOADS"),
    );
    const settings = await prisma.userSettings.update({
      where: { userId: input.userId },
      data: {
        customPersonaStatus: "WAITING_UPLOADS",
        customPersonaProfileJson: undefined,
        customPersonaGeneratedAt: null,
      },
    });

    return {
      settings: settingsDto(settings),
      imports,
      importedCount: parsedFiles.length,
      requiredCount: MIN_CUSTOM_PERSONA_FILES,
      participantSelectionRequired: false,
      participants: collectParticipants(parsedFiles),
      error: "Import at least 3 valid WhatsApp TXT conversations.",
    };
  }

  const ownerParticipant = resolveOwnerParticipant({
    parsedFiles,
    participantName: input.participantName,
    businessName: input.businessName,
    professionalName: input.professionalName,
  });

  if (!ownerParticipant) {
    const imports = await persistPersonaImportRows(
      input.userId,
      markValidRows(importRows, "NEEDS_PARTICIPANT"),
    );
    const settings = await prisma.userSettings.update({
      where: { userId: input.userId },
      data: {
        customPersonaStatus: "NEEDS_PARTICIPANT",
        customPersonaProfileJson: undefined,
        customPersonaGeneratedAt: null,
      },
    });

    return {
      settings: settingsDto(settings),
      imports,
      importedCount: parsedFiles.length,
      requiredCount: MIN_CUSTOM_PERSONA_FILES,
      participantSelectionRequired: true,
      participants: collectParticipants(parsedFiles),
    };
  }

  const ownerMessages = parsedFiles.flatMap((file) =>
    file.messages
      .filter((message) => sameParticipant(message.author, ownerParticipant))
      .map((message) => message.text),
  );
  const profile = buildCustomPersonaProfile(ownerMessages);
  const imports = await persistPersonaImportRows(
    input.userId,
    markValidRows(importRows, "READY"),
  );
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
    settings: settingsDto(settings),
    imports,
    importedCount: parsedFiles.length,
    requiredCount: MIN_CUSTOM_PERSONA_FILES,
    participantSelectionRequired: false,
    participants: collectParticipants(parsedFiles),
  };
}

export async function ensureCustomPersonaGeneration(userId: string) {
  const settings = await getPrisma().userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      aiEnabled: false,
      activationMode: "ALWAYS",
      customPersonaStatus: "NOT_STARTED",
    },
  });
  const dto = settingsDto(settings);
  if (dto.customPersonaStatus === "READY" && dto.customPersonaProfile) {
    return dto;
  }

  throw new AppError(
    "CONFLICT",
    "Import at least 3 valid TXT files before generating a custom persona.",
    409,
    {
      customPersonaStatus: dto.customPersonaStatus,
    },
  );
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
  }>,
): Promise<PersonaImportDto[]> {
  await getPrisma().personaConversationImport.createMany({
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
  status: CustomPersonaStatus,
) {
  return rows.map((row) =>
    row.status === "PROCESSING" ? { ...row, status } : row,
  );
}

function parseWhatsAppTxtExport(
  fileName: string,
  fileSize: number,
  content: string,
): ParsedConversationFile {
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
    normalized.includes("mensagens e chamadas") ||
    normalized.includes("messages and calls are end-to-end encrypted") ||
    normalized.includes("criou este grupo") ||
    normalized.includes("adicionou") ||
    normalized.includes("removeu") ||
    normalized.includes("alterou o assunto") ||
    normalized.includes("codigo de seguranca") ||
    normalized.includes("código de segurança")
  );
}

function isIgnoredMessageText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("midia oculta") ||
    normalized.includes("mídia oculta") ||
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
  return [...new Set(files.flatMap((file) => file.participants))].sort((a, b) =>
    a.localeCompare(b),
  );
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
    return (
      participants.find((participant) =>
        sameParticipant(participant, explicit),
      ) ?? null
    );
  }

  const hints = [input.professionalName, input.businessName]
    .map((value) => normalizeParticipant(value ?? ""))
    .filter(Boolean);
  for (const participant of participants) {
    const normalized = normalizeParticipant(participant);
    if (
      hints.some(
        (hint) => normalized.includes(hint) || hint.includes(normalized),
      )
    ) {
      return participant;
    }
  }

  return participants.length === 1 ? participants[0] : null;
}

function buildCustomPersonaProfile(messages: string[]): CustomPersonaProfile {
  const cleanMessages = messages.map(cleanVirtualAttendantText).filter(Boolean);
  const totalMessages = cleanMessages.length || 1;
  const averageLength =
    cleanMessages.reduce((sum, message) => sum + message.length, 0) /
    totalMessages;
  const emojiCount = cleanMessages.reduce(
    (sum, message) => sum + countEmojis(message),
    0,
  );
  const emojiRatio = emojiCount / totalMessages;
  const formalCount = countMatches(
    cleanMessages,
    /\b(senhor|senhora|por gentileza|agradeco|agradeço|estou a disposicao|estou à disposição)\b/gi,
  );
  const informalCount = countMatches(
    cleanMessages,
    /\b(oii+|ta|tá|beleza|combinado|querida|amor|flor)\b/gi,
  );
  const greetingExpressions = topExpressions(
    cleanMessages.filter((message) =>
      /^(oi|ola|olá|bom dia|boa tarde|boa noite|oie|oii)/i.test(message),
    ),
    4,
  );
  const commonExpressions = topExpressions(cleanMessages, 8);

  const formalityLevel =
    formalCount > informalCount * 1.4
      ? "formal"
      : informalCount > formalCount * 1.4
        ? "informal"
        : "balanced";
  const emojiUsage =
    emojiRatio === 0
      ? "none"
      : emojiRatio < 0.25
        ? "low"
        : emojiRatio < 0.8
          ? "moderate"
          : "high";
  const messageLengthPreference =
    averageLength < 80 ? "short" : averageLength > 180 ? "long" : "medium";

  return {
    greetingStyle: greetingExpressions.length
      ? `Costuma abrir com ${greetingExpressions.join(", ")}.`
      : "Cumprimenta de forma breve, natural e acolhedora.",
    formalityLevel,
    emojiUsage,
    commonExpressions,
    schedulingStyle:
      "Conduz para o agendamento aos poucos, confirmando servico, dia, horario e valor antes de fechar.",
    objectionHandlingStyle:
      "Responde duvidas com calma, acolhe insegurancas e evita pressionar a cliente.",
    closingStyle:
      "Finaliza confirmando proximos passos e mantendo abertura para a cliente chamar de novo.",
    persuasionStyle:
      "Usa persuasao leve, baseada em ajuda e clareza, sem prometer disponibilidade nao confirmada.",
    messageLengthPreference,
    doList: [
      "Manter portugues brasileiro natural.",
      "Usar uma pergunta principal por vez.",
      "Adaptar vocabulario as expressoes frequentes do negocio.",
      "Confirmar informacoes antes de agendar.",
    ],
    avoidList: [
      "Copiar mensagens sensiveis das conversas importadas.",
      "Exagerar em emojis ou exclamacoes.",
      "Inventar precos, servicos, politicas ou disponibilidade.",
      "Repetir o nome da IA em todas as mensagens.",
    ],
    generatedPersonaInstructions: [
      `Use um tom ${formalityLevel === "formal" ? "profissional e claro" : formalityLevel === "informal" ? "leve, proximo e natural" : "equilibrado, simpatico e profissional"}.`,
      `Prefira mensagens ${messageLengthPreference === "short" ? "curtas" : messageLengthPreference === "long" ? "mais completas quando necessario" : "medias e objetivas"}.`,
      emojiUsage === "none"
        ? "Evite emojis."
        : emojiUsage === "low"
          ? "Use emojis raramente."
          : emojiUsage === "moderate"
            ? "Use emojis com moderacao."
            : "Use emojis com cuidado para nao parecer exagerado.",
      commonExpressions.length
        ? `Expressoes recorrentes que podem inspirar o estilo: ${commonExpressions.join(", ")}.`
        : "",
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
  return messages.reduce(
    (sum, message) => sum + (message.match(regex)?.length ?? 0),
    0,
  );
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

function cleanVirtualAttendantText(value: string | null | undefined): string {
  return (
    (value ?? "")
      // eslint-disable-next-line no-control-regex -- Remove unsafe control bytes from imported text.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\s+\n/g, "\n")
      .trim()
  );
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
