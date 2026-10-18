import type { Metadata } from "next";
import { Suspense } from "react";

import { RevenueCustomersScreen } from "@/features/revenue/RevenueCustomersScreen";

export const metadata: Metadata = { title: "Clientes do faturamento" };

export default function RevenueCustomersPage() {
  return (
    <Suspense fallback={null}>
      <RevenueCustomersScreen />
    </Suspense>
  );
}
