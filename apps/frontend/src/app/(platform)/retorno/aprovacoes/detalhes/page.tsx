import type { Metadata } from "next";

import { ReturnApprovalScreen } from "@/features/customer-return/ReturnApprovalScreen";

export const metadata: Metadata = { title: "Aprovação do retorno" };

export default async function ReturnApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ReturnApprovalScreen id={id} key={id} />;
}
