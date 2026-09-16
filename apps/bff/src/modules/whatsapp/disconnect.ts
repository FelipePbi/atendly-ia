import type { EvolutionClient } from "../../clients/evolution/index.js";
import { getPrisma } from "../../lib/prisma.js";
import type { TenantContext } from "../../lib/tenant-context.js";
import {
  findLinkedInstance,
  resolveInstanceCredential,
  resolveLinkState,
} from "./instance-link.js";

/**
 * A desconexão do WhatsApp, num lugar só (Goal025/WU-02).
 *
 * Extraída de `DELETE /v1/whatsapp` sem mudança de comportamento: a rota
 * continua sendo o único caminho público, e a exclusão de conta passa a chamar
 * **esta** função em vez de repetir logout, remoção remota e remoção da linha
 * local. Duplicar o caminho é como as duas pontas se separam — uma ganha a
 * tolerância a falha remota e a outra não, e ninguém percebe até o número
 * ficar meio desconectado.
 *
 * A tolerância vale para o lado remoto e só para ele: logout e remoção na
 * Evolution podem falhar e a linha local **ainda assim** some. É o contrário
 * do que pareceria prudente, e é deliberado — instância remota órfã é lixo
 * operacional, mas linha local sobrevivente é um vínculo que o dono acha que
 * apagou.
 */
export interface WhatsAppDisconnectDeps {
  evolution: Pick<EvolutionClient, "logoutInstance" | "deleteInstance">;
  requestId: string;
}

/** O que havia para desconectar. Conjunto fechado; "nada" é resposta. */
export type WhatsAppDisconnectOutcome =
  /** Não havia vínculo nenhum: nada a fazer, e isso não é erro. */
  | "ABSENT"
  /** Vínculo do negócio: logout autenticado, remoção remota e linha apagada. */
  | "DISCONNECTED"
  /**
   * Vínculo legado sem dono de negócio, descartado pelo próprio dono. Sem
   * logout autenticado — a credencial está cifrada contra um vínculo que não
   * existe —, mas a instância remota ainda é removida pela chave administrativa.
   */
  | "PENDING_DISCARDED";

/**
 * O que aconteceu, e com qual vínculo. O `instanceId` existe para o log de
 * quem chama: sem ele, o descarte de um vínculo pendente vira uma linha de log
 * que não diz qual linha foi descartada.
 */
export interface WhatsAppDisconnectResult {
  outcome: WhatsAppDisconnectOutcome;
  instanceId: string | null;
}

/**
 * Desconecta e apaga o vínculo local do negócio.
 *
 * **Lança** `CONFLICT` na divergência entre negócios, exatamente como antes:
 * ali já haveria outro negócio no meio, e apagar seria decidir por ele. Quem
 * não pode recusar (a exclusão de conta) trata a exceção; quem pode (a rota)
 * a propaga.
 */
export async function disconnectWhatsApp(
  tenant: TenantContext,
  deps: WhatsAppDisconnectDeps,
): Promise<WhatsAppDisconnectResult> {
  const state = await resolveLinkState(tenant);
  if (state.kind === "divergent") {
    // Recusa vinda do caminho que já sabe recusar, em vez de um erro novo
    // escrito aqui com outra mensagem.
    await findLinkedInstance(tenant);
  }
  if (state.kind === "absent" || state.kind === "divergent") {
    return { outcome: "ABSENT", instanceId: null };
  }

  const instance = state.instance;
  // Sem dono de negócio a credencial não é abrível — a cifra está ligada ao
  // vínculo. O logout autenticado é pulado; a instância remota ainda é
  // removida pela credencial administrativa.
  if (state.kind === "linked") {
    const credential = await resolveInstanceCredential(instance);
    await deps.evolution
      .logoutInstance(credential, deps.requestId)
      .catch(() => null);
  }
  await deps.evolution
    .deleteInstance(
      instance.evolutionInstanceId ?? instance.evolutionInstanceName,
      deps.requestId,
    )
    .catch(() => null);
  await getPrisma().whatsAppInstance.delete({ where: { id: instance.id } });
  return {
    outcome: state.kind === "pending" ? "PENDING_DISCARDED" : "DISCONNECTED",
    instanceId: instance.id,
  };
}
