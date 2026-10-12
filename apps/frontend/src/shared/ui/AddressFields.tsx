"use client";

import { useId } from "react";

import type { BusinessAddressParts } from "@/data";
import { Icon } from "@/shared/icons/Icon";

/**
 * Endereço do local próprio em campos separados (onboarding e Configurações ›
 * Negócio). O rascunho guarda "sem número" como caixa marcada; a API recebe
 * `number: null` nesse caso.
 */
export type AddressDraft = {
  city: string;
  complement: string;
  district: string;
  noNumber: boolean;
  number: string;
  postalCode: string;
  state: string;
  street: string;
};

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  city: "",
  complement: "",
  district: "",
  noNumber: false,
  number: "",
  postalCode: "",
  state: "",
  street: "",
};

const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

export function addressDraftFrom(
  parts: BusinessAddressParts | null | undefined,
): AddressDraft {
  if (!parts) return EMPTY_ADDRESS_DRAFT;
  return {
    city: parts.city,
    complement: parts.complement ?? "",
    district: parts.district,
    noNumber: parts.number === null,
    number: parts.number ?? "",
    postalCode: formatPostalCode(parts.postalCode),
    state: parts.state,
    street: parts.street,
  };
}

export function addressPartsFromDraft(
  draft: AddressDraft,
): BusinessAddressParts {
  return {
    city: draft.city.trim(),
    complement: draft.complement.trim() || null,
    district: draft.district.trim(),
    number: draft.noNumber ? null : draft.number.trim(),
    postalCode: draft.postalCode.replace(/\D/g, ""),
    state: draft.state,
    street: draft.street.trim(),
  };
}

// `required` sozinho não barra um valor só de espaços.
const NOT_BLANK = ".*\\S.*";

export function AddressFields({
  value,
  onChange,
}: {
  value: AddressDraft;
  onChange: (updater: (current: AddressDraft) => AddressDraft) => void;
}) {
  const id = useId();
  const set =
    <K extends keyof AddressDraft>(key: K) =>
    (next: AddressDraft[K]) =>
      onChange((current) => ({ ...current, [key]: next }));

  return (
    <div className="address-fields">
      <div className="field address-postal-code">
        <label className="label" htmlFor={`${id}-cep`}>
          CEP
        </label>
        <input
          autoComplete="postal-code"
          className="input"
          data-error-message="Informe o CEP com 8 números."
          data-server-error-message="Preencha o endereço do seu espaço."
          data-server-field="business.address"
          id={`${id}-cep`}
          inputMode="numeric"
          maxLength={9}
          pattern="\d{5}-?\d{3}"
          placeholder="00000-000"
          required
          value={value.postalCode}
          onChange={(event) =>
            set("postalCode")(formatPostalCode(event.target.value))
          }
        />
      </div>
      <div className="field address-street">
        <label className="label" htmlFor={`${id}-street`}>
          Rua
        </label>
        <input
          autoComplete="address-line1"
          className="input"
          data-error-message="Informe a rua."
          id={`${id}-street`}
          maxLength={200}
          pattern={NOT_BLANK}
          required
          value={value.street}
          onChange={(event) => set("street")(event.target.value)}
        />
      </div>
      <div className="field address-number">
        <label className="label" htmlFor={`${id}-number`}>
          Número
        </label>
        {/* O erro do número entra depois da caixa "Sem número", não entre as
            duas. */}
        <div className="address-number-control" data-error-anchor="">
          <input
            className="input"
            data-error-message="Informe o número."
            disabled={value.noNumber}
            id={`${id}-number`}
            inputMode="numeric"
            maxLength={20}
            pattern={value.noNumber ? undefined : NOT_BLANK}
            placeholder={value.noNumber ? "S/N" : undefined}
            required={!value.noNumber}
            value={value.noNumber ? "" : value.number}
            onChange={(event) => set("number")(event.target.value)}
          />
          <label className="address-no-number">
            <input
              checked={value.noNumber}
              className="sr-only"
              type="checkbox"
              onChange={(event) => set("noNumber")(event.target.checked)}
            />
            <span aria-hidden="true" className="address-check">
              {value.noNumber && <Icon name="check" />}
            </span>
            Sem número
          </label>
        </div>
      </div>
      <div className="field address-complement">
        <label className="label" htmlFor={`${id}-complement`}>
          Complemento <span className="address-optional">(opcional)</span>
        </label>
        <input
          autoComplete="address-line2"
          className="input"
          id={`${id}-complement`}
          maxLength={120}
          placeholder="Sala, andar, bloco"
          value={value.complement}
          onChange={(event) => set("complement")(event.target.value)}
        />
      </div>
      <div className="field address-district">
        <label className="label" htmlFor={`${id}-district`}>
          Bairro
        </label>
        <input
          className="input"
          data-error-message="Informe o bairro."
          id={`${id}-district`}
          maxLength={120}
          pattern={NOT_BLANK}
          required
          value={value.district}
          onChange={(event) => set("district")(event.target.value)}
        />
      </div>
      <div className="field address-city">
        <label className="label" htmlFor={`${id}-city`}>
          Cidade
        </label>
        <input
          autoComplete="address-level2"
          className="input"
          data-error-message="Informe a cidade."
          id={`${id}-city`}
          maxLength={120}
          pattern={NOT_BLANK}
          required
          value={value.city}
          onChange={(event) => set("city")(event.target.value)}
        />
      </div>
      <div className="field address-state">
        <label className="label" htmlFor={`${id}-state`}>
          Estado
        </label>
        <span className="input-wrap">
          <select
            autoComplete="address-level1"
            className="select"
            data-error-message="Escolha o estado."
            id={`${id}-state`}
            required
            value={value.state}
            onChange={(event) => set("state")(event.target.value)}
          >
            <option value="">UF</option>
            {STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <span className="select-icon">
            <Icon name="chevron-down" />
          </span>
        </span>
      </div>
    </div>
  );
}
