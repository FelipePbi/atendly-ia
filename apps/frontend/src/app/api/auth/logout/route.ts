import { ok } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  return ok({ ok: true });
}
