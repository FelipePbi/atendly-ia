import type { Metadata } from "next";

import { MoreScreen } from "@/shared/layout/MoreScreen";

export const metadata: Metadata = { title: "Mais" };

export default function MorePage() {
  return <MoreScreen />;
}
