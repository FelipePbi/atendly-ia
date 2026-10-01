"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { BffHttpError, type CalendarState, type Customer } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { ListItem } from "@/shared/ui/ListItem";
import { Spinner } from "@/shared/ui/Spinner";
import { StatePanel } from "@/shared/ui/States";

import { CustomerListPanel } from "./CustomerList";

type PendingInput = { name: string; phone: string };

export function CustomerForm() {
  const wide = useWideLayout();
  const router = useRouter();
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Customer[] | null>(null);
  const [pending, setPending] = useState<PendingInput | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.getCalendar(controller.signal)
      .then(setCalendar)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setLoadingError(
            requestError(caught, "Não foi possível verificar a agenda."),
          );
      });
    return () => controller.abort();
  }, []);

  async function create(input: PendingInput) {
    setBusy(true);
    setMessage(null);
    try {
      const customer = await getProductServices().customers.create({
        name: input.name || null,
        phone: input.phone || null,
      });
      router.replace(
        `/clientes/detalhes?id=${encodeURIComponent(customer.id)}`,
      );
    } catch (caught: unknown) {
      setMessage(requestError(caught, "Não foi possível criar o cliente."));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = formText(data, "name");
    const phone = formText(data, "phone");
    setMessage(null);
    if (!name && !phone) {
      setMessage("Informe ao menos o nome ou o telefone do cliente.");
      return;
    }
    if (!phone) {
      await create({ name, phone });
      return;
    }
    setChecking(true);
    try {
      const found = await getProductServices().customers.listCandidatesByPhone(
        phone,
      );
      if (found.items.length > 0) {
        setCandidates(found.items);
        setPending({ name, phone });
      } else {
        await create({ name, phone });
      }
    } catch (caught: unknown) {
      setMessage(
        requestError(caught, "Não foi possível verificar o telefone informado."),
      );
    } finally {
      setChecking(false);
    }
  }

  function backToEdit() {
    setCandidates(null);
    setMessage(null);
  }

  useShellConfig({
    active: "clientes",
    loading: !calendar && !loadingError,
    module: "directory",
    pushed: true,
    title: "Novo cliente",
  });

  const form = (
    <div className="page customer-profile customer-form-screen">
      <PushedBar
        backHref="/clientes"
        backIcon="x"
        backLabel="Voltar para clientes"
        title="Novo cliente"
      />

      {loadingError ? (
        <StatePanel
          description={loadingError}
          icon="alert"
          title="Agenda indisponível"
          tone="error"
        />
      ) : !calendar ? (
        <div className="customer-form-loading">
          <Spinner label="Carregando agenda" />
        </div>
      ) : !calendar.capabilities.manageCustomers ? (
        <StatePanel
          actionHref="/clientes"
          actionLabel="Voltar para clientes"
          description="Este negócio cadastra clientes pelo Minha Agenda. Não é possível criar um cliente novo por aqui."
          icon="link"
          title="Cadastro gerenciado no Minha Agenda"
        />
      ) : candidates && pending ? (
        <div className="customer-candidates">
          <p role="status">
            Encontramos {candidates.length}{" "}
            {candidates.length === 1
              ? "cadastro com o telefone"
              : "cadastros com o telefone"}{" "}
            {displayPhone(pending.phone, "")}. O mesmo número pode pertencer a mais de uma
            pessoa: escolha um cadastro existente ou confirme que é uma
            pessoa nova. A Atendly não junta cadastros automaticamente.
          </p>
          <div aria-label="Cadastros com este telefone" className="list" role="list">
            {candidates.map((candidate) => (
              <ListItem
                copy={displayPhone(candidate.phone, "Telefone não informado")}
                href={`/clientes/detalhes?id=${encodeURIComponent(candidate.id)}`}
                key={candidate.id}
                title={candidate.name || "Cliente sem nome"}
                trailing={<Icon name="chevron-right" />}
              />
            ))}
          </div>
          {message && (
            <div className="customer-inline-error" role="alert">
              {message}
            </div>
          )}
          <div className="customer-form-footer">
            <button
              className="btn btn-secondary"
              onClick={backToEdit}
              type="button"
            >
              Revisar dados
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void create(pending)}
              type="button"
            >
              {busy
                ? "Criando..."
                : `Cadastrar ${pending.name || "cliente"} como nova pessoa`}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="customer-form-card"
          onSubmit={(event) => void submit(event)}
        >
          <div className="customer-form-grid">
            <Field
              autoComplete="name"
              defaultValue={pending?.name}
              help="Use o nome que ajuda você a reconhecer este cliente."
              label="Nome"
              maxLength={200}
              name="name"
            />
            <Field
              autoComplete="tel"
              defaultValue={pending?.phone}
              help="O telefone identifica o cliente apenas neste negócio. Pode ficar em branco."
              inputMode="tel"
              label="Telefone"
              maxLength={32}
              minLength={6}
              name="phone"
              placeholder="(00) 00000-0000"
              type="tel"
            />
          </div>
          {message && (
            <div className="customer-inline-error" role="alert">
              {message}
            </div>
          )}
          {/* CTA fixo no rodapé da tela empurrada (CL4); cancelar é o × da barra. */}
          <div className="customer-form-cta">
            <button
              className="btn btn-primary"
              disabled={checking || busy}
              type="submit"
            >
              {checking ? "Verificando..." : busy ? "Criando..." : "Criar cliente"}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (!wide) return form;
  return (
    <ListDetailLayout
      detail={form}
      list={<CustomerListPanel />}
      listLabel="Clientes"
    />
  );
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
