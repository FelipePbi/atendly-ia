import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBffJson(request, "/automation/ai", { method: "GET" });
}

export async function PATCH(request: Request) {
  return proxyBffJson(request, "/automation/ai", { method: "PATCH" });
}
