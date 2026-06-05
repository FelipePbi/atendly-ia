import "server-only";

import { phonesMatch } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export function shouldClearWhatsAppDataForPhoneChange(
  previousPhone: string | null | undefined,
  nextPhone: string | null | undefined
): boolean {
  const previous = previousPhone?.trim();
  const next = nextPhone?.trim();

  if (!previous || !next) return false;

  return !phonesMatch(previous, next);
}

export async function clearWhatsAppInstanceConversationData(instanceId: string) {
  await prisma.$transaction([
    prisma.message.deleteMany({
      where: { instanceId },
    }),
    prisma.conversation.deleteMany({
      where: { instanceId },
    }),
  ]);
}
