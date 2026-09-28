import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Verifique seu e-mail" };
export default function RequestSentPage() {
  return <AuthScreen scenario="request-sent" />;
}
