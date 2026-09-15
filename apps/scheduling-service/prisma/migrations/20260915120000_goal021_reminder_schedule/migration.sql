-- Goal021 - lembretes, confirmacao de presenca e notificacao de alteracao:
-- configuracao de lembrete por negocio, versao monotonica do compromisso e
-- intencao de envio duravel ao cliente.
--
-- ADITIVA E RETOMAVEL, em um passo unico. Nao ha passo de corte e nao ha
-- BACKFILL DE COMPORTAMENTO: este arquivo nao tem um unico `UPDATE`. A unica
-- tabela preexistente tocada e `Appointment`, que ganha uma coluna nova
-- (`notifiableVersion`) com `NOT NULL DEFAULT 1` — default constante, fast
-- default do Postgres 11+, que nao reescreve a tabela nem muda o valor de
-- nenhuma linha existente. Nenhuma coluna existente muda de tipo, de default
-- ou de significado, e nenhuma linha e apagada, reescrita ou convertida.
--
-- NENHUM COMPROMISSO EXISTENTE GANHA LEMBRETE RETROATIVO. As duas tabelas de
-- configuracao (`ReminderSettings`, `ReminderRule`) e a de intencao
-- (`AppointmentNotificationIntent`) nascem VAZIAS. Negocio sem linha em
-- `ReminderSettings` nunca configurou lembrete, e isso e diferente de ter
-- desligado: quem desligou tem a linha de configuracao e ZERO `ReminderRule`.
-- O default do produto (um lembrete, vinte e quatro horas antes) e constante
-- nomeada no dominio, nunca linha fabricada por migration — a mesma regra que
-- o Goal018 aplicou a `BusinessProfile.modalities`.
--
-- "ATE DOIS" E INVARIANTE DE ESQUEMA, NAO VALIDACAO DE APLICACAO. Sao dois
-- objetos de banco agindo juntos em `ReminderRule`:
--
--   1. `ReminderRule_pkey` sobre `("tenantId", "slot")` — a segunda linha da
--      mesma posicao para o mesmo negocio e recusada pelo banco, inclusive
--      com duas conexoes concorrentes commitando ao mesmo tempo;
--   2. `ReminderRule_slot_check` restringindo `slot` a `FIRST`/`SECOND`.
--
-- O tipo `AppointmentNotificationSlot` tem TRES valores porque o aviso de
-- alteracao precisa de posicao propria (ver abaixo); o CHECK e o que impede o
-- terceiro valor de virar um terceiro lembrete configurado. Com os dois, nao
-- existe caminho — rota, importacao, correcao operacional em SQL cru — que
-- grave um terceiro lembrete para um negocio.
--
-- POSICAO NAO NULA NO AVISO DE ALTERACAO, E O MOTIVO E POSTGRES, NAO ESTILO.
-- O dedupe da intencao e o indice unico
-- `AppointmentNotificationIntent_identity_key` sobre `("tenantId",
-- "appointmentId", "kind", "slot", "appointmentVersion")`. Se o aviso de
-- alteracao gravasse `slot` nulo, o indice nao deduplicaria nada para ele: no
-- PostgreSQL dois `NULL` nunca sao iguais num indice unico B-tree padrao, e
-- duas linhas `(mesmo compromisso, CHANGE_NOTICE, NULL, mesma versao)`
-- entrariam as duas. Por isso `slot` e `NOT NULL` e o aviso usa o valor
-- proprio `CHANGE_NOTICE`, amarrado a especie por
-- `AppointmentNotificationIntent_kind_slot_check`.
--
-- VOCABULARIO FECHADO, NAO TEXTO LIVRE. Estado e motivo da intencao sao tipos
-- enum do Postgres (`AppointmentNotificationState`,
-- `AppointmentNotificationReason`), e o estado ganha tambem CHECK explicito
-- pelo mesmo motivo do Goal008/Goal010: o conjunto fechado e invariante de
-- banco, e um valor fora dele precisa ser recusado mesmo que algum caminho
-- futuro passe a gravar a coluna como texto. `detail` e texto, mas e
-- complemento sanitizado — nunca substitui `reason`.
--
-- TRES ESTADOS DE VERDADE DIFERENTES, amarrados por
-- `AppointmentNotificationIntent_reason_check`: "nao saiu" (`PENDING`,
-- `CLAIMED`) e "saiu" (`SENT`) nao tem motivo; "nao devia sair" (`DISMISSED`,
-- `CANCELLED`) e "falhou" (`FAILED`) tem motivo OBRIGATORIO. O banco recusa
-- uma dispensa sem motivo, que e exatamente o registro que a central de
-- notificacoes do Goal022 nao conseguiria explicar.
--
-- LEASE PELO RELOGIO DO BANCO: `dueAt`, `leaseAcquiredAt`, `leaseExpiresAt`,
-- `leaseHeartbeatAt`, `lastAttemptAt`, `sentAt` e `settledAt` sao TIMESTAMPTZ,
-- nao TIMESTAMP, pela licao do `AppointmentHold` no Goal008
-- (`20260909182000_goal008_agenda_fixups`) e do `ImportSession` no Goal010:
-- sao sempre comparados com `now()` do servidor e precisam continuar corretos
-- independentemente do fuso da sessao que grava ou le a linha.
--
-- CASCATA DELIBERADA EM `AppointmentNotificationIntent`, e so nela. O FK para
-- `Appointment` e `ON DELETE CASCADE`, diferente de `AppointmentItem` e
-- `AppointmentEvent`, que sao `RESTRICT`. A intencao e trabalho operacional
-- que so existe enquanto o compromisso existe; o historico de registro do
-- atendimento continua sendo `AppointmentEvent`. Sem a cascata, a remocao
-- definitiva do atendimento do teste de ativacao (Goal019,
-- `modules/calendar/removal.ts`, que apaga item e evento na mesma transacao)
-- passaria a falhar por chave estrangeira no primeiro atendimento que tivesse
-- lembrete — e o teste de ativacao cria justamente um atendimento futuro.
--
-- DIVERGENCIAS DE SCHEMA INTENCIONAIS, como nos Goals 005-010. `prisma
-- migrate diff` vai relata-las; sao esperadas e nao devem ser "corrigidas"
-- removendo o objeto:
--
--   1. CHECKs explicitos (`ReminderRule_slot_check`,
--      `ReminderRule_leadMinutes_check`, e os quatro de
--      `AppointmentNotificationIntent`), que o Prisma nao modela;
--   2. `updatedAt` nasce com `DEFAULT CURRENT_TIMESTAMP`, que o Prisma nao
--      declara (ele preenche a coluna na aplicacao). Mesma divergencia que
--      `BlockSeries`, `AppointmentHold`, `ImportSession` e outras ja carregam,
--      e existe para que INSERT em SQL cru (ensaio, fixture, correcao
--      operacional) nao precise repetir o valor.
--
-- REVERSAO: o binario anterior a este Goal ignora as tres tabelas novas e a
-- coluna nova de `Appointment` (`NOT NULL` com default constante), entao
-- reverter o binario nao perde nenhuma linha preexistente — o que se perde e a
-- capacidade de saber que lembrete foi agendado ou por que um nao saiu. Como
-- nenhum lembrete existe antes deste Goal, nao ha estado de produto anterior a
-- preservar.

-- 1. Tipos novos. `CREATE TYPE` sob guarda de `duplicate_object`, no padrao
--    dos Goals 009/010/012, para a migration ser retomavel.
DO $$ BEGIN
    CREATE TYPE "ReminderPricePolicy" AS ENUM ('NEVER', 'WHEN_FIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- As duas posicoes de lembrete mais a posicao propria do aviso de alteracao.
-- `ReminderRule` so admite as duas primeiras (ver o CHECK em 3.1).
DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationSlot" AS ENUM ('FIRST', 'SECOND', 'CHANGE_NOTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationKind" AS ENUM ('REMINDER', 'CHANGE_NOTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationState" AS ENUM (
        'PENDING',
        'CLAIMED',
        'SENT',
        'FAILED',
        'DISMISSED',
        'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationReason" AS ENUM (
        'LEAD_ALREADY_PASSED',
        'APPOINTMENT_VERSION_SUPERSEDED',
        'APPOINTMENT_NOT_CONFIRMED',
        'APPOINTMENT_CANCELLED',
        'APPOINTMENT_ALREADY_STARTED',
        'REMINDER_CONFIGURATION_CHANGED',
        'CUSTOMER_WITHOUT_PHONE',
        'CONTACT_IGNORED',
        'AI_NOT_ENABLED',
        'CHANNEL_NOT_CONNECTED',
        'TRANSPORT_FAILED',
        'TRANSPORT_UNKNOWN',
        'ATTEMPTS_EXHAUSTED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Configuracao de lembrete do negocio. A EXISTENCIA DA LINHA e a escolha:
--    sem linha, o negocio nunca configurou e vale o default do dominio; com
--    linha e zero `ReminderRule`, ele desligou os lembretes de proposito.
CREATE TABLE IF NOT EXISTS "ReminderSettings" (
    "tenantId"            TEXT NOT NULL,
    -- Confirmacao de presenca pela resposta ao lembrete. Nasce desligada:
    -- perguntar "confirma?" e decisao explicita do negocio.
    "confirmationEnabled" BOOLEAN NOT NULL DEFAULT false,
    -- Preco no texto do lembrete. `NEVER` e o padrao do vault; `WHEN_FIXED`
    -- so mostra quando o acordo do atendimento tem preco FIXO.
    "pricePolicy"         "ReminderPricePolicy" NOT NULL DEFAULT 'NEVER',
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSettings_pkey" PRIMARY KEY ("tenantId")
);

-- 3. Um lembrete configurado, por posicao. A chave primaria composta E o
--    "no maximo um por posicao"; o CHECK abaixo e o "no maximo duas
--    posicoes". Juntos: ate dois lembretes por negocio, garantidos pelo banco.
CREATE TABLE IF NOT EXISTS "ReminderRule" (
    "tenantId"    TEXT NOT NULL,
    "slot"        "AppointmentNotificationSlot" NOT NULL,
    -- Antecedencia em minutos, positiva e com teto declarado (ver 3.2).
    "leadMinutes" INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("tenantId", "slot")
);

-- 3.1. O terceiro lembrete e impossivel: `CHANGE_NOTICE` existe no tipo para o
--      aviso de alteracao, e o banco recusa grava-lo como regra configurada.
DO $$ BEGIN
    ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_slot_check"
        CHECK ("slot" IN ('FIRST', 'SECOND'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3.2. Antecedencia positiva e limitada a trinta dias (43200 minutos).
--      Antecedencia zero ou negativa e recusada pelo BANCO, alem do codigo
--      proprio que a rota devolve; o teto existe para que "personalizado" nao
--      vire lembrete a anos do compromisso.
DO $$ BEGIN
    ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_leadMinutes_check"
        CHECK ("leadMinutes" > 0 AND "leadMinutes" <= 43200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_tenantId_fkey"
        FOREIGN KEY ("tenantId")
        REFERENCES "ReminderSettings"("tenantId")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Versao monotonica do compromisso. Default constante 1: todo atendimento
--    que ja existe nasce na versao 1, que e a verdade sobre ele ("nunca
--    mudou"), sem UPDATE e sem lembrete retroativo. Quem incrementa e a
--    politica unica de escrita, na mesma transacao da mutacao — nao ha
--    trigger aqui, de proposito.
ALTER TABLE "Appointment"
    ADD COLUMN IF NOT EXISTS "notifiableVersion" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_notifiableVersion_check"
        CHECK ("notifiableVersion" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Intencao de envio ao cliente: o trabalho duravel do dono da agenda.
CREATE TABLE IF NOT EXISTS "AppointmentNotificationIntent" (
    "id"                    TEXT NOT NULL,
    "tenantId"              TEXT NOT NULL,
    "appointmentId"         TEXT NOT NULL,
    "kind"                  "AppointmentNotificationKind" NOT NULL,
    -- NOT NULL inclusive para o aviso de alteracao (ver cabecalho).
    "slot"                  "AppointmentNotificationSlot" NOT NULL,
    -- `Appointment.notifiableVersion` no momento em que a intencao nasceu.
    "appointmentVersion"    INTEGER NOT NULL,
    "state"                 "AppointmentNotificationState" NOT NULL DEFAULT 'PENDING',
    "reason"                "AppointmentNotificationReason",
    -- Vencimento: inicio do compromisso menos a antecedencia (lembrete) ou o
    -- instante da mutacao (aviso de alteracao).
    "dueAt"                 TIMESTAMPTZ(3) NOT NULL,
    -- Fatos prontos compostos pelo DONO na reivindicacao (nome, telefone,
    -- servicos, data e hora ja formatadas no fuso do tenant, com o instante
    -- junto). Nulo enquanto pendente. Nunca texto de lembrete: a composicao
    -- por estilo e da entrega.
    "facts"                 JSONB,
    "attemptCount"          INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt"         TIMESTAMPTZ(3),
    -- Lease pelo relogio do banco (ver cabecalho).
    "leaseOwner"            TEXT,
    "leaseToken"            TEXT,
    "leaseAcquiredAt"       TIMESTAMPTZ(3),
    "leaseExpiresAt"        TIMESTAMPTZ(3),
    "leaseHeartbeatAt"      TIMESTAMPTZ(3),
    -- `correlationId` deterministico da saida, derivado da identidade da
    -- intencao: e por ele que a reivindicacao repetida nao duplica a mensagem.
    "outboundCorrelationId" TEXT,
    "sentAt"                TIMESTAMPTZ(3),
    "settledAt"             TIMESTAMPTZ(3),
    -- Complemento sanitizado do motivo. Nunca substitui `reason`, e nunca
    -- carrega credencial nem payload cru.
    "detail"                TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentNotificationIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentNotificationIntent_tenantId_id_key"
    ON "AppointmentNotificationIntent"("tenantId", "id");

-- 5.1. O DEDUPE. Uma intencao por compromisso, especie, posicao e versao. O
--      nome curto e explicito no schema Prisma (`map:`) porque o nome gerado
--      passaria dos 63 caracteres do PostgreSQL e seria truncado.
CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentNotificationIntent_identity_key"
    ON "AppointmentNotificationIntent"("tenantId", "appointmentId", "kind", "slot", "appointmentVersion");

-- Leitura por compromisso (tela de detalhe do agendamento).
CREATE INDEX IF NOT EXISTS "AppointmentNotificationIntent_tenantId_appointmentId_idx"
    ON "AppointmentNotificationIntent"("tenantId", "appointmentId");
-- Teto de lote por negocio na varredura.
CREATE INDEX IF NOT EXISTS "AppointmentNotificationIntent_tenantId_state_dueAt_idx"
    ON "AppointmentNotificationIntent"("tenantId", "state", "dueAt");
-- Fila da varredura. A IA atende todos os negocios, entao a ordem de
-- vencimento nao tem tenant na frente; o teto por tenant e do codigo.
CREATE INDEX IF NOT EXISTS "AppointmentNotificationIntent_state_dueAt_idx"
    ON "AppointmentNotificationIntent"("state", "dueAt");
-- Devolucao de lease expirado sem varredura completa da tabela.
CREATE INDEX IF NOT EXISTS "AppointmentNotificationIntent_leaseExpiresAt_idx"
    ON "AppointmentNotificationIntent"("leaseExpiresAt");

-- 5.2. Especie e posicao amarradas: lembrete usa `FIRST`/`SECOND`, aviso de
--      alteracao usa a posicao propria. Sem isso, um aviso com posicao
--      `FIRST` colidiria com o primeiro lembrete no indice de identidade.
DO $$ BEGIN
    ALTER TABLE "AppointmentNotificationIntent" ADD CONSTRAINT "AppointmentNotificationIntent_kind_slot_check"
        CHECK (
            ("kind" = 'REMINDER' AND "slot" IN ('FIRST', 'SECOND'))
            OR ("kind" = 'CHANGE_NOTICE' AND "slot" = 'CHANGE_NOTICE')
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.3. Estado em conjunto fechado, explicito em SQL alem do enum (mesmo
--      motivo do `ImportItem_status_check` do Goal010).
DO $$ BEGIN
    ALTER TABLE "AppointmentNotificationIntent" ADD CONSTRAINT "AppointmentNotificationIntent_state_check"
        CHECK ("state" IN ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'DISMISSED', 'CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.4. Motivo obrigatorio em tudo que nao saiu por decisao ou por falha, e
--      proibido no que ainda nao foi decidido e no que saiu. Uma dispensa sem
--      motivo e recusada pelo banco.
DO $$ BEGIN
    ALTER TABLE "AppointmentNotificationIntent" ADD CONSTRAINT "AppointmentNotificationIntent_reason_check"
        CHECK (("state" IN ('FAILED', 'DISMISSED', 'CANCELLED')) = ("reason" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.5. Coerencia do ciclo de vida: `SENT` se e somente se ha instante de
--      envio; todo estado terminal tem instante de liquidacao; `CLAIMED` se e
--      somente se ha lease; lease e um bloco (dono, token e expiracao entram
--      juntos) e expira depois de ter sido adquirido; tentativas nunca
--      negativas; versao do compromisso nunca abaixo de um.
DO $$ BEGIN
    ALTER TABLE "AppointmentNotificationIntent" ADD CONSTRAINT "AppointmentNotificationIntent_lifecycle_check"
        CHECK (
            (("state" = 'SENT') = ("sentAt" IS NOT NULL))
            AND (("state" IN ('SENT', 'FAILED', 'DISMISSED', 'CANCELLED')) = ("settledAt" IS NOT NULL))
            AND (("state" = 'CLAIMED') = ("leaseOwner" IS NOT NULL))
            AND (("leaseOwner" IS NULL) = ("leaseToken" IS NULL))
            AND (("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL))
            AND ("leaseAcquiredAt" IS NULL OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" > "leaseAcquiredAt")
            AND ("attemptCount" >= 0)
            AND ("appointmentVersion" >= 1)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.6. Dono do compromisso, por tenant. `CASCADE` deliberado (ver cabecalho):
--      a intencao e trabalho operacional, nao o historico do atendimento.
DO $$ BEGIN
    ALTER TABLE "AppointmentNotificationIntent" ADD CONSTRAINT "AppointmentNotificationIntent_tenantId_appointmentId_fkey"
        FOREIGN KEY ("tenantId", "appointmentId")
        REFERENCES "Appointment"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
