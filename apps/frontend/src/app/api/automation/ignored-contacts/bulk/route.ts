import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyBffJson(request, "/ignored-contacts/bulk");
}
