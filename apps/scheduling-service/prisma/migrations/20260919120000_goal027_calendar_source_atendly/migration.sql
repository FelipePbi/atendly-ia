-- Goal027, WU-01: a fonte da agenda sai do dado. `CalendarSettings.source`
-- passa a valer sempre `ATENDLY`, e o banco passa a recusar qualquer outro
-- valor nessa tabela.
--
-- REGRA DE REESCRITA: toda linha de `CalendarSettings` com
-- `source = 'MINHA_AGENDA'` e reescrita para `ATENDLY`. A reescrita e
-- declarada, nao silenciosa: `scripts/goal027-calendar-source-migration-
-- rehearsal.mjs` conta e reporta quantas linhas mudaram.
--
-- MOTIVO: desde o corte operacional do Goal010, o negocio marcado
-- `MINHA_AGENDA` recebe `409` em TODA escrita, TODA oferta e TODA leitura
-- operacional da agenda. Ele nao tem agenda externa funcionando — tem um
-- rotulo que so o impede de usar a propria, e nenhum caminho de volta.
-- `ATENDLY` e a unica fonte que o produto honra, mais ainda depois da
-- retirada do writer remoto (Goal026). Passar a linha para `ATENDLY`
-- DESCREVE o que ja e verdade; nao concede capacidade nova. Nada mais do
-- negocio muda: servicos, disponibilidade, agendamentos, integracao e sessao
-- de importacao ficam exatamente como estao, e o checklist de onboarding
-- passa a cobrar `AVAILABILITY_REQUIRED` como cobra de qualquer negocio
-- Atendly.
--
-- `updatedAt` da linha reescrita avanca, porque a linha de fato mudou. E a
-- unica coluna, alem de `source`, que esta migration toca — `timezone`,
-- `minLeadMinutes`, `maxLeadDays`, `granularityMinutes` e `createdAt` ficam
-- intactos, e a linha que ja era `ATENDLY` nao e tocada em coluna nenhuma.
--
-- O QUE ESTA MIGRATION NAO FAZ: nao reduz o enum `CalendarSource`. Ele
-- continua com `ATENDLY` e `MINHA_AGENDA` porque `MigrationJob.source` e
-- `MigrationJob.target` sao historico preservado (D-026, Goal026): job antigo
-- continua dizendo de onde para onde a importacao foi, e apagar o valor
-- reescreveria esse historico. Nenhuma linha de `MigrationJob`,
-- `MigrationJobItem`, `MigrationConflict`, `IntegrationConnection`,
-- `ExternalEntityMap` ou `ImportSession` e tocada aqui. Nenhuma tabela,
-- coluna, enum ou linha e apagada.
--
-- RETOMAVEL/IDEMPOTENTE: o `UPDATE` filtra por `source <> 'ATENDLY'` e na
-- segunda execucao nao encontra linha nenhuma; a guarda `duplicate_object`
-- absorve a constraint ja criada. Reaplicar nao muda linha e nao falha.

-- 1. Reescrita declarada das linhas legadas.
UPDATE "CalendarSettings"
   SET "source"    = 'ATENDLY',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "source" <> 'ATENDLY';

-- 2. Trava no banco: a partir daqui o estado invalido deixa de ser alcancavel
--    mesmo por escrita fora do servico. Nome no padrao das constraints
--    existentes (`CalendarSettings_offer_rules_check`,
--    `MigrationJob_sources_check`).
DO $$ BEGIN
    ALTER TABLE "CalendarSettings" ADD CONSTRAINT "CalendarSettings_source_atendly_check"
        CHECK ("source" = 'ATENDLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
