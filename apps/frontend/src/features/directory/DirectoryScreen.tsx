"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/shared/layout/AppShell";
import { Dialog } from "@/shared/ui/Dialog";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";
import { Icon } from "@/shared/icons/Icon";
import { mockCustomers, mockServices } from "@/mocks/data/directory";
import type { CustomerScenario } from "@/features/customers/types";
import type { ServiceScenario } from "@/features/services/types";

type DirectoryProps =
  | { area: "customers"; scenario?: CustomerScenario }
  | { area: "services"; scenario?: ServiceScenario };

function SourceStrip({
  area,
  external,
}: {
  area: "customers" | "services";
  external: boolean;
}) {
  return (
    <section className="directory-source-strip">
      <div className="directory-source-copy">
        <span className="directory-source-icon">
          <Icon
            name={
              external ? "link" : area === "services" ? "briefcase" : "users"
            }
          />
        </span>
        <div>
          <strong>
            {external
              ? "Dados sincronizados com Minha Agenda"
              : "Gerenciado pela Agenda Atendly"}
          </strong>
          <span>
            {external
              ? area === "services"
                ? "Os serviços são editados na fonte oficial."
                : "Nome e telefone são controlados na fonte oficial; observações são locais."
              : area === "services"
                ? "Serviços podem ser criados, editados e desativados aqui."
                : "Cadastros e observações pertencem a este negócio."}
          </span>
        </div>
      </div>
      <span className={external ? "badge" : "badge badge-success"}>
        {!external && <span className="badge-dot" aria-hidden="true" />}
        {external ? "Atualização não informada" : "Controle completo"}
      </span>
    </section>
  );
}

function DirectoryList({
  area,
  scenario,
}: {
  area: "customers" | "services";
  scenario: string;
}) {
  const external = scenario.includes("external") || scenario === "error";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [services, setServices] = useState(
    mockServices.map((item) => ({
      ...item,
      origin: external ? ("external" as const) : item.origin,
    })),
  );
  const [dialog, setDialog] = useState<string>();
  const [stateFeedback, setStateFeedback] = useState("");
  const [retrying, setRetrying] = useState(false);
  const isCustomers = area === "customers";
  const title = isCustomers ? "Clientes" : "Serviços";
  const empty = scenario.includes("empty");
  const error = scenario === "error";
  const loading = scenario === "loading";
  const customers = mockCustomers.filter(
    (item) =>
      `${item.name} ${item.phone}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (filter === "all" ||
        (filter === "upcoming" && item.nextAppointment) ||
        (filter === "no-upcoming" && !item.nextAppointment)),
  );
  const visibleServices = services.filter(
    (item) =>
      item.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (filter === "all" ||
        (filter === "active" && item.active) ||
        (filter === "inactive" && !item.active)),
  );
  return (
    <AppShell
      active={isCustomers ? "clientes" : "servicos"}
      module="directory"
      source={external ? "external" : "atendly"}
    >
      <section className="directory-page">
        <header className="directory-page-header">
          <div>
            <h1>{title}</h1>
            <p>
              {isCustomers
                ? "Informações úteis para continuar atendimentos e acompanhar agendamentos."
                : "Organize o que pode ser agendado, com duração, preço e estado claros."}
            </p>
          </div>
          <div className="directory-page-actions">
            {!external && !empty && !error && !loading && (
              <Link
                className="btn btn-primary"
                href={isCustomers ? "/clientes/novo" : "/servicos/novo"}
                aria-label={isCustomers ? "Novo cliente" : "Novo serviço"}
              >
                <Icon name="plus" />
                <span>Novo {isCustomers ? "cliente" : "serviço"}</span>
              </Link>
            )}
          </div>
        </header>
        <SourceStrip area={area} external={external} />
        {!empty && !error && !loading && (
          <>
            <div className="alert alert-info directory-demo-note">
              <Icon name="info" />
              <div>
                <p className="alert-title">Conteúdo demonstrativo</p>
                <p className="alert-text">
                  Nomes, datas e valores abaixo existem apenas para apresentar a
                  interface.
                </p>
              </div>
            </div>
            <section className="directory-toolbar">
              <label className="directory-search">
                <span className="sr-only">Buscar</span>
                <Icon name="search" />
                <input
                  className="input"
                  type="search"
                  placeholder={
                    isCustomers
                      ? "Buscar por nome ou telefone"
                      : "Buscar serviço"
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="directory-filters">
                {(isCustomers
                  ? [
                      ["all", "Todos"],
                      ["upcoming", "Com agendamento"],
                      ["no-upcoming", "Sem próximo horário"],
                    ]
                  : [
                      ["all", "Todos"],
                      ["active", "Ativos"],
                      ["inactive", "Inativos"],
                    ]
                ).map(([value, label]) => (
                  <button
                    className={clsx(
                      "directory-filter",
                      filter === value && "is-active",
                    )}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="directory-list-surface">
              <div className="directory-list-meta">
                <strong>
                  {isCustomers ? "Recentes" : "Serviços cadastrados"}
                </strong>
                <span>
                  {isCustomers
                    ? `${customers.length} clientes no exemplo`
                    : `${visibleServices.length} serviços no exemplo`}
                </span>
              </div>
              <div
                className={clsx(
                  "directory-grid-head",
                  isCustomers ? "customer-grid" : "service-grid",
                )}
                aria-hidden="true"
              >
                <span>{isCustomers ? "Cliente" : "Serviço"}</span>
                <span>{isCustomers ? "Último contato" : "Duração"}</span>
                <span>{isCustomers ? "Próximo agendamento" : "Preço"}</span>
                <span>{isCustomers ? "Agendamentos" : "Status"}</span>
                {!isCustomers && <span>Ação</span>}
                <span />
              </div>
              <div>
                {isCustomers
                  ? customers.map((item) => (
                      <Link
                        className="directory-row customer-grid"
                        href={
                          external
                            ? "/clientes/detalhes/externo"
                            : "/clientes/detalhes"
                        }
                        key={item.id}
                      >
                        <span className="directory-row-main">
                          <span className="avatar">
                            {item.id === "c1"
                              ? "C1"
                              : item.id === "c2"
                                ? "?"
                                : item.id === "c3"
                                  ? "C2"
                                  : "C3"}
                          </span>
                          <span className="directory-row-copy">
                            <strong>{item.name}</strong>
                            <span>{item.phone}</span>
                            {external && (
                              <span className="badge">Minha Agenda</span>
                            )}
                          </span>
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">
                            Último contato
                          </span>
                          {item.lastContact}
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">
                            Próximo agendamento
                          </span>
                          <strong>
                            {item.nextAppointment ?? "Sem próximo horário"}
                          </strong>
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">
                            Agendamentos
                          </span>
                          {item.appointments}
                        </span>
                        <span className="directory-row-action">
                          <Icon name="chevron-right" />
                        </span>
                      </Link>
                    ))
                  : visibleServices.map((item) => (
                      <div className="directory-row service-grid" key={item.id}>
                        <span className="directory-row-main">
                          <span className="directory-source-icon">
                            <Icon name="briefcase" />
                          </span>
                          <span className="directory-row-copy">
                            <strong>{item.name}</strong>
                            <span className="badge">
                              {external ? "Minha Agenda" : "Agenda Atendly"}
                            </span>
                          </span>
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">Duração</span>
                          {item.duration} min
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">Preço</span>
                          <strong>
                            {item.price
                              ? item.price.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })
                              : "Sob consulta"}
                          </strong>
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">Status</span>
                          <span
                            className={clsx(
                              "badge",
                              item.active && "badge-success",
                            )}
                          >
                            <span className="badge-dot" aria-hidden="true" />
                            {item.active ? "Ativo" : "Inativo"}
                          </span>
                        </span>
                        <span className="directory-cell">
                          <span className="directory-cell-label">Ação</span>
                          <button
                            className="btn btn-tertiary"
                            type="button"
                            onClick={() =>
                              external ? undefined : setDialog(item.id)
                            }
                          >
                            {external
                              ? "Editar no Minha Agenda"
                              : item.active
                                ? "Desativar"
                                : "Ativar"}
                          </button>
                        </span>
                        <Link
                          className="icon-btn directory-row-action"
                          href="/servicos/editar"
                          aria-label={`Editar ${item.name}`}
                        >
                          <Icon
                            name={external ? "external" : "chevron-right"}
                          />
                        </Link>
                      </div>
                    ))}
              </div>
            </section>
          </>
        )}
        {loading && (
          <div className="directory-loading-shell" aria-busy="true">
            {[0, 1, 2, 3, 4].map((item) => (
              <div className="directory-loading-row" key={item}>
                <span className="skeleton directory-loading-avatar" />
                <span className="directory-loading-copy">
                  <span className="skeleton skeleton-title" />
                  <span className="skeleton skeleton-line" />
                </span>
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line" />
              </div>
            ))}
          </div>
        )}
        {(empty || error) && (
          <div className="directory-state-surface">
            <div className={error ? "error-state" : "empty-state"}>
              <span className="state-icon">
                <Icon
                  name={error ? "alert" : isCustomers ? "users" : "briefcase"}
                />
              </span>
              <h2>
                {error
                  ? `Não foi possível carregar ${title.toLocaleLowerCase("pt-BR")}`
                  : isCustomers
                    ? "Seus clientes aparecerão aqui"
                    : external
                      ? "Nenhum serviço sincronizado"
                      : "Cadastre seu primeiro serviço"}
              </h2>
              <p>
                {error
                  ? external
                    ? "Os dados podem estar desatualizados. Verifique a conexão antes de tomar decisões com base nesta lista."
                    : "A lista não foi atualizada. Tente novamente; nenhum cadastro foi alterado."
                  : isCustomers
                    ? "Depois do primeiro contato, cadastro ou importação, você encontrará cada cliente nesta lista."
                    : external
                      ? "A Atendly ainda não recebeu serviços da fonte oficial. Verifique a conexão antes de ativar agendamentos."
                      : "A IA só oferece serviços ativos com nome, duração e preço ou valor sob consulta."}
              </p>
              {error ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={retrying}
                  aria-busy={retrying}
                  onClick={() => {
                    setRetrying(true);
                    setStateFeedback("");
                    window.setTimeout(() => {
                      setRetrying(false);
                      setStateFeedback(
                        external
                          ? "A conexão com Minha Agenda continua indisponível. Nenhum dado foi alterado."
                          : "Ainda não foi possível atualizar a lista. Nenhum cadastro foi alterado.",
                      );
                    }, 1000);
                  }}
                >
                  {retrying && <span className="spinner" aria-hidden="true" />}
                  {retrying ? "Carregando" : "Carregar novamente"}
                </button>
              ) : isCustomers ? (
                <Link
                  className={external ? "btn btn-secondary" : "btn btn-primary"}
                  href={external ? "/conversas" : "/clientes/novo"}
                >
                  {external ? "Ver conversas" : "Cadastrar cliente"}
                </Link>
              ) : external ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() =>
                    setStateFeedback(
                      "Não é possível abrir a Minha Agenda neste protótipo. Nenhum dado foi alterado.",
                    )
                  }
                >
                  Verificar sincronização
                </button>
              ) : (
                <Link className="btn btn-primary" href="/servicos/novo">
                  Cadastrar primeiro serviço
                </Link>
              )}
              <div
                className="directory-retry-status"
                role="status"
                aria-live="polite"
              >
                {stateFeedback}
              </div>
            </div>
          </div>
        )}
      </section>
      <Dialog
        open={Boolean(dialog)}
        onClose={() => setDialog(undefined)}
        title={
          services.find((item) => item.id === dialog)?.active
            ? "Desativar serviço?"
            : "Ativar serviço?"
        }
        eyebrow="Atenção"
      >
        <p className="small muted">
          Novos agendamentos respeitarão o estado atualizado. O histórico será
          preservado.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDialog(undefined)}
          >
            Manter como está
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setServices((current) =>
                current.map((item) =>
                  item.id === dialog ? { ...item, active: !item.active } : item,
                ),
              );
              setDialog(undefined);
            }}
          >
            Confirmar alteração
          </button>
        </div>
      </Dialog>
    </AppShell>
  );
}

function CustomerDetail({ external = false }: { external?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <AppShell
      active="clientes"
      module="directory"
      source={external ? "external" : "atendly"}
    >
      <section className="directory-page">
        <header className="directory-page-header">
          <Link className="btn btn-tertiary" href="/clientes">
            <Icon name="chevron-left" />
            Voltar para clientes
          </Link>
        </header>
        <SourceStrip area="customers" external={external} />
        <div className="alert alert-info directory-demo-note">
          <Icon name="info" />
          <div>
            <p className="alert-title">Conteúdo demonstrativo</p>
            <p className="alert-text">
              Nomes, datas e valores abaixo existem apenas para apresentar a
              interface.
            </p>
          </div>
        </div>
        <section className="directory-detail-hero">
          <div className="directory-detail-identity">
            <span className="avatar">C1</span>
            <div>
              <h1>Cliente demonstrativo 01</h1>
              <p className="directory-detail-phone">(11) 99999-1234</p>
              <div className="directory-detail-signals">
                <span className="badge">
                  {external ? "Minha Agenda" : "Agenda Atendly"}
                </span>
                <span className="badge badge-success">
                  Próximo horário agendado
                </span>
              </div>
            </div>
          </div>
          <div className="directory-detail-actions">
            <Link className="btn btn-primary" href="/conversas/ai-active">
              <Icon name="chat" />
              Abrir conversa
            </Link>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => (external ? undefined : setEdit(true))}
            >
              <Icon name={external ? "external" : "user"} />
              {external ? "Editar na origem" : "Editar cadastro"}
            </button>
          </div>
        </section>
        <div className="directory-detail-grid">
          <div>
            <section className="directory-section">
              <div className="directory-section-header">
                <div>
                  <h2>Agendamentos</h2>
                  <p>Próximo horário e histórico deste negócio.</p>
                </div>
              </div>
              <div className="directory-appointment">
                <time>
                  25 AGO
                  <br />
                  14:30
                </time>
                <span className="directory-appointment-copy">
                  <strong>Serviço de demonstração</strong>
                  <span>60 min · conteúdo demonstrativo</span>
                </span>
                <span className="badge badge-success">Confirmado</span>
              </div>
              <div className="directory-appointment">
                <time>
                  12 AGO
                  <br />
                  10:00
                </time>
                <span className="directory-appointment-copy">
                  <strong>Serviço sob consulta</strong>
                  <span>Atendimento anterior · exemplo</span>
                </span>
                <span className="badge">Concluído no exemplo</span>
              </div>
            </section>
            <section className="directory-section">
              <div className="directory-section-header">
                <div>
                  <h2>Histórico relacionado</h2>
                  <p>Conversas e alterações visíveis somente neste negócio.</p>
                </div>
              </div>
              <div className="directory-timeline">
                <div className="directory-timeline-item">
                  <strong>Conversa atendida pela IA</strong>
                  <span>Hoje, 09:18 · exemplo</span>
                </div>
                <div className="directory-timeline-item">
                  <strong>Agendamento criado</strong>
                  <span>Ontem, 16:42 · exemplo</span>
                </div>
                <div className="directory-timeline-item">
                  <strong>Primeiro contato recebido</strong>
                  <span>12 de agosto · exemplo</span>
                </div>
              </div>
            </section>
          </div>
          <aside>
            <section className="directory-section">
              <div className="directory-section-header">
                <div>
                  <h2>Observações locais</h2>
                  <p>
                    Uso interno. Nada aqui é enviado automaticamente ao cliente.
                  </p>
                </div>
              </div>
              <form
                className="directory-note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSaved(true);
                }}
              >
                <label className="label" htmlFor="customer-notes">
                  Observações
                </label>
                <textarea
                  className="input"
                  id="customer-notes"
                  defaultValue="Prefere atendimento no período da tarde. Conteúdo demonstrativo."
                  maxLength={500}
                />
                <div className="directory-form-status is-success" role="status">
                  {saved ? "Observações salvas somente neste negócio." : ""}
                </div>
                <div className="directory-note-actions">
                  <button className="btn btn-secondary" type="submit">
                    Salvar observações
                  </button>
                </div>
              </form>
            </section>
            <section className="directory-section">
              <div className="directory-section-header">
                <div>
                  <h2>Origem dos dados</h2>
                </div>
              </div>
              <div className="directory-readonly-field">
                <span>Cadastro</span>
                <strong>{external ? "Minha Agenda" : "Agenda Atendly"}</strong>
              </div>
              <div className="directory-readonly-field">
                <span>Última sincronização</span>
                <strong>{external ? "Não informada" : "Não se aplica"}</strong>
              </div>
            </section>
          </aside>
        </div>
      </section>
      <Dialog
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar cadastro"
        eyebrow="Agenda Atendly"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEdit(false);
          }}
        >
          <label className="field directory-dialog-field">
            <span className="label">Nome</span>
            <input
              className="input"
              defaultValue="Cliente demonstrativo 01"
              required
            />
          </label>
          <label className="field directory-dialog-field">
            <span className="label">Telefone</span>
            <input className="input" defaultValue="(11) 99999-1234" required />
          </label>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setEdit(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit">
              Salvar cadastro
            </button>
          </div>
        </form>
      </Dialog>
    </AppShell>
  );
}

function DirectoryForm({
  area,
  edit = false,
}: {
  area: "customers" | "services";
  edit?: boolean;
}) {
  const [success, setSuccess] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setSuccess(true);
  }
  return (
    <AppShell
      active={area === "customers" ? "clientes" : "servicos"}
      module="directory"
    >
      <section className="directory-page is-form-page">
        <header className="directory-page-header">
          <div>
            <Link
              className="btn btn-tertiary"
              href={area === "customers" ? "/clientes" : "/servicos"}
            >
              <Icon name="chevron-left" />
              Voltar
            </Link>
            <h1>
              {area === "customers"
                ? "Novo cliente"
                : edit
                  ? "Editar serviço"
                  : "Novo serviço"}
            </h1>
            <p>
              {area === "customers"
                ? "Cadastre apenas os dados necessários para identificar e atender."
                : "Defina o que a IA pode oferecer ao criar novos agendamentos."}
            </p>
          </div>
        </header>
        <SourceStrip area={area} external={false} />
        {success ? (
          <div className="agenda-success-panel">
            <div className="state-icon">
              <Icon name="check" />
            </div>
            <h2>{area === "customers" ? "Cliente criado" : "Serviço salvo"}</h2>
            <p>Dados disponíveis somente neste ambiente demonstrativo.</p>
            <Link
              className="btn btn-primary"
              href={area === "customers" ? "/clientes" : "/servicos"}
            >
              Voltar para lista
            </Link>
          </div>
        ) : (
          <form className="directory-form-card" onSubmit={submit}>
            <h2>
              {area === "customers"
                ? "Dados do cliente"
                : "Informações do serviço"}
            </h2>
            <div className="directory-form-grid">
              <label
                className={clsx("field", area === "services" && "is-wide")}
              >
                <span className="label">
                  {area === "customers" ? "Nome" : "Nome do serviço"}
                </span>
                <input
                  className="input"
                  defaultValue={edit ? "Serviço de demonstração" : undefined}
                  required
                />
                {area === "customers" && (
                  <span className="field-help">
                    Use o nome que ajuda você a reconhecer este cliente.
                  </span>
                )}
              </label>
              {area === "customers" ? (
                <>
                  <label className="field">
                    <span className="label">Telefone</span>
                    <input
                      className="input"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      required
                    />
                    <span className="field-help">
                      O telefone identifica o cliente apenas neste negócio.
                    </span>
                  </label>
                  <label className="field is-wide">
                    <span className="label">
                      Observações locais{" "}
                      <span className="muted">(opcional)</span>
                    </span>
                    <textarea className="input" maxLength={500} />
                    <span className="field-help">
                      Uso interno. Não será enviado automaticamente ao cliente.
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <label className="field is-wide">
                    <span className="label">
                      Descrição curta <span className="muted">(opcional)</span>
                    </span>
                    <textarea
                      className="input"
                      defaultValue={
                        edit
                          ? "Descrição demonstrativa usada para explicar o atendimento."
                          : undefined
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="label">Duração</span>
                    <select
                      className="select"
                      defaultValue={edit ? "60" : ""}
                      required
                    >
                      <option value="">Selecione</option>
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">60 minutos</option>
                      <option value="90">90 minutos</option>
                    </select>
                    <span className="field-help">
                      Alterações não modificam silenciosamente agendamentos
                      existentes.
                    </span>
                  </label>
                  <fieldset className="directory-fieldset">
                    <legend>Valor</legend>
                    <div className="directory-segmented">
                      <label>
                        <input
                          type="radio"
                          name="price-mode"
                          value="fixed"
                          defaultChecked
                        />
                        <span>Preço fixo</span>
                      </label>
                      <label>
                        <input type="radio" name="price-mode" value="consult" />
                        <span>Sob consulta</span>
                      </label>
                    </div>
                  </fieldset>
                  <label className="field">
                    <span className="label">Preço</span>
                    <CurrencyInput
                      className="input"
                      defaultValueCents={edit ? 12_000 : undefined}
                      placeholder="R$ 0,00"
                      required
                    />
                    <span className="field-help">
                      Uma alteração vale para novos agendamentos; o histórico é
                      preservado.
                    </span>
                  </label>
                  <label className="check directory-active-control is-wide">
                    <input type="checkbox" defaultChecked />
                    <span className="check-box" />
                    <span className="directory-active-copy">
                      <strong>Serviço ativo</strong>
                      <span className="field-help">
                        Serviços inativos não são oferecidos pela IA para novos
                        agendamentos.
                      </span>
                    </span>
                  </label>
                  <div className="directory-form-note is-wide">
                    Antes de salvar alterações de duração ou desativar um
                    serviço, confirme eventuais impactos nos agendamentos
                    futuros.
                  </div>
                </>
              )}
            </div>
            <div className="directory-form-footer">
              <Link
                className="btn btn-secondary"
                href={area === "customers" ? "/clientes" : "/servicos"}
              >
                Cancelar
              </Link>
              <button className="btn btn-primary" type="submit">
                {area === "customers"
                  ? "Criar cliente"
                  : edit
                    ? "Salvar alterações"
                    : "Criar serviço"}
              </button>
            </div>
          </form>
        )}
      </section>
    </AppShell>
  );
}

export function DirectoryScreen(props: DirectoryProps) {
  const scenario = props.scenario ?? "list";
  if (
    props.area === "customers" &&
    (scenario === "detail" || scenario === "detail-external")
  )
    return <CustomerDetail external={scenario === "detail-external"} />;
  if (scenario === "new" || scenario === "edit")
    return <DirectoryForm area={props.area} edit={scenario === "edit"} />;
  return <DirectoryList area={props.area} scenario={scenario} />;
}
