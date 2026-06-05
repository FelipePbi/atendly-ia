import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBffJson<{ contacts: unknown[] }>(request, "/whatsapp/contacts", {
    method: "GET",
    transform: (data) => ({ data: data.contacts }),
  });
}
