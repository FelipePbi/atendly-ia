import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBffJson(request, "/automation/ai", {
    transform: (data: { settings?: unknown }) => ({
      settings: data.settings,
    }),
  });
}

export async function PATCH(request: Request) {
  return proxyBffJson(request, "/automation/ai");
}
