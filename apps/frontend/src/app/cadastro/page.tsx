import type { Metadata } from "next";
import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Criar conta" };
export default function SignupPage() {
  return <AuthScreen scenario="signup" />;
}
