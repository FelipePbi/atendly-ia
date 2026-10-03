# Review formal — Goal 106

**Decisão vigente — rodada 3: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-03, em review DEEP, conforme o [Goal106](../goals/106-whatsapp-igual-ao-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

`/configuracoes/whatsapp` com o número conectado passa a seguir o quadro W1. A tela mostra a identidade (avatar com as iniciais do negócio e selo, nome, telefone formatado e a pílula "Conectado desde DD/MM" no fuso do negócio), o cartão da IA por `settings.ai.enabled`, as linhas "Contatos que a IA nunca responde" e "Trocar número", o texto de uso normal e "Desconectar WhatsApp" em área de atenção. O botão "Desconectar número" e o cartão "WhatsApp conectado" saíram. `WhatsAppConnectionPanel` continua um só, com uma prop opcional `renderConnected`; o onboarding não a passa. `IgnoredContactsPanel` foi movido para `features/whatsapp/` sem mudança. O `visual:compare` ganhou respostas fixas de `GET` por alvo (`responses`), usadas só pelo W1. O desconectado, a casca, o contrato, o BFF e a IA não mudaram. Decisão: [D-118](../DECISIONS.md), aceita neste fechamento; ela não reescreve D-117, D-116 nem D-103.

## Escopo e identidade do diff

- Baseline aceita vigente: `b31575aec9ffb4d536b8a2c6b4b015ce13eeebf4` (Goal104). Base imediata da implementação: `72b12eb8f4d0992991b7179a9d2418ba8ca6d86f`, HEAD da worktree `.ai-worktrees/goal-106`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **19 arquivos**, hash do diff `fcccf1feb53b3b8e36e330b46760a02d075f4ff541a14802f67e155653b09850`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git status --porcelain=v1 -uall` no snapshot aceito:
  - Produção, em `apps/frontend/src/`: `features/settings/WhatsAppSettings.tsx` (`sha256` `153fe61c…`), `ProductSettingsScreen.tsx` (`0bc27785…`, só passar `settings`), `features/whatsapp/WhatsAppConnectionPanel.tsx` (`3a9a6294…`, só o ponto de extensão), `features/onboarding/blocks/whatsapp.tsx` (`92ac497a…`, só tirar o componente movido e importá-lo) e `shared/styles/atendly-settings.css` (`0edc3439…`); os novos `features/settings/WhatsAppConnectedSettings.tsx` (`abdbf513…`) e `features/whatsapp/IgnoredContactsPanel.tsx` (`e6cc793a…`).
  - Instrumento: `scripts/visual-compare.mjs` (só o import e o serviço de `responses`), `apps/frontend/e2e/visual/targets.json` (`$comment` e a entrada do W1) e os novos `scripts/lib/visual-responses.mjs` (`f7fdb4fc…`) e `scripts/tests/visual-responses.test.mjs` (`a9aec83e…`, 9 testes).
  - Gate, por autorização do Tech Lead na rodada 1: `apps/frontend/e2e/authenticated-matrix.spec.ts` (`2e712734…`, só o marcador de `LOADED_STATE` de `/configuracoes/whatsapp`) e `apps/frontend/AGENTS.md` (`da13f610…`, a linha do marcador).
  - Teste novo: `apps/frontend/tests/goal106-whatsapp.test.tsx` (**30** testes, cinco provas, `sha256` `5ad6ff23…`).
  - Testes ajustados só na montagem de `WhatsAppSettings` com `settings`, sem asserção mudada, nenhum removido nem pulado: `goal071-onboarding-whatsapp` e `goal099-onboarding-ia-whatsapp`.
  - Documentos: `docs/migration/DECISIONS.md` (D-118), `CURRENT_STATE.md` e `VALIDATION_GATE.md`.
- `e2e/routes.ts`, a casca (`src/shared/layout/`), o contrato público, o BFF e as configurações de gate não mudaram no snapshot aceito.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 5 blockers.** Visual aceito no mérito. Duas decisões do Tech Lead nesta rodada: (1) a evidência 10 do Goal estava errada, porque a conta do gate autenticado tem o número conectado; como (b) tira o `h2` "WhatsApp conectado", fica autorizada só a troca do marcador de `LOADED_STATE` (para o botão "Trocar número") e a linha correspondente de `apps/frontend/AGENTS.md`, como exceção pontual aos critérios 8 e 10; (2) o controle 5 do §6, como escrito, não pode reprovar, porque a guarda `!consentPhase` é exigida por (c); a variante que remove `consentPhase` e passa a prop é a forma válida. Blockers: (1) a pílula usava o fuso fixo `America/Sao_Paulo`, e o Goal pede o fuso do negócio; (2) a espera da demonstração do onboarding acrescentada em `proveOnboardingScreen` contrariava o "Não mude `e2e/` por causa disso"; (3) a execução final, o vermelho da baseline e os controles precisavam ser refeitos depois das correções; (4) D-118 e (5) CURRENT_STATE/VALIDATION_GATE precisavam refletir as decisões acima.
2. **Rodada 2 — `CHANGES_REQUIRED`, 6 blockers.** Código aceito no mérito: fuso do negócio com fallback, espera da demonstração revertida, spec diferente da base só no hunk autorizado. Faltava o teste do fallback de fuso (o teste "sem `settings.business`" usava um instante que dá 18/09 em quase todo fuso) e cinco correções de documento: tirar de "Divergências medidas" o bullet duplicado do gate; trocar "causa não medida" pela causa medida na WU-02; tirar do "Limite declarado" a frase de que o W1 não ficou igual ao quadro; registrar o controle 5 na variante aceita; e reescrever os itens 4 e 5 do "Revisar se".
3. **Rodada 3 — `ACCEPTED`, 0 blockers.** O teste novo prova o fallback: sem `settings.business`, `connectedAt` `2026-09-18T02:00:00.000Z` dá "Conectado desde 17/09" e nenhum "18/09". Os documentos foram corrigidos só na seção do Goal106. Os sha256 de produção, de `scripts/` e de `e2e/` são iguais aos da rodada 2.

O perfil do Developer declarado no Goal é `SONNET_HIGH`; as correções rodaram como unidade FIX-001.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal106 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal106) e na "Prova" de D-118.

- **Identidade do código aceito.** Na rodada 3, os sha256 citados acima batem com os documentados e com os da rodada 2, salvo o teste (`80f3ee4c…` para `5ad6ff23…`, só pelo teste do fallback). `git status --porcelain=v1 -uall` lista só arquivos autorizados, mais o spec e o `AGENTS.md` autorizados na rodada 1. Sem resto de controle negativo e sem `e2e-results/` rastreado.
- **`visual:compare`.** O Tech Lead rodou `npm run visual:compare -- --target W1` nas rodadas 1, 2 e 3 (exit 0). As três deram **9,5 / 4,3 / 6,7 / 5,5** (mobile / tablet em retrato / tablet em paisagem / desktop), iguais à execução 3 do Developer. O `AGENTS.md` não foi reescrito pelo `next dev`. Em cada rodada, o Tech Lead abriu os quatro `side-by-side.png`. Nos quatro devices, a estrutura, a ordem dos blocos, os componentes, a tipografia e as cores seguem o W1: avatar de 72 px com selo verde, nome em Literata, telefone, pílula verde, cartão da IA, grupo de linhas com chevron, texto de uso normal e área de atenção no fim. O que difere são as divergências declaradas 1 a 6 de D-118 e a linha "Desconectar WhatsApp" fora do viewport.
- **"Desconectar WhatsApp" fora do viewport e a piora em relação à execução 2.** Causa medida na WU-02 da rodada 1: com uma resposta fixa temporária de `GET /v1/status` (conectado e IA ativa), depois removida, o W1 deu 6,0 / 2,0 / 4,8 / 3,7, com tablets e desktop alinhados ao quadro. A linha sai do viewport pelos banners reais da casca (divergência 2) somados ao `min-height: 100dvh` de `.settings-page.is-pushed:has(.wa-screen)`, o mesmo padrão já aceito em `.rules-screen` (AG1) e `.account-screen` (C1). Por isso não é blocker visual.
- **Instrumento.** (a) segue os limites: só `GET`, só `/v1/`, caminho exato, só o alvo que declara. Só o W1 declara `responses`, com `GET /v1/whatsapp` conectado; `GET /v1/status` continua real. 4.2, 4.6, IA1, C5 e H3 têm os mesmos números nas três execuções do Developer; o M1 mobile passa de 8,8 para 8,7, sem causa isolada.
- **Código.** `IgnoredContactsPanel` tem corpo idêntico ao componente da base, salvo nome e export. Sem `renderConnected`, o painel é o de hoje; com `consentPhase` ou fora do estado conectado, a prop é ignorada. A pílula usa `settings.business?.timezone ?? "America/Sao_Paulo"`. Há uma chamada de `useShellConfig` por árvore, em `ProductSettingsScreen`. `.wa-ai-link` tem `min-height: 44px`.
- **Provas.** `goal106-whatsapp.test.tsx` passa **30**/**30** na árvore aceita. Contra a baseline, medido pelo Developer na rodada 3, **25** reprovam e **5** passam; os 5 estão nomeados no VALIDATION_GATE. `visual-responses.test.mjs` passa 9/9.
- **Controles negativos do §6**, refeitos pelo Developer na rodada 3 sobre a árvore final, com a restauração conferida por sha256: `25`, `9`, `1`, `3`, `1` (controle 5 na variante), `27` reprovações de 30 e `2` de 9 no teste do instrumento; um oitavo controle (fallback trocado para `"UTC"`) dá `1`. Sem o defeito, 30/30 e 9/9. O Tech Lead aceitou os controles pelo registro e não os reexecutou.
- **Gates do IA Loop na rodada 3,** sobre a árvore aceita, todos com exit 0: typecheck, lint, `goal106-whatsapp` 30/30, `validate:core`, `test:gate` (`tests 242, pass 242`), `validate:ui` (169 passed, 0 retentativas), `validate:integration` e `git diff --check`. A `validate:integration` da rodada 3 deu **274 passed e 1 flaky**, com 1 retentativa, em `[mobile-390] › onboarding-agenda-atendly-pronta › measured, logged in`. A causa está no log: `page.goto: net::ERR_NO_BUFFER_SPACE`, esgotamento de buffer de socket do host Windows, não asserção. A rota está fora do escopo. Na rodada 2, com o mesmo código de produção, a `validate:integration` deu **275 passed** e 0 retentativas; a árvore da rodada 3 difere só por um teste de jsdom.

## Aceito sem prova completa

1. **"IA ativa neste número"** está provado só em jsdom. A conta visual não tem a IA ativa.
2. **O W1 com um número conectado de verdade**: a captura usa a resposta fixa de `GET /v1/whatsapp`.
3. **O W1 não chegou a diff zero** e, pelo diff, ficou pior que o painel de hoje com o número conectado (execução 2: 8,3 / 3,9 / 6,1 / 5,1). O aceite vem da vista dos `side-by-side.png` e da causa medida na WU-02.
4. **A causa do M1 mobile** (8,8 para 8,7) não foi isolada. O M1 não usa `responses`.

## Observações registradas, sem mudar a decisão

1. **A evidência 10 do Goal estava errada.** A conta do gate autenticado está conectada, e o gate renderizado mede o W1 conectado, com a IA desligada. Isso expôs o alvo de toque de "Ver em IA" (60×18 px), corrigido em `atendly-settings.css`.
2. **O controle 5 do §6, como escrito, não tem efeito.** A guarda `!consentPhase` exigida por (c) faz o painel ignorar a prop no onboarding. Vale a variante, que remove `consentPhase` e passa `renderConnected`.
3. **A frase "sem reexecução na rodada 3"** do VALIDATION_GATE descreve a execução do Developer. O IA Loop rodou a `validate:integration` na rodada 3, com o resultado acima; está registrado na nota de fechamento do VALIDATION_GATE.
4. **O review 106 não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos.

## O que o aceite não prova

- A tela num aparelho real. A conferência humana **não foi feita**.
- O W1 com um número conectado de verdade e com a IA ativa fora do jsdom.
- O W1 com diff zero: o critério "igual ao quadro" foi julgado pela vista.
- O W2, o W3, o painel desconectado, o consentimento e a vinculação, que ficam fora do escopo.
