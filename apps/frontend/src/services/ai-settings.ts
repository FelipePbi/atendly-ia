import "server-only";

import { prisma } from "@/lib/prisma";

export async function deactivateAiForUserIfEnabled(userId: string) {
  await prisma.userSettings.updateMany({
    where: {
      userId,
      aiEnabled: true,
    },
    data: {
      aiEnabled: false,
    },
  });

  return prisma.userSettings.findUnique({
    where: { userId },
  });
}
