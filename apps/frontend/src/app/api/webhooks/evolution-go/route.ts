import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { search } = new URL(request.url);
  return proxyBffJson(request, `/webhooks/evolution-go${search}`);
}
