/**
 * Endereço do local próprio em campos separados (`AddressFields`), como a
 * usuária preenche no onboarding (`endereco`) e em Configurações › Negócio.
 */

import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

import type { BusinessAddressParts } from "@/data";

type User = ReturnType<typeof userEvent.setup>;

/** Endereço completo, no formato que a API recebe e devolve. */
export const FLORES_ADDRESS: BusinessAddressParts = {
  city: "São Paulo",
  complement: null,
  district: "Centro",
  number: "100",
  postalCode: "01310100",
  state: "SP",
  street: "Rua das Flores",
};

/** Texto único que o BFF monta das partes (`formatBusinessAddress`). */
export function composedAddress(parts: BusinessAddressParts): string {
  const postalCode = `${parts.postalCode.slice(0, 5)}-${parts.postalCode.slice(5)}`;
  const streetLine = [parts.street, parts.number ?? "s/n", parts.complement]
    .filter(Boolean)
    .join(", ");
  return `${streetLine} - ${parts.district}, ${parts.city} - ${parts.state}, CEP ${postalCode}`;
}

export function addressField(
  label: "CEP" | "Rua" | "Número" | "Complemento" | "Bairro" | "Cidade" | "Estado",
  root: HTMLElement = document.body,
): HTMLElement {
  return within(root).getByLabelText(
    label === "Complemento" ? /^Complemento/ : label,
  );
}

/**
 * Digita cada parte no seu campo. Os valores entram como digitados (com
 * espaços, se houver), para a prova de `trim` ficar no componente; `number:
 * null` marca "Sem número".
 */
export async function fillAddress(
  user: User,
  values: {
    city: string;
    complement: string | null;
    district: string;
    number: string | null;
    postalCode: string;
    state: string;
    street: string;
  },
  root: HTMLElement = document.body,
): Promise<void> {
  const scope = within(root);
  await user.type(await scope.findByLabelText("CEP"), values.postalCode);
  await user.type(addressField("Rua", root), values.street);
  if (values.number === null) {
    await user.click(scope.getByRole("checkbox", { name: "Sem número" }));
  } else {
    await user.type(addressField("Número", root), values.number);
  }
  if (values.complement !== null) {
    await user.type(addressField("Complemento", root), values.complement);
  }
  await user.type(addressField("Bairro", root), values.district);
  await user.type(addressField("Cidade", root), values.city);
  if (values.state !== "") {
    await user.selectOptions(addressField("Estado", root), values.state);
  }
}

/** O grupo de endereço de Configurações › Negócio. */
export function settingsAddressGroup(): Promise<HTMLElement> {
  return screen.findByRole("group", { name: "Endereço do seu espaço" });
}
