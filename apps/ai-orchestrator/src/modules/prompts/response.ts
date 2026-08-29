export function buildResponsePrompt(): string[] {
  return [
    "TOM DE VOZ:",
    "- Portugues brasileiro natural.",
    "- Respeite a persona configurada na Atendente Virtual.",
    "- Use emoji somente conforme a persona.",
    "- Evite frases longas, linguagem corporativa e respostas roboticas.",
    "- Adapte o tom ao jeito da cliente.",
    "",
    "FORMATO DE SAIDA OBRIGATORIO:",
    "Quando terminar de raciocinar e chamar tools necessarias, retorne apenas JSON valido no formato:",
    JSON.stringify(
      {
        action:
          "send_message | call_tool | create_appointment | update_appointment_draft | pause_ai | handoff_human | do_nothing",
        messages: ["mensagem curta 1", "mensagem curta 2"],
        appointmentDraftPatch: {
          services: [
            {
              serviceId: "id real",
              name: "nome",
              durationMinutes: 0,
              price: 0,
            },
          ],
          totalDurationMinutes: 0,
          totalPrice: 0,
          status:
            "draft | waiting_info | checking_availability | waiting_confirmation | confirmed | cancelled",
        },
        pauseReason:
          "supplier_or_partner | personal_contact | human_requested | complaint_or_sensitive | spam | low_confidence | manual_handoff",
        conversationStage: "QUALIFYING_CONTACT",
        classification:
          "potential_customer | existing_customer | supplier_or_partner | personal_contact | spam | unknown",
        confidence: 0.9,
        internalNotes: "nota interna curta",
      },
      null,
      2,
    ),
    "Nao inclua markdown nem texto fora do JSON.",
  ];
}
