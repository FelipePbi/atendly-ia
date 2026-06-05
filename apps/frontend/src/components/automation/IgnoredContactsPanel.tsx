"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BotOff,
  Check,
  CircleSlash,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Search,
  Smartphone,
  Terminal,
  UserPlus,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import { formatDate } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";

type IgnoredSource =
  | "MANUAL"
  | "EVOLUTION_CONTACT_IMPORT"
  | "WHATSAPP_COMMAND"
  | "CHAT_ACTION"
  | "AUTO_SAFETY"
  | "SYSTEM";

type IgnoredContact = {
  id: string;
  jid: string;
  phoneNumber: string | null;
  displayName: string | null;
  pushName: string | null;
  businessName: string | null;
  source: IgnoredSource;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type EvolutionContact = {
  jid: string;
  phoneNumber: string | null;
  displayName: string | null;
  firstName: string;
  fullName: string;
  pushName: string;
  businessName: string;
  alreadyIgnored: boolean;
};

type Tab = "ignored" | "whatsapp" | "manual";
type ContactFilter = "all" | "ignored" | "available";

const tabs = [
  { value: "ignored" as const, label: "Ignorados", icon: BotOff },
  { value: "whatsapp" as const, label: "Contatos", icon: Smartphone },
  { value: "manual" as const, label: "Manual", icon: UserPlus },
];

const sourceLabels: Record<IgnoredSource, string> = {
  MANUAL: "Manual",
  EVOLUTION_CONTACT_IMPORT: "Contatos do WhatsApp",
  WHATSAPP_COMMAND: "/ia_pause",
  CHAT_ACTION: "Chat",
  AUTO_SAFETY: "Seguranca",
  SYSTEM: "Sistema",
};

export function IgnoredContactsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("ignored");
  const [ignoredContacts, setIgnoredContacts] = useState<IgnoredContact[]>([]);
  const [whatsappContacts, setWhatsappContacts] = useState<EvolutionContact[]>([]);
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("available");
  const [loadingIgnored, setLoadingIgnored] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [manualForm, setManualForm] = useState({
    displayName: "",
    phoneNumber: "",
    reason: "",
  });

  const loadIgnoredContacts = useCallback(async () => {
    setLoadingIgnored(true);
    const response = await fetch("/api/automation/ignored-contacts?pageSize=100", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { data?: IgnoredContact[]; error?: string } | null;
    setLoadingIgnored(false);

    if (!response.ok) {
      setError(data?.error ?? "Nao conseguimos carregar a lista de ignorados.");
      return;
    }

    setIgnoredContacts(data?.data ?? []);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadIgnoredContacts();
    });
  }, [loadIgnoredContacts]);

  const ignoredJids = useMemo(() => new Set(ignoredContacts.filter((contact) => contact.isActive).map((contact) => contact.jid)), [
    ignoredContacts,
  ]);

  const filteredIgnored = useMemo(() => {
    const term = normalizeSearch(search);
    return ignoredContacts.filter((contact) => {
      if (!term) return true;
      return normalizeSearch(contactLabel(contact)).includes(term) || normalizeSearch(contact.jid).includes(term);
    });
  }, [ignoredContacts, search]);

  const filteredWhatsappContacts = useMemo(() => {
    const term = normalizeSearch(search);
    return whatsappContacts.filter((contact) => {
      const alreadyIgnored = contact.alreadyIgnored || ignoredJids.has(contact.jid);
      if (contactFilter === "ignored" && !alreadyIgnored) return false;
      if (contactFilter === "available" && alreadyIgnored) return false;
      if (!term) return true;
      return normalizeSearch(evolutionContactLabel(contact)).includes(term) || normalizeSearch(contact.jid).includes(term);
    });
  }, [contactFilter, ignoredJids, search, whatsappContacts]);

  async function syncContacts() {
    setLoadingContacts(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/automation/evolution-contacts", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { data?: EvolutionContact[]; error?: string } | null;
    setLoadingContacts(false);

    if (!response.ok) {
      setError(data?.error ?? "Nao conseguimos buscar seus contatos agora. Tente novamente em alguns instantes.");
      return;
    }

    setWhatsappContacts(data?.data ?? []);
    setSelectedJids(new Set());
    setSuccess("Contatos do WhatsApp sincronizados.");
  }

  async function addManualContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/automation/ignored-contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manualForm),
    });
    const data = (await response.json().catch(() => null)) as { contact?: IgnoredContact; error?: string } | null;
    setSaving(false);

    if (!response.ok || !data?.contact) {
      setError(data?.error ?? "Nao foi possivel adicionar o contato.");
      return;
    }

    const contact = data.contact;
    setIgnoredContacts((current) => upsertIgnoredContact(current, contact));
    setManualForm({ displayName: "", phoneNumber: "", reason: "" });
    setSuccess("Contato adicionado a lista de ignorados. A IA nao respondera mais esta conversa.");
    setActiveTab("ignored");
  }

  async function addSelectedContacts() {
    const selected = whatsappContacts.filter((contact) => selectedJids.has(contact.jid));
    if (selected.length === 0) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/automation/ignored-contacts/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contacts: selected,
        reason: "Selecionado nos contatos do WhatsApp",
      }),
    });
    const data = (await response.json().catch(() => null)) as { added?: number; error?: string } | null;
    setSaving(false);

    if (!response.ok) {
      setError(data?.error ?? "Nao foi possivel ignorar os contatos selecionados.");
      return;
    }

    setWhatsappContacts((current) =>
      current.map((contact) => (selectedJids.has(contact.jid) ? { ...contact, alreadyIgnored: true } : contact))
    );
    setSelectedJids(new Set());
    await loadIgnoredContacts();
    setSuccess(`${data?.added ?? selected.length} contatos adicionados a lista de ignorados.`);
  }

  async function reactivateContact(contact: IgnoredContact) {
    setError("");
    setSuccess("");
    const response = await fetch(`/api/automation/ignored-contacts/${contact.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => null)) as { contact?: IgnoredContact; error?: string } | null;

    if (!response.ok || !data?.contact) {
      setError(data?.error ?? "Nao foi possivel reativar a IA para este contato.");
      return;
    }

    setIgnoredContacts((current) => current.filter((item) => item.id !== contact.id));
    setWhatsappContacts((current) => current.map((item) => (item.jid === contact.jid ? { ...item, alreadyIgnored: false } : item)));
    setSuccess("IA reativada para este contato.");
  }

  function toggleSelected(jid: string) {
    setSelectedJids((current) => {
      const next = new Set(current);
      if (next.has(jid)) next.delete(jid);
      else next.add(jid);
      return next;
    });
  }

  if (loadingIgnored) {
    return <LoadingState label="Carregando lista de ignorados..." />;
  }

  return (
    <section className="grid gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.value;

          return (
            <button
              className={clsx(
                "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-black transition sm:text-sm",
                active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value);
                setError("");
                setSuccess("");
              }}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {success ? <p className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-strong">{success}</p> : null}

      <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm leading-6 text-muted">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Terminal className="h-4 w-4" aria-hidden="true" />
        </span>
        <p>
          Atalho pelo WhatsApp: envie <strong className="font-black text-foreground">/ia_pause</strong> dentro da conversa pelo
          proprio numero conectado para pausar a IA daquele contato. Mensagens enviadas por clientes com esse comando nao pausam a IA.
        </p>
      </div>

      {activeTab === "ignored" ? (
        <div className="grid gap-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar contato ignorado" />
          {filteredIgnored.length === 0 ? (
            <EmptyIgnoredState />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredIgnored.map((contact) => (
                <IgnoredContactCard contact={contact} key={contact.id} onReactivate={() => reactivateContact(contact)} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "whatsapp" ? (
        <div className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField value={search} onChange={setSearch} placeholder="Buscar contatos do WhatsApp" />
            <button
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-black text-foreground transition hover:bg-surface-muted disabled:opacity-60"
              type="button"
              onClick={syncContacts}
              disabled={loadingContacts}
            >
              {loadingContacts ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
              Sincronizar contatos
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted p-1">
            {[
              { value: "available" as const, label: "Nao ignorados" },
              { value: "ignored" as const, label: "Ja ignorados" },
              { value: "all" as const, label: "Todos" },
            ].map((option) => (
              <button
                className={clsx(
                  "h-9 rounded-md px-2 text-xs font-black transition",
                  contactFilter === option.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                )}
                key={option.value}
                type="button"
                onClick={() => setContactFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loadingContacts ? (
            <LoadingState label="Buscando contatos salvos..." />
          ) : whatsappContacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center">
              <Users className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-black text-foreground">Nenhum contato carregado</h2>
              <p className="mt-1 text-sm leading-6 text-muted">Sincronize para selecionar contatos salvos no WhatsApp.</p>
            </div>
          ) : filteredWhatsappContacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
              Nenhum contato encontrado para o filtro atual.
            </div>
          ) : (
            <div className="grid gap-2 pb-20 sm:pb-0">
              {filteredWhatsappContacts.map((contact) => {
                const alreadyIgnored = contact.alreadyIgnored || ignoredJids.has(contact.jid);
                const selected = selectedJids.has(contact.jid);

                return (
                  <label
                    className={clsx(
                      "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-surface p-3 transition",
                      alreadyIgnored ? "opacity-75" : "hover:border-brand"
                    )}
                    key={contact.jid}
                  >
                    <input
                      className="h-5 w-5 accent-brand"
                      type="checkbox"
                      checked={selected}
                      disabled={alreadyIgnored}
                      onChange={() => toggleSelected(contact.jid)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-foreground">{evolutionContactLabel(contact)}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{contact.phoneNumber ?? contact.jid}</span>
                    </span>
                    {alreadyIgnored ? (
                      <span className="rounded-md bg-warning/10 px-2 py-1 text-[11px] font-black text-warning">Ja ignorado</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}

          {selectedJids.size > 0 ? (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 shadow-lg sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
                type="button"
                onClick={addSelectedContacts}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Ignorar {selectedJids.size} selecionado{selectedJids.size > 1 ? "s" : ""}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "manual" ? (
        <form className="grid max-w-2xl gap-4 rounded-md border border-border bg-surface p-4 sm:p-5" onSubmit={addManualContact}>
          <label className="block">
            <span className="text-sm font-bold text-foreground">Nome ou apelido</span>
            <input
              className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={manualForm.displayName}
              onChange={(event) => setManualForm((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-foreground">Telefone com DDI</span>
            <input
              className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={manualForm.phoneNumber}
              onChange={(event) => setManualForm((current) => ({ ...current, phoneNumber: event.target.value }))}
              placeholder="+55 54 99999-9999"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-foreground">Motivo</span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-base leading-6 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={manualForm.reason}
              onChange={(event) => setManualForm((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-strong disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            Adicionar a lista de ignorados
          </button>
        </form>
      ) : null}
    </section>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function IgnoredContactCard({ contact, onReactivate }: { contact: IgnoredContact; onReactivate: () => void }) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
          <BotOff className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-foreground">{contactLabel(contact)}</h2>
          <p className="mt-0.5 truncate text-xs text-muted">{contact.phoneNumber ?? contact.jid}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md bg-surface-muted px-2 py-1 text-[11px] font-black text-muted">
              Origem: {sourceLabels[contact.source]}
            </span>
            <span className="rounded-md bg-warning/10 px-2 py-1 text-[11px] font-black text-warning">
              Desde {formatDate(contact.createdAt)}
            </span>
          </div>
          {contact.reason ? <p className="mt-3 text-sm leading-6 text-muted">{contact.reason}</p> : null}
        </div>
      </div>
      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-black text-foreground transition hover:bg-surface-muted"
        type="button"
        onClick={onReactivate}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reativar IA
      </button>
    </article>
  );
}

function EmptyIgnoredState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center">
      <CircleSlash className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-black text-foreground">Nenhum contato ignorado ainda</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Adicione familiares, amigos ou fornecedores para evitar respostas automaticas da IA.
      </p>
    </div>
  );
}

function upsertIgnoredContact(current: IgnoredContact[], contact: IgnoredContact): IgnoredContact[] {
  const next = current.some((item) => item.id === contact.id)
    ? current.map((item) => (item.id === contact.id ? contact : item))
    : [contact, ...current];

  return next.filter((item) => item.isActive);
}

function contactLabel(contact: IgnoredContact): string {
  return contact.displayName || contact.pushName || contact.businessName || contact.phoneNumber || contact.jid;
}

function evolutionContactLabel(contact: EvolutionContact): string {
  return contact.displayName || contact.fullName || contact.pushName || contact.firstName || contact.businessName || contact.phoneNumber || contact.jid;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
