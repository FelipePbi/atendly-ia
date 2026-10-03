# Review formal — Goal 095

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal095](../goals/095-servicos-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

Serviços passa a seguir os quadros Servicos:S1, S3, Servicos:S4 e Agenda:S1 do protótipo. A lista perde o botão "Desativar"/"Ativar", e ativar e desativar ficam na caixa "Serviço ativo" da edição. O novo serviço tem o preço segmentado em quatro opções e o CTA "Salvar serviço". As cinco opções do formulário são linhas fechadas que abrem uma a uma. "Cor na agenda" ganha a prévia "Assim na agenda". A paleta mostra os nomes e os hex do protótipo sobre os mesmos seis tokens persistidos. A composição de D-103, o contrato, o BFF, o Scheduling e a IA não mudaram. Decisão: [D-114](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita vigente: `a4cf1f6bc03055f60106bf583a8c433de11e56b6` (Goal103). Base imediata da implementação: `4d903403cb6aa2a9f03a7a9da2222853e4195650`, HEAD da worktree `.ai-worktrees/goal-095`, sem commit na worktree. Entre as duas há só documentação (fechamento do Goal103 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **17 arquivos**, hash do diff `709c391874a84ab6d26ef9c80a3ccce70e9bb92a64d955cbec8eed4e13ecb52c`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, todos em `apps/frontend/src/`: `features/services/ServiceList.tsx` (`sha256` `c249ac47…`), `features/services/ServiceForm.tsx` (`505ebab7…`) e `shared/styles/atendly-services.css` (`d9a55fc7…`). Os três hashes foram conferidos no fechamento e são os mesmos que VALIDATION_GATE cita para os controles do §7.
  - E2E e visual: `apps/frontend/e2e/authenticated-matrix.spec.ts`, só as três linhas que o §6 do Goal autoriza ("Criar serviço" para "Salvar serviço" no locator e nas mensagens; o título do teste não mudou). `apps/frontend/e2e/visual/targets.json`, só os `steps` de Agenda:S1 e Servicos:S4.
  - Teste novo: `apps/frontend/tests/goal095-servicos.test.tsx` (**46** testes, cinco provas).
  - Testes ajustados, só onde dependiam do texto ou da estrutura que o quadro troca, nenhum removido nem pulado: `goal015-services`, `goal015-shell-invariant`, `goal058-service-form`, `goal076-service-form`, `goal076-service-list`, `goal078-service-instruction-form`, `goal084-price-input` e `goal088-list-detail` (uma linha, `:238`, o texto do painel vazio).
  - Documentos: `docs/migration/DECISIONS.md` (D-114 e as notas "Revista em parte" em D-091 e D-103), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- Rota, contrato público, BFF, Scheduling, IA, migration, `serviceFormatting.ts`, `ProductServicesScreen.tsx`, `ListDetail.tsx`, a casca e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 7 blockers, todos de fidelidade visual.** O escopo, o §6, os `steps`, o corpo dos pedidos e os gates estavam certos. Blockers: (1) o título "Inativos" herdava a fonte serifada do `h2` global; (2) as linhas da lista ficavam 5 a 6 px mais altas que no quadro, pelo `line-height` herdado; (3) o painel vazio dizia "Selecione um serviço para editar", não "Selecione um serviço"; (4) o S3 usava duas colunas iguais com intervalo de 28 px e um recuo de 720 px, contra 1,2/1, intervalo de 40 px e largura total no quadro; (5) na edição, "Duração" e "Preço" ficavam empilhados, e não lado a lado com "Fixo · R$ 90,00"; (6) as cores de "Cor na agenda" ficavam agrupadas à esquerda, sem o `space-between` do quadro; (7) no S4, as linhas abertas de intervalo e instruções mostravam o valor, e a recorrência aberta mostrava o rótulo e o campo que o quadro não tem.
2. **Rodada 2 — `CHANGES_REQUIRED`, 2 blockers, de CSS.** Os sete blockers da rodada 1 foram fechados. Restavam: (1) o CTA fixo com `padding-bottom` de 46 px (o valor do mobile) em tablet e desktop, contra 28 px e 24 px no quadro; (2) a linha aberta da lista sem ir de borda a borda do painel, com a barra verde-azulada sobre o traço da cor do serviço.
3. **Rodada 3 — `CHANGES_REQUIRED`, 2 blockers, de evidência e documento.** Código e visual aceitos no mérito; a rodada 3 mudou só `atendly-services.css`. Restavam: (1) os cinco controles do §7 tinham rodado antes das edições das rodadas 2 e 3, com hashes que não batiam com a árvore e 42 testes em vez de 46; (2) CURRENT_STATE, VALIDATION_GATE e D-114 descreviam a árvore da rodada 1 (o "Fim" do `visual:compare`, as contagens de teste, a afirmação de que `goal088-list-detail` não mudou, as execuções e as correções da rodada 3 nos `side-by-side.png`).
4. **Rodada 4 — `ACCEPTED`, 0 blockers.** Só documentos e controles; o código é o da rodada 3.

O perfil do Developer declarado no Goal é `SONNET_HIGH`. As rodadas 2 e 3 recomendaram `SONNET_MEDIUM` para a correção, que era CSS localizado e, depois, só controles e documentos.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal095 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal095) e na "Prova" de D-114.

- **Identidade do código aceito.** Na rodada 4, os `sha256` dos três arquivos de produção batiam com os citados nos controles, e `git status` tinha as mesmas 17 linhas. O spec e2e diferia da baseline só pelas três linhas do §6, e `targets.json` só pelos `steps` das duas entradas autorizadas.
- **`visual:compare`.** O Tech Lead rodou o comando em todas as rodadas (exit 0). Na rodada 4, os números batiam com o "Fim" documentado: Servicos:S1 **8,5 / 4,5 / 4,2 / 3,2**, Servicos:S3 **6,8 / 3,5 / 13,4 / 4,8**, Servicos:S4 **9,5 / 5,9 / 13,7 / 5,0** e Agenda:S1 **12,2 / 6,2 / 15,3 / 6,4** (mobile / tablet em retrato / tablet em paisagem / desktop). O Tech Lead abriu os dezesseis `side-by-side.png` do §1 e, nas rodadas 1 e 2, mediu pixels em recortes de `app.png` e `prototype.png` contra o markup do protótipo.
- **Provas.** `goal095-servicos.test.tsx` passa **46**/**46**. Contra os três arquivos de produção da baseline, **39** reprovam e **7** passam, e os 7 estão declarados em D-114 (cinco da prova 1 que a baseline já cumpria e as duas da prova 5, que guardam comportamento).
- **Controles negativos do §7**, rodados de novo na rodada 4 sobre a árvore final, com a restauração conferida por `sha256`. Com o defeito, falhas e passes: **1/45**, **3/43**, **4/42**, **1/45** e **2/44**. Sem o defeito, **46**/**46** nos cinco.
- **Gates.** Na rodada 3, sobre a árvore final: typecheck, lint, `validate:core`, `test:gate` **233**, `validate:ui` **169** com 0 retentativas e `validate:integration` **36**/**36** passos com o gate autenticado em **255** `passed` e 0 retentativas. Na rodada 4, os gates do IA Loop deram exit 0 (typecheck, lint, `goal095` 46/46, `validate:core`, `test:gate`, `validate:ui`, `validate:integration` e `git diff --check`). A suíte do frontend da rodada 4 deu **142** arquivos e **1628** testes.
- **Contrato de dados.** A criação continua enviando `active: true`. Desativar continua pelo mesmo `PATCH /v1/services/:id` com `active`. O campo de uma linha fechada continua no formulário e é enviado (`hidden` não tira o campo do `FormData`). `ESSENTIALS_OPEN_ON_EDIT` e `input[name="duration"]` não mudaram, e o teste dos 45 minutos do gate continua passando.

## Aceito sem prova completa

1. **A linha pendente com "Corrigir" em âmbar** está provada só em jsdom (prova 1). A conta de teste não tem serviço pendente, e nenhuma captura a mostra.
2. **A piora de Agenda:S1 no mobile (9,7 para 12,2) e no tablet em paisagem (14,5 para 15,3)** fica sem causa medida. O início rodou sem os `steps` de `targets.json`, e o fim abre a linha "Cor na agenda". O Tech Lead aceitou a captura final pelo `side-by-side.png`, sem defeito visual não declarado.
3. **O mapa dos tokens para a paleta** (D-114 (g)) é escolha do Developer. Ele preserva o nome "Ardósia" de `SLATE` e a família de cada cor. Outro mapa muda a cor que o serviço cadastrado mostra, sem migrar dado.

## Observações registradas, sem mudar a decisão

1. **O "Limite declarado" de D-114 citava "duração e preço empilhados"** como divergência aberta, mas a rodada 2 corrigiu isso. A frase foi corrigida no fechamento, com nota.
2. **Linha verde-azulada de 2 px na largura toda**, em S1 e N1 no tablet em retrato. Aparece também em N1, que o Goal não tocou, então vem da casca e fica fora do escopo.
3. **Em Servicos:S4 no tablet em paisagem**, os `steps` de `targets.json` rolam o painel, e o cabeçalho com "X" e título sai da captura.
4. **A lista do quadro Agenda:S1** em tablet em paisagem e desktop é uma variante antiga, com "Revisar" e "Inativo" como selos. O app segue a lista do S1, por D-114 (b).
5. **Na rodada 2**, `apps/frontend/AGENTS.md` foi reescrito pelo `next dev` durante o `visual:compare` do Tech Lead e voltou ao original no fim. A árvore final está limpa.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- Os quadros S2, S5 a S9 e S1b, "Onde é feito", a cor livre e o cabeçalho "‹ Mais" da lista no mobile, que ficam fora do escopo.
