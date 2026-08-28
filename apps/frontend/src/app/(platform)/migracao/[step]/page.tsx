import { notFound } from "next/navigation";
import { MigrationScreen } from "@/features/migration/MigrationScreen";
import type {
  MigrationScenario,
  MigrationTarget,
} from "@/features/migration/types";
const scenarios: Record<string, MigrationScenario> = {
  "para-atendly": "to-atendly-intro",
  "para-minha-agenda": "to-external-intro",
  diagnostico: "diagnosis",
  conflitos: "conflicts",
  revisao: "review",
  progresso: "progress",
  sucesso: "success",
  parcial: "partial",
  erro: "error",
};
export function generateStaticParams() {
  return Object.keys(scenarios).map((step) => ({ step }));
}
export default async function MigrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ step: string }>;
  searchParams: Promise<{ target?: string }>;
}) {
  const { step } = await params;
  const query = await searchParams;
  const scenario = scenarios[step];
  if (!scenario) notFound();
  const target: MigrationTarget =
    query.target === "external" || step === "para-minha-agenda"
      ? "external"
      : "atendly";
  return <MigrationScreen scenario={scenario} target={target} />;
}
