# Review formal — Goal 084

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-30, conforme o [Goal084](../goals/084-dados-exibidos-como-a-pessoa-espera-preco-em-reais-telefone-formatado-e-texto-sem-artigo-fixo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–083) foi reaberto, reavaliado ou revertido. **Uma rodada**, review `DEEP`, sem blocker.

O Goal fecha **R-03**, **R-07** e **R-04** do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080). Digitar "60" no preço gravava R$ 0,60; o telefone gravado na forma nacional aparecia cru na lista de Clientes e em outras telas de cliente; e a demonstração da IA escrevia "Quanto custa o Escova?". Agora o campo de preço recebe reais e entrega centavos ao consumidor, a forma nacional é reconhecida só para exibição em toda tela que mostra cliente, e a demonstração não põe artigo nem contração antes do nome do serviço. O conserto fica todo em `apps/frontend/src/`, e nenhum contrato muda. Decisão: [D-099](../DECISIONS.md), que substitui o item 4 de D-074.

## Escopo e identidade do diff

- Baseline aceita vigente: `a16ef359d43de66cd9b303970acbd546ffb3d4c3` (Goal083). Base imediata da implementação: `ec83f8d21707e3fe96825ec9cb92f4f9439ce097`, HEAD da worktree `.ai-worktrees/goal-084`, inalterado na rodada. Entre `a16ef35` e `ec83f8d` só há `docs/`: o fechamento do Goal083, a preparação deste Goal e a revisão de U-12.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos**, hash do diff `a141f41f172e2471cd9d0aedf66c20e3013a030e3b984e305474274f969f7dcf`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **19 arquivos rastreados**, por `git diff --numstat ec83f8d` no snapshot aceito:
  - Produção, em `apps/frontend/src/`: `shared/ui/CurrencyInput.tsx` (+75/−63), `shared/phone.ts` (+40/−12), `features/onboarding/demo.ts` (+11/−6), `features/agenda/NewAppointmentFields.tsx` (+7/−2), `features/agenda/SeriesPreview.tsx` (+5/−2), `features/agenda/occupancy.ts` (+4/−1) e `features/customers/CustomerForm.tsx` (+3/−2).
  - Testes existentes reescritos, sem teste removido nem pulado: `goal058-service-form.test.tsx` (+101/−64, bloco de 7 para 8 testes), `goal065-onboarding-schedule.test.tsx` (+6/−6), `goal076-service-form.test.tsx` (+5/−5), `goal078-service-instruction-form.test.tsx` (+3/−3), `goal079-demo-slots.test.ts` (+3/−3), `goal018-onboarding-reachability.test.tsx` (+2/−2), `goal079-onboarding-demo.test.tsx` (+2/−2) e `goal072-onboarding-schedule-fields.test.tsx` (+2/−1). O motivo de cada asserção mudada está em [FINAL_AUDIT §60](../FINAL_AUDIT.md).
  - Documentos do §7: `CURRENT_STATE.md` (+58), `DECISIONS.md` (+38, D-099), `FINAL_AUDIT.md` (+65, §60) e `VALIDATION_GATE.md` (+53).
- **Três arquivos novos**: `apps/frontend/tests/goal084-price-input.test.tsx` (**323** linhas, **24** testes, provas 1 a 4), `goal084-phone-display.test.tsx` (**279** linhas, **19** testes, provas 5 e 6) e `goal084-demo-article.test.ts` (**134** linhas, **10** testes, prova 7).
- Nenhuma rota de API, migration, campo de contrato, reescrita de dado ou opção nova em allowlist. `apps/bff/` e `apps/bff/PUBLIC_API_V1.md` ficam na baseline. `ServiceForm.tsx` e `blocks/schedule.tsx`, os dois consumidores de `CurrencyInput`, não mudaram. Nada em `e2e/`, `vitest.config.*`, `playwright.config.*`, `next.config.ts`, `scripts/` ou `tools/ia-loop/`. `QA_LOCAL_REVIEW.md`, o vault e `docs/design-reference/` não foram editados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blocker.** O Tech Lead conferiu no código:
   - (a)/(b) `CurrencyInput` reescrito com `sanitizedText` e `parsedCents`. Cada linha da tabela de (b) confere: "1.200" sem vírgula não casa com o decimal de fim e vale 120000; "60.50" vale 6050; "R$ 1.234,56" colado vale 123456. A forma editável ao entrar (`editableText`) e a formatação ao sair funcionam, e os `onFocus` e `onBlur` do consumidor continuam chamados. Os centavos vão a `onValueChange` em toda mudança, `inputMode` é `decimal`, e valor acima de `Number.MAX_SAFE_INTEGER` centavos é recusado sem mudar o estado. A interface pública não mudou.
   - (c) O ramo nacional de `normalizeBrazilianPhoneDigits` segue `toCanonicalBrazilianPhone` do Scheduling (`apps/scheduling-service/src/shared/phone/phone.ts`): mesma ordem (`55` com 12 ou 13 dígitos primeiro), mesmo descarte do `0` de tronco em 11 e 12 dígitos, lista de DDDs igual a `BRAZILIAN_DDDS` e mesma restauração do 9º dígito. Também exige assinante iniciado em 2 a 9 nos 10 dígitos, como o Goal pede.
   - (d) As quatro telas passam por `displayPhone`, inclusive no fallback de nome de `personLabel` e `customerLabel`. A busca não mudou, e `listCandidatesByPhone` continua recebendo o valor gravado, o que está afirmado no teste.
   - (e) Os textos de `demo.ts` são os do Goal, com `capitalizeFirst` só onde o nome abre a frase, inclusive na última fala da IA ("<Nome>, data…"). Ordem e quantidade de itens não mudaram.
   - Testes: as três provas novas cobrem 1 a 7. O bloco de `goal058-service-form.test.tsx` passou de 7 para 8 testes, sem remoção, e continua afirmando entrada só pelo `onChange` (`onKeyDown` não chamado), colar, preenchimento automático e valor salvo formatado. As outras asserções mudadas dependem só da máscara de centavos ou do artigo.

## Evidência final aceita

A execução final descrita nos documentos é a da **WU-14 da rodada 1**, sobre a árvore entregue, sem edição de código depois dela, todos exit 0 ([FINAL_AUDIT §60](../FINAL_AUDIT.md)). `validate:integration` rodou contra um PostgreSQL descartável em `127.0.0.1:55741/atendly_bff_test`.

- `validate:core` **17** passos (**15** `passed`, **2** `skipped`: `test:bff` e `test:health-worker`).
- `test:gate` **233**/**233**.
- `validate:ui` **169** `passed`, **21** `skipped`, **0** `flaky` (`startTime` `2026-10-01T01:48:45.905Z`, da WU-12).
- `validate:integration` **36**/**36** passos, com o gate autenticado em **175** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas (`startTime` `2026-10-01T02:11:32.086Z`). A execução anterior desse gate, da WU-13, teve **1** `flaky` por `net::ERR_NO_BUFFER_SPACE` em `[desktop-1440]` `/configuracoes/agenda`; é falha de ambiente, e a WU-14 refez o gate sem tocar configuração.
- Suítes lidas dentro do `validate:core`: `test:frontend` **127**/**1334** (referência **124**/**1280**; **+53** dos três arquivos novos e **+1** líquido em `goal058-service-form.test.tsx`), `test:ai-orchestrator` **1186** passando e **98** `skipped` de **1284**, e `test:scheduling-service` **37**/**502**, sem mudança.
- Os 11 gates declarados do IA Loop passaram: typecheck (WU-04), lint (WU-05), testes dirigidos (WU-06 a WU-09), `validate:core` (WU-10), `test:gate` (WU-11), `validate:ui` (WU-12), `validate:integration` (WU-13) e `git diff --check` (WU-15).
- Quatro controles negativos do §6, pela WU-14, depois da execução final, por edição real revertida e conferida por `sha256`: `goal084-price-input.test.tsx` de `24 passed (24)` para `9 failed | 15 passed (24)`; `goal084-phone-display.test.tsx` de `19 passed (19)` para `10 failed | 9 passed (19)` e para `1 failed | 18 passed (19)`; `goal084-demo-article.test.ts` de `10 passed (10)` para `6 failed | 4 passed (10)`. Todos passam restaurados.
- O vermelho da baseline das provas 1 a 7 é entrega das WU-01 a WU-03 e não está colado em §60.

Evidência conferida pelo Tech Lead:

- `vitest run` no frontend: **127** arquivos e **1334** testes passando, iguais aos declarados.
- `git diff --check` limpo; `git status` só com os 22 arquivos autorizados, sem resto de controle nem `e2e-results/`.
- O Tech Lead não reexecutou os quatro controles, o vermelho da baseline nem os gates renderizados. Os controles vêm da WU-14, o vermelho das WU-01 a WU-03, e as contagens de `validate:ui` e `validate:integration` dos `results.json` citados.

## Observações registradas, sem mudar a decisão

1. **A Inbox também formata a forma nacional.** `formatPhone` de `features/conversations/format.ts` chama `formatBrazilianPhone`, que usa `normalizeBrazilianPhoneDigits`. Um JID estrangeiro de 11 dígitos com prefixo igual a um DDD válido e assinante iniciado em 9 passa a aparecer como telefone brasileiro: Peru `+51 9xxxxxxxx` vira "(51) 9xxxx-xxxx". É coerente com o canonicalizador do Scheduling, que já trata esse número assim, mas D-099 não citava o efeito. Fica registrado na nota de fechamento de D-099, para o próximo Goal que tocar Conversas.
2. **"60,5,9" é lido como R$ 60,59.** Os dígitos depois da segunda vírgula entram nas casas decimais. É leitura possível de "só a primeira vírgula conta", e nenhuma prova a afirma.
3. **O cursor pode pular para o fim** quando um caractere inválido é descartado no meio do texto. É o comportamento comum de campo controlado, e fica para a conferência humana do §8.

## O que o aceite não prova

- Que a pessoa acha natural o campo de preço formatar ao sair, no onboarding, num serviço novo e numa edição, num navegador contra a pilha local. A conferência humana do §8 **não foi feita**.
- Que toda linha da base importada real cabe nas formas reconhecidas. A prova usa as formas conhecidas de IM-10 e CL-04, e outra forma nacional continua crua.
- Que a IA real concorda o gênero do serviço. A demonstração é prévia do frontend, e o texto sem artigo diverge do protótipo de propósito.
- A importação real da Minha Agenda (R-02, Goal082, à espera de uma pessoa), e R-06 e R-08 a R-10 (Goal085).

Veredito do FINAL_AUDIT: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem mudança em relação a §59. R-03, R-07 e R-04 ficam corrigidos. Eles são achados do re-teste local, fora da enumeração A-01…A-24 ([FINAL_AUDIT §60](../FINAL_AUDIT.md)).
