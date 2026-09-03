import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Nova senha" };
export default function NewPasswordPage() {
  return <AuthScreen scenario="new-password" />;
}
