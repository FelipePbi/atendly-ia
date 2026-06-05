import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBffJson(request, "/virtual-attendant/settings", { method: "GET" });
}

export async function PATCH(request: Request) {
  return proxyBffJson(request, "/virtual-attendant/settings", { method: "PATCH" });
}
