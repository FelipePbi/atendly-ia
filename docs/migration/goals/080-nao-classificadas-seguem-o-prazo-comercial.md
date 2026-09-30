# Goal 080 — Não classificadas seguem o prazo Comercial

**Status: READY.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal079 ACCEPTED](../reviews/079-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v102, **inserida** depois do 079. O 079 era o último Goal PLANNED da tabela. Na reavaliação desta passada, a decisão **U-01** de [DECISIONS](../DECISIONS.md) é o único item que reúne três condições: uma pessoa já decidiu, nenhum Goal a implementou e o repositório a fecha sozinho, sem ambiente hospedado, credencial externa nem nova decisão. A tabela de decisões do usuário a registra como "DECIDIDA por Felipe Borges em 2026-09-27, aguardando Goal que implemente". O [FINAL_AUDIT](../FINAL_AUDIT.md) a mantém como **A-12**, `LIMITE-DECLARADO` ("O grupo `Não classificadas` segue sem prazo de retenção"), e na tabela de incertezas, onde U-01 aparece como "aberto".

## Baseline aceita

Baseline aceita: `b207829c7e8996f7f90ffe0bd1c691a77a9b9268`

Goal anterior: 079 — Onboarding fiel ao protótipo: demonstração, estilo, promessas e boas-vindas

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal079 já integrado em `main` (origem `998772d9dcd0c94a1f53a7fa6c4cc3746563bb29`). A virada de status do documento do Goal079 para `ACCEPTED` entrou no próprio commit de fechamento. **Duas rodadas**, com 1 e 0 blockers; o único defeito foi um teste que o próprio Goal deixou intermitente, e nenhum código de produção mudou entre as rodadas. **D-095** foi aceita e [FINAL_AUDIT §56](../FINAL_AUDIT.md) escrita sem reescrever §4 a §55. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review079](../reviews/079-review.md) e de FINAL_AUDIT §56: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **121** arquivos e **1243** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **170** testes e **0** retentativas. Backend sem mudança desde o Goal078, conforme o Goal079: `test:bff-integration` **60** arquivos e **465** testes; `test:ai-orchestrator` **1177** passando e **93** pulados de **1270**; `test:scheduling-service` **37** arquivos e **502** testes.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline `b207829` e antes da primeira edição, `test:frontend`, `test:gate`, `test:ai-orchestrator` e `test:bff-integration`, e cole a linha de resumo de cada um. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê. `test:bff-integration` e a suíte de banco da IA pulam sem `*_TEST_DATABASE_URL`; nesse caso, o relatório diz quantos pularam.

## Objetivo e posição

Aplicar a decisão U-01: **o conteúdo de conversa governado por sessão `UNCLASSIFIED` passa a expirar pelo prazo Comercial do negócio** (default 90 dias), com as mesmas garantias que o Goal023 deu a Comercial e Pessoal.

1. A varredura de retenção passa a apagar `Message` e `AiRun` de sessão não classificada mais velhos que o prazo Comercial. Os filhos caem por cascade, como hoje.
2. A regra "Não classificadas segue Comercial" é escrita **uma única vez**, no BFF, que é dono do prazo. A IA, dona do dado, recebe um terceiro cutoff já calculado e não decide prazo.
3. Configurações › Conversas e o contrato público dizem a verdade nova: Não classificadas tem prazo, e ele é o Comercial.
4. A-12 deixa de ser limite declarado. O veredito da auditoria passa a **0/7/5**.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O predicado da purga tem só dois ramos.** `governedRows` em `apps/ai-orchestrator/src/modules/retention/content-purge-service.ts` só libera a purga para `COMMERCIAL` com `commercialCutoff` e `PERSONAL` com `personalCutoff`. Uma sessão `UNCLASSIFIED` sempre "recusa", e o docblock cita U-01 como motivo.
2. **O corpo interno tem dois cutoffs.** Em `apps/ai-orchestrator/src/modules/internal/routes.ts`, `contentPurgeSchema` aceita `commercialCutoff`, `personalCutoff` e `maxRows`; `POST /internal/retention/conversation-content` repassa os dois. O cliente do BFF, `purgeConversationContent` em `apps/bff/src/clients/ai-orchestrator/index.ts`, manda os mesmos dois.
3. **Os cutoffs nascem num só lugar.** `retentionCutoffs` em `apps/bff/src/modules/retention/sweep.ts` calcula os dois a partir de `RetentionSettings`. `defaultRetentionPorts` os repassa à IA.
4. **O contrato público afirma o contrário da decisão.** `unclassifiedPurged: false` aparece em `apps/bff/src/modules/retention/settings.ts`, em `packages/public-api-contract/src/schemas.ts` (`z.literal(false)`) e em `apps/bff/PUBLIC_API_V1.md`. O documento diz que o campo é "invariante, não estado" e que "não existe categoria, coluna, parâmetro ou default para conteúdo 'não classificado'".
5. **A tela também afirma o contrário.** `apps/frontend/src/features/settings/RetentionSection.tsx` diz "Conversas Não classificadas não têm prazo: o conteúdo fica guardado enquanto a categoria não for definida". O diálogo de redução não menciona Não classificadas.
6. **Um teste guarda a regra velha.** `apps/ai-orchestrator/tests/retention/content-purge.test.ts:276` ("nunca apaga mensagem governada por sessao nao classificada (U-01)") roda no passo `test:ai-orchestrator-content-purge` de `validate:integration`. A-12 e a linha U-01 do FINAL_AUDIT o citam como a prova de que nada do grupo é apagado.
7. **A sessão nasce `UNCLASSIFIED`.** `ConversationSession.category` tem `@default(UNCLASSIFIED)` no schema da IA, e `session-policy.ts` devolve `UNCLASSIFIED` sem sugestão nem override. Então o grupo não é residual: é onde o conteúdo fica até alguém ou a classificação o mover.
8. **O vault não fixa o prazo.** `01-Regras/08-Privacidade-e-Retencao.md` lista os defaults de Comercial (90) e Pessoal (30) e nada para Não classificadas. A Q215 de `99-Perguntas-e-Respostas.md` ("Pode ficar indefinidamente Não classificada? Sim") trata da **classificação**, não do prazo do conteúdo.

## Escolhas de desenho desta passada

**(a) "A regra de Comercial" quer dizer o prazo Comercial do negócio, não 90 dias fixos.** A decisão diz "90 dias, a regra de Comercial (não a de Pessoal, default30)". A comparação é entre as regras das duas categorias, e 90 é o default da Comercial. O prazo fixo criaria um terceiro prazo, sem seletor e sem lugar na tela, para conteúdo que a profissional vê na inbox. O vault diz que a retenção é configurável e lista só as duas categorias. Então Não classificadas segue o valor que o negócio escolher para Comercial: 90 por default, e 30, 180 ou 365 se o negócio mudar. Nenhuma coluna, opção ou seletor novo. D-096 registra esta leitura e o que a reabre.

**(b) A regra vive no BFF.** `retentionCutoffs` ganha `unclassifiedCutoff`, calculado de `commercialRetentionDays`. É o único lugar do repositório que diz que Não classificadas segue Comercial. A varredura manda o terceiro cutoff à IA. A IA não mapeia categoria para prazo: ela aplica o cutoff que recebe, como já faz com os outros dois (D-039 (5)).

**(c) O campo interno é opcional, e a ausência preserva.** Em `contentPurgeSchema`, `unclassifiedCutoff` é opcional. Sem ele, a sessão `UNCLASSIFIED` continua recusando a purga, como na baseline. Um BFF antigo que chame uma IA nova, durante um deploy fora de ordem, não apaga nada que não apagava antes. A IA **nunca** deriva o cutoff ausente do comercial. Os outros dois campos continuam obrigatórios.

**(d) O predicado ganha um ramo, e só um.** Em `governedRows`, dentro do `NOT (...)`, entra `s."category" = 'UNCLASSIFIED' AND occurredAt < unclassifiedCutoff`, só quando o cutoff veio. Ficam como estão:

- o `EXISTS`: linha órfã de janela de sessão continua sobrevivendo, porque U-01 trata de sessão não classificada, não de conteúdo sem sessão;
- o `NOT EXISTS`: numa janela ambígua, a linha só sai se **toda** sessão governante permitir. Uma janela com `UNCLASSIFIED` vencida e `COMMERCIAL` ainda no prazo sobrevive; `UNCLASSIFIED` e `PERSONAL` ambas vencidas sai;
- o filtro por `tenantId` do contexto, o teto por passada, `hasMore` e a marca `contentExpiredThrough`, que já avança até a linha mais nova apagada. O comentário de `advanceMarks` deixa de citar `UNCLASSIFIED` como exemplo do que sobrevive e passa a citar a linha órfã e a janela ambígua.

**(e) O contrato público troca a afirmação falsa por uma verdadeira.** `unclassifiedPurged: false` sai de `settings.ts`, `schemas.ts` e `PUBLIC_API_V1.md`. No lugar entra `unclassifiedRetentionFollows: "COMMERCIAL"`, literal e só de leitura: invariante do servidor, não estado nem opção. Um booleano `true` diria que o grupo é purgado, mas não por qual prazo. Manter o `false` seria mentir no contrato. O único consumidor é o frontend deste repositório, que não lê o campo em `src/`, só nos fixtures de teste. O `PATCH` não muda de forma: reduzir Comercial exige `confirmReduction: true`, como antes, e `error.details.reductions` continua listando só as categorias configuráveis.

**(f) A tela diz o que a redução alcança.** A nota de `RetentionSection` passa a dizer que Não classificadas segue o prazo Comercial. O diálogo de redução **da Comercial**, e só dele, diz que a redução vale também para as conversas Não classificadas. Texto sugerido, que pode ser ajustado sem mudar o sentido nem a regra de copy não técnica de `apps/frontend/AGENTS.md`:

- nota: "Conversas Não classificadas seguem o prazo Comercial. Ao classificar uma conversa como Pessoal, o prazo Pessoal passa a valer para ela daí em diante.";
- diálogo da Comercial: "Mensagens Comerciais e Não classificadas mais antigas que o novo prazo poderão ser removidas na próxima varredura. Não há como recuperá-las depois."

**(g) Nenhum dado é mexido neste Goal.** Nenhuma migration, backfill ou `UPDATE`. O laço continua nascendo desligado (`RETENTION_SWEEP_ENABLED`). A consequência que D-039 já previa vale agora: a primeira varredura ligada depois deste Goal alcança de uma vez todo conteúdo não classificado acumulado além do prazo Comercial. Não existe ambiente hospedado com dado de cliente real. A base local da revisão tem dados reais da Minha Agenda e **não** pode receber varredura (§10).

**(h) O vault registra a decisão.** U-01 é decisão do usuário, e o vault é a fonte canônica de produto. O Goal057 já registrou U-06 no vault do mesmo jeito. `01-Regras/08-Privacidade-e-Retencao.md` ganha, em "Retenção", a linha de que Não classificadas segue o prazo Comercial, e nada mais do vault muda.

## Fora do escopo

- Linha órfã de janela de sessão e janela ambígua: continuam preservadas. Dar prazo a elas é outra decisão, que U-01 não tomou.
- O prazo técnico das intenções, o inbox durável, o outbox do transporte e a janela da central (D-039 (12) e (13)): não mudam.
- Exclusão de conta (Goal025): já apaga tudo do negócio e não depende de categoria.
- Seletor próprio, coluna ou default para Não classificadas: não existem, por (a).
- A busca por CEP de O-15, pendente de decisão humana; a conferência humana dos Goals anteriores; U-03 (provider de e-mail); as pendências da auditoria que dependem de deploy real.
- `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/` e `scripts/`, salvo o que o §5 autoriza.

## Dependências e contexto mínimo

- Goal079 ACCEPTED (baseline acima). O Goal023 escreveu a retenção inteira (D-039), e o Goal025 escreveu a exclusão de conta sem mexer nela.
- Arquivos de partida:
  - IA: `apps/ai-orchestrator/src/modules/retention/content-purge-service.ts` e `apps/ai-orchestrator/src/modules/internal/routes.ts` (`contentPurgeSchema` e a rota `POST /internal/retention/conversation-content`).
  - BFF: `apps/bff/src/modules/retention/sweep.ts` (`RetentionCutoffs`, `retentionCutoffs`, `defaultRetentionPorts`), `apps/bff/src/modules/retention/settings.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts` (`purgeConversationContent`) e `apps/bff/PUBLIC_API_V1.md` (seção de retenção).
  - Contrato: `packages/public-api-contract/src/schemas.ts`.
  - Frontend: `apps/frontend/src/features/settings/RetentionSection.tsx`.
- Testes de partida:
  - IA: `apps/ai-orchestrator/tests/retention/content-purge.test.ts`, contra PostgreSQL real com `AI_TEST_DATABASE_URL`, e `apps/ai-orchestrator/tests/security/internal-credentials.test.ts`, que chama a rota.
  - BFF: `apps/bff/tests/goal023-retention-sweep.test.ts` e `apps/bff/tests/goal023-retention-settings.test.ts`.
  - Frontend: `apps/frontend/tests/goal023-retention-settings.test.tsx`, `goal023-conversations-settings.test.tsx` e `goal024-settings-shell-invariant.test.tsx`.
- `scripts/goal030-mvp-journey-rehearsal.mjs` tem a etapa `retention-declaration`. Confira se ela supõe que conteúdo não classificado sobrevive à purga. Se supuser, a etapa é ajustada no mesmo diff, e o relatório cita a asserção de antes e a de depois.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Predicado e entrada da purga | `content-purge-service.ts` (`ContentPurgeInput`, `governedRows`, docblocks, comentário de `advanceMarks`) |
| Rota interna | `internal/routes.ts` (`contentPurgeSchema`, chamada de `contentPurge.purge`) |
| Regra e varredura | `bff/src/modules/retention/sweep.ts`, `bff/src/clients/ai-orchestrator/index.ts` |
| Contrato público | `bff/src/modules/retention/settings.ts`, `packages/public-api-contract/src/schemas.ts`, `bff/PUBLIC_API_V1.md` |
| Tela | `frontend/src/features/settings/RetentionSection.tsx` |
| Testes | os de partida, ajustados, e testes novos `goal080-*` onde o padrão do app pedir |

## Escopo obrigatório

### 1. A IA aplica o terceiro cutoff

`ContentPurgeInput` ganha `unclassifiedCutoff?: Date`. O docblock diz que a ausência preserva o grupo. `governedRows` ganha o ramo de (d), só quando o cutoff veio. `contentPurgeSchema` aceita `unclassifiedCutoff` opcional no mesmo formato dos outros (`z.iso.datetime({ offset: true })`), e a rota o repassa. Nenhum default e nenhuma derivação do comercial dentro da IA.

### 2. O BFF escreve a regra e a manda

`RetentionCutoffs` ganha `unclassifiedCutoff`, e `retentionCutoffs` o calcula de `commercialRetentionDays`. O docblock diz que é U-01 e aponta para D-096. `purgeConversationContent` e `defaultRetentionPorts` passam o terceiro cutoff. Os cutoffs técnicos (`intentContentCutoff` e afins) não mudam.

### 3. O contrato público

Faça a troca de (e) em `settings.ts`, `schemas.ts` e `PUBLIC_API_V1.md`, com exemplo JSON, tabela de campos e o parágrafo "Não existe categoria…" reescritos. O parágrafo continua dizendo que não há coluna, parâmetro, opção nem default próprios, e passa a dizer que o grupo segue o prazo Comercial.

### 4. A tela

Faça as duas mudanças de copy de (f) em `RetentionSection.tsx`. O diálogo da Pessoal não muda.

### 5. O que mais pode mudar

- A etapa `retention-declaration` de `scripts/goal030-mvp-journey-rehearsal.mjs`, só se o §Dependências a achar dependente da regra velha.
- `docs/product-vault/01-Regras/08-Privacidade-e-Retencao.md`, só a linha de (h).
- `apps/bff/AGENTS.md` ou `apps/ai-orchestrator/AGENTS.md`, só se alguma frase deles sobre retenção ficar falsa.

### 6. Provas que reprovam na baseline

Cada teste abaixo reprova na baseline `b207829` e passa no diff. O relatório da rodada 1 cola o vermelho de cada um, rodado com os arquivos de `src/` restaurados da baseline e os testes novos no lugar, e confere a restauração por hash.

1. **Purga do grupo, contra PostgreSQL real** (`content-purge.test.ts`): com `unclassifiedCutoff`, uma `Message` e um `AiRun` de sessão `UNCLASSIFIED` mais velhos que o cutoff são apagados, com os filhos por cascade. Os mais novos sobrevivem. `contentExpiredThrough` avança até a linha mais nova apagada, e não até o cutoff.
2. **Ausência preserva** (mesmo arquivo): sem `unclassifiedCutoff`, a mesma sessão não perde nada. É o teste da linha 276, reescrito para nomear a ausência do cutoff. O relatório diz o nome antigo e o novo. Este teste passa também na baseline: é guarda, não vermelho, e está aqui porque um controle do §7 depende dele.
3. **Janela ambígua** (mesmo arquivo): `UNCLASSIFIED` vencida com `COMMERCIAL` no prazo sobrevive; `UNCLASSIFIED` e `PERSONAL` ambas vencidas sai.
4. **Isolamento e órfã** (mesmo arquivo): o conteúdo não classificado do negócio vizinho não é tocado, e a linha órfã de sessão continua sobrevivendo com os três cutoffs no passado.
5. **Rota interna**: um corpo com `unclassifiedCutoff` inválido é `400`, sem purga. Um corpo válido chega a `purge` com o terceiro cutoff. Se `internal-credentials.test.ts` não for o lugar certo, o teste fica num arquivo novo da IA.
6. **Regra no BFF** (`goal023-retention-sweep.test.ts` ou `goal080-*` no BFF): `retentionCutoffs` devolve `unclassifiedCutoff` igual ao `commercialCutoff` para 30, 90, 180 e 365 dias de Comercial, com Pessoal diferente. A varredura entrega à porta da IA os três cutoffs.
7. **Contrato** (`goal023-retention-settings.test.ts` do BFF): `GET` e `PATCH /v1/settings/retention` devolvem `unclassifiedRetentionFollows: "COMMERCIAL"` e não devolvem `unclassifiedPurged`. O schema de `packages/public-api-contract` aceita a resposta.
8. **Tela** (`goal023-retention-settings.test.tsx` ou `goal080-*` no frontend): a nota diz que Não classificadas segue o prazo Comercial e não diz mais que o grupo não tem prazo. O diálogo de redução da Comercial menciona Não classificadas; o da Pessoal, não.

Os fixtures de `goal023-conversations-settings.test.tsx` e `goal024-settings-shell-invariant.test.tsx` trocam o campo. O relatório lista cada asserção de teste existente que mudou e diz por quê.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. O ramo `UNCLASSIFIED` sai de `governedRows`: o teste 1 reprova.
2. A IA passa a usar `commercialCutoff` quando `unclassifiedCutoff` não vem: o teste 2 reprova.
3. O `NOT EXISTS` passa a aceitar a linha se **alguma** sessão governante permitir: o teste 3 reprova.
4. `retentionCutoffs` calcula `unclassifiedCutoff` de `personalRetentionDays`: o teste 6 reprova.
5. A resposta volta a trazer `unclassifiedPurged: false` no lugar do campo novo: o teste 7 reprova.
6. A nota de `RetentionSection` volta ao texto da baseline: o teste 8 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md):
  - ganha **D-096** em `PROPOSED`, no formato de D-090 a D-095. Ela diz: a leitura de (a) e o motivo; a regra escrita só no BFF; o cutoff opcional que preserva quando ausente; o ramo único do predicado, com a órfã e a janela ambígua preservadas; a troca do campo público; a copy; a ausência de migration; o alcance da primeira varredura ligada;
  - diz que D-096 **substitui o item (9) de D-039** e mantém os outros itens. O texto aceito de D-039 não é reescrito;
  - "Revisar se" inclui: uma pessoa querer prazo próprio para Não classificadas; a órfã ou a janela ambígua precisarem de prazo; a categoria default da sessão mudar;
  - a linha U-01 da tabela de decisões do usuário passa de "aguardando Goal que implemente" a "implementada pelo Goal080 (D-096)". É a única edição nessa tabela.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§57**, sem reescrever §4 a §56. Ela registra A-12 e a linha U-01 como fechados por este Goal, cita o teste que agora prova a purga do grupo e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, recontado por execução. A seção de A-12 e a tabela de incertezas ficam como estão; o §57 as supera.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md`, pelo §3, e a linha do vault, pelo (h).
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§56 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada.

**Ordem obrigatória, a mesma dos Goals065 a 079:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os seis controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Antes de entregar uma rodada de correção, rode um grep, nos documentos do §8, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório.

### 9. O que só uma pessoa confere

- Que a leitura de (a), "segue o prazo Comercial" e não "90 dias fixos", é a que Felipe Borges quis. Se não for, D-096 é reaberta antes de qualquer varredura ligada em dado real.
- Que a nova copy de Configurações › Conversas é clara para a profissional.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", o que o §5 autoriza, os testes e os documentos do §8. Não toca `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/`, outros arquivos de `scripts/`, outras notas do vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration, nenhuma coluna, nenhum backfill, nenhum `UPDATE` em dado existente, nenhuma rota nova e nenhuma opção nova na allowlist.
- **Nenhuma varredura contra banco que não seja descartável.** Não ligue `RETENTION_SWEEP_ENABLED` em `.env` local, e não rode a purga contra a base local da revisão, que tem dados reais de clientes (QA_LOCAL_REVIEW, "Estado do ambiente ao fim"). Toda prova de purga roda contra os bancos descartáveis de `validate:integration` ou das suítes de teste.
- Não enfraquece o que D-039 garante: o filtro por `tenantId` do contexto em toda consulta de purga, o teto por passada, `hasMore` por linha a mais, a marca que só avança, a confirmação de redução no contrato e o laço desligado por default.
- **Falha de gate por ambiente** (memória, contenção, porta, rede, a tela "Verificando seu acesso" que some na retentativa) é reexecutada ou reportada. Nunca é corrigida editando configuração (rodada 3 do review073, rodada 2 do review077, observação 1 do review072, observação 4 do review079).
- Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff. Mas o teste 1 do §6 só vale como prova quando roda contra PostgreSQL real, e o relatório diz em qual execução isso aconteceu.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*`, `next.config.ts` ou nos specs de `e2e/`.
- Não remove teste, não pula teste e não encolhe suíte. O teste da linha 276 é reescrito pelo §6.2, não removido.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Com o terceiro cutoff, a purga apaga o conteúdo não classificado vencido, preserva o do prazo e avança a marca até a linha mais nova apagada. Provado pelo teste §6.1 contra PostgreSQL real dentro de `validate:integration`.
2. Sem o terceiro cutoff, nada do grupo é apagado. Provado pelo teste §6.2.
3. Janela ambígua, linha órfã e negócio vizinho seguem as regras de D-039. Provado pelos testes §6.3 e §6.4.
4. A rota interna aceita e valida o campo opcional. Provado pelo teste §6.5.
5. A regra "Não classificadas segue Comercial" existe só em `retentionCutoffs`, e a varredura manda os três cutoffs. Provado pelo teste §6.6 e por grep no diff.
6. O contrato público devolve `unclassifiedRetentionFollows: "COMMERCIAL"` sem `unclassifiedPurged`, e `PUBLIC_API_V1.md` e `packages/public-api-contract` dizem o mesmo. Provado pelo teste §6.7 e por `test:gate`.
7. A nota e o diálogo da Comercial dizem a regra nova. Provado pelo teste §6.8. Largura, contraste, foco e toque de Configurações › Conversas continuam decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas. A clareza da copy fica no §9.
8. Os seis controles negativos do §7 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck e lint de `apps/ai-orchestrator`, `apps/bff`, `apps/frontend` e `packages/public-api-contract` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **121**/**1243**, `test:gate` **233**, `test:ai-orchestrator` **1270**, `test:bff-integration` **465**). `validate:core`, `validate:ui` e `validate:integration` passam, e o gate autenticado tem os **170** testes da baseline com **0** retentativas. Provado por execução.
10. D-096 em `PROPOSED`, a linha U-01 atualizada, FINAL_AUDIT §57 com o veredito **0/7/5**, CURRENT_STATE, VALIDATION_GATE, `PUBLIC_API_V1.md` e a linha do vault foram escritos depois da execução final e dos controles. Eles trazem as contagens da execução final e dizem que a conferência do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a leitura de (a) é a que o usuário quis, o que depende de conferência humana;
- que a varredura se comporta bem sobre o volume real acumulado, porque nenhuma purga roda contra dado real;
- a busca por CEP, pendente de decisão humana.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | COMPLEX | — | Recontagem da baseline; IA: entrada, predicado, rota interna e testes §6.1 a §6.5, com o vermelho da baseline (§1) |
| WU-02 | STANDARD | WU-01 | BFF e contrato: `retentionCutoffs`, cliente, varredura, `settings.ts`, `schemas.ts`, `PUBLIC_API_V1.md`, testes §6.6 e §6.7 e, se preciso, a etapa do ensaio do Goal030 (§2, §3, §5) |
| WU-03 | STANDARD | WU-02 | Frontend: nota, diálogo da Comercial, fixtures e teste §6.8 (§4) |
| WU-04…WU-06 | DETERMINISTIC | WU-03 | typecheck de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` |
| WU-07…WU-09 | DETERMINISTIC | WU-03 | lint de `apps/ai-orchestrator`, `apps/bff` e `apps/frontend` |
| WU-10…WU-12 | DETERMINISTIC | WU-03 | testes dirigidos: `retention` na IA, `goal023-retention` no BFF e `goal023-retention` no frontend |
| WU-13 | DETERMINISTIC | WU-04…WU-12 | validate-core |
| WU-14…WU-16 | DETERMINISTIC | WU-13 | gate-tests, validate-ui e validate-integration |
| WU-17 | STANDARD | WU-14, WU-15, WU-16 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-18 | DETERMINISTIC | WU-17 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular.

A prova de banco da IA roda em `validate:integration`, no passo `test:ai-orchestrator-content-purge`. Se `validate:integration` falhar num passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, sem editar configuração.
