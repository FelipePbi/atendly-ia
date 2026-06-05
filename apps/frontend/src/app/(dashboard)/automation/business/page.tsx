import { BusinessSettingsForm } from "@/components/automation/BusinessSettingsForm";

export default function AutomationBusinessPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="min-w-0">
        <h1 className="text-xl font-black text-foreground sm:text-2xl">Regras de Negócios</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Configure dados do negócio, agenda e políticas que orientam as respostas da IA.
        </p>
      </header>

      <BusinessSettingsForm />
    </div>
  );
}
