# Review formal — Goal 088

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-01, conforme o [Goal088](../goals/088-lista-e-detalhe-lado-a-lado-e-telas-empurradas-sem-barra-de-abas.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior (001–087) foi reaberto, reavaliado ou revertido.

O Goal cria a casca comum de lista e detalhe (casca 2 do [pente-fino visual de 2026-10-01](../QA_LOCAL_REVIEW.md#pente-fino-visual--protótipo--app-2026-10-01)) e a aplica a Clientes, Serviços e Configurações. De 1024 px em diante, a lista fica numa coluna de 380 px à esquerda e o detalhe à direita. Abaixo disso, o detalhe é uma tela empurrada, com barra própria e sem barra de abas. `/clientes/detalhes`, `/servicos/editar` e `/configuracoes/negocio` seguem os quadros **CL5**, **S4** e **N1**. A decisão é [D-103](../DECISIONS.md), aceita neste review, com a divergência 4 autorizada aqui.

## Escopo e identidade do diff

- Baseline aceita vigente: `f0d53ae296285c18337edfb7269e5b898eed9a43` (Goal085). Base imediata da implementação: `c483db3214140ad0efccf6182fe3cfcfd7426be4`, HEAD da worktree `.ai-worktrees/goal-088`, inalterado nas três rodadas. Entre `f0d53ae` e `c483db3` há só documentação: a virada de status do Goal085 (`742feec`) e o fechamento do Goal085 com a preparação deste Goal.
- Snapshot aceito, calculado pelo IA Loop: **32 arquivos**, hash do diff `493953eee8599bfa2f137025793aed4674e91525f28f4af82f807a348cd36fbb`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Os 32 arquivos, por `git diff --numstat c483db3` no snapshot aceito:
  - Casca, em `src/shared/layout/`: `ListDetail.tsx` (novo, 35 linhas), `PushedBar.tsx` (novo, 127), `useWideLayout.ts` (novo, 32), `AppShell.tsx` (+7/−1) e `ShellConfig.tsx` (+7, campo `pushed`), mais `src/app/(platform)/layout.tsx` (+1).
  - Clientes: `CustomerList.tsx` (+227/−11), `CustomerSummary.tsx` (+87/−65), `CustomerProfile.tsx` (+39/−24), `CustomerForm.tsx` (+26/−17) e `CustomerMemory.tsx` (+23/−23).
  - Serviços: `ServiceForm.tsx` (+286/−157) e `ServiceList.tsx` (+216/−92).
  - Configurações: `BusinessSettings.tsx` (+314/−139), `ProductSettingsScreen.tsx` (+87/−4), `SettingsHub.tsx` (+51/−1) e `shared/SettingsPage.tsx` (+22).
  - Estilos: `avenly-customers.css` (+583), `avenly-services.css` (+324/−64), `avenly-settings.css` (+122) e `avenly.css` (+113).
  - Gate autenticado, só por acréscimo: `e2e/authenticated-matrix.spec.ts` (+299/−0, G-4 e G-5).
  - Testes: `tests/goal088-list-detail.test.tsx` (novo, **25** testes, provas 1 a 5) e asserções ajustadas em `goal018-a11y` (+6), `goal018-business-block` (+2), `goal024-settings-shell-invariant` (+10/−4), `goal058-service-form` (−3), `goal075-customer-profile` (+15/−6) e `goal078-service-instruction-form` (−6).
  - Documentos: `docs/migration/CURRENT_STATE.md`, `DECISIONS.md` (D-103) e `VALIDATION_GATE.md`.
- Nenhuma rota, parâmetro, contrato, migration, variável de ambiente, campo ou serviço mudou. `apps/bff/PUBLIC_API_V1.md`, o vault, `docs/design-reference/`, `e2e/visual/targets.json`, `e2e/routes.ts`, `KNOWN_*`, configurações de Playwright e Vitest, sementes, `scripts/` e passos de `validate:*` não foram editados. FINAL_AUDIT não ganha seção, como o Goal manda.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 12 blockers.** Só a WU-01 foi entregue: `useWideLayout`, `ListDetailLayout`, `PushedBar`, o campo `pushed` no `ShellConfig` e Clientes no padrão. O desenho da casca estava correto. Faltavam S4 e N1 (WU-02 e WU-03 `BLOCKED`), a prova `goal088-list-detail`, G-4 e G-5, os controles do §6, uma execução final válida e os três documentos. O corpo do Resumo do CL5 divergia nos quatro devices, e `/clientes/novo` mantinha o `h1` grande. O Tech Lead respondeu à dúvida da WU-01 sem precisar de humano: o corpo do Resumo do CL5 está no escopo, porque o CL5 é quadro-alvo e não aparece nas exclusões.
2. **Rodada 2 — `CHANGES_REQUIRED`, 8 blockers.** Perfil do Developer elevado a `OPUS_MEDIUM`. Blockers:
   1. Corpo do S4 não portado, e declarado pelo próprio Developer como divergência sem autorização do Goal.
   2. N1 com um cartão permanente "Editar dados do negócio", fora do quadro.
   3. Rótulos PRÓXIMO e PREFERÊNCIAS do CL5 em Literata.
   4. Legenda "a cada" do CL5 quebrando em paisagem, e o `PrimaryGuardianPanel` sem declaração.
   5. Subrotas de Configurações fora do Negócio sem a composição.
   6. CL4 sem CTA fixo.
   7. CURRENT_STATE e D-103 afirmavam o que o app não fazia.
   8. `validate:integration` com exit 1 em `test:scheduling-integration`, sem causa medida.
3. **Rodada 3 — `ACCEPTED`, 0 blocker.** O FIX-001 corrigiu os oito pontos e refez a execução final e os quatro controles sobre a árvore final. A unidade ficou `BLOCKED` só pela decisão da divergência 4, que este review toma. Os gates WU-05 a WU-10 ficaram `OBSERVED` sobre a mesma árvore revisada.

## O que o Tech Lead conferiu na rodada 3

- `visual:compare -- --target CL5,Servicos:S4,Mais-Negocio:N1` na worktree, com leitura dos `side-by-side.png`. Os números coincidem com VALIDATION_GATE:
  - **CL5** 9,4 / 4,6 / 6,1 / 5,4 % (mobile / tablet em retrato / tablet em paisagem / desktop). Mobile e retrato com barra empurrada (‹ e ⋯), sem barra de abas. Paisagem e desktop com a lista de 380 px e o item marcado. PRÓXIMO e PREFERÊNCIAS em Hanken Grotesk, e "a cada" numa linha. O que difere é dado da conta: tags, botão Conversa e resumo vazio.
  - **N1** 8,2 / 3,8 / 5,9 / 5,1 %. Linhas agrupadas iguais ao quadro, sem cartão permanente.
  - **S4** 9,7 / 8,7 / 14,2 / 8,7 %. Barra com × e título, CTA fixo, também acima da barra de abas entre 1024 e 1099 px. As linhas Recorrência, Intervalo (steppers de 52/32 px), Instruções (78 px, raio 14) e Serviço ativo (24 px, raio 7) conferidas no JSX e no CSS contra os valores inline do quadro.
- Telas irmãs: CL4, AG1 e W1 rodadas. Tela empurrada no mobile, com o CTA fixo no CL4, e lado a lado no desktop, com a Agenda marcada.
- Oito arquivos de Vitest: `goal088-list-detail` (25), `goal015`, `goal024`, `goal058`, `goal078`, `goal075` e os dois `goal018`. Resultado **95**/**95**.
- Gate autenticado em disco: `startTime` `2026-10-01T11:47:02Z`, depois da última edição de código (`avenly-services.css`, `11:39:47Z`). **235** `expected`, **0** `unexpected`, **0** `flaky`, **0** retentativas, **15** testes G-4 e **15** G-5. "a 45-minute service saves through the form" verde nas cinco larguras.
- A spec do gate mudou só por acréscimo (+299/−0).
- As asserções mudadas em `goal058`, `goal078` e `goal075` (clique no disclosure que deixou de existir; "Editar dados" movido para o `⋯`) estão justificadas pelo §5 do Goal.

## Decisão do Tech Lead sobre a divergência 4 de D-103

A linha-resumo "Nome, duração e preço" do S4 **abre expandida** (`ESSENTIALS_OPEN_ON_EDIT = true` em `ServiceForm.tsx`) e fica **autorizada como divergência declarada**.

1. O §3 do Goal exige que "a 45-minute service saves through the form" passe sem mudança, e o §4 proíbe mudar teste existente. O teste preenche `input[name=duration]` sem clicar na linha, e o Playwright exige o campo visível.
2. A legenda do quadro S4 diz "A parte de baixo do mesmo cadastro, com as opções abertas". Os essenciais acima das linhas são coerentes com isso, e a ordem e os componentes das linhas batem com o quadro.
3. A alternativa (linha fechada, como no quadro) exigiria mudar o teste, fora da autorização do Goal.

"Onde é feito" fica de fora porque o contrato `Service` não tem o campo.

## Evidência final aceita

Os números estão em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal088), em [VALIDATION_GATE](../VALIDATION_GATE.md) (subseção da rodada 3) e na prova de [D-103](../DECISIONS.md).

- `visual:compare` dos três quadros: os números acima. Telas irmãs: CL1 11,0 / 5,1 / 3,4 / 2,7; CL4 5,8 / 2,6 / 6,5 / 5,0; S1 8,8 / 5,3 / 3,9 / 2,9; M1 7,6 / 3,1 / 5,9 / 5,1; S3, Agenda S1, AG1, IA1, W1, R1 e C1 em VALIDATION_GATE. AG1, IA1, W1, R1 e C1 pioram em paisagem e desktop porque abrem ao lado da lista de Configurações, que é de outro Goal. A porcentagem é tendência; a decisão veio da leitura dos `side-by-side.png`.
- `npx tsc --noEmit` e `npm run lint` com exit 0. `test:frontend`: **132** arquivos e **1415** testes, contra **131**/**1390** na baseline.
- `validate:core`: exit 0, **17** passos, **15** `passed`, **2** `skipped` (`test:bff` e `test:health-worker`).
- `test:gate`: **233**/**233**.
- `validate:ui`: exit 0 em duas corridas, **167** `passed`, **21** `skipped` e **2** `flaky` em cada, em rotas públicas não tocadas, por ambiente (`Target crashed`, axe acima de 30 s).
- Gate autenticado: **235** testes (**205** da baseline mais **30** de G-4 e G-5), **0** `unexpected`, **0** retentativas. O orçamento de requisições comportou as cinco larguras.
- Prova vermelha da baseline: na rodada 2, `goal088-list-detail` com **23** testes reprovou com **11** falhas contra os arquivos de produção de `f0d53ae`, restaurados por `sha256`.
- Quatro controles negativos do §6, depois da última edição de código, cada um restaurado com `sha256` idêntico:
  1. `AppShell` com `hideTabBar = false`: `4 failed | 21 passed (25)`.
  2. `useShellConfig` dentro de `CustomerListPanel`: `4 failed | 21 passed (25)`.
  3. Detalhe sem a lista em largo: `2 failed | 23 passed (25)`.
  4. Lista montada abaixo de 1024 px: `2 failed | 23 passed (25)`.

## Aceito sem prova completa

1. **`validate:integration` terminou com exit 1** em `test:scheduling-integration`, com **26** passos `passed`, **1** `failed` e **9** `notRun`. A falha está fora do diff: nenhum arquivo de `apps/scheduling-service`, `apps/bff` ou `apps/ai-orchestrator` mudou desde `c483db3`. `goal025-tenant-purge.test.ts` depende do relógio: fixa o atendimento em `2026-10-01T09:00Z`, e a constraint `AppointmentHold_expiresAt_check` (`23514`) falha depois desse horário. O Developer reproduziu `4 failed | 139 passed (143)` na base `c483db3`. Na corrida do harness falharam também `goal008-agenda.test.ts` (`completed: 2`) e `goal010` (concorrência), e o Developer não reproduziu essas duas na base.
2. **Os 9 passos `notRun`** vêm da declaração do Developer, que os rodou à parte. O Tech Lead conferiu em disco só o gate autenticado.
3. **Os controles negativos do §6 não foram reexecutados pelo Tech Lead.** Foram conferidos pelo registro em VALIDATION_GATE e pelo `sha256` declarado.
4. **A baseline `f0d53ae` não foi renderizada de novo** na rodada 3. CL5, S4 e N1 não têm número de baseline nesta execução, e CL1, S1 e M1 são comparadas com os números do fechamento do Goal085.

## Divergências declaradas, aceitas

A lista completa está em D-103. Resumo:

1. Banner e cartão do WhatsApp desconectado da conta de teste (D-102).
2. `⋯` ausente quando a tela não tem ação secundária hoje.
3. "alterações não salvas" só com o formulário alterado.
4. Linha-resumo do S4 aberta por padrão (decidida acima) e sem "Onde é feito".
5. N1 com "Não informado" estático onde o contrato `settings.business` não tem o campo.
6. Dados do CL5 da conta de teste.
7. Listas de Configurações (M1), CL1 e S1, e o conteúdo próprio de AG1, IA1, W1, R1 e C1, de outros Goals (094, 095 e 097).
8. Layout largo com barra de abas entre 1024 e 1099 px (D-101).
9. "Cancelar" fora do `ServiceForm` e do `CustomerForm` (o × assume), e o voltar do N1 oculto em largura (`hideBackWide`).
10. `PrimaryGuardianPanel` abaixo do Resumo no CL5, funcionalidade existente que o quadro não tem.
11. Editor de dados do negócio aberto sob demanda pela linha com `›` no N1, estado que o quadro não desenha.

## Observações registradas, sem mudar a decisão

1. **Linha petróleo de 2 px no fim de `main`** nas telas empurradas mais curtas que a viewport. É o anel de foco de `main` (`tabIndex` −1), focado pelo efeito de troca de rota que já existia na base. Não é defeito de layout.
2. **Revisar a divergência 4** se o teste "a 45-minute service saves through the form" passar a abrir a linha-resumo antes de preencher a duração. A linha pode então abrir fechada, como no quadro (nota de fechamento de D-103).
3. **Falhas de relógio em `test:scheduling-integration`.** `goal025-tenant-purge.test.ts` fixa uma data absoluta e falha depois de `2026-10-01T09:00Z` em qualquer diff. É problema do teste do Scheduling, fora do escopo deste Goal, e vai bloquear `validate:integration` dos próximos Goals até ser corrigido.
4. **R-08 e R-09** continuam abertos. Pertencem aos Goals que portarem CL1 e A10.
5. **Perfil de execução.** O Goal declarava `SONNET_HIGH`. A rodada 3 rodou com `OPUS_MEDIUM`, por indicação do review da rodada 2.

## O que o aceite não prova

- A conferência do §7 do Goal **não foi feita**: o lado a lado num tablet real em paisagem e num desktop com a janela perto de 1024 px, e a tela empurrada num celular real, com o teclado aberto no formulário de serviço e o CTA fixo.
- O conteúdo próprio das telas irmãs (CL1, CL4, S1, S3, M1, AG1, IA1, W1, R1 e C1).
- Agenda e Conversas no padrão de lista e detalhe.
- Renderização fora das quatro dimensões do `visual:compare` e das cinco larguras do `validate:ui` e do gate autenticado.
