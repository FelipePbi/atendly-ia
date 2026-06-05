import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBffJson(request, `/ignored-contacts/${encodeURIComponent(id)}`);
}
