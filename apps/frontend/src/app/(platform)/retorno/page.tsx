import type { Metadata } from "next";

import { ReturnOverviewScreen } from "@/features/customer-return/ReturnOverviewScreen";

export const metadata: Metadata = { title: "Retorno de clientes" };

export default function ReturnPage() {
  return <ReturnOverviewScreen />;
}
