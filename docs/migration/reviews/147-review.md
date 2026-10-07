# Review formal — Goal 147

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-07, em review DEEP conforme o [Goal147](../goals/147-a-conversa-do-responsavel-e-as-acoes-do-perfil-iguais-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido. A rodada 1 é histórica: terminou em CHANGES_REQUIRED com 2 blockers de fidelidade visual, fechados na rodada 2.

O perfil de um cliente sem telefone próprio, com responsável confirmado (`dependent`), passa a oferecer **"Conversa com <primeiro nome do responsável>"**, lida pelo id do responsável (`conversations.list({ customerId: <responsável>, limit: 1 })`), e nunca pede nem mostra a conversa pelo id do dependente. Nos outros perfis, o dono da conversa é o próprio cliente, e o rótulo continua "Conversa". O pedido sai depois de o perfil carregar. Confirmar ou remover o responsável troca o dono, aborta o pedido anterior e barra um resultado atrasado. "Ver <responsável>" ganha o nome acessível "Ver <nome completo>", que contém o texto visível. As ações de todos os perfis seguem os quadros CL5 a CL8: 46 px, raio de 12 px, borda `--border-strong`, fundo transparente, hover e active do quadro, reticências em rótulo longo e os ícones `nav-chat` e `nav-calendar` do sprite. O cabeçalho compacto de CL6 e CL7 foi alinhado ao quadro. O alvo CL8 responde uma conversa da Maria, só por `GET` e sem passo. O BFF, a IA, o Scheduling, o contrato público, `PUBLIC_API_V1.md`, a semente da captura e do gate e o banco não mudaram. Decisão: [D-161](../DECISIONS.md), aceita neste fechamento. Ela resolve as observações 1 a 3 do [review144](144-review.md) e cumpre a consequência declarada em D-160, sem editar D-158 nem D-160.

## Escopo e identidade do diff

- Baseline aceita vigente: `e0142aa4a5ea67a7a414fa5b7e2d286fba578619` (Goal146). Base imediata da implementação: `30dc62929061b0ecf87c7139eb71751fda4b469c`, HEAD da worktree `.ai-worktrees/goal-147`, sem commit na worktree. Entre a baseline e `30dc629` só há `docs/`, sem código.
- Snapshot aceito, calculado pelo IA Loop: **11 arquivos** (9 rastreados e 2 novos não rastreados), hash do diff `d89ab6426afc3a31057d5363117096c76f0e01f3ff013158b68fa2a2ad3dc784`. Mudança posterior nesses arquivos exige avaliar o novo diff. Os registros deste fechamento ficam só em `docs/migration/`.
- Arquivos:
  - frontend (3): `apps/frontend/src/features/customers/CustomerProfile.tsx` (o dono da conversa, o pedido, o rótulo e os ícones `nav-chat` e `nav-calendar`), `GuardianCard.tsx` (o `aria-label`; `firstName` exportada) e `src/shared/styles/avenly-customers.css` (as ações de todos os perfis e o cabeçalho compacto);
  - captura (1): `apps/frontend/e2e/visual/targets.json` (o CL8 e as `notes` do CL5);
  - testes novos (2): `apps/frontend/tests/goal147-conversa-do-responsavel.test.tsx` (24) e `goal147-alvo-captura.test.ts` (5);
  - testes ajustados (2): `apps/frontend/tests/goal144-perfil-responsavel.test.tsx` e `goal144-alvos-captura.test.ts`;
  - `docs/migration/` (3, por acréscimo): D-161 em `DECISIONS.md`, o delta em `CURRENT_STATE.md` e a seção do Goal147 em `VALIDATION_GATE.md`.
- `PrimaryGuardianPanel.tsx`, `CustomerSummary.tsx`, `CustomerMemory.tsx`, `data/services/`, `shared/ui/`, `avenly.css`, `scripts/tests/visual-responses.test.mjs`, `e2e/routes.ts`, `e2e/authenticated-matrix.spec.ts`, `apps/bff`, `apps/ai-orchestrator`, `apps/scheduling-service`, `packages/` (o contrato público), `PUBLIC_API_V1.md`, `tools/ia-loop/` e o documento do Goal147 não foram tocados.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 2 blockers.** WU-01 a WU-05 (código, captura, fidelidade visual e os controles negativos (a) a (g)) e WU-15 (registros) terminaram `COMPLETED`; os gates WU-06 a WU-14 passaram na árvore `code-v1:41adab3f16527fd69cf80adf2d094a620baa58646bffb05ac31cb90783df15a1` (WU-10, `test:ia-loop`, pulada), e o gate autenticado deu 309 passed e 1 flaky (`mobile-390 › servicos > measured, logged in`). O Tech Lead refez `visual:compare --target CL8,CL5,CL6,CL7` e abriu os 16 `side-by-side.png`. A lógica, o CSS e o alvo estavam corretos, mas os glifos não: (1) "Conversa com Maria" usava `<Icon name="chat" />` (`CustomerProfile.tsx:311`), e o quadro usa o balão simples, que é exatamente `i-nav-chat` do sprite; (2) "Agendar" usava `<Icon name="calendar" />` (`:320`), com a grade de dias, e o quadro usa o calendário sem marcações, que é exatamente `i-nav-calendar`. A divergência aparecia no CL8 (as duas ações) e no CL5 ("Agendar") e não estava declarada.
2. **Rodada 2 — `ACCEPTED`, com 1 blocker só de documentação adiado para o fechamento.** Rodada de correção (`CODE_OR_EVIDENCE`). A FIX-001 trocou os dois ícones para `nav-chat` e `nav-calendar`, como `SettingsHub.tsx` já faz, e atualizou os registros. Os gates WU-06 a WU-14 e WU-16 rodaram de novo na árvore final, todos com `attemptId` `a1` e o mesmo `codeFingerprint`, `code-v1:c4c51f65fed1f9afdf08702113e0e211dea3e70f1c0617651b09a5ee97b05895`. O review da rodada 2 confirmou os ícones e pediu só uma correção de registro: VALIDATION_GATE e CURRENT_STATE ainda davam os números da rodada 1 (309 passed e 1 flaky) como a execução final. O harness aceitou a rodada com essa correção pendente (`DOC_ONLY_BLOCKERS_DEFERRED_TO_CLOSURE`), sem nova rodada; ela foi feita neste fechamento.

## Registro aplicado no fechamento

Só em `docs/migration/`:

1. **Correção adiada do review da rodada 2.** `VALIDATION_GATE.md`, seção do Goal147: a abertura diz que a execução final é a da rodada 2 e dá o `codeFingerprint` dela; a tabela de gates passa a ter a coluna "Execução final (rodada 2)", com os números e as durações da rodada 2 e os da rodada 1 entre parênteses; "Gate autenticado" separa a execução final (310 passed, 0 retentativas, 10,9 min) do flaky da rodada 1; "Desvios" e "Não executado" dizem que a retentativa não se repetiu na rodada 2. `CURRENT_STATE.md`, delta do Goal147: o bullet de contagens passa a ser o da execução final (rodada 2, `c4c51f65…`), com um bullet à parte para a rodada 1 (histórico, com o 309 passed e 1 flaky), e "Pendências para o Tech Lead" marca a retentativa em `servicos` como não reproduzida na rodada 2.
2. `DECISIONS.md`, D-161: o status passou a ACCEPTED, sem o "Aguarda o review", e a nota de fechamento, com as duas rodadas, a conferência, o aceito sem prova completa, as observações não bloqueantes e os gates da árvore aceita.
3. `CURRENT_STATE.md`, delta do Goal147: o status no título e o parágrafo "Aceite".
4. `VALIDATION_GATE.md`, seção do Goal147: a subseção "Aceite".
5. Este review.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal147), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal147) e em D-161.

- **Gates do IA Loop, rodada 2** (`attemptId` `a1` em todos, mesma árvore):
  - typecheck do frontend com saída 0 (WU-06) e lint do frontend com saída 0 (WU-07);
  - `goal147` 29 de 29 em 2 arquivos (WU-08);
  - frontend com 208 arquivos e 3046 testes passando, 98,0 s (WU-09). A partida, medida pela WU-01 no `HEAD` sem edição, antes da primeira edição, é 206 e 3017: +2 arquivos e +29 testes. A lição 2 do Goal foi cumprida;
  - `test:ia-loop` pulado (WU-10): o repositório não declara o script, e o harness vive fora dele. Aceito sem prova por não se aplicar;
  - `test:gate` 298 de 298 (WU-11), igual ao Goal146;
  - `validate:core` com saída 0, 191,2 s, 15 de 17 passos e 2 pulados (`test:bff` e `test:health-worker`) (WU-12);
  - `validate:ui` com saída 0, 57,5 s (56,4 s de Playwright), 169 passed, 21 pulados e 0 retentativas (WU-13), igual ao Goal144;
  - `validate:integration` com saída 0, 819,6 s, 36 de 36 passos, e o gate autenticado com 310 passed em 10,9 min e 0 retentativas, "every test passed on its first attempt" (WU-14), igual ao Goal146;
  - `git diff --check` com saída 0 (WU-16).

  O flaky da rodada 1 (`mobile-390 › servicos > measured, logged in`, 309 passed e 1 flaky) não se repetiu na árvore final. A IA e o Scheduling não mudaram; as contagens de unidade deles não foram refeitas fora do `validate:core`.
- **Do Developer:** a partida do frontend (WU-01); as três capturas da baseline (`run1` a `run3`, fora do repositório) e a tabela por imagem contra elas; as medidas de DOM e de pixel no app e no quadro (WU-04); os sete controles negativos (a) a (g) da WU-05, cada um reprovando o teste que o Goal nomeia e revertido com `cmp` igual ao backup.
- **Conferência do Tech Lead:**
  - **O dono da conversa:** `conversationOwnerId` é o id do responsável `CONFIRMED` quando o cliente é `dependent`, senão o do próprio cliente, e é `null` até o perfil carregar. O efeito depende só dele, aborta no cleanup e só aplica o resultado se `!controller.signal.aborted`; o perfil só lê o id quando o `ownerId` guardado é o dono atual.
  - **O rótulo e o nome acessível:** "Conversa com <primeiro nome>" ou "Conversa com o responsável", sem `aria-label`; "Conversa" para o dono cliente. `GuardianCard` com `aria-label` "Ver <nome completo>" e, sem nome, sem `aria-label`.
  - **O CSS:** escopado a `.customer-profile`; 46 px, raio 12, borda `--border-strong`, fundo transparente, hover e active do quadro, `scale` só com `prefers-reduced-motion: no-preference`, reticências com `min-width: 0`; a regra `.is-dependent .btn` removida.
  - **Os ícones (rodada 2):** `CustomerProfile.tsx:311` com `nav-chat` e `:320` com `nav-calendar`; os símbolos do sprite são idênticos aos paths de `Clientes.dc.html`.
  - **A fidelidade visual:** `visual:compare --target CL8,CL5,CL6,CL7` refeito no review da rodada 2, com os mesmos percentuais declarados; abertos os `side-by-side.png` de CL8 e CL5 nos quatro devices, de CL6 no celular e de CL7 no desktop. No CL8, o balão e o calendário são iguais ao quadro, com "Conversa com Maria" e "Agendar" lado a lado nos quatro devices. No CL5, "Agendar" usa o calendário do quadro, e a falta de "Conversa" segue declarada como estado da conta. As outras diferenças são estado da conta ou divergências declaradas.
  - **O alvo:** o CL8 tem uma só conversa, da Maria (`customerId` `visual-compare-cl8-maria`), válida contra o schema, só `GET` e sem passo. O ajuste de `goal144-alvos-captura` (schema em vez de `[]`) é coberto por `goal147-alvo-captura`.
  - **Gates:** os JSON de `results/work_unit` da rodada 2 batem com VALIDATION_GATE, todos com o mesmo `codeFingerprint` e saída 0 (WU-10 pulada).
  - **Reexecução no fechamento:** a partir de `apps/frontend`, `npx vitest run` nos dois arquivos `goal147`, em `goal144-perfil-responsavel` e em `goal144-alvos-captura`: 4 arquivos e 82 testes passando.
  - **Escopo e registros:** os arquivos listados acima. D-161 com número livre, em PROPOSED na rodada, só por acréscimo, sem editar D-158 nem D-160. As contagens (3046, 29, 298, 169 e 310) batem entre VALIDATION_GATE, CURRENT_STATE e os resultados das WU depois da correção deste fechamento.

## Aceito sem prova completa

1. **Os controles negativos** são os da WU-05. O Tech Lead não os refez nem leu a saída bruta deles.
2. **Uma conversa de responsável de ponta a ponta numa conta real.** A ação é provada com o serviço de conversas falso nos testes e com a resposta fixa de `GET` na captura. No CL5, a ação "Conversa" ao lado de "Agendar" não aparece (a conta visual não tem conversa); ela usa a mesma regra de CSS medida no CL8.
3. **O overflow com rótulo longo ("Conversa com Maximiliana") em 360 px** é garantido pelo CSS (`min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`) e não foi medido.
4. **O hover e o active** foram lidos do CSS contra o quadro, não capturados.
5. **Os 35 px do CL3 em desktop** (delta 5) contra a baseline, numa região da barra lateral em que o ruído não foi medido. A mudança é escopada em `.customer-profile`, e a barra lateral não é do perfil.
6. **Os `side-by-side.png` de CL6 em paisagem e de CL7 em retrato e em paisagem** não constam como abertos pela WU-04; para eles valem a medida do DOM e a diferença de pixels.
7. **A contagem de testes por passo** de `validate:core` e de `validate:integration` não foi retida pelo IA Loop; vale a saída 0 e os passos.

## Pendências não bloqueantes

1. **O cabeçalho compacto de CL6 e CL7** (D-161, item 7.2) mudou além da linha de ações, fora da letra do Goal. Aceito: segue a regra do Goal de corrigir o que passa de 1 px, e as abas ficam alinhadas ao quadro em todos os perfis.
2. **A borda das ações** tem 1,42:1 em repouso e 1,50:1 no hover, abaixo de 3:1 de não texto. É a mesma `--border-strong` de antes e a do quadro, e o rótulo e o ícone identificam o controle. Fica junto com a borda dos cartões (observação 4 do review144), que continua fora.
3. **`Ver perfil do responsável` → `Ver responsável`** em `goal144-perfil-responsavel.test.tsx`, fora da lista literal do §3.2, consequência direta da escolha 5.
4. **A asserção da lista de conversas** em `goal144-alvos-captura.test.ts` ficou mais fraca nesse arquivo; o conteúdo está afirmado em `goal147-alvo-captura.test.ts`.
5. **O flaky da rodada 1** em `mobile-390 › servicos > measured, logged in` não teve a causa investigada e não se repetiu na rodada 2. Se reaparecer, investigar à parte; a rota `/servicos` não é tocada por este Goal.
6. **`prettier --check`:** `goal144-alvos-captura.test.ts` já reprovava antes deste Goal (CRLF do checkout), segundo a WU-03; trechos não relacionados não foram reformatados.
7. **Fora deste Goal, com Goal e decisão próprios:** a borda dos cartões (observação 4 do review144); o conserto retroativo do vínculo velho que aponta para um dependente (pendência 7 do review146); o perfil do responsável mostrar de quem ele é responsável; "agenda para <dependente>" na lista e na busca; o tipo de relação (pergunta 141) e o gênero na nota; a IA propor responsável (D-022 (5)); o lembrete para o responsável (pergunta 135); serviço e duração no "Próximo"; e os 11 quadros ainda sem alvo.
