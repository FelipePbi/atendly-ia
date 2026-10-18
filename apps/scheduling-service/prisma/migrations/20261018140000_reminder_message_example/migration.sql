-- Mensagem de exemplo do lembrete (2026-10-18, D-197).
--
-- ADITIVA: uma coluna nova, nula. Nulo e o padrao do produto (a mensagem pelo
-- estilo da IA); preenchida, e o texto que a profissional escreveu como
-- referencia de tom para o lembrete. Nao e fato: servico, data, horario,
-- preco e confirmacao continuam saindo dos dados do agendamento. Texto vazio
-- nao existe (vira nulo no codigo) e o teto de 600 caracteres e do banco
-- tambem, alem da validacao das rotas.
ALTER TABLE "ReminderSettings" ADD COLUMN "messageExample" TEXT;

ALTER TABLE "ReminderSettings"
  ADD CONSTRAINT "ReminderSettings_messageExample_check"
  CHECK ("messageExample" IS NULL OR char_length("messageExample") BETWEEN 1 AND 600);
