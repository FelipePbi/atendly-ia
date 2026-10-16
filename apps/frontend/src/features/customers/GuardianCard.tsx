import Link from "next/link";

import { type CustomerDetail } from "@/data";
import { formatBrazilianPhone } from "@/shared/phone";
import { ContactPhoto, customerPhotoUrl } from "@/shared/ui/ContactPhoto";

import { dayMonthLabel } from "../settings/dayMonth";
import { initials } from "./initials";

type PrimaryGuardian = NonNullable<CustomerDetail["primaryGuardian"]>;

type GuardianCardProps = {
  customer: Pick<CustomerDetail, "name" | "phone">;
  guardian: PrimaryGuardian;
  timezone: string;
};

const CONFIRMED_BY_LABELS: Record<"AI" | "CUSTOMER" | "PROFESSIONAL", string> =
  {
    AI: "confirmado pela IA",
    CUSTOMER: "confirmado pelo cliente",
    PROFESSIONAL: "confirmado por você",
  };

/**
 * Quem agenda por um cliente sem telefone próprio (quadro CL8): o responsável
 * confirmado, o telefone dele, quem confirmou e quando, e a nota do que a IA
 * faz quando ele escreve. Não lê nada: recebe a relação já carregada.
 * O contrato não traz o tipo de relação ("mãe"), então a linha não o inventa.
 */
export function GuardianCard({
  customer,
  guardian,
  timezone,
}: GuardianCardProps) {
  const person = guardian.guardian;
  const name = person.name?.trim() || null;
  const phone = person.phone?.trim()
    ? (formatBrazilianPhone(person.phone, "plus") ?? person.phone)
    : null;
  const guardianFirstName = firstName(name);
  const customerFirstName = firstName(customer.name) ?? "este cliente";
  const showNote = !customer.phone?.trim() && phone !== null;

  const date = dayMonthLabel(guardian.confirmedAt, timezone);
  const confirmation = guardian.confirmedBy
    ? CONFIRMED_BY_LABELS[guardian.confirmedBy]
    : "confirmado";
  const details = [phone, date ? `${confirmation} em ${date}` : confirmation]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label="Quem agenda por este cliente"
      className="customer-guardian"
    >
      <div className="customer-guardian-card">
        <span aria-hidden="true" className="customer-guardian-avatar">
          {initials(name)}
          <ContactPhoto src={customerPhotoUrl(person.id)} />
        </span>
        <div className="customer-guardian-copy">
          <span className="customer-guardian-title">
            {name ?? phone ?? "Responsável sem nome"} agenda para{" "}
            {customerFirstName}
          </span>
          <span className="customer-guardian-detail">{details}</span>
        </div>
        <Link
          aria-label={name ? `Ver ${name}` : undefined}
          className="customer-guardian-link"
          href={`/clientes/detalhes?id=${encodeURIComponent(person.id)}`}
        >
          {guardianFirstName ? `Ver ${guardianFirstName}` : "Ver responsável"}
        </Link>
      </div>
      {showNote && (
        <p className="customer-guardian-note">
          <span aria-hidden="true" className="customer-guardian-dot" />
          <span>
            {guardianFirstName
              ? `As mensagens chegam pelo WhatsApp de ${guardianFirstName}. Quando ${guardianFirstName} escrever, a IA pode perguntar `
              : "As mensagens chegam pelo WhatsApp de quem agenda. Quando essa pessoa escrever, a IA pode perguntar "}
            <em>“Seria para {customerFirstName} novamente?”</em> em vez de
            assumir.
          </span>
        </p>
      )}
    </section>
  );
}

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}
