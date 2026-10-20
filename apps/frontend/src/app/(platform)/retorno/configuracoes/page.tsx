import type { Metadata } from "next";

import { ReturnSettingsScreen } from "@/features/customer-return/ReturnSettingsScreen";

export const metadata: Metadata = { title: "Configurações do retorno" };

export default function ReturnSettingsPage() {
  return <ReturnSettingsScreen />;
}
