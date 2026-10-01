# Goal 098 — Os testes de integração do Scheduling não dependem da data do dia

**Status: READY.** Preparado em 2026-10-01 pelo Tech Lead Agent após [Goal088 ACCEPTED](../reviews/088-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v115, já READY, inserida **à frente do 089** sem renumerar nenhum Goal. Não há quadro do protótipo: o Goal não toca tela.

## Baseline aceita

Baseline aceita: `d23f60278fb5c7e5d02a79e180fe916c4fd27929`

Goal anterior: 088 — Lista e detalhe lado a lado no tablet e no desktop, e telas empurradas sem barra de abas no mobile

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal088 já integrado em `main` (origem `afe3da3e9322ff365fe3c2e008105252968d21be`). A virada de status do documento do Goal088 para `ACCEPTED` **não** entrou no commit de fechamento: veio no commit documental seguinte, `0e429f5`, que não é baseline. **Três rodadas**, com 12, 8 e 0 blockers. **D-103** aceita. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, da execução final do Goal088 ([review088](../reviews/088-review.md), [VALIDATION_GATE](../VALIDATION_GATE.md)): `validate:core` **17** passos, **15** `passed` e **2** `skipped`; `test:frontend` **132** arquivos e **1415** testes; `test:gate` **233**; `validate:integration` **36** passos, **26** `passed`, **1** `failed` e **9** `notRun`, exit 1; `test:bff-integration` **63** arquivos e **474** testes; `test:scheduling-integration` `4 failed | 139 passed (143)`; gate autenticado **235** testes, rodado à parte.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Antes da primeira edição, rode `validate:integration` na baseline, num banco recém-provisionado, e cole a linha de resumo de `test:scheduling-integration` e a contagem de passos. Rode também `test:scheduling-integration` uma segunda vez **no mesmo banco, sem reprovisionar**, e cole a linha de resumo. Se divergir dos números acima, o relatório diz por quê, com a hora UTC de cada corrida.

## Objetivo e posição

`validate:integration` para no passo `test:scheduling-integration` e não roda os **9** passos seguintes, entre eles o gate autenticado (`rehearse:goal033-authenticated-ui`). A causa medida no review088 é de teste, não de produto: fixtures com data absoluta que precisava estar no futuro. A data passou em 2026-10-01, e o passo falha em qualquer diff desde então.

Este Goal faz `test:scheduling-integration` passar **em qualquer data**, sem mexer em código de produção, e devolve `validate:integration` inteiro e verde à baseline.

**Por que agora, à frente do 089.** A observação 3 do [review088](../reviews/088-review.md) diz que a falha "vai bloquear `validate:integration` dos próximos Goals até ser corrigida". Os Goals 089 a 097 tocam telas e dependem do gate autenticado para largura, toque, contraste e foco das rotas logadas. Com o passo vermelho, cada um deles seria aceito "sem prova completa", como o 085, o 087 e o 088 já foram. O conserto é pequeno e fica só em testes; o 089 não depende dele tecnicamente, só de ordem.

## O que a evidência desta passada mostra

Conferido no código da baseline e no registro do Goal088 em [VALIDATION_GATE](../VALIDATION_GATE.md):

1. **`goal025-tenant-purge.test.ts` fixa o atendimento em `2026-10-01T09:00Z`.** `seedTenant` cria um `AppointmentHold` com `expiresAt` cinco minutos depois do fim desse atendimento. A constraint `AppointmentHold_expiresAt_check` (migration `20260909182000_goal008_agenda_fixups`) exige `"expiresAt" > ("createdAt" AT TIME ZONE 'UTC')`, e `createdAt` vem do relógio do banco. Depois de `2026-10-01T10:05Z` a inserção falha com `23514`, e os quatro testes do arquivo reprovam. O Developer do 088 reproduziu `4 failed | 139 passed (143)` na base `c483db3`.
2. **`goal010-import.test.ts` fixa o horário disputado em `2026-10-01T12:00Z`** (`contestedStartAt`, "09:00 em `America/Sao_Paulo`"). Na corrida do harness do 088, o teste de concorrência do goal010 também falhou; o Developer não reproduziu na base. Hipótese a confirmar ou descartar: a corrida do harness foi depois de 12:00Z, e a do Developer antes.
3. **`goal008-agenda.test.ts` "completes what expired past the grace period…"** falhou com `completed: 2` contra `completed: 1` quando o banco do Scheduling foi reaproveitado, e passou depois de `provision:scheduling-test-database`. `runAutoCompleteSweep` varre todos os negócios do banco, e o teste conta o total. Hipótese a confirmar: linhas de atendimento deixadas por outro arquivo (por exemplo, o `seedTenant` do goal025 que parou no meio) entram na contagem.
4. **Há outras datas absolutas** em `tests/integration/`: `goal075-customer-appointments.integration.test.ts` (2026-01-01, 2030-03-10 e um `vi.setSystemTime` em 2026-06-15) e as entradas de snapshot do goal010 (`startDate`, `endDate`, `referenceDate`). Nem toda data absoluta é defeito: só a que o banco ou o código compara com o relógio real.
5. **`vi.setSystemTime` não muda o relógio do banco.** `now()` e os `@default(now())` do Prisma são do PostgreSQL. Uma fixture que precisa estar no futuro em relação a uma linha criada pelo banco só fica certa se for calculada a partir do relógio real.

## Escolhas de desenho desta passada

**(a) Data relativa ao relógio real, só onde o relógio decide.** Toda fixture que o banco ou o código compara com o agora (expiração de reserva, horário futuro exigido pela agenda, vencimento) passa a ser calculada a partir de `Date.now()` no momento do teste, com folga suficiente para a duração da suíte. Se a regra depender do dia ou da hora local (disponibilidade por dia da semana, horário comercial, fuso `America/Sao_Paulo`), a data calculada respeita isso: por exemplo, o próximo dia útil daqui a pelo menos sete dias, às 09:00 locais.

**(b) Um helper só, em `tests/integration/support/`.** O cálculo de (a) mora num helper compartilhado, usado pelos arquivos que precisarem. Nenhum arquivo cria o seu.

**(c) Data absoluta que não depende do relógio continua.** Hora do dia em `1970-01-01`, janelas de snapshot passadas como entrada e datas comparadas só entre si ficam como estão. O relatório lista cada data absoluta que sobra em `tests/integration/` e diz, em uma linha, por que ela não depende do relógio.

**(d) Isolamento antes de afrouxar.** Se o `completed: 2` do goal008 vier de linhas de outro arquivo, a correção ataca a origem: o arquivo que deixa linhas passa a limpar as suas, ou o goal008 parte de um estado conhecido para o que a varredura global enxerga. A asserção pode passar a medir o efeito sobre o negócio do teste só se a contagem global não puder ser isolada; nesse caso, o relatório diz por quê, e as verificações de "nunca toca cancelado nem não compareceu" e de "repetir não duplica efeito" ficam como estão.

**(e) Nenhum código de produção muda.** A constraint, a varredura, o provider e as migrations estão certos; quem errou foi a fixture. Se a investigação mostrar defeito de produção, o Developer para, descreve e reporta `BLOCKED`, sem corrigir.

## Escopo obrigatório

### 1. Os três arquivos medidos passam em qualquer data

`goal025-tenant-purge.test.ts`, `goal010-import.test.ts` e `goal008-agenda.test.ts` passam hoje e continuam passando em qualquer data futura, por (a) e (d). Para o goal010, o Developer confirma ou descarta a hipótese do item 2 com a hora UTC de cada corrida e corrige `contestedStartAt` se ela se confirmar.

### 2. Varredura das datas absolutas

Todas as datas absolutas de `apps/scheduling-service/tests/integration/` são conferidas contra (a) e (c). As que dependem do relógio são corrigidas pelo helper de (b); as outras ficam listadas no relatório.

### 3. A suíte roda duas vezes no mesmo banco

`test:scheduling-integration` passa **duas vezes seguidas no mesmo banco, sem reprovisionar**, e passa depois de `provision:scheduling-test-database`.

### 4. `validate:integration` inteiro

`validate:integration` termina com exit 0, os **36** passos executados e nenhum `notRun`, num banco recém-provisionado. Se um dos 9 passos que hoje não rodam falhar pela mesma causa (data absoluta que passou), a fixture desse passo é corrigida do mesmo jeito, só no arquivo de teste ou de ensaio, e o relatório diz qual e por quê. Se falhar por outra causa, o relatório mede e reporta, sem corrigir.

### 5. Controles negativos, rodados depois da última edição de código

Cada um com o arquivo restaurado e `sha256` idêntico conferido no fim:

1. Voltar a data do `seedTenant` do goal025 para `2026-10-01T09:00:00.000Z`: o arquivo reprova com `23514`.
2. Fazer o helper de (b) devolver uma data no passado: os arquivos que o usam reprovam.
3. Se (d) mudou a limpeza de algum arquivo, desfazer essa limpeza e rodar a suíte duas vezes no mesmo banco: a segunda corrida reprova no goal008.

### 6. O que este Goal não pode fazer

- Mudar qualquer arquivo de `apps/*/src/`, `apps/*/prisma/` (schema e migrations), `PUBLIC_API_V1.md` ou o vault.
- Mudar `scripts/validate-integration.mjs`, `scripts/provision-*`, `vitest.config.*`, `playwright*.config.*`, `KNOWN_*` ou qualquer passo de `validate:*`.
- Pular, remover ou marcar teste como `skip`/`todo`; aumentar timeout; trocar asserção exata por aproximada, exceto o caso declarado em (d).
- Usar `vi.setSystemTime` ou relógio falso para resolver comparação feita pelo banco.

## Pontos de implementação

- `apps/scheduling-service/tests/integration/support/` (helper novo de (b)).
- `apps/scheduling-service/tests/integration/goal025-tenant-purge.test.ts`, `goal010-import.test.ts` e `goal008-agenda.test.ts`.
- Outros arquivos de `apps/scheduling-service/tests/integration/` só se o §2 achar data que depende do relógio.
- Arquivo de teste ou de ensaio de outro passo de `validate:integration` só no caso do §4.
- Os documentos abaixo.

## Fora do escopo

- Datas absolutas nos testes **unitários** dos serviços (`tests/unit/`), que rodam em `validate:core` e passam hoje.
- Qualquer mudança de tela, contrato, rota ou serviço.
- O cluster PostgreSQL do harness, a memória do Windows (`error code 1455`) e a porta ocupada que o review088 registra: são do ambiente.

## Documentação

No mesmo diff:

- [VALIDATION_GATE](../VALIDATION_GATE.md) ganha uma subseção do Goal098: a causa medida, a regra de (a) e (c) para fixture de teste de integração, as corridas do §3, a contagem final de `validate:integration` e os controles do §5.
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto: `validate:integration` volta a rodar inteiro, com a contagem da execução final.
- DECISIONS **não** ganha decisão, e FINAL_AUDIT não ganha seção. `apps/bff/PUBLIC_API_V1.md`, o vault, `QA_LOCAL_REVIEW.md` e `docs/design-reference/` não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de arquivo, função ou teste citado é conferido contra o código antes da entrega.

## Validação e ordem

1. Recontar a baseline como manda "Baseline aceita", com a hora UTC de cada corrida.
2. Implementar §1 e §2.
3. Fazer a última edição de código.
4. Rodar a execução final: `validate:core`, depois `validate:integration` num banco recém-provisionado, depois `test:scheduling-integration` mais uma vez no mesmo banco.
5. Rodar os controles do §5.
6. Escrever a prosa só depois disso.

**Falha de gate por ambiente** é reexecutada ou reportada, nunca corrigida editando configuração.

## Critério de aceite

1. `test:scheduling-integration` passa duas vezes seguidas no mesmo banco e depois de reprovisionar, com **143** testes ou mais, e reprovou na baseline (o vermelho colado na rodada 1).
2. `validate:integration` com exit 0, **36** passos executados, nenhum `notRun`, rodado depois da última edição de código, com o gate autenticado em **235** testes e **0** retentativas.
3. `validate:core` passa, com as contagens da baseline.
4. Os controles do §5 reprovam com o defeito e passam sem ele, depois da última edição de código.
5. Nenhum arquivo fora de "Pontos de implementação" mudou; nenhum teste a menos; nenhuma asserção afrouxada além do caso declarado em (d).
6. O relatório lista as datas absolutas que sobraram em `tests/integration/`, cada uma com o motivo de (c).
7. VALIDATION_GATE e CURRENT_STATE são escritos depois da execução final, com as contagens dela.
8. `git status --porcelain=v1 -uall` lista só os arquivos autorizados.

**O que o aceite não prova:** que os testes unitários e os de outros serviços não tenham data que vá vencer; que a suíte passe perto da meia-noite de `America/Sao_Paulo` ou numa virada de horário de verão, se o Brasil voltar a ter.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; helper de (b); goal025 e goal010 com data relativa; varredura do §2 |
| WU-02 | STANDARD | WU-01 | Isolamento do goal008 por (d); suíte duas vezes no mesmo banco |
| WU-03 | DETERMINISTIC | WU-02 | validate-core |
| WU-04 | STANDARD | WU-03 | Execução final de `validate:integration`, controles do §5 e documentação |
| WU-05 | DETERMINISTIC | WU-04 | validate-integration |
| WU-06 | DETERMINISTIC | WU-05 | git-diff-check final |
