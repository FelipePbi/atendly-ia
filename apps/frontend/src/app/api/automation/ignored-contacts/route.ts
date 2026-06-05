import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { normalizeWhatsappJid, phoneFromWhatsappJid } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { addIgnoredContactSchema } from "@/lib/validation";
import { pauseBotHandoffInBackend } from "@/services/backend-dispatch";
import { ignoredContactDto, listIgnoredContacts, pauseConversationAi } from "@/services/ignored-contacts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!instance) {
      return ok({
        ok: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
      });
    }

    const { searchParams } = new URL(request.url);
    const page = positiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(100, positiveInt(searchParams.get("pageSize"), 20));
    const statusParam = searchParams.get("status");
    const status = statusParam === "inactive" || statusParam === "all" ? statusParam : "active";
    const result = await listIgnoredContacts({
      userId: user.id,
      instanceId: instance.id,
      q: searchParams.get("q"),
      status,
      page,
      pageSize,
    });

    return ok({
      ok: true,
      data: result.contacts.map(ignoredContactDto),
      pagination: {
        page,
        pageSize,
        total: result.total,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await readJson(request, addIgnoredContactSchema);
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!instance) {
      return errorResponse("Conecte o WhatsApp antes de criar a lista de ignorados.", 409);
    }

    const jid = normalizeWhatsappJid(body.phoneNumber);
    if (!jid) {
      return errorResponse("Informe um telefone valido com DDI.", 400);
    }

    const reason = body.reason?.trim() || "Contato adicionado manualmente";
    const contact = await pauseConversationAi({
      userId: user.id,
      instanceId: instance.id,
      jid,
      displayName: body.displayName,
      source: "MANUAL",
      reason,
      createdByUserId: user.id,
    });

    const phone = phoneFromWhatsappJid(jid);
    if (phone) {
      await pauseBotHandoffInBackend({
        phone,
        reason: "IA pausada por lista de ignorados",
        summary: reason,
      });
    }

    return ok(
      {
        ok: true,
        contact: ignoredContactDto(contact),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
