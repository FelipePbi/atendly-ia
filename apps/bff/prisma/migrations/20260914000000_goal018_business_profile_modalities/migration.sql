-- Goal018/WU-01 - negocio completo: modalidades, endereco e versao do contexto.
--
-- Aditiva. Nenhuma linha existente ganha modalidade, endereco, nome ou
-- categoria como escolha fabricada: as colunas novas nascem com o mesmo
-- default para todo o estoque (array vazio, endereco nulo) porque o
-- PostgreSQL preenche uma coluna NOT NULL nova com o DEFAULT declarado, sem
-- UPDATE de backfill nenhum aqui.
--
-- "businessContextVersion"/"businessContextProjectedVersion" sao contadores
-- simples (nunca timestamp). Os defaults divergem de proposito — 1 e 0 — para
-- que toda linha, nova ou ja existente, nasca com a versao projetada atras da
-- corrente: o contexto de negocio ganhou campos que ainda nao foram
-- projetados para a IA em lugar nenhum. Consumir essa distancia é trabalho de
-- outra Work Unit deste Goal; esta migration só abre o contador.
CREATE TYPE "BusinessModality" AS ENUM ('ON_SITE', 'AT_HOME', 'ONLINE');

ALTER TABLE "BusinessProfile"
  ADD COLUMN "modalities" "BusinessModality"[] NOT NULL DEFAULT '{}',
  ADD COLUMN "address" TEXT,
  ADD COLUMN "businessContextVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "businessContextProjectedVersion" INTEGER NOT NULL DEFAULT 0;
