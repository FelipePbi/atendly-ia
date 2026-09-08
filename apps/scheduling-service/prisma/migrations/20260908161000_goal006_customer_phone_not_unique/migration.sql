-- Goal006 - passo de CORTE da identidade de cliente.
--
-- Passo separado de proposito. Ele so pode rodar depois que todos os consumers
-- deste repositorio ja leem e escrevem cliente por ID (Scheduling, IA, BFF,
-- frontend): a partir daqui duas pessoas podem compartilhar o mesmo numero no
-- mesmo negocio, e o binario anterior ao corte deixa de ser destino seguro
-- assim que existir um numero compartilhado ou um cliente sem telefone.
--
-- Nao ha fusao, renomeacao nem deduplicacao: a instrucao remove um indice, nao
-- toca linha nenhuma.
-- A ordem importa: quando a unicidade nasceu como constraint, o indice que a
-- sustenta so pode cair junto dela. Remover a constraint primeiro cobre os dois
-- casos - schema criado por `CREATE UNIQUE INDEX` e schema criado por
-- `CONSTRAINT ... UNIQUE`.
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_tenantId_normalizedPhone_key";
DROP INDEX IF EXISTS "Customer_tenantId_normalizedPhone_key";

-- O indice de busca por candidatos (nao exclusivo) foi criado no passo de
-- expansao; reafirmado aqui para que o corte nunca deixe a busca sem indice.
CREATE INDEX IF NOT EXISTS "Customer_tenantId_normalizedPhone_idx"
    ON "Customer"("tenantId", "normalizedPhone");
