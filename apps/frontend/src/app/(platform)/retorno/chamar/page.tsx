import type { Metadata } from "next";

import { ReturnCallScreen } from "@/features/customer-return/ReturnCallScreen";

export const metadata: Metadata = { title: "Chamar clientes" };

export default function ReturnCallPage() {
  return <ReturnCallScreen />;
}
