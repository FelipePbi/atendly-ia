import type { Metadata } from "next";

import { CustomerReturnScreen } from "@/features/customer-return/CustomerReturnScreen";

export const metadata: Metadata = { title: "Retorno de clientes" };

export default function CustomerReturnPage() {
  return <CustomerReturnScreen />;
}
