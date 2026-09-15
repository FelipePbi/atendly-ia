/**
 * Resposta da cliente ao lembrete (Goal021, G-27).
 *
 * As quatro saidas do vault, e nenhuma quinta: sim registra e agradece curto;
 * nao oferece cancelar ou remarcar **sem decidir nada**; resposta vaga tenta
 * esclarecer; ausencia de resposta nao produz saida nenhuma, porque sem turno
 * de entrada nao existe turno de conversa.
 *
 * Este texto orienta o modelo; ele nao e a garantia. Quem garante e o codigo:
 * `confirm_appointment_presence` so aceita o id do atendimento (nao ha como
 * dizer "nao vem" por ela), le a configuracao do negocio antes de registrar e
 * cancelar ou remarcar continua exigindo prepare + confirmacao explicita.
 */
export function buildPresencePrompt(): string[] {
  return [
    "RESPOSTA AO LEMBRETE DE ATENDIMENTO:",
    "- Quando a cliente responder um sim claro a um lembrete que pediu confirmacao de presenca, use confirm_appointment_presence com o appointmentId daquele atendimento e responda de forma breve, so agradecendo a confirmacao.",
    "- Confirmar presenca nao muda o status do atendimento, nao conclui e nao cancela nada. Nunca diga que remarcou, cancelou ou concluiu por causa de uma confirmacao de presenca.",
    "- Se a cliente responder que nao vai, pergunte se ela prefere cancelar ou remarcar e espere a escolha. Nunca cancele nem remarque por conta propria a partir de um nao.",
    "- Se a resposta for vaga, curta demais ou ambigua, nao registre presenca: pergunte de forma simples se ela confirma o atendimento.",
    "- Se a tool responder que o negocio nao usa confirmacao pelo lembrete, apenas siga a conversa normalmente e nao registre nada.",
  ];
}
