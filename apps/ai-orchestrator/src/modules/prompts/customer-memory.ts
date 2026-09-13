import {
  customerMemoryKindLabel,
  customerMemoryOriginLabel,
  type CustomerMemoryPromptItem,
} from "../memory/customer-memory.js";

/**
 * Secao de memoria da pessoa no prompt.
 *
 * So chega aqui memoria **permitida** da pessoa vinculada ao contato: o filtro
 * de permissao, de remocao e de substituicao acontece na consulta
 * (`CustomerMemoryService.loadForPrompt`). Esta funcao nao decide o que pode
 * ser lembrado; ela apresenta origem e idade para que o modelo saiba o peso de
 * cada item — preferencia inferida antiga nao vale o mesmo que cadastro recente
 * da profissional.
 *
 * E deliberadamente separada da `ConversationMemory` (o "Estado interno atual
 * da conversa"), que dura a sessao e nao tem origem nem permissao.
 */
export function buildCustomerMemoryPrompt(
  items: CustomerMemoryPromptItem[],
): string[] {
  if (items.length === 0) {
    return [
      "Memoria da pessoa atendida:",
      "- Nenhuma memoria autorizada para esta pessoa.",
      "- Nao presuma preferencia, historico nem observacao que nao esteja listada aqui.",
    ];
  }

  return [
    "Memoria da pessoa atendida (somente o que o negocio autorizou a IA a usar):",
    "- Cada item traz a origem e ha quanto tempo foi observado. Use como contexto, nunca como fato confirmado da agenda ou do cadastro.",
    "- Item marcado como antigo tem menor peso: confirme com a pessoa antes de agir sobre ele.",
    "- Nunca cite a origem nem a idade da memoria para a cliente e nunca diga que voce guarda registros sobre ela.",
    "- Nao invente memoria fora desta lista e nao trate ausencia de memoria como novidade.",
    ...items.map((item) => formatMemoryLine(item)),
  ];
}

function formatMemoryLine(item: CustomerMemoryPromptItem): string {
  const age =
    item.ageDays <= 0
      ? "observado hoje"
      : `observado ha ${item.ageDays} dia(s)`;
  const staleMark = item.stale ? " | ANTIGO, menor peso" : "";
  return `[${customerMemoryKindLabel(item.kind)} | origem ${customerMemoryOriginLabel(item.origin)} | ${age}${staleMark}] ${item.value}`;
}
