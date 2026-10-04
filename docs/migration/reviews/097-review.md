# Review formal — Goal 097

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal097](../goals/097-configuracoes-iguais-ao-prototipo-hub-negocio-e-agenda.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

Configurações passa a seguir os quadros M1, N1, AG1 e AG3. `/configuracoes` mostra o bloco de identidade e três grupos ("Atendimento", "Seu negócio" e "Dados e conta"), com o estado de cada linha lido do BFF e sem segunda linha quando a leitura falha ou ainda carrega. O cartão "Disponibilidade" saiu do hub; `/configuracoes/disponibilidade` marca "Agenda" na lista de 1024 px em diante. `/configuracoes/agenda` é uma lista de linhas, e "Dias visíveis" e "Visualização inicial" abrem uma folha que grava pelo mesmo `PATCH /v1/settings/agenda-view`. As regras de oferta e a política de cancelamento moram em `/configuracoes/agenda/regras` (AG3), com um só "Salvar" e um só `PATCH /v1/settings/availability`, que reenvia o `timezone` e as `rules` lidas. O bloco "Na prática" vem de `offerPreview`. Os lembretes moram em `/configuracoes/agenda/lembretes`. O N1 só ganhou acabamento de CSS. A casca, o diálogo "Mais", o contrato, o BFF, o Scheduling e a IA não mudaram. Decisão: [D-116](../DECISIONS.md), aceita neste fechamento; ela revê só o item 1 de D-085 e, com ele, o item 4 de D-086.

## Escopo e identidade do diff

- Baseline aceita vigente: `4735b21f026454dd8bf1d3a1e589c9c738cf8f09` (Goal096). Base imediata da implementação: `70efd42473cbe182be40d560bddaeda616a7258f`, HEAD da worktree `.ai-worktrees/goal-097`, sem commit na worktree. Entre as duas há só documentação (fechamento do Goal096 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **32 arquivos**, hash do diff `fb106906b881c5b9bd62ce31f7d4986794d31d8db29c62afa8b253521f4f4539`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, todos em `apps/frontend/`: `src/features/settings/SettingsHub.tsx` (`sha256` `61daff92…`), `ProductSettingsScreen.tsx` (`b4a44cc6…`), `CalendarSettings.tsx`, `types.ts`, `shared/SettingsPage.tsx` e `shared/labels.ts`; os novos `OfferRulesSettings.tsx` (`b22f5519…`), `agendaSummaries.ts` (`76b7d1bb…`) e `offerPreview.ts` (`4a770ec1…`); as rotas novas `src/app/(platform)/configuracoes/agenda/regras/page.tsx` e `.../agenda/lembretes/page.tsx`; `src/features/reminders/ReminderSettingsSection.tsx` (só o `h2`); `src/shared/icons/Icon.tsx` e `public/icons/avenly-icons.svg`; e `src/shared/styles/avenly-settings.css` (`68b6dc60…`). Os hashes são os conferidos pelo Tech Lead nas rodadas 4 e 5 e no fechamento, iguais aos que VALIDATION_GATE cita.
  - E2E e visual: `apps/frontend/e2e/routes.ts` (`4df19cee…`), só as duas entradas do §6; `apps/frontend/e2e/visual/targets.json` (`26c0b2e2…`), só a entrada do AG3.
  - Teste novo: `apps/frontend/tests/goal097-configuracoes.test.tsx` (**44** testes, cinco provas, `sha256` `9861642e…`).
  - Testes ajustados, só onde dependiam do texto ou da estrutura que o quadro troca, nenhum removido nem pulado: `goal020-reachability`, `goal021-a11y`, `goal021-reminder-settings-section`, `goal021-shell-invariant`, `goal023-conversations-settings`, `goal024-settings-hub`, `goal024-settings-shell-invariant`, `goal067-configuracoes-agenda`, `goal069-hidden-days-limit`, `goal073-configuracoes-agenda` e `goal088-list-detail`.
  - Documentos: `docs/migration/DECISIONS.md` (D-116 e as notas "Revista em parte" em D-085 e D-086), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `BusinessSettings.tsx`, `e2e/authenticated-matrix.spec.ts`, a casca (`AppShell.tsx`, `navigation.ts`, `PushedBar.tsx`, `ListDetail.tsx`, `useWideLayout.ts`, `ShellConfig.tsx`), `apps/frontend/AGENTS.md`, o contrato público, o BFF e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers, de produção.** AG1, AG3 e N1 foram aceitos no mérito. (1) No M1, o nome e "segmento · endereço" do bloco de identidade quebravam em várias linhas: faltava `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` em `.hub-identity-copy strong` e `span`. (2) Regressão do §3: em `/configuracoes/disponibilidade`, de 1024 px em diante, nenhuma linha do hub ficava com `aria-current="page"`, porque `openHrefFor('availability')` ainda apontava para o cartão que saiu do hub.
2. **Rodada 2 — `CHANGES_REQUIRED`, 1 blocker, de evidência e documento.** Os dois blockers de código foram resolvidos: o bloco de identidade usa reticências, e `availability` marca "Agenda", com um teste novo (o arquivo passou de 43 para 44 testes). A rodada editou código e teste, mas não rodou de novo os seis controles do §7 nem o vermelho da baseline, e os documentos ficaram com os hashes, a contagem 43 e as execuções da rodada 1.
3. **Rodada 3 — `CHANGES_REQUIRED`, 1 blocker, só de documento.** Os controles, o vermelho da baseline (`42 failed | 2 passed (44)`) e o `visual:compare` foram rodados sobre a árvore final, e os hashes conferiram. Ficaram falsos o "Contexto" de D-116, com os números de `visual:compare` da WU-12, e a afirmação de que `validate:integration` não tinha rodado depois da rodada 2.
4. **Rodada 4 — `CHANGES_REQUIRED`, 5 blockers, só de documento.** O Developer corrigiu só o "Contexto" de D-116, porque viu o blocker truncado, e acrescentou em D-116 (h) a mesma afirmação falsa sobre `validate:integration`. O Tech Lead dividiu o pedido em cinco itens curtos: o título "(rodada 1)" da seção de VALIDATION_GATE, a introdução e a linha da tabela de `validate:integration`, o parágrafo do critério de 265, o item "Execução final" de CURRENT_STATE e o item (h) de D-116.
5. **Rodada 5 — `ACCEPTED`, 0 blockers.** Só documentos. Os cinco itens foram resolvidos. O grep pelas frases falsas nas três seções do Goal097 não achou resto.

O código de produção e o teste não mudaram desde a rodada 2. O perfil do Developer declarado no Goal é `SONNET_HIGH`. As rodadas 1 a 4 recomendaram `SONNET_MEDIUM` para a correção.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal097 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal097) e na "Prova" de D-116.

- **Identidade do código aceito.** Nas rodadas 4 e 5, os `sha256` de `SettingsHub.tsx`, `ProductSettingsScreen.tsx`, `avenly-settings.css`, `OfferRulesSettings.tsx` e do teste batem com os da rodada 2 e com os documentados. `git status` tem 32 linhas, só de arquivos autorizados, sem resto de controle negativo e sem `e2e-results/` rastreado.
- **`visual:compare`.** O Tech Lead rodou `npm run visual:compare -- --target M1,N1,AG1,AG3` nas rodadas 1, 2, 3 e 5 (exit 0). Na rodada 4 não rodou, porque o código não mudou. Os números das rodadas 3 e 5 são os do "Fim": M1 **8,5 / 3,8 / 5,9 / 5,1**, N1 **8,2 / 3,8 / 5,9 / 5,2**, AG1 **8,3 / 3,7 / 6,1 / 5,1** e AG3 **15,2 / 6,4 / 7,5 / 6,7** (mobile / tablet em retrato / tablet em paisagem / desktop). O início do Developer, na baseline, foi M1 7,6 / 3,1 / 5,9 / 5,1, N1 8,2 / 3,8 / 5,9 / 5,1, AG1 13,4 / 5,9 / 7,1 / 5,9 e AG3 19,7 / 10,8 / 11,5 / 9,7. H3, CL1, Servicos:S1 e C5 ficaram com diff idêntico ao do início. Em cada rodada em que rodou o compare, o Tech Lead abriu os dezesseis `side-by-side.png`. M1, N1, AG1 e AG3 batem com os quadros em estrutura, componentes, cores, tipografia e espaçamento nos quatro devices. O que difere é o declarado em D-116 ou vem do ambiente:
  - o título "Configurações" no lugar de "Mais" (divergência 2);
  - o banner da casca "Atendimento automático parado" e a pílula "WhatsApp desconectado", que trunca o nome com reticências;
  - os dados da conta visual (divergência 3) e o "Não informado" sem "Adicionar" no N1 (divergência 6);
  - a falta de "Bloqueios que se repetem" (divergência 4);
  - a opção extra "Sem antecedência mínima" e o "Na prática" calculado com antecedência 0 da conta;
  - o item "Notificações" da sidebar (divergência 7).
- **Código.** O hub tem os três grupos com os `href` de D-116 (a), e não tem Disponibilidade. A linha Serviços some a partir de 1100 px. Cada leitura de (b) é independente e não inventa valor. O AG1 está em linhas, e as folhas `Dialog` `variant="sheet"` usam o mesmo `PATCH` de `agenda-view`. O AG3 tem um único `updateAvailability`, que reenvia `timezone` e `rules` como foram lidos. `offerPreview` dá o resultado do quadro com relógio fixo. Há uma chamada de `useShellConfig` por árvore, em `ProductSettingsScreen`.
- **Provas.** `goal097-configuracoes.test.tsx` passa **44**/**44** nos gates das rodadas 2 a 5. Contra os arquivos de produção da baseline, medido pelo Developer na rodada 3, **42** reprovam e **2** passam (`42 failed | 2 passed (44)`). Os 2 são da prova 5 e guardam comportamento que a baseline já cumpre; estão declarados em D-116. Na rodada 1, o Tech Lead rodou os sete arquivos de teste afetados (101/101) e conferiu que a contagem por arquivo era igual à do HEAD.
- **Controles negativos do §7**, rodados pelo Developer na rodada 3 sobre a árvore final, com a restauração conferida por `sha256`. Com o defeito: `3`, `2`, `1`, `5`, `5` e `11` reprovações dos 44; sem ele, `44 passed (44)`. O controle 6 derruba sete testes de tela do AG3 além dos quatro da prova 5, por `Maximum update depth exceeded`. O Tech Lead aceitou os controles pelo registro e não os reexecutou.
- **Gates.** Na rodada 5, sobre a árvore aceita, todos os gates do IA Loop deram exit 0: typecheck, lint, `goal097` 44/44, `validate:core`, `test:gate` **233**, `validate:ui` **169** com 0 retentativas, `validate:integration` com o gate autenticado em **265** `passed` e 0 retentativas, e `git diff --check`. A WU-11 das rodadas 2, 3 e 4 deu o mesmo 265 e 0 retentativas sobre o mesmo código; o Tech Lead conferiu os JSONs `097-r{2,3,4}-unit-wu-11.json`. A suíte do frontend, na rodada 3, deu **144** arquivos e **1693** testes.
- **Gate autenticado.** `routes.ts` ganhou só as duas entradas do §6 (`configuracoes-agenda-regras` e `configuracoes-agenda-lembretes`), e `targets.json` mudou só na entrada do AG3. O gate passa de 255 para 265 testes. `authenticated-matrix.spec.ts` não mudou.

## Aceito sem prova completa

1. **O M1 com a IA ativa e o WhatsApp conectado, a linha de Serviços com revisão em âmbar e a linha Importação depois de uma importação concluída** estão provados só em jsdom e por leitura do código. A conta visual não tem esses estados.
2. **A piora leve do M1** no mobile (7,6 para 8,5) e no tablet em retrato (3,1 para 3,8) foi aceita pela vista dos `side-by-side.png`: o banner da casca empurra a página, e o hub novo tem mais texto e ícone. A causa não foi medida em pixels.
3. **O bloco "Na prática"** está provado como função pura e na tela. Não foi provado que a IA, numa conversa real, ofereça horários como ele mostra.

## Observações registradas, sem mudar a decisão

1. **No AG3 mobile, a barra "Salvar" fixa cobre o fim do grupo "Cancelar ou remarcar pelo WhatsApp"** até a pessoa rolar. O quadro também tem a barra fixa no rodapé. D-116 declara o ponto e o põe no "Revisar se" item 4.
2. **`AvailabilitySettings` continua voltando para `/configuracoes`.** O Goal permitia trocar para `/configuracoes/agenda`, mas não exigia.
3. **O nome do negócio aparece truncado com reticências no M1** por causa da pílula larga "WhatsApp desconectado". É o estado da conta (divergência 3), e o truncamento é o comportamento que o Goal pede.
4. **O blocker da rodada 3 chegou truncado ao Developer**, e a rodada 4 corrigiu só a primeira parte. A partir da rodada 4, os blockers foram escritos em itens curtos e separados.
5. **O banner "Atendimento automático parado"** aparece em todas as capturas por causa do ambiente do `visual:compare` (sem orquestrador da IA nem WhatsApp).

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- Que a barra "Salvar" do AG3 deixe o último grupo alcançável num aparelho real.
- O AG2, "Bloqueios que se repetem", "Adicionar" no N1 e o conhecimento do negócio (104), que ficam fora do escopo.
- O M1 como destino do quinto item da barra: o item continua abrindo o diálogo "Mais" (D-101 (b)).
