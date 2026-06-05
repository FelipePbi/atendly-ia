import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyBffJson(request, "/whatsapp/instance", { method: "POST" });
}

export async function DELETE(request: Request) {
  return proxyBffJson(request, "/whatsapp/instance", { method: "DELETE" });
}
