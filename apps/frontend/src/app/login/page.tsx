import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Entrar" };
export default function LoginPage() {
  return <AuthScreen scenario="login" />;
}
