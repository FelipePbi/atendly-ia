import type { Metadata } from "next";

import { ReturnApprovalsScreen } from "@/features/customer-return/ReturnApprovalsScreen";

export const metadata: Metadata = { title: "Aprovações do retorno" };

export default function ReturnApprovalsPage() {
  return <ReturnApprovalsScreen />;
}
