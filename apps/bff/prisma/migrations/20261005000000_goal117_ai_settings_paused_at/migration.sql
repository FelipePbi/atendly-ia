-- Goal117, WU-01: instante da pausa humana da IA.
--
-- ADITIVA: coluna anulavel, sem default e sem backfill. Nulo e "nao ha pausa
-- humana registrada" (IA ligada, nunca ligada, ou pausa anterior a este
-- Goal); a migration nao inventa instante nenhum para linhas existentes.

ALTER TABLE "AiSettings" ADD COLUMN "pausedAt" TIMESTAMP(3);
