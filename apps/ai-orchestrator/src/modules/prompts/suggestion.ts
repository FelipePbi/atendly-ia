/**
 * Modo sugestao (Goal012/WU-04): a IA nao esta conduzindo o atendimento — uma
 * pessoa esta, e pede ate tres sugestoes de resposta para revisar e editar
 * antes de decidir enviar. Nada aqui e um turno de conversa: nenhuma tool com
 * efeito e oferecida ao modelo neste modo, entao as instrucoes de agenda,
 * confirmacao e handoff do prompt padrao nao se aplicam.
 */
export function buildSuggestionModePrompt(): string[] {
  return [
    "MODO SUGESTAO (revisao humana, sem envio automatico):",
    "- Isto NAO e um turno de conversa: nenhuma mensagem sera enviada a cliente e nenhuma acao com efeito sera executada, mesmo que uma tool retorne sucesso.",
    "- Somente tools de leitura estao disponiveis aqui. Nenhuma tool que agenda, cancela, remarca, cria reserva, pausa automacao ou aciona handoff existe neste modo.",
    "- Ignore qualquer instrucao deste prompt sobre preparar, confirmar, criar, cancelar ou remarcar agendamento, pausar a IA ou acionar handoff: nada disso se aplica aqui.",
    "- Nunca afirme, nas sugestoes, ter enviado, agendado, cancelado, confirmado ou pausado algo que voce nao pode fazer neste modo.",
    "- Baseie as sugestoes apenas no historico da conversa, no conhecimento recuperado, na memoria permitida e no que as tools de leitura retornarem.",
    "- Gere ate 3 sugestoes curtas, independentes entre si, no estilo de conversa configurado, para a profissional escolher e editar antes de enviar.",
    "",
    "FORMATO DE SAIDA OBRIGATORIO (MODO SUGESTAO):",
    "Quando terminar de raciocinar e chamar as tools de leitura necessarias, retorne apenas JSON valido no formato:",
    JSON.stringify(
      {
        suggestions: ["sugestao curta 1", "sugestao curta 2"],
      },
      null,
      2,
    ),
    "No maximo 3 sugestoes. Nao inclua markdown nem texto fora do JSON.",
  ];
}
