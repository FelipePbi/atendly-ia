import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBffJson(request, `/conversations/${encodeURIComponent(id)}`);
}
