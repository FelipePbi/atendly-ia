import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { importPersonaConversations } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return errorResponse("Selecione pelo menos 3 arquivos .txt exportados do WhatsApp.", 400);
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { businessName: true, fullName: true },
    });
    const participantName = stringFormValue(formData.get("participantName"));
    const result = await importPersonaConversations({
      userId: user.id,
      files,
      participantName,
      businessName: profile?.businessName,
      professionalName: profile?.fullName,
    });

    return ok({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}

function stringFormValue(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
