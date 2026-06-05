import { IgnoredContactsPanel } from "@/components/automation/IgnoredContactsPanel";

export default function IgnoredContactsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="min-w-0">
        <h1 className="text-xl font-black text-foreground sm:text-2xl">Lista de ignorados</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Escolha contatos que a IA nao deve responder automaticamente.
        </p>
      </header>

      <IgnoredContactsPanel />
    </div>
  );
}
