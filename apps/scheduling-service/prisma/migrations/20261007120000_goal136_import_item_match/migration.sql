-- Goal136, WU-01: a analise grava a correspondencia sugerida e os valores do
-- servico da origem, para que a decisao de conflito os mostre.
-- Aditiva apenas — duas colunas JSON anulaveis e nada mais: nenhuma tabela,
-- indice, constraint ou linha existente muda.
--
-- `matchCandidateInternalIds` guarda, so em itens `SERVICE` e `CUSTOMER`, a
-- lista de IDs de cadastro que a analise calculou como correspondencia
-- (`["<id>", ...]`); a rota de itens le os cadastros no momento da leitura.
--
-- `proposedService` guarda, so em itens `SERVICE`, o que a origem propoe
-- (`{ durationMinutes, priceType, price }`), derivado pelas mesmas funcoes da
-- execucao. Nenhum outro dado da origem entra aqui.
--
-- Linhas existentes ficam `NULL`, que e o mesmo que "nada gravado" — a
-- proxima analise da sessao as preenche.
ALTER TABLE "ImportItem" ADD COLUMN "matchCandidateInternalIds" JSONB,
ADD COLUMN "proposedService" JSONB;
