import type { Metadata } from "next";

import { RevenueScreen } from "@/features/revenue/RevenueScreen";

export const metadata: Metadata = { title: "Faturamento" };

export default function RevenuePage() {
  return <RevenueScreen />;
}
