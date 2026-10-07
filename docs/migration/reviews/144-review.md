# Review formal — Goal 144

**Decisão vigente — rodada 1: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review **DEEP** conforme o [Goal144](../goals/144-o-perfil-de-quem-e-agendado-por-um-responsavel-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. Review do diff inteiro, sem blocker; nenhuma correção de registro ficou para o fechamento.

O perfil de quem é agendado por um responsável passa a mostrar quem agenda, como o quadro CL8. No Resumo, com `primaryGuardian` `CONFIRMED`, o perfil mostra entre a identidade e as ações o cartão "<responsável> agenda para <primeiro nome do cliente>", com o telefone do responsável, quem confirmou, a data no fuso do negócio e o link "Ver <primeiro nome>" para o perfil do responsável. Com cliente sem telefone e responsável com telefone, uma nota diz que as mensagens chegam pelo WhatsApp do responsável e que a IA pode perguntar "Seria para <cliente> novamente?". A linha sob o nome diz "Sem telefone próprio" no lugar de "Telefone não informado" quando há responsável confirmado. `targets.json` ganha o alvo **CL8**, com cinco respostas fixas de `GET` e sem passo. Só o frontend e a captura: o BFF, a IA, o Scheduling, o contrato público, `PUBLIC_API_V1.md`, a semente da captura e do gate e o banco não mudaram. Decisão: [D-158](../DECISIONS.md), aceita neste fechamento. O CL8, adiado na v166 e liberado por D-156 e D-157, deixa de estar sem alvo: 102 alvos, e 11 dos 113 quadros continuam sem alvo.

## Escopo e identidade do diff

- Baseline aceita vigente: `23f447efd3ef1e66908260bb8b14cc80b28f5b2b` (Goal143). Base imediata da implementação: `01de4f243621e84fb4928f163049adddd3dc6bab`, HEAD da worktree `.ai-worktrees/goal-144`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **11 arquivos** (7 rastreados e 4 novos não rastreados), hash do diff `e244ba8866137c1c133f6107ae172c6a170f4003111a2963769e5b20d434953c`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - frontend, código (4): `apps/frontend/src/features/customers/GuardianCard.tsx` (novo), `apps/frontend/src/features/customers/initials.ts` (novo; `initials` saiu de `CustomerProfile.tsx` sem cópia), `apps/frontend/src/features/customers/CustomerProfile.tsx` e `apps/frontend/src/shared/styles/avenly-customers.css`;
  - captura (2): `apps/frontend/e2e/visual/targets.json` (o alvo CL8) e `scripts/tests/visual-responses.test.mjs` (o CL8 entre os donos de `responses` de `Clientes.dc.html` e um teste novo);
  - testes novos (2): `apps/frontend/tests/goal144-perfil-responsavel.test.tsx` (43) e `apps/frontend/tests/goal144-alvos-captura.test.ts` (10);
  - `docs/migration/` (3, por acréscimo): D-158 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal144 em `VALIDATION_GATE.md`.
- `PrimaryGuardianPanel.tsx`, `CustomerSummary.tsx`, `CustomerMemory.tsx`, `features/settings/dayMonth.ts`, `data/services/`, `shared/ui/`, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, `packages/` (o contrato público), `PUBLIC_API_V1.md`, o BFF, a IA, o Scheduling, o `prisma`, `tools/ia-loop/` e o documento do Goal144 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `ACCEPTED`, 0 blockers.** WU-01 (o cartão, a nota, a linha sob o nome, o CSS e os testes `goal144` do perfil), WU-02 (o alvo CL8, o teste de captura e `visual-responses.test.mjs`), WU-03 (a fidelidade visual, as medidas e as correções de CSS), WU-04 (os controles negativos (a) a (g)) e WU-13 (registros) terminaram `COMPLETED` na primeira tentativa. Os gates WU-05 a WU-12 e WU-14 rodaram todos com `attemptId` `a1` sobre uma só árvore, `code-v1:8a36aa6f9b9971077b714be5785d1fa4696c00c7b4ef9e0bf2c73cc50d9f5ee2`; nenhum precisou ser refeito. Uma primeira passada do Tech Lead, só sobre o diff, deixou como `UNCLEAR` a fidelidade visual (critério 4) e as saídas dos gates (critério 7), porque não se conferem pelo diff; a decisão as resolveu com a captura rodada pelo Tech Lead e com os resultados das WU.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. `DECISIONS.md`, D-158: o status passou a ACCEPTED, sem correção no texto da proposta; a nota de fechamento, com a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
2. `CURRENT_STATE.md`, delta do Goal144: o status no título e o parágrafo "Aceite".
3. `VALIDATION_GATE.md`, seção do Goal144: o registro do aceite na abertura e a subseção "Aceite", com a conferência do Tech Lead e o resultado da WU-14.
4. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal144), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal144) e em D-158.

- **Gates do IA Loop, rodada 1** (`attemptId` `a1` em todos, mesma árvore): typecheck do frontend com saída 0 (WU-05); lint do frontend com saída 0 (WU-06); `goal144` 2 arquivos e 53 passando (WU-07); frontend 206 arquivos e 3017 testes passando (WU-08; a partida, medida na baseline antes de editar, é 204 e 2964: +2 arquivos e +53 testes); `test:gate` 298 (WU-09; era 297, +1 pelo teste do CL8); `validate:core` com saída 0, 15 de 17 passos e 2 pulados (WU-10); `validate:ui` 169 passed, 21 pulados e 0 retentativas (WU-11), igual ao Goal140; `validate:integration` com saída 0, 36 de 36 passos e o gate autenticado com 310 passed e 0 retentativas (WU-12); `git diff --check` com saída 0 depois dos registros, 104 ms (WU-14). A IA e o Scheduling não mudaram, então as contagens de unidade deles não foram refeitas.
- **Do Developer:** a partida do frontend medida na baseline antes de editar; três capturas de baseline de CL5, CL6, CL7, CL1 e CL3 para medir o ruído (14 de 20 imagens idênticas nas três; ruído só no tablet em paisagem e no desktop, até 34 px e delta de canal 8); o CL8 conferido e medido nos quatro devices, com no máximo 1 px de diferença entre blocos fora a barra do iPhone; CL5, CL6, CL7, CL1 e CL3 depois das edições com 16 de 20 imagens idênticas por byte e 4 dentro do ruído (WU-03).
- **Controles negativos do Developer (WU-04):** sete controles, (a) a (g), sobre `CustomerProfile.tsx`, `GuardianCard.tsx` e `targets.json`; cada um reprovou os testes esperados, com comando, testes e mensagem registrados em VALIDATION_GATE, e foi revertido com `cmp` e `md5` iguais ao backup.
- **Conferência do Tech Lead:**
  - **O cartão:** `GuardianCard.tsx` não faz leitura própria. O cartão só aparece com `status === "CONFIRMED"` e só no Resumo, dentro de `directory-detail-hero`, entre a identidade e as ações.
  - **As duas linhas:** a primeira tem os substitutos pedidos (telefone, "Responsável sem nome", "este cliente"). A segunda usa `formatBrazilianPhone(phone, "plus")` ou o valor cru, os quatro textos de `confirmedBy` e `dayMonthLabel` no fuso do calendário, com `America/Sao_Paulo` sem calendário.
  - **O link:** aponta para `/clientes/detalhes?id=<encodeURIComponent(guardian.id)>`, com nome acessível "Ver perfil de <nome>" e `min-height` de 24 px.
  - **A nota:** sai só com cliente sem telefone e responsável com telefone, com o texto da escolha 4, a pergunta em `<em>` e sem `role`.
  - **A linha sob o nome:** "Sem telefone próprio" só com cliente sem telefone e responsável confirmado; `compactSubtitle` não mudou.
  - **Estado e estilo:** `initials` foi movida para `initials.ts`, sem cópia. Confirmar e remover pelo painel atualizam o cartão por `applyGuardian`, sem nova leitura. O CSS fica em `.customer-guardian*` e `.is-dependent`, com movimento só em `prefers-reduced-motion: no-preference`.
  - **Testes:** os 43 testes `goal144-perfil-responsavel` e os 10 `goal144-alvos-captura` cobrem o §3.1 e a escolha 10. `visual-responses.test.mjs` prova que o CL8 só declara `GET` e não tem passo; a lista de donos só ganhou o CL8, sem asserção afrouxada.
  - **Visual:** o Tech Lead rodou `npm run visual:compare -- --target CL8,CL5,CL6,CL7` e abriu os `side-by-side` do CL8 nos quatro devices. Identidade, linha sob o nome, cartão (avatar "MS", título, detalhe, "Ver Maria"), nota com o ponto, "Agendar" e abas ficam sobrepostos ao quadro no tablet e no desktop. No celular, os mesmos blocos ficam deslocados 14 px pela barra do iPhone. As diferenças restantes são todas declaradas nas `notes` e em D-158 (8.1 a 8.9).
  - **"Conversa com Maria":** a evidência 1 do Goal descrevia o quadro errado. A escolha 6 proíbe mudar as ações, então implementar o botão seria fora do escopo; a divergência 8.4 está correta.
  - **Regressão:** os `app.png` do Tech Lead contra as baselines do Developer. CL6 e CL7 no celular e no tablet em retrato são idênticos por byte. As diferenças restantes estão na coluna da lista e no bloco "Próximo" do CL5: a conta visual tinha um agendamento às 14:00 do dia que já tinha passado, então é estado de horário, não CSS. Por construção, nenhuma regra nova vale para CL5 a CL7: `.is-dependent` e o cartão só existem com responsável `CONFIRMED`, e o cliente semeado não tem responsável.
  - **Reexecução no fechamento:** `npx vitest run goal144` em `apps/frontend`, 2 arquivos e 53 de 53; `node --test scripts/tests/visual-responses.test.mjs`, 65 de 65.
  - **Escopo e registros:** só os arquivos listados acima. D-158 com número livre e em PROPOSED; os três registros por acréscimo. As contagens (3017, 298, 169 e 310) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU.

## Aceito sem prova completa

1. **Os controles negativos** são os do Developer (WU-04); o Tech Lead não os refez, e as mensagens registradas vêm do relatório da WU-04.
2. **As medidas do CL8** foram tiradas pelo Developer com uma cópia do `visual-compare` em `%TEMP%`, fora do repositório. O Tech Lead conferiu os `side-by-side`, não refez as medidas.
3. **CL1 e CL3** não foram recapturados pelo Tech Lead; vale a tabela por imagem da WU-03.
4. **Um responsável confirmado de ponta a ponta numa conta real:** o CL8 usa respostas fixas de `GET` na captura, e os testes do perfil usam o painel falso.
5. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **"Conversa com <responsável>"** no perfil do dependente: o quadro tem, o app não. Precisa de Goal e decisão próprios.
2. **O "Agendar" com 46 px e fundo transparente** vale só para dependentes (`.is-dependent`). CL5, CL6 e CL7 seguem com 44 px e fundo `var(--surface)`. Alinhar todos ao quadro num Goal próprio.
3. **O nome acessível "Ver perfil de Maria Souza"** não contém o texto visível "Ver Maria" (WCAG 2.5.3, rótulo no nome). O nome foi mandado pelo Goal; rever.
4. **A borda do cartão** tem 1,31:1, abaixo de 3:1 de não texto. É o `--border` de todos os cartões e do quadro; não muda só aqui.
5. **Fora deste Goal, com Goal e decisão próprios:** o tipo de relação ("mãe", pergunta 141); o gênero na nota; serviço, duração, preço e quem marcou no "Próximo"; a IA propor responsável (D-022 (5)); lembrete para o responsável (pergunta 135); "agenda para <dependente>" na lista e na busca; as pendências não bloqueantes dos reviews [138](138-review.md) a [143](143-review.md); os 11 quadros ainda sem alvo (S1b, S5, S6, S8, S9, CL9, N2, N3, H6, NT3 e 4.3).
