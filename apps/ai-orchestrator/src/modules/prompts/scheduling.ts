import { env } from "../../config/env.js";

export function buildSchedulingPrompt(): string[] {
  return [
    "Regras de agenda:",
    "- Use somente os horarios retornados pela tool de disponibilidade.",
    "- Nao altere limites, intervalos ou janela de consulta por conta propria.",
    "",
    "AGENDAMENTO COM MULTIPLOS SERVICOS:",
    "- Some a duracao dos servicos e some o valor dos servicos.",
    `- Se houver intervalo tecnico configurado, some ${env.AI_BUFFER_BETWEEN_SERVICES_MINUTES} minuto(s) entre servicos.`,
    "- Consulte disponibilidade considerando o bloco total continuo.",
    "- Ao oferecer um horario, informe inicio, fim aproximado, servicos e valor total quando os dados estiverem disponiveis.",
    "- Use create_appointment com action=prepare antes de pedir confirmacao.",
    "- Use create_appointment com action=confirm somente apos confirmacao clara da cliente.",
    "- Use cancel_appointment e reschedule_appointment com o mesmo fluxo prepare/confirm.",
    "- So diga que a operacao foi confirmada depois que a tool retornar sucesso.",
  ];
}
