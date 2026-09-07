import { AppError } from "../../lib/errors.js";
import {
  type CredentialBinding,
  credentialKeysConfigured,
  isSealedCredential,
  needsRotation,
  openInstanceCredential,
  sealInstanceCredential,
} from "../../lib/instance-credentials.js";
import { getPrisma } from "../../lib/prisma.js";
import type { TenantContext } from "../../lib/tenant-context.js";

/**
 * Resolução do vínculo entre negócio e instância WhatsApp.
 *
 * O BFF é o dono do vínculo. Nenhuma consulta parte do que o navegador enviou:
 * o tenant vem do contexto autenticado e a instância só é considerada
 * autorizada quando tenant e usuário do registro coincidem com esse contexto.
 *
 * Estado ambíguo — instância do usuário sem dono definido, instância do tenant
 * pertencente a outro usuário, ou duas linhas concorrentes — bloqueia o uso até
 * resolução explícita. Em nenhum caso a primeira associação encontrada vira
 * dona por fallback.
 */
export interface LinkedInstance {
  id: string;
  tenantId: string | null;
  userId: string;
  evolutionInstanceId: string | null;
  evolutionInstanceName: string;
  evolutionInstanceToken: string;
  credentialKeyId: string | null;
  credentialVersion: number;
  phoneNumber: string | null;
  status: string;
  qrcode: string | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Divergência entre negócios: duas linhas concorrentes, ou uma linha cujo dono
 * de negócio e dono de usuário apontam para contas diferentes. Resolver isso
 * envolveria decidir por outro negócio, então nada aqui se autoatende.
 */
const DIVERGENT_LINK =
  "WhatsApp connection ownership diverges between this business and the number's original account. The link stays blocked until an operator resolves it.";

/**
 * Estoque legado que o backfill deixou sem dono de negócio, na conta do próprio
 * usuário autenticado. Não é adotado em silêncio por este tenant, mas o dono
 * pode descartá-lo e conectar o número de novo — é a única parte ambígua que
 * envolve um negócio só.
 */
const PENDING_LINK =
  "WhatsApp connection ownership is pending for this business. Disconnect it (DELETE /v1/whatsapp) to discard the pending link, then connect the number again.";

export type LinkState =
  | { kind: "absent" }
  | { kind: "linked"; instance: LinkedInstance }
  | { kind: "pending"; instance: LinkedInstance }
  | { kind: "divergent" };

/**
 * Estado bruto do vínculo, sem decidir por quem o consulta.
 *
 * `findLinkedInstance` recusa `pending` e `divergent`; só o descarte explícito
 * pelo dono, em `DELETE /v1/whatsapp`, trata `pending` como resolvível.
 */
export async function resolveLinkState(
  tenant: TenantContext,
): Promise<LinkState> {
  const prisma = getPrisma();
  const [byTenant, byUser] = await Promise.all([
    prisma.whatsAppInstance.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    prisma.whatsAppInstance.findUnique({ where: { userId: tenant.userId } }),
  ]);

  if (byTenant && byUser && byTenant.id !== byUser.id) {
    return { kind: "divergent" };
  }
  if (byTenant && byTenant.userId !== tenant.userId) {
    return { kind: "divergent" };
  }
  if (!byTenant && byUser) {
    return { kind: "pending", instance: byUser };
  }
  return byTenant ? { kind: "linked", instance: byTenant } : { kind: "absent" };
}

export async function findLinkedInstance(
  tenant: TenantContext,
): Promise<LinkedInstance | null> {
  const state = await resolveLinkState(tenant);
  switch (state.kind) {
    case "linked":
      return state.instance;
    case "absent":
      return null;
    case "pending":
      throw new AppError("CONFLICT", PENDING_LINK, 409);
    case "divergent":
      throw new AppError("CONFLICT", DIVERGENT_LINK, 409);
  }
}

export async function requireLinkedInstance(
  tenant: TenantContext,
): Promise<LinkedInstance> {
  const instance = await findLinkedInstance(tenant);
  if (!instance) {
    throw new AppError("NOT_FOUND", "WhatsApp connection was not found.", 404);
  }
  return instance;
}

function binding(instance: {
  tenantId: string | null;
  evolutionInstanceName: string;
}): CredentialBinding {
  if (!instance.tenantId) {
    throw new AppError("CONFLICT", PENDING_LINK, 409);
  }
  return {
    tenantId: instance.tenantId,
    evolutionInstanceName: instance.evolutionInstanceName,
  };
}

export function sealedInstanceCredentialData(
  plaintext: string,
  instance: { tenantId: string; evolutionInstanceName: string },
) {
  const sealed = sealInstanceCredential(plaintext, binding(instance));
  return {
    evolutionInstanceToken: sealed.envelope,
    credentialKeyId: sealed.keyId,
    credentialVersion: sealed.version,
    credentialRotatedAt: new Date(),
  };
}

/**
 * Devolve a credencial em claro para uso imediato na chamada ao transporte.
 *
 * Envelope de chave antiga é regravado com a chave ativa (rotação), e estoque
 * legado em texto puro é cifrado na primeira leitura. Falha de cifra, chave
 * ausente ou vínculo não resolvido interrompem a operação — não existe queda
 * para a chave global.
 */
export async function resolveInstanceCredential(
  instance: LinkedInstance,
): Promise<string> {
  const target = binding(instance);

  if (instance.credentialVersion >= 1 || isSealedCredential(instance.evolutionInstanceToken)) {
    const plaintext = openInstanceCredential(
      instance.evolutionInstanceToken,
      target,
    );
    if (
      needsRotation({
        credentialKeyId: instance.credentialKeyId,
        credentialVersion: instance.credentialVersion,
      })
    ) {
      await persistSealed(instance.id, plaintext, target);
    }
    return plaintext;
  }

  if (!credentialKeysConfigured()) {
    throw new AppError(
      "CREDENTIAL_UNAVAILABLE",
      "Legacy WhatsApp credential cannot be used before WHATSAPP_CREDENTIAL_KEYS is configured.",
      503,
    );
  }

  const plaintext = instance.evolutionInstanceToken;
  await persistSealed(instance.id, plaintext, target);
  return plaintext;
}

async function persistSealed(
  id: string,
  plaintext: string,
  target: { tenantId: string; evolutionInstanceName: string },
): Promise<void> {
  await getPrisma().whatsAppInstance.update({
    where: { id },
    data: sealedInstanceCredentialData(plaintext, target),
  });
}
