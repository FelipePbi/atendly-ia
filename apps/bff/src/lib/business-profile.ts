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

interface StoredBusinessProfileFields {
  modalities: readonly BusinessModality[];
  address: string | null;
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
  return profile.businessContextProjectedVersion === profile.businessContextVersion
    ? "PROJECTED"
    : "PENDING";
}

interface BusinessProfilePatch {
  /** Ausente preserva o que ja esta gravado; nunca grava conjunto vazio so por omissao. */
  modalities?: readonly BusinessModality[];
  /** Chave ausente preserva o endereco gravado; `null` ou string explicita substituem. */
  address?: string | null;
}

/**
 * Funde o corpo recebido com o que ja esta gravado e valida a regra ON_SITE.
 * Retirar ON_SITE do conjunto nunca apaga um endereco existente — so um
 * corpo que traga `address` explicitamente muda o que esta gravado.
 */
export function resolveBusinessProfileFields(
  current: StoredBusinessProfileFields | null,
  patch: BusinessProfilePatch,
): { modalities: BusinessModality[]; address: string | null } {
  const modalities = [...(patch.modalities ?? current?.modalities ?? [])];

  const rawAddress =
    "address" in patch ? patch.address : (current?.address ?? null);
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

  return { modalities, address };
}
