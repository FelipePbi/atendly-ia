import { bffFetch, copySetCookie } from "@/lib/bff";

export const runtime = "nodejs";

type PersonaImportData = Record<string, unknown>;

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  const payload = {
    participantName: stringFormValue(formData.get("participantName")),
    files: await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        size: file.size,
        text: await file.text(),
      }))
    ),
  };

  const { response, envelope } = await bffFetch<PersonaImportData>("/virtual-attendant/persona/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cookieHeader: request.headers.get("cookie"),
  });

  const body =
    response.ok && envelope?.data
      ? { ok: true, ...envelope.data }
      : {
          ok: false,
          error: envelope?.error?.message ?? "Nao foi possivel importar a persona agora.",
          details: envelope?.error?.details,
        };
  const nextResponse = Response.json(body, { status: response.status });
  copySetCookie(response, nextResponse);
  return nextResponse;
}

function stringFormValue(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
