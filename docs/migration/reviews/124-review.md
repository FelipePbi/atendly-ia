# Review formal — Goal 124

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-06, em review **DEEP**, conforme o [Goal124](../goals/124-desconectar-o-whatsapp-reduzir-a-retencao-e-excluir-a-conta-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. O review da rodada 2 terminou `CHANGES_REQUIRED` com 2 blockers só de documentação; o IA Loop aceitou a rodada e adiou as correções para este fechamento, onde elas foram aplicadas nos registros de `docs/migration/`, sem nova rodada.

A folha "Desconectar o WhatsApp?", a folha de redução do prazo de retenção e a tela "Excluir sua conta na Avenly?" ficam iguais aos quadros W2, R2 e C2, nos quatro devices, salvo as divergências declaradas em D-138. W2 e R2 usam a `ChatSheetShell` do K5 e do K6, com o foco inicial na ação que não grava; C2 é a rota própria `/configuracoes/conta/excluir`, e a linha "Excluir conta" do C1 passa a ser um link. Nenhum passo de captura em `targets.json` toca o botão que confirma uma ação gravada, e `visual-responses.test.mjs` recusa esse passo. Nenhuma mudança no BFF, no Scheduling, na IA, no contrato ou no banco. Decisão: [D-138](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `7e5de46dd5320f7b54032865c53ceb173408183e` (Goal123). Base imediata da implementação: `62ee50c0fc7c7cef1951d9db0d5fe108e811efc8` (fechamento do Goal123 e preparação do Goal124), HEAD da worktree `.ai-worktrees/goal-124`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **22 arquivos** (18 rastreados e 4 novos não rastreados), hash do diff `d078e33d0552aaa801fd3953a4695def845dd923de4409acbe28a3c53c1e5fe1`. Mudança posterior nesses arquivos exige avaliar o novo diff. As correções de registro deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - `apps/frontend/src/` (9): `features/whatsapp/WhatsAppConnectionPanel.tsx`; `features/conversations/ConversationActionsSheet.tsx` (rodada 2, só a prop opcional `initialFocusSelector` de `ChatSheetShell`); em `features/settings/`, `AccountDeletionScreen.tsx` (novo), `AccountSettings.tsx`, `ProductSettingsScreen.tsx`, `RetentionSection.tsx` e `types.ts`; a rota `app/(platform)/configuracoes/conta/excluir/page.tsx` (nova); e `shared/styles/avenly-settings.css`;
  - `apps/frontend/tests/` (7): `goal124-folhas-de-configuracoes.test.tsx` e `goal124-excluir-conta.test.tsx` (novos, 36 testes) e os ajustes de `goal023`, `goal024`, `goal025`, `goal104` e `goal106`;
  - a captura (3): `apps/frontend/e2e/routes.ts` (rota do C2), `apps/frontend/e2e/visual/targets.json` (W2, R2 e C2) e `scripts/tests/visual-responses.test.mjs` (de 46 para 49 testes);
  - `docs/migration/` (3, por acréscimo): D-138 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal124 em `VALIDATION_GATE.md`.
- Todos dentro do critério 8 do Goal. `ConversationActionsSheet.tsx` está sob `apps/frontend/src/`, e a escolha 2 do Goal autoriza usar a `ChatSheetShell` sem mudar o comportamento do K5 e do K6: a prop é opcional e os chamadores sem ela continuam focando o primeiro focável. `scripts/visual-compare.mjs`, `scripts/lib/visual-responses.mjs` e `apps/frontend/e2e/authenticated-matrix.spec.ts` não mudaram. O documento do Goal124 não foi tocado.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers (2 de código ou evidência, 2 só de documentação), de volta ao Developer.** O review DEEP aprovou a estrutura das três telas, os estados do C2, o corpo dos pedidos e a fidelidade visual, e pediu:
   1. o foco inicial de W2 e R2 caía em "Desconectar" ou "Reduzir para {novo}", o primeiro focável da `ChatSheetShell`; Enter repetido de quem abre a folha pelo teclado confirmaria a ação gravada, contra o critério 4 (o `Dialog` antigo focava "Fechar");
   2. as `notes` de W2 e R2 em `targets.json` não citavam todas as divergências declaradas (escolha 9 do Goal): faltavam a frase das Não classificadas no R2 e o estado da casca da conta visual no W2;
   3. a divergência do campo "Confirme com sua senha" sem "Mostrar senha" no C2 não estava registrada em D-138 nem no VALIDATION_GATE;
   4. os registros diziam 30 testes `goal124`, e a execução final deu 34; D-138 citava um título antigo errado do diálogo de redução.
2. **Rodada 2 — `CHANGES_REQUIRED` no review, 2 blockers só de documentação; `ACCEPTED` pelo IA Loop com as correções adiadas para o fechamento.** A FIX-001 resolveu os quatro blockers: `ChatSheetShell` ganhou a prop opcional `initialFocusSelector`, lida na montagem, com retorno ao primeiro focável; W2 e R2 passam `.settings-sheet-cancel`; dois testes novos provam o foco em "Manter conectado" e "Manter 90 dias" e que Enter não chama `disconnect` nem o `PATCH`. As `notes` foram completadas, a divergência do C2 entrou em D-138 e no VALIDATION_GATE, e a contagem passou a 36 (WU-06). Os dois blockers que restaram pediam: dizer que os cinco controles negativos rodaram na rodada 1, antes da FIX-001, e por que não foram refeitos; e citar `ConversationActionsSheet.tsx` e a prop de foco no escopo do VALIDATION_GATE e no delta do CURRENT_STATE. Aplicados neste fechamento (ver "Correção de registro aplicada no fechamento").

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal124), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal124) e em D-138.

- **Gates do IA Loop, rodada 2, todos com saída 0 na árvore final:** `typecheck` (WU-04), `lint` (WU-05), testes alvo `goal124` com 2 arquivos e 36 testes (WU-06), suíte do frontend com 171 arquivos e 2210 testes (WU-07), `test:gate` com 282 pass e 0 fail (WU-08), `validate:core` com 17 passos, 15 passando, 0 falhas e 2 pulados (`test:bff` e `test:health-worker`) (WU-09), `validate:ui` com 169 passed, 21 skipped e 0 retentativas (WU-10), `validate:integration` com 36 de 36 passos e o gate autenticado em 280 passed e 0 retentativas (WU-11) e `git diff --check` (WU-12).
- **Controles negativos do Developer (rodada 1):** (a) "Excluir minha conta" habilitado sem senha reprovou 2 testes; (b) o formulário durante o carregamento, 1; (c) o `PATCH` sem `confirmReduction`, 3; (d) sem a frase das Não classificadas, 2; (e) um passo de captura que confirma, 1 de 49 em `visual-responses.test.mjs`. Cada mutação foi revertida e conferida com `cmp`.
- **Conferência do Tech Lead:**
  - **`visual:compare` de W2, R2 e Mais-WhatsApp:C2:** refeito nas duas rodadas, saída 0, 12 capturas, os 12 `side-by-side.png` abertos. W2 2,3/6,1/7,7/6,3%, R2 6,3/7,7/12,7/10,7% e C2 8,9/4,1/6,4/5,5% (mobile, tablet em retrato, tablet em paisagem, desktop), os mesmos valores do Developer nas duas rodadas. Estrutura, componentes, cores, tipografia e os botões de 52 px iguais aos quadros; o texto mais curto do W2 e o mais longo do R2 deslocam a folha centrada no tablet e no desktop, e o aviso da casca empurra o campo de senha do C2 para baixo da dobra no mobile e na paisagem, efeitos das divergências declaradas.
  - **Regressão:** K5 e K6, que usam a mesma `ChatSheetShell` sem a prop, com os mesmos percentuais da captura aceita (K5 com 0,1 de variação no celular); W1, R1, Mais-WhatsApp:C1 e M1 iguais aos aceitos.
  - **Código:** `disconnect()` e o corpo do `PATCH` da retenção não mudam; `confirmReduction: true` só sai depois do botão que confirma, uma vez; "Reduzir para…" em tinta (`is-ink`), sem `btn-danger`. O C2 calcula a data com hoje mais 7 dias no fuso do negócio, mantém "Excluir minha conta" desabilitado com a senha vazia, nunca mostra o formulário enquanto carrega nem quando a leitura falha, e redireciona por `replace` com `SCHEDULED` ou `PURGED`. A regra dos passos reconhece "Desconectar", "Excluir minha conta", "Reduzir os dois prazos" e o prefixo "Reduzir para", e deixa passar "Desconectar WhatsApp".
  - **Controles negativos depois da FIX-001:** entre os patches das rodadas 1 e 2, `RetentionSection.tsx` só ganhou a linha `initialFocusSelector=".settings-sheet-cancel"`, e as expressões mutadas em (c) e (d) estão iguais; `AccountDeletionScreen.tsx` não mudou ((a) e (b)); em `targets.json` só mudaram as `notes` de W2 e R2 (sem efeito em (e)); `goal124-folhas-de-configuracoes.test.tsx` só ganhou testes. Por isso os controles da rodada 1 continuam valendo.
  - Na rodada 2, a reescrita de `apps/frontend/AGENTS.md` pelo `next dev` durante a captura foi devolvida; o arquivo não faz parte do diff.

## Correção de registro aplicada no fechamento

Os dois blockers adiados foram aplicados pelo Tech Lead, só em `docs/migration/`, com o texto pedido pelo review:

1. `VALIDATION_GATE.md`, seção do Goal124, "Controles negativos": a frase "Rodados depois da última edição de código; ..." passou a dizer que os controles rodaram na rodada 1, depois da última edição de código daquela rodada, que a rodada 2 só acrescentou a prop `initialFocusSelector` (em `ConversationActionsSheet.tsx`, `WhatsAppConnectionPanel.tsx` e `RetentionSection.tsx`) e completou as `notes` de W2 e R2, e que nenhuma linha mutada nem teste reprovado mudou, por isso os controles não foram refeitos.
2. `VALIDATION_GATE.md`, seção do Goal124, "Escopo": a lista ganhou `apps/frontend/src/features/conversations/ConversationActionsSheet.tsx`, logo depois de `WhatsAppConnectionPanel.tsx`. `CURRENT_STATE.md`, delta do Goal124, item W2: ganhou a frase do foco inicial de W2 e R2 na ação que não grava, pela prop opcional `initialFocusSelector` de `ChatSheetShell`, com K5, K6 e os outros chamadores focando o primeiro focável.

Também neste fechamento: o status de D-138 passou a ACCEPTED, com a nota de fechamento.

## Divergências aceitas

Declaradas pelo Goal ou por D-138, conferidas nas capturas:

1. W2: a terceira linha termina em "refazer o teste." e o quadro diz "refazer o teste de 3 minutos."; o app não promete a duração de um teste que ele não cronometra.
2. R2: sem "hoje isso alcança 86 conversas" (o BFF não expõe a contagem antes de salvar) e com "As Não classificadas seguem o mesmo prazo." quando a Comercial reduz.
3. C2: a data da linha do tempo é a de hoje mais 7 dias no fuso do negócio ("Em 13 de outubro" na captura; o quadro mostra "Em 25 de setembro").
4. C2: o campo "Confirme com sua senha" é um input de senha próprio, sem "Mostrar senha", como no quadro; por isso o critério 7 não tem esse alvo de toque.
5. W2 e R2: o foco inicial em "Manter conectado", "Manter {prazo atual}" ou "Manter os prazos atuais"; o quadro não define foco, e não aparece na captura.
6. O estado da casca da conta visual (o aviso "Atendimento automático parado", a barra de status, as linhas do hub, "Notificações" e o nome e o telefone do negócio ao fundo, D-118), e a barra de status e o indicador de início do iPhone do protótipo.

## Aceito sem prova completa

1. **Os controles negativos** vêm da execução do Developer na rodada 1. O Tech Lead não os refez; conferiu, pelos patches das duas rodadas, que a FIX-001 não tocou nas linhas mutadas nem nos testes que eles reprovaram.
2. **As contagens dos gates globais** vêm dos resultados do IA Loop da rodada 2, sem reexecução pelo Tech Lead além do `visual:compare`.
3. **Contraste e alvo de toque das folhas W2 e R2** foram conferidos por cálculo (WCAG 2.x) sobre as cores do CSS e pela altura de 52 px dos botões, não por `validate:ui`: as folhas são estados abertos por toque e `routes.ts` só lista rotas. O gate autenticado alcança o C2 nos cinco widths.
4. **Conferência em aparelho real:** não feita; o Goal pede as capturas do `visual:compare`.

## Observações registradas, sem mudar a decisão

1. A primeira execução de `validate:core` do Developer falhou em `test:ai-orchestrator` porque o banco de `AI_TEST_DATABASE_URL` do ambiente não estava migrado; as execuções que contam rodaram sem essas variáveis. Os gates do IA Loop (WU-09 e WU-11) passaram com saída 0.
2. A `ChatSheetShell` continua exportada de `features/conversations/ConversationActionsSheet.tsx` e agora serve também a Configurações e ao WhatsApp. Mover a casca para `shared/ui/`, que a escolha 2 do Goal permitia, fica para quando outro Goal mexer nela.
