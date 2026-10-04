# Review formal — Goal 065

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-28, conforme o [Goal065](../goals/065-onboarding-conforme-o-vault.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–064, 070 e 071) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 11 blockers, e a rodada 2 terminou com zero.

O Goal corrige **QA O-01**, **QA O-02**, **QA O-03**, **QA O-04**, **QA O-05**, **QA O-06**, **QA O-08**, **QA O-09**, **QA O-14**, **QA O-15** (só a sequência), **QA O-16**, **QA O-24**, **QA O-26**, **QA O-28**, **QA O-30**, **QA O-31**, **QA O-33**, **QA O-34**, **QA O-35**, **QA O-38**, **QA O-41**, **QA O-43** e **QA O-50** da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. O onboarding segue a sequência do vault e começa em Boas-vindas sem gravar nada. "Seu negócio" vira três etapas (Segmento + nome, Modalidade, Endereço). O primeiro serviço grava os quatro tipos de preço sem conversão, e os serviços adicionais usam `POST /v1/services`. A agenda grava horário por dia. Todas as etapas validam inline, sem balão nativo. Os textos chamam a automação de "IA". O onboarding entra no gate autenticado ([D-083](../DECISIONS.md)).

## Escopo e identidade do diff

- Baseline aceita vigente: `76293d0747d0c755c38f90ff71ded08c1247a987` (Goal064). Base imediata da implementação: `03f9b941909ddb6254fe6514cb4b5066a1849dbd`, HEAD da worktree `.ai-worktrees/goal-065`, inalterado nas duas rodadas. O commit `03f9b94` é só documental (fechamento do 064 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **32 arquivos**, hash do diff `02495114429630291aa70fd83dc9994774bd2954e9d91d639c14fa858749c8b0`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Vinte e oito arquivos rastreados**, por `git diff --numstat 03f9b94`:
  - `apps/bff/`: `PUBLIC_API_V1.md` (+2/−0) e `src/modules/onboarding/routes.ts` (+22/−1). Nenhuma migration.
  - `apps/frontend/`, produto: `app/onboarding/[step]/page.tsx` (+14/−1), `data/services/BffOnboardingService.ts` (+1/−1), `features/onboarding/OnboardingRuntime.tsx` (+59/−24), `OnboardingScreen.tsx` (+45/−15), `OnboardingShell.tsx` (+16/−4), `blocks.ts` (+13/−6), `blocks/ai.tsx` (+22/−9), `blocks/business.tsx` (+231/−92), `blocks/schedule.tsx` (+500/−137), `blocks/shared.tsx` (+203/−0), `blocks/whatsapp.tsx` (+11/−4), `scenarios.ts` (+30/−18) e `shared/styles/avenly.css` (+70/−13).
  - `apps/frontend/`, documentação e medição: `AGENTS.md` (+15/−0), `e2e/authenticated-matrix.spec.ts` (+359/−13), `e2e/routes.ts` (+69/−0) e `e2e/measure.ts` (+10/−1).
  - `apps/frontend/tests/`: `goal018-a11y.test.tsx` (+10/−5), `goal018-business-block.test.tsx` (+16/−141), `goal018-onboarding-reachability.test.tsx` (+85/−58) e `goal063-onboarding-activation.test.tsx` (+3/−1). Cada mudança está mapeada em [FINAL_AUDIT §44](../FINAL_AUDIT.md), por rota, ordem de etapa, validação nativa, tipo de preço convertido ou texto trocado. Nenhum teste foi pulado.
  - `scripts/goal033-authenticated-ui-rehearsal.mjs` (+94/−4): semeia uma segunda conta pelas rotas do produto, parada no meio do onboarding. A conta principal não mudou.
  - Os quatro documentos de `docs/migration/`, só por acréscimo: `CURRENT_STATE.md` (+98), `DECISIONS.md` (+38, D-083), `FINAL_AUDIT.md` (+71, §44) e `VALIDATION_GATE.md` (+109).
- **Quatro arquivos novos**:
  - `apps/bff/tests/goal065-onboarding.integration.test.ts` (**329** linhas, **4** testes);
  - `apps/frontend/tests/goal065-onboarding-business.test.tsx` (**467** linhas, **21** testes), `goal065-onboarding-schedule.test.tsx` (**753** linhas, **37** testes) e `goal065-onboarding-copy-whatsapp.test.tsx` (**250** linhas, **18** testes).
- Nenhum arquivo foi tocado em `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `apps/bff/src/clients/`, `packages/` ou `tools/ia-loop/`. `POST /v1/onboarding/complete`, as regras de conclusão e a ativação da IA não mudaram. `this.http.` em `apps/bff/src/clients/` segue em **42** ocorrências. `QA_LOCAL_REVIEW.md` e o Product Vault não foram editados.

## Rodada 1 — CHANGES_REQUIRED (11 blockers)

O que já estava correto: o BFF aceitava os quatro `priceType`, com `superRefine` antes do Scheduling e vermelho real na baseline. A conversão `onboardingPriceType` tinha saído. Os serviços adicionais usavam `POST /v1/services`. Havia uma regra por dia, semana começando na segunda, resumo sem "Fonte oficial", `noValidate`, `aria-pressed` e redirect das rotas antigas. A segunda conta já entrava no gate autenticado nas cinco larguras, com a checagem dos oito chips. O perfil do Developer passou de `SONNET_HIGH` para `OPUS_MEDIUM`, o perfil declarado no Goal, porque partes do §2, §3, §4 e §7 ficaram de fora sem aviso. Os onze blockers:

1. **Documentação do §12 ausente**: sem D-083, FINAL_AUDIT §44, CURRENT_STATE e VALIDATION_GATE.
2. **Controles 1 e 6 do §10 não rodados** (`priceType` do PATCH de volta a `FIXED`/`ON_REQUEST`; `.chip-row` de volta a `nowrap`). Os controles 2 a 5 precisavam rodar de novo, porque o código ia mudar.
3. **Segmento + nome fora do vault**: o nome vinha antes do segmento, sem a pergunta "Como seus clientes conhecem você?", e o título e o eyebrow eram outros.
4. **Modalidade fora do vault**: título, descrição e texto da opção "A domicílio" diferentes.
5. **Boas-vindas incompleta**: sem "Seu progresso fica salvo a cada etapa." e sem a composição estática de três elementos.
6. **"Sair" sem estilo de botão** (QA O-02).
7. **Validação inline incompleta**: segmento vazio e nenhum dia caíam no rodapé; fim antes do início não marcava o campo final (QA O-33); erro de validação do servidor não caía no campo; o formulário aberto e vazio de "Serviços adicionais" bloqueava "Continuar".
8. **Regressão na retomada de horários**: `draftFromState` preenchia `dayHours` para todos os dias, e mudar o intervalo-base gravava o horário antigo. Era escrita com perda.
9. **Demonstração da IA com "R$ 0,00"** para `NOT_INFORMED`, e `STARTING_AT` sem "a partir de".
10. **Textos ainda chamando a automação de "Avenly"** em `segmento-e-nome` e `servico-nome` (QA O-38), com teste de cópia restrito a `tom-da-ia`.
11. **Introdução do WhatsApp sem o layout empilhado no celular** (QA O-41). O relatório do Developer declarava ter pulado a parte.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1, B2:** D-083 PROPOSED, FINAL_AUDIT §44, CURRENT_STATE e VALIDATION_GATE escritos só por acréscimo, com o vermelho de `76293d0` (frontend **67** de **76** falhando; BFF **2** de **4**), os seis controles com saída real, o veredito 0/7/6 recontado e a conferência humana do §11 declarada como não feita. O controle 6 dá **5** `unexpected` em **125**, com 881px de conteúdo em 328px. Os hashes declarados de `routes.ts` (`0a5c382d`), `OnboardingRuntime.tsx` (`62d9c58b`), `OnboardingScreen.tsx` (`46165c84`), `schedule.tsx` (`dfdfd78c`) e `avenly.css` (`9fd39696`) batem com a árvore revisada. Logo, nenhum código mudou depois dos controles.
- **B3, B4:** chips de segmento antes de "Como seus clientes conhecem você?", com a ajuda do vault; título "Vamos começar pelo seu negócio", eyebrow "Seu negócio". Modalidade com "Onde você atende?", "Pode escolher mais de uma opção." e "A domicílio · Você vai até o cliente". `contentMarker`s do e2e atualizados.
- **B5:** figura estática com mensagem, resposta da IA e horário, mais "Seu progresso fica salvo a cada etapa.".
- **B6:** "Sair" usa `btn btn-secondary`, ícone `aria-hidden`, texto oculto só visualmente no celular, sem `::after`.
- **B7:** `data-validation-group` liga o erro ao grupo (segmento, modalidade, dias). `setCustomValidity` marca o campo final, no intervalo-base e em cada dia. `applyServerFieldErrors` usa `details.fieldErrors` do BFF, com texto de tela. O formulário de adicional fica em `data-validation-scope` e não bloqueia "Continuar".
- **B8:** `draftFromState` usa o intervalo mais frequente como base, e `dayHours` guarda só os dias diferentes. Fechar "Personalizar" limpa `dayHours`. Há testes de retomada uniforme, de dia personalizado e de fechamento.
- **B9:** `demoPriceReply` cobre os quatro tipos, sem "R$ 0,00".
- **B10:** textos com "IA". O teste de cópia varre as dez etapas do §8 mais `tom-da-ia`.
- **B11:** na introdução do WhatsApp, o botão principal vem primeiro, e `.is-stacked` empilha os botões em largura total no celular. O gate autenticado mede isso.

Prova declarada pelo Developer e conferida na revisão:

- `validate:core`: **17** passos, **15** `passed`, **2** `skipped` (`test:bff`, `test:health-worker`), **0** `failed`. Dentro dele: `test:frontend` **90** arquivos e **927** testes (baseline review064: **87**/**854**); `audit:static` **33** de **34**, **1** pulada.
- `test:gate`: **233**/**233**.
- `validate:ui`: **169** passando, **21** pulados, **0** retentativas.
- `validate:integration`: **35**/**35** passos. `test:bff-integration` roda **53** arquivos e **428** testes (baseline **52**/**424**), inclusive os **4** novos. `test:scheduling-integration` roda **16**/**124** (inalterado). `rehearse:goal033-authenticated-ui`: **125** expected (os **75** da conta principal, sem mudança, mais **50** das dez etapas do onboarding nas cinco larguras), **0** unexpected, **0** flaky, **0** retentativas.
- Nenhuma exceção nova em `KNOWN_*`. Nenhuma suíte encolheu.

## Observações registradas, sem mudar a decisão

1. **Execução não limpa do orquestrador.** No `validate:integration` rodado pelo IA Loop para a revisão da rodada 2, o gate autenticado deu **124** expected e **1** flaky: `net::ERR_NO_BUFFER_SPACE` em `onboarding-whatsapp@desktop-1440`, esgotamento de buffer de socket do Windows. As duas execuções do Developer deram **125**/**0**/**0**. Os documentos do Goal citavam só as execuções limpas; o fechamento acrescentou o registro em [VALIDATION_GATE](../VALIDATION_GATE.md).
2. **`e2e/measure.ts` fora dos pontos de implementação.** Na rodada 1, `isVisuallyHidden` passou a reconhecer `sr-only` (`position: absolute`, 1×1) para medir o rótulo de "Sair". Não é afrouxamento: o rótulo continua medido.
3. **Ordem de Tab na introdução do WhatsApp.** A partir do tablet, `row-reverse` deixa a ordem de Tab (principal, depois "Fazer isso depois", depois "Voltar") invertida em relação à ordem visual.
4. **Erro de servidor de `price` negativo cai no campo errado.** A mensagem do zod não contém o nome do campo, e o erro cai no primeiro campo da seção (nome do serviço), não no valor.
5. **Dia personalizado só no início.** Um dia personalizado só no horário de início congela o fim antigo quando o fim do intervalo-base muda.

As observações 3 a 5 são candidatas a ajuste no Goal072 ou em revisão futura.

## O que o aceite não prova

- Que o onboarding, percorrido num aparelho real com a conta nova, segue o vault de ponta a ponta. A conferência humana do §11 do Goal **não foi feita**.
- Que os estados de erro das etapas cumprem largura, toque, contraste, foco e movimento. Ficam no jsdom; o gate mede as etapas no estado inicial.
- O bloco "Sua agenda" e a importação no onboarding (Goal066), nem o endereço por CEP (Goal072).
- Que as etapas batem com o protótipo aprovado: ícones, trilho de capítulos, stepper, máscara de moeda e demonstração animada (Goal072).

Veredito do FINAL_AUDIT, recontado na execução final: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, sem contar os achados da revisão local ([FINAL_AUDIT §44](../FINAL_AUDIT.md)).
