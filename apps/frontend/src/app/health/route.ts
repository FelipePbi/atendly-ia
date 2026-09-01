import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "atendly-ia-frontend",
    timestamp: new Date().toISOString(),
  });
}
