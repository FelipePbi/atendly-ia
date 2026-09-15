import type { PrismaClient } from "../../generated/prisma/client.js";
import { type AiTenantSettings, normalizeAiSettings } from "./ai-settings.js";
import {
  type BusinessContext,
  normalizeBusinessContext,
} from "./business-context.js";

/**
 * O que o turno precisa saber sobre o negocio antes de chamar o agente.
 *
 * Sao os dois dados que `AssistantService.prepareGraphTurn` le para montar o
 * prompt e para decidir se ha negocio configurado: sem `businessContext`,
 * `businessContextConfigured` e falso e o turno inteiro vira a decisao
 * imediata de "contexto incompleto" — a IA nao consulta catalogo, nao consulta
 * agenda e nao agenda nada.
 */
export interface TenantExecutionContext {
  businessContext: BusinessContext;
  aiSettings: AiTenantSettings;
}

/** A linha de `AiTenantConfig`, na forma minima que esta leitura usa. */
export interface TenantExecutionConfigRow {
  enabled?: boolean | null;
  tone?: unknown;
  settings?: unknown;
}

/**
 * Traduz a configuracao gravada para o contexto do turno.
 *
 * Existe como funcao propria — e nao inline em quem le o banco — porque ha
 * mais de um caminho que entrega mensagem a IA: o webhook do canal e a
 * execucao do teste real. Os dois precisam montar **o mesmo** contexto; foi
 * justamente a divergencia entre eles que deixou o teste real sem contexto de
 * negocio nenhum (Goal019, blocker 1 da rodada 2).
 */
export function tenantExecutionContextFrom(
  config: TenantExecutionConfigRow | null | undefined,
): TenantExecutionContext {
  return {
    businessContext: normalizeBusinessContext(config?.settings),
    aiSettings: normalizeAiSettings({
      aiEnabled: config?.enabled ?? false,
      // Estilo legado gravado antes do Goal011 sai daqui ja no vocabulario
      // novo; tenant sem configuracao sai no equilibrado.
      tone: config?.tone,
    }),
  };
}

/** Le a configuracao do tenant e devolve o contexto do turno. */
export async function loadTenantExecutionContext(
  prisma: Pick<PrismaClient, "aiTenantConfig">,
  tenantId: string,
): Promise<TenantExecutionContext> {
  const config = await prisma.aiTenantConfig.findUnique({
    where: { tenantId },
    select: { enabled: true, tone: true, settings: true },
  });
  return tenantExecutionContextFrom(config);
}
