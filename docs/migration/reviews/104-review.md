# Review formal — Goal 104

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal104](../goals/104-ia-conversas-e-conta-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

IA, Conversas e Conta passam a seguir os quadros IA1, R1 e Mais-WhatsApp:C1. `/configuracoes/ia` tem o título "IA", o cartão de estado, "Jeito de falar", o aviso de agendamento, o contrato em duas colunas e duas linhas de link: "O que ela sabe responder" leva a `/configuracoes/negocio/perguntas-frequentes` e "Quem ela nunca responde" leva a `/configuracoes/whatsapp`. `KnowledgeSection` e `OtherInfoSection` saíram da IA e moram na rota nova `/configuracoes/negocio/perguntas-frequentes` (tela empurrada, cenário `business-faq`), aberta pelas duas linhas do N1, que viraram links com o resumo lido e sem segunda linha quando a leitura falha ou carrega. `/configuracoes/conversas` tem os dois prazos de retenção com um só "Salvar", um só `PATCH` e a confirmação de redução. `/configuracoes/conta` é uma lista em três grupos ("Seus dados", "Segurança" e "Sobre"); "Sair" chama só `logoutAllDevices`, e "Sair da conta" deixou de existir. A casca, o contrato, o BFF e a IA não mudaram. Decisão: [D-117](../DECISIONS.md), aceita neste fechamento; ela revê só o item 3 de "Revisar se" de D-116 e a parte do conhecimento da divergência 6.

## Escopo e identidade do diff

- Baseline aceita vigente: `a4bd80508e59786f14f7a8ff5aa582d3a07e4869` (Goal097). Base imediata da implementação: `ecb6435893c86f5b2ca74b50d1314c0a374c6cc6`, HEAD da worktree `.ai-worktrees/goal-104`, sem commit na worktree. Entre as duas há só documentação (fechamento do Goal097 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **30 arquivos**, hash do diff `7e4870e91c20222bc02e824bc8c58fac11befd08a4b0d5824d9ca0f627828080`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, todos em `apps/frontend/src/`: `features/settings/AiSettings.tsx` (`sha256` `e53f90c5…`), `BusinessSettings.tsx` (`ca2b66ba…`), `RetentionSection.tsx` (`1480985c…`), `AccountSettings.tsx` (`9e978f44…`), `ProductSettingsScreen.tsx` (`55aaba75…`), `ConversationsSettings.tsx`, `types.ts` (cenário `business-faq`) e `shared/styles/avenly-settings.css` (`a07b21c9…`); `features/knowledge/OtherInfoSection.tsx` (só o `id="outras-informacoes"`); os novos `features/settings/BusinessKnowledgeSettings.tsx` (`65b8e891…`) e `app/(platform)/configuracoes/negocio/perguntas-frequentes/page.tsx` (`6c3e855f…`). Os hashes são os conferidos pelo Tech Lead na rodada 2, iguais aos que VALIDATION_GATE cita.
  - E2E: `apps/frontend/e2e/routes.ts` (`5f68d49e…`), só as três mudanças do §6.
  - Teste novo: `apps/frontend/tests/goal104-ia-conversas-e-conta.test.tsx` (**65** testes, cinco provas, `sha256` `295f8cfa…`).
  - Testes ajustados, só onde dependiam do texto, do rótulo ou da estrutura que o quadro troca, nenhum removido nem pulado: `goal018-a11y`, `goal018-business-block`, `goal023-conversations-settings`, `goal023-retention-settings`, `goal024-account-sessions`, `goal024-settings-shell-invariant` (10 para 11 testes), `goal025-account-deletion-screen`, `goal063-ai-settings`, `goal064-greeting-and-account`, `goal067-configuracoes-ia-conta`, `goal081-activation-test-refusals`, `goal088-list-detail`, `goal097-configuracoes` e `goal099-onboarding-ia-whatsapp`.
  - Documentos: `docs/migration/DECISIONS.md` (D-117 e a nota "Revista em parte" em D-116), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `e2e/authenticated-matrix.spec.ts`, `e2e/visual/targets.json` (`26c0b2e2…`), a casca (`src/shared/layout/`), `apps/frontend/AGENTS.md`, o contrato público, o BFF e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers, só de documento.** Código e visual foram aceitos no mérito. (1) D-117 (a) e o delta de CURRENT_STATE diziam que a IA1 tinha "duas linhas de link para o conhecimento"; no código, "Quem ela nunca responde" leva a `/configuracoes/whatsapp`. (2) A última frase de D-117 (b) dizia que a IA1 apontava para `#outras-informacoes`; só a linha "Outras informações" do N1 usa a âncora. (3) O §4 e o critério de aceite 3 do Goal pedem as asserções que a baseline já cumpre declaradas uma a uma; os documentos davam só a contagem dos 16 testes que passam na baseline. (4) CURRENT_STATE dizia "quatorze testes" onde são quatorze arquivos de teste.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** Só documentos. Os quatro itens foram resolvidos. O Developer refez o vermelho da baseline sobre a árvore atual, com a restauração conferida por sha256 (`49 failed | 16 passed (65)`, os mesmos 16), e nomeou os 16 no VALIDATION_GATE, por prova e com o motivo.

O código de produção e o teste não mudaram desde a rodada 1. O perfil do Developer declarado no Goal é `SONNET_HIGH`. A rodada 1 recomendou `SONNET_MEDIUM` para a correção; a unidade FIX-001 rodou em Sonnet com esforço alto.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal104 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal104) e na "Prova" de D-117.

- **Identidade do código aceito.** Na rodada 2, os `sha256` de produção, do teste e de `routes.ts` batem com os documentados, e o código não mudou desde a rodada 1. `git status` tem 30 linhas, só de arquivos autorizados, sem resto de controle negativo e sem `e2e-results/` rastreado. `routes.ts` difere da base só pelas três mudanças do §6.
- **`visual:compare`.** O Tech Lead rodou `npm run visual:compare -- --target IA1,R1,Mais-WhatsApp:C1` nas rodadas 1 e 2 (exit 0). Na rodada 2, com o BFF local fora do ar, subiu BFF, Scheduling e ai-orchestrator de dev, e os parou depois. Os números das duas rodadas são os do "Fim" do Developer: IA1 **12,7 / 6,0 / 7,8 / 6,6**, R1 **17,2 / 9,4 / 10,2 / 9,1** e C1 **5,1 / 2,4 / 4,9 / 4,2** (mobile / tablet em retrato / tablet em paisagem / desktop). O início, na baseline, foi IA1 13,6 / 6,3 / 7,2 / 6,0, R1 13,5 / 8,1 / 9,5 / 8,3 e C1 10,6 / 4,4 / 5,7 / 4,9. M1, N1, AG1, AG3, H3, CL1, Servicos:S1 e C5 ficaram com os números do início. Em cada rodada, o Tech Lead abriu os doze `side-by-side.png`. IA1, R1 e C1 batem com os quadros em estrutura, ordem, componentes, cores, tipografia e espaçamento nos quatro devices. O que difere é o declarado em D-117, vem do ambiente ou é comportamento que o Goal manda ter:
  - o banner da casca "Atendimento automático parado" e o item "Notificações" da sidebar (divergência 7);
  - a IA desligada com "Conectar WhatsApp" e os dados da conta visual (divergência 2);
  - as segundas linhas que o contrato não traz, sem "2 contatos" nem versão no rodapé (divergência 3);
  - o texto do aviso sem gênero (divergência 4) e a nota de U-01 no R1 (divergência 5);
  - o "Salvar" do R1 desabilitado sem mudança, como pede (c), e o e-mail da Conta sem chevron, como pede (d).
- **Código.** `AiSettings`: o tom grava ao escolher, num só `PATCH` com o `enabled` lido, e a falha volta ao tom gravado; `AppointmentNoticeRow` mostra esqueleto ao carregar e some na falha; o `aria-busy` foi mantido; as seções de conhecimento saíram. A rota nova tem o cenário `business-faq` em `isHubScenario`, e `openHrefFor` marca Negócio. No N1, `useKnowledgeSummary` deixa a linha sem segunda linha quando a leitura falha ou carrega, e uma leitura falhando não esconde a outra. `RetentionSection`: um só `PATCH` com os dois prazos, confirmação antes de reduzir com `confirmReduction: true`, e a falha mantém o rascunho. `AccountSettings`: as folhas usam os pedidos e as mensagens de hoje; "Sair" chama só `logoutAllDevices` depois da confirmação; os quatro estados da exclusão foram preservados. O CSS só ganhou regras novas. Há uma chamada de `useShellConfig` por árvore, em `ProductSettingsScreen`.
- **Provas.** `goal104-ia-conversas-e-conta.test.tsx` passa **65**/**65** nos gates das duas rodadas. Na rodada 1, o Tech Lead rodou de novo seis arquivos de teste, entre eles o `goal104`: 151/151. Contra os arquivos de produção da baseline, medido pelo Developer nas rodadas 1 e 2, **49** reprovam e **16** passam; os 16 estão nomeados no VALIDATION_GATE e guardam comportamento que a baseline já cumpre (2 na prova 1, 2 na 2, 1 na 3, 2 na 4 e 9 na 5, estes de composição da casca).
- **Controles negativos do §7**, rodados pelo Developer na WU-11 da rodada 1, sobre a árvore final, com a restauração conferida por `sha256`. Com o defeito: `1`, `1`, `2`, `4`, `2` e `5` reprovações dos 65; sem ele, `65 passed (65)`. O Tech Lead aceitou os controles pelo registro e não os reexecutou.
- **Gates.** Na rodada 2, sobre a árvore aceita, todos os gates do IA Loop deram exit 0: typecheck, lint, `goal104` 65/65, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` com o gate autenticado em **275** `passed` e 0 retentativas, e `git diff --check`. Na rodada 1, a WU-10 deu os mesmos 275 e 0 retentativas, e a WU-11 deu a suíte do frontend com **145** arquivos e **1759** testes.
- **Gate autenticado.** `routes.ts` mudou só nas três linhas do §6: o marcador de `/configuracoes/ia` passa a "IA" e entram `configuracoes-negocio-perguntas-frequentes` e `configuracoes-conversas`. O gate passa de 265 para 275 testes. `authenticated-matrix.spec.ts` e `targets.json` não mudaram.

## Aceito sem prova completa

1. **A IA1 com "IA ativa" e "Pausar"** está provada só em jsdom e por leitura do código. A conta visual não tem a IA ativa nem o WhatsApp conectado.
2. **A piora do R1 nos quatro devices** (13,5 / 8,1 / 9,5 / 8,3 para 17,2 / 9,4 / 10,2 / 9,1) **e a da IA1 no tablet em paisagem e no desktop** (7,2 para 7,8 e 6,0 para 6,6) foram aceitas pela vista dos `side-by-side.png`: vêm da nota de U-01, do banner da casca e do "Salvar" desabilitado em tom mais claro, não de diferença de layout. A causa não foi medida em pixels.
3. **A barra "Salvar" do R1 no mobile** cobre o conteúdo de baixo até a pessoa rolar. Ela é `position: sticky`, e o conteúdo segue alcançável pela rolagem; num aparelho real isso não foi conferido. D-117 põe o ponto no "Revisar se" item 4.

## Observações registradas, sem mudar a decisão

1. **No parágrafo "Prova" de D-117**, a sequência "16 na prova 1, 8 na 2…" é de reprovações e podia ser lida como a dos 16 que passam. O fechamento precisou a frase ("reprovam 16 na prova 1…"); o VALIDATION_GATE já era claro.
2. **No N1, as duas linhas do conhecimento mostram "Não informado"** porque a conta visual não tem perguntas frequentes nem outras informações; o quadro mostra "4 perguntas" e "Produtos veganos…". É o dado da conta.
3. **No C1, no tablet em paisagem e no desktop, "Excluir conta" fica abaixo da dobra**, atrás do banner da casca. É o estado do ambiente.
4. **Os blockers 1 e 3 da rodada 1 chegaram truncados ao Developer.** A unidade FIX-001 resolveu pelos trechos legíveis e pelo código, e o resultado conferiu na rodada 2.
5. **O banner "Atendimento automático parado"** aparece em todas as capturas por causa do ambiente do `visual:compare` (sem orquestrador da IA nem WhatsApp).

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- Que a barra "Salvar" do R1 deixe o conteúdo alcançável num aparelho real.
- A IA1 e o R1 com diff zero: o critério "igual ao quadro" foi julgado pela vista.
- A N3, o "Adicionar" do N1, o WhatsApp (W1, Goal 106) e as segundas linhas da Conta que dependem de dado que o contrato não traz, que ficam fora do escopo.
