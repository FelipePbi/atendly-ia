/**
 * Convite de retorno enviado a esta cliente (D-202).
 *
 * A mensagem de retorno saiu por modelo, sem a IA (rodada aprovada pela
 * profissional). Quando a cliente responde, a conversa e da IA, e ela precisa
 * saber o que foi oferecido: a rotina, o servico, a data esperada de volta,
 * o incentivo prometido e os horarios — e de onde partir ao oferecer outros
 * (os horarios de costume da cliente, secao 3 do vault).
 *
 * O texto orienta; quem garante e o codigo. O incentivo vem da rodada, nunca
 * do modelo, e `answer_return_invitation` e o unico caminho para registrar
 * recusa ou pedido para parar.
 */

export interface ReturnInvitationPromptItem {
  kind: "RENEWAL" | "WINBACK";
  serviceName: string | null;
  expectedDate: string | null;
  incentive: string | null;
  offeredSlots: Array<{ date: string; time: string }>;
  habit: { weekdays: number[]; bandStart: string; bandEnd: string } | null;
  sentAt: string;
  followUpSentAt: string | null;
}

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
] as const;

function dayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const weekday = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]} ${match[3]}/${match[2]}`;
}

export function buildReturnInvitationPrompt(
  invitation: ReturnInvitationPromptItem | null,
): string[] {
  if (!invitation) return [];
  const routine =
    invitation.kind === "RENEWAL"
      ? "Renovacao (a cliente esta no prazo de refazer o servico)"
      : "Resgate (a cliente nao vem ha algum tempo)";
  const lines = [
    "CONVITE DE RETORNO ENVIADO A ESTA CLIENTE:",
    `- O negocio mandou a esta cliente um convite de ${routine} em ${invitation.sentAt.slice(0, 10)}${invitation.followUpSentAt ? ", com um lembrete depois" : ""}. A mensagem esta no historico da conversa; continue dali, sem nova saudacao.`,
  ];
  if (invitation.serviceName) {
    lines.push(`- Servico do convite: ${invitation.serviceName}.`);
  }
  if (invitation.expectedDate) {
    lines.push(
      `- Data esperada de volta: ${dayLabel(invitation.expectedDate)}.`,
    );
  }
  if (invitation.offeredSlots.length > 0) {
    lines.push(
      `- Horarios oferecidos na mensagem: ${invitation.offeredSlots
        .map((slot) => `${dayLabel(slot.date)} as ${slot.time}`)
        .join(
          ", ",
        )}. Antes de preparar o agendamento, confira com get_availability: o horario pode ter sido ocupado.`,
    );
  }
  if (invitation.habit) {
    const days =
      invitation.habit.weekdays.length > 0
        ? `nos dias ${invitation.habit.weekdays.map((day) => WEEKDAYS[day]).join(", ")}`
        : "em dias variados";
    lines.push(
      `- Horarios de costume da cliente: ${days}, com inicio entre ${invitation.habit.bandStart} e ${invitation.habit.bandEnd}. Ao oferecer horarios, comece pelo dia e pela faixa de costume; depois o dia de costume na faixa mais proxima; depois outro dia que ela ja usou na faixa de costume; so por ultimo qualquer horario livre. Nao ofereca primeiro um dia que ela nunca usou, a nao ser que ela peca outro dia ou nao haja nada perto do costume.`,
    );
  }
  lines.push(
    invitation.incentive
      ? `- Condicao prometida pela profissional para esta volta: "${invitation.incentive}". Quando falar de beneficio, use exatamente esta condicao. Nunca invente outro desconto, brinde ou condicao, nem altere esta.`
      : "- Nao ha condicao especial neste convite: nao ofereca desconto, brinde nem condicao.",
    "- Se a cliente quiser marcar, confirme o servico e siga o fluxo normal de agendamento (get_availability, create_appointment com prepare e confirmacao clara).",
    "- Se a cliente recusar (nao quero, agora nao, parei de fazer), agradeca em uma frase, encerre sem insistir e chame answer_return_invitation com answer DECLINED.",
    "- Se a cliente pedir para nao receber mais mensagens (pare, nao me mande mais), peca desculpas pelo incomodo em uma frase, diga que nao vai mais mandar e chame answer_return_invitation com answer STOPPED.",
    "- Depois de uma recusa, nunca insista nem faca nova oferta.",
  );
  return lines;
}

/** Amostra fixa para a versao do prompt (`derivePromptVersion`). */
export const STABLE_RETURN_INVITATION_SAMPLE: ReturnInvitationPromptItem = {
  kind: "RENEWAL",
  serviceName: "stable-sample",
  expectedDate: "2026-01-01",
  incentive: "stable-sample",
  offeredSlots: [{ date: "2026-01-02", time: "10:00" }],
  habit: { weekdays: [5], bandStart: "09:00", bandEnd: "12:00" },
  sentAt: "2026-01-01T00:00:00.000Z",
  followUpSentAt: null,
};
