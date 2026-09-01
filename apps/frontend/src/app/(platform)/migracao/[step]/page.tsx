import { notFound } from "next/navigation";

import type { ProductMigrationStep } from "@/features/migration/ProductMigrationScreen";
import { ProductMigrationScreen } from "@/features/migration/ProductMigrationScreen";

const steps: Record<string, ProductMigrationStep> = {
  "para-atendly": "intro",
  "para-minha-agenda": "intro",
  diagnostico: "diagnosis",
  conflitos: "conflicts",
  revisao: "review",
  progresso: "progress",
  sucesso: "result",
  parcial: "result",
  erro: "result",
};
export function generateStaticParams() {
  return Object.keys(steps).map((step) => ({ step }));
}
export default async function MigrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ step: string }>;
  searchParams: Promise<{ migrationId?: string; target?: string }>;
}) {
  const { step } = await params;
  const query = await searchParams;
  const productStep = steps[step];
  if (!productStep) notFound();
  const target =
    query.target === "external" || step === "para-minha-agenda"
      ? ("EXTERNAL" as const)
      : ("ATENDLY" as const);
  return (
    <ProductMigrationScreen
      migrationId={query.migrationId}
      step={productStep}
      target={target}
    />
  );
}
