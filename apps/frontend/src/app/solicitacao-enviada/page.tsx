import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Solicitação enviada" };
export default function RequestSentPage() {
  return <AuthScreen scenario="request-sent" />;
}
