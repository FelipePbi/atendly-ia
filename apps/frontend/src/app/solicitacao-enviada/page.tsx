import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Senha redefinida" };
export default function RequestSentPage() {
  return <AuthScreen scenario="request-sent" />;
}
