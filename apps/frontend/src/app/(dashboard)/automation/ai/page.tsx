import { AiControlPanel } from "@/components/ia/AiControlPanel";

export default function AutomationAiPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="min-w-0">
        <h1 className="text-xl font-black text-foreground sm:text-2xl">Atendente Virtual</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Controle quando a IA pode responder automaticamente e acompanhe o status do atendimento virtual.
        </p>
      </header>

      <AiControlPanel />
    </div>
  );
}
