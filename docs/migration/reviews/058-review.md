# Review formal — Goal 058

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-27, conforme o [Goal058](../goals/058-a-area-logada-volta-a-ter-casca.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–057) foi reaberto, reavaliado ou revertido. **Duas rodadas**: a rodada 1 terminou `CHANGES_REQUIRED` com 5 blockers; a rodada 2, com zero.

O Goal corrige cinco achados da [revisão local de ponta a ponta](../QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT: **QA CV-01** e **QA CV-02** (Conversas, Clientes e Serviços sem casca, com a `aside.sidebar` na largura inteira e interceptando o clique), **QA SV-01** (duração com `min={1}` e `step={5}`), **QA SV-02** (preço novo em "R$ 0,00" e digitação dependente do cursor) e **QA NT-04** (Central de notificações sem respiro). Também faz o gate autenticado do Goal033 reprovar casca quebrada. **QA CV-03** saiu deste Goal e é o 058B.

## Escopo e identidade do diff

- Baseline aceita vigente: `b4c3f127fd5437848b28aec3ba59be8d3f3d401c` (fechamento do Goal057). Base imediata da implementação: `220a5bdbc5a9763d95f9892e57208eb4ac322ff1`, HEAD da worktree `.ai-worktrees/goal-058`, inalterado nas duas rodadas. O commit `220a5bd` é só documental (fechamento do 057 e preparação deste Goal).
- Snapshot aceito, calculado pelo IA Loop: **18 arquivos**, hash do diff `d6819290a52fe5471f50234c1738d5f9674c2186eff2bd64a8de53a75f5686d5`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Dezesseis arquivos rastreados**, por `git diff --numstat 220a5bd`: `apps/frontend/AGENTS.md` (+46/−2), `e2e/authenticated-matrix.spec.ts` (+330/−5), `e2e/measure.ts` (+165/−1), `features/services/ServiceForm.tsx` (+4/−4), `shared/layout/AppShell.tsx` (+1/−0), `shared/layout/navigation.ts` (+11/−0), `avenly-agenda.css` (+0/−53), `avenly-settings.css` (+18/−42), `avenly.css` (+69/−56), `shared/ui/CurrencyInput.tsx` (+51/−19), `scripts/goal033-authenticated-ui-rehearsal.mjs` (+22/−0), `scripts/tests/goal033-authenticated-ui-rehearsal.test.mjs` (+18/−0) e os quatro documentos de `docs/migration/` por acréscimo puro (`FINAL_AUDIT.md` +94, `CURRENT_STATE.md` +80, `DECISIONS.md` +30, `VALIDATION_GATE.md` +19). **Dois arquivos novos** em `apps/frontend/tests/`: `goal058-service-form.test.tsx` (**323** linhas, 13 testes) e `goal058-shell-base.test.tsx` (**81** linhas).
- Nenhum arquivo de `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, migration ou `tools/ia-loop/` foi tocado. `QA_LOCAL_REVIEW.md` e `scripts/tests/validate-integration.test.mjs` não foram editados. `KNOWN_SMALL_TARGETS`, `KNOWN_CONTRAST_FAILURES` e `AUTHENTICATED_ROUTES` ficaram intactos.

## Rodada 1 — CHANGES_REQUIRED (5 blockers)

O código dos §1 a §5 estava no lugar: grade em `.app-frame`, `SHELL_MODULES` alimentando o teste jsdom, duração com `step={1}`, preço novo vazio, medida de composição, clique real e semente própria para o caso de 45 minutos. O `validate:integration` nativo (WU-13) já passava com 35/35 passos e o gate autenticado com 60 testes. Os cinco blockers:

1. **Regressão de especificidade na casca `settings` abaixo de 768px.** `.app-frame > nav` (0,1,1) vencia `.settings-bottom-nav` (0,1,0): em 390px a barra inferior de `/configuracoes` e `/notificacoes` foi de x=0..390 para x=-195..195. O cabeçalho móvel de `settings` também perdeu `z-index` 40 e o respiro próprio. Nenhuma medida do gate via elemento deslocado para x negativo.
2. **`CurrencyInput` dependia de `keydown`.** Só aceitava `event.key` de 0 a 9, com `onChange` vazio. Teclado virtual e IME (`key: "Unidentified"`), ditado, preenchimento automático e texto arrastado não conseguiam preencher o preço.
3. **§5.1 sem evidência.** Faltava a saída do gate na baseline e a causa medida de o overflow do Goal033 não ter reprovado em 390.
4. **§6 não executado.** Os quatro controles negativos não rodaram; WU-04 ficou `BLOCKED`.
5. **§7 ausente.** Nenhum documento foi tocado.

## Rodada 2 — ACCEPTED (0 blockers)

- **B1:** cabeçalho móvel e barra inferior da base passam a `:where()`, com especificidade zero; a regra do módulo vence em qualquer ordem de arquivo. `measureComposition` ganhou a checagem de cabeçalho e barra inteiros dentro da viewport, e um quinto controle negativo reprova a regressão da rodada 1 (4 de 60, `nav.settings-bottom-nav` em x=-195..195). `.conversation-detail-shell` neutraliza o respiro inferior da base na thread; o `header:first-child` da base só atinge o cabeçalho móvel.
- **B2:** `CurrencyInput` deriva a edição no `onChange`, pelo prefixo e sufixo comuns com o texto formatado anterior. Três testes só com `fireEvent.input` reprovam com o componente da baseline e com o da rodada 1.
- **B3:** saída da baseline colada em [FINAL_AUDIT §35](../FINAL_AUDIT.md): 35 reprovados e 25 passando, composição reprovando `/conversas`, `/clientes` e `/servicos` nas cinco larguras. Causa medida do 390: `scrollWidth` igual a `clientWidth` (390), sidebar em bloco empilhado sobre o `main`, e o único elemento além da borda recortado por ancestral.
- **B4:** os quatro controles e o quinto têm saída real em §35. `git status` mostra só os arquivos declarados, sem `e2e-results/`.
- **B5:** `apps/frontend/AGENTS.md` corrigido, D-074 `PROPOSED` com limites e relação com D-030/D-031/D-049, FINAL_AUDIT §35 só por acréscimo, CURRENT_STATE e VALIDATION_GATE com contagens atribuídas à execução.

Os nove gates nativos da rodada 2 passaram. Prova conferida: `validate:integration` exit 0, com `rehearse:goal033-authenticated-ui` em **60** testes e **0** retentativas; `test:frontend` com **74** arquivos e **686** testes; `test:gate-scripts` **227**/**227** (baseline **226**); `validate:ui` **169** passando e **21** pulados; typecheck e lint de `apps/frontend` exit 0.

### Observações não bloqueantes

1. **Texto de "Criar serviço".** `apps/frontend/AGENTS.md`, D-074 item 3 e a tabela de VALIDATION_GATE diziam que "Criar serviço" abre o formulário. O teste abre o formulário por "Novo serviço" e clica "Criar serviço", o botão de envio, provado pelo alerta "Informe o valor". D-074 e VALIDATION_GATE foram corrigidos no fechamento; `apps/frontend/AGENTS.md:191` fica com a frase imprecisa, porque está fora do escopo de escrita do fechamento. Corrigir no próximo Goal que tocar `apps/frontend/AGENTS.md`.
2. **`SHELL_MODULES` não é conferida contra a união `ShellModule`.** É um `readonly ShellModule[]` escrito à mão. O risco é baixo: a casca de todo módulo vem de `AppShell` aplicar `app-frame` sem condição, não da lista.
3. **Ctrl/Meta com dígito** era interceptado pelo `keydown` da rodada 1; a rodada 2 tirou o `keydown`, e a observação deixa de valer.
4. **Lint de `apps/frontend/e2e/`** tem 2 erros anteriores a este Goal, fora do que o script `lint` cobre. Não foram introduzidos nem corrigidos aqui.
5. **As observações abertas herdadas continuam abertas**: as do [review057](057-review.md) e as que ele herdou.

### O que este aceite não cobre

Não prova fidelidade visual da casca, de Conversas, Clientes, Serviços e Notificações ao protótipo aprovado: conferência humana, e o redesenho é do Goal069. A composição mede o `contentMarker` de cada rota, não o resto da tela. Overflow recortado por ancestral continua sem reprovar (a prévia de mensagem de `/conversas` em 390, até x=409, recortada na baseline e na execução final). O gate autenticado roda em `validate:integration`, não em `validate:ui`. **QA CV-03** não faz parte deste Goal (058B). Nenhum achado A-01…A-24 foi corrigido ou reclassificado; a auditoria segue **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §35](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-074 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review e a contagem de rodadas, e ganha nota de fechamento com as observações 1 e 2.
- **D-074 item 3** e a linha de alcance por clique de **VALIDATION_GATE** (seção do Goal058) passam a dizer que "Novo serviço" abre o formulário e "Criar serviço" recebe o clique. Nenhum outro texto de D-074 foi reescrito.
- **`FINAL_AUDIT §35`** passa a citar D-074 como `ACCEPTED` neste review, em vez de `PROPOSED`.
- **O status do documento do Goal058 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
