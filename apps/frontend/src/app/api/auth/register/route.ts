import { prisma } from "@/lib/prisma";
import { errorResponse, getClientIp, handleRouteError, ok, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = await readJson(request, registerSchema);
    const rateKey = `register:${getClientIp(request)}:${data.email}`;

    if (!checkRateLimit(rateKey, 5, 15 * 60 * 1000)) {
      return errorResponse("Muitas tentativas. Tente novamente em alguns minutos.", 429);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (existingUser) {
      return errorResponse("Este email ja esta cadastrado.", 409);
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        settings: {
          create: {
            aiEnabled: false,
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    return ok({ ok: true, user }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
