import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Criar conta | Atendly",
  description: "Crie sua conta na Atendly.",
  robots: { index: false, follow: false },
};

export default function RegistrationPage() {
  return <RegisterForm />;
}
