import { EvolutionGoError, getEvolutionQr } from "@/services/evolution-go";
import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return errorResponse("Instancia nao encontrada.", 404);
    }

    let qr: Awaited<ReturnType<typeof getEvolutionQr>>;
    try {
      qr = await getEvolutionQr(instance.evolutionInstanceToken);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Variavel de ambiente ausente")) {
        throw error;
      }

      if (error instanceof EvolutionGoError && (error.status === 401 || error.status === 404)) {
        const updated = await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            status: "ERROR",
            qrcode: null,
          },
        });

        return errorResponse("A instancia da Evolution nao foi encontrada. Recarregue a pagina para criar uma nova instancia.", 409, {
          whatsappInstance: instanceDto(updated),
        });
      }

      const updated = await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: instance.status === "CREATED" ? "CONNECTING" : instance.status,
        },
      });

      return ok({
        ok: true,
        pending: true,
        qrcode: updated.qrcode,
        code: null,
        whatsappInstance: instanceDto(updated),
      });
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        qrcode: qr.qrcode || instance.qrcode,
        status: qr.qrcode ? "WAITING_QR" : instance.status,
      },
    });

    return ok({
      ok: true,
      pending: !qr.qrcode,
      qrcode: qr.qrcode,
      code: qr.code,
      whatsappInstance: instanceDto(updated),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
