import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  return NextResponse.json(
    {
      status: "ok",
      service: "atendly-ia-frontend",
      requestId,
      timestamp: new Date().toISOString(),
    },
    { headers: { "x-request-id": requestId } },
  );
}
