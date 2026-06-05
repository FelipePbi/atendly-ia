import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  return proxyBffJson(request, "/onboarding/profile", { method: "PATCH" });
}
