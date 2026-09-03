import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Recuperar senha" };
export default function ForgotPasswordPage() {
  return <AuthScreen scenario="forgot-password" />;
}
