import { prisma } from "@/lib/prisma";
import { errorResponse, getClientIp, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const data = await readJson(request, changePasswordSchema);
    const rateKey = `change-password:${getClientIp(request)}:${sessionUser.id}`;

    if (!checkRateLimit(rateKey, 5, 15 * 60 * 1000)) {
      return errorResponse("Muitas tentativas. Tente novamente em alguns minutos.", 429);
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
    });

    if (!user) {
      return errorResponse("Usuario nao encontrado.", 404);
    }

    const validPassword = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!validPassword) {
      return errorResponse("Senha atual incorreta.", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword),
      },
    });

    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
