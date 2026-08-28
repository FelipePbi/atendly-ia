import type { Metadata } from "next";
import { AuthScreen } from "@/features/auth/AuthScreen";
export const metadata: Metadata = { title: "Link expirado" };
export default function ExpiredLinkPage() {
  return <AuthScreen scenario="link-expired" />;
}
