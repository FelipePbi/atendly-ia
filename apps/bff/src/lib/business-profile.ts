import { z } from "zod";

import { AppError } from "./errors.js";

/**
 * Modalidade de atendimento do negocio (Goal018/WU-01). Selecao multipla,
 * mesmo vocabulario do enum "BusinessModality" do Postgres.
 */
export const BUSINESS_MODALITIES = ["ON_SITE", "AT_HOME", "ONLINE"] as const;
export type BusinessModality = (typeof BUSINESS_MODALITIES)[number];

export const businessModalitySchema = z.enum(BUSINESS_MODALITIES);

/** Corpo aceita string vazia/so espaco como "sem endereco", nunca 400 generico
 * so por isso — a exigencia de endereco por ON_SITE tem o erro proprio abaixo. */
export const businessAddressSchema = z.string().trim().max(300).nullable();

/**
 * Endereco em partes (formulario dividido do onboarding e de Configuracoes).
 * CEP com ou sem mascara vira 8 digitos; UF vira 2 letras maiusculas.
 * `number` nulo e "sem numero"; `complement` vazio vira nulo.
 */
const requiredPart = (max: number) => z.string().trim().min(1).max(max);
const optionalPart = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null));

export const businessAddressPartsSchema = z
  .object({
    postalCode: z
      .string()
      .transform((value) => value.replace(/\D/g, ""))
      .pipe(z.string().length(8)),
    state: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/)),
    city: requiredPart(120),
    district: requiredPart(120),
    street: requiredPart(200),
    number: optionalPart(20),
    complement: optionalPart(120),
  })
  .nullable();

export type BusinessAddressParts = NonNullable<
  z.infer<typeof businessAddressPartsSchema>
>;

/** Texto unico lido pela IA, no formato usual de endereco brasileiro. */
export function formatBusinessAddress(parts: BusinessAddressParts): string {
  const postalCode = `${parts.postalCode.slice(0, 5)}-${parts.postalCode.slice(5)}`;
  const streetLine = [parts.street, parts.number ?? "s/n", parts.complement]
    .filter(Boolean)
    .join(", ");
  return `${streetLine} - ${parts.district}, ${parts.city} - ${parts.state}, CEP ${postalCode}`;
}

function storedAddressParts(value: unknown): BusinessAddressParts | null {
  const parsed = businessAddressPartsSchema.safeParse(value ?? null);
  return parsed.success ? parsed.data : null;
}

interface StoredBusinessProfileFields {
  modalities: readonly BusinessModality[];
  address: string | null;
  addressParts?: unknown;
}

interface BusinessContextSource {
  businessName: string;
  category: string | null;
  timezone: string;
  modalities: readonly BusinessModality[];
  address: string | null;
  businessContextVersion: number;
}

/**
 * Corpo enviado para a IA nos dois caminhos que ja projetam contexto de
 * negocio (settings e onboarding — Goal018/WU-03). Um unico lugar de calculo
 * para os dois nao divergirem sobre o que "segmento" ou "endereco" significam.
 */
export function businessContextPayload(profile: BusinessContextSource) {
  return {
    version: profile.businessContextVersion,
    businessName: profile.businessName,
    timezone: profile.timezone,
    segment: profile.category?.trim() || "",
    modalities: profile.modalities,
    address: profile.address ?? "",
  };
}

export type BusinessContextProjectionState = "PROJECTED" | "PENDING";

/**
 * Projetado/pendente e derivado da comparacao entre as duas versoes gravadas
 * no BFF, nunca de um booleano solto: um booleano pode ficar mentindo depois
 * que o contexto muda de novo sem nova projecao bem-sucedida.
 */
export function businessContextProjectionState(profile: {
  businessContextVersion: number;
  businessContextProjectedVersion: number;
}): BusinessContextProjectionState {
  return profile.businessContextProjectedVersion ===
    profile.businessContextVersion
    ? "PROJECTED"
    : "PENDING";
}

interface BusinessProfilePatch {
  /** Ausente preserva o que ja esta gravado; nunca grava conjunto vazio so por omissao. */
  modalities?: readonly BusinessModality[];
  /** Chave ausente preserva o endereco gravado; `null` ou string explicita substituem. */
  address?: string | null;
  /**
   * Chave ausente preserva; partes explicitas substituem e montam `address`;
   * `null` apaga as partes. Um `address` solto (sem partes) limpa as partes
   * gravadas, porque elas deixariam de descrever o texto.
   */
  addressParts?: BusinessAddressParts | null;
}

/**
 * Funde o corpo recebido com o que ja esta gravado e valida a regra ON_SITE.
 * Retirar ON_SITE do conjunto nunca apaga um endereco existente — so um
 * corpo que traga `address` explicitamente muda o que esta gravado.
 */
export function resolveBusinessProfileFields(
  current: StoredBusinessProfileFields | null,
  patch: BusinessProfilePatch,
): {
  modalities: BusinessModality[];
  address: string | null;
  addressParts: BusinessAddressParts | null;
} {
  const modalities = [...(patch.modalities ?? current?.modalities ?? [])];

  let addressParts: BusinessAddressParts | null;
  let rawAddress: string | null | undefined;
  if ("addressParts" in patch) {
    addressParts = patch.addressParts ?? null;
    rawAddress = addressParts
      ? formatBusinessAddress(addressParts)
      : "address" in patch
        ? patch.address
        : null;
  } else if ("address" in patch) {
    addressParts = null;
    rawAddress = patch.address;
  } else {
    addressParts = storedAddressParts(current?.addressParts);
    rawAddress = current?.address ?? null;
  }
  const address =
    rawAddress && rawAddress.trim().length > 0 ? rawAddress.trim() : null;

  if (modalities.includes("ON_SITE") && !address) {
    throw new AppError(
      "BUSINESS_ADDRESS_REQUIRED",
      "Address is required when ON_SITE is one of the service modalities.",
      400,
      { field: "address" },
    );
  }

  return { modalities, address, addressParts };
}

/** Partes gravadas como a API devolve: nulas quando ausentes ou invalidas. */
export function businessAddressPartsDto(
  value: unknown,
): BusinessAddressParts | null {
  return storedAddressParts(value);
}
