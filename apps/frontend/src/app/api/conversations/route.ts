import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyBffJson(request, `/conversations${search}`);
}
