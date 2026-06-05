import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBffJson(request, "/onboarding", { method: "GET" });
}
