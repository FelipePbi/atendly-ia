# Review formal — Goal 102

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-04, conforme o [Goal102](../goals/102-o-produto-passa-a-se-chamar-avenly-nas-telas-no-codigo-e-no-prototipo.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

O produto passa a se chamar Avenly no código, nas telas, nos pacotes, nos documentos de instrução e no protótipo. Toda ocorrência de `Atendly`, `atendly` e `ATENDLY` no escopo vira `Avenly`, `avenly` e `AVENLY`, também dentro de identificadores compostos, de nomes de arquivo e de pacote (`@avenly-ia/*`, raiz `avenly-ia`). O nome antigo sobra só nas classes de exceção: as herdadas de D-120 e D-121 ((i), (ii), (iii), (v) e (vi)), nome de ambiente (viii), nome antigo que reconhece o nome antigo (ix) e binário (x). Os scripts de D-120 (iv) e os literais de D-121 (vii) trocaram. A versão legal continua `0.1-draft`. O passo de onboarding passa a `agenda-avenly-pronta`, com `agenda-atendly-pronta` em `legacyStepRedirects`. Decisão: [D-122](../DECISIONS.md), aceita neste fechamento.

## Escopo e identidade do diff

- Baseline aceita anterior: `90fe865b5b415ca77cbb168673bf414c99328068` (Goal110). Base imediata da implementação: `d5c2fd58200385f2ad32332cb81870ab8867187e` (D-123, a saída do harness para o `relay-loop-ia`), HEAD da worktree `.ai-worktrees/goal-102`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **286 arquivos**, hash do diff `509dfb4bb7fb02bf19ab2e23c0936568b56b33714cf5c3ebd25104efb9d9c6e3`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por área: pacotes e lockfiles (`package.json` e `package-lock.json` da raiz, dos apps e de `packages/`, e os `.npmrc`); código e testes do BFF, da IA, do Scheduling e do frontend; 3 arquivos do Evolution (Go); scripts e seus testes em `scripts/`; documentos de instrução (`AGENTS.md`, `CLAUDE.md`, `README.md`, `GRAPHIFY_WORKSPACE_MAP.md`, os `AGENTS.md` e `README.md` dos apps, `PUBLIC_API_V1.md`); `render.yaml` e os `.env.example`, só em linhas fora de (viii); 52 arquivos de `docs/design-reference/claude-design/`; e `docs/migration/` (D-122, um delta em CURRENT_STATE e uma seção em VALIDATION_GATE, só por acréscimo).
- Renomeados com `git mv`, todos como `R` em `git diff --name-status -M d5c2fd5`: as 9 folhas `apps/frontend/src/shared/styles/avenly*.css`, `public/brand/avenly-icon.svg`, `public/icons/avenly-icons.svg`, no Scheduling `avenly-availability.ts`, `avenly-customer-service.ts`, `avenly-service-service.ts` e `modules/integrations/avenly/` (2 arquivos), e no protótipo `Avenly.dc.html`, `Avenly-standalone.html` e as duas `avenly-logo-icon.png`.
- Nenhuma migration, `vitest.config.*` ou `playwright*.config.*` mudou. `next.config.ts` muda só as duas strings de `transpilePackages`. Os dois `schema.prisma` mudam só linhas `///`. `graphify-out/` não está no diff. Os dois `.zip` do protótipo ficam com nome e bytes.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 7 blockers.** Perfil `SONNET_HIGH`. O §1 (pacotes), o §2 (backend), o §3 (frontend) e o §5 (scripts e documentos de instrução) já conferiam com a regra. Os blockers: (1) o §4, protótipo, não foi feito (0 ocorrências de `avenly` em `docs/design-reference/`); (2) a WU-03 do frontend terminou `FAILED` (`UNKNOWN_FATAL`) sem relatório nem critérios conferidos; (3) dois arquivos `goal109-*` mudaram sem declaração, contra o critério 8; (4) faltava o inventário do §6; (5) `visual:compare` não rodou (WU-13 `BLOCKED`); (6) os gates rodaram sobre a árvore incompleta e valiam só como observação; (7) D-122, o delta de CURRENT_STATE e a seção de VALIDATION_GATE não existiam. O Tech Lead pediu o perfil `OPUS_MEDIUM`, que o Goal declara.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** A FIX-001 trocou o nome no protótipo, com prova inversa em 52 de 52 arquivos; devolveu a linha (iii) de `apps/frontend/tests/service-schema.test.ts:64` a `"ATENDLY"`; corrigiu três sobras; refez os gates depois da última edição de código, inclusive `visual:compare`; e escreveu o inventário (444 e 11 linhas, sem resto) e D-122, com a exceção ao critério 8 declarada. O IA Loop então rodou os seus gates sobre a árvore final.

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal102 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal102) e em D-122.

- **Troca linha a linha, conferida pelo Tech Lead na rodada 2.** Fora de `docs/`, cada linha mudada contra `d5c2fd5` difere da baseline só pela troca do nome. As únicas exceções são a entrada nova `agenda-atendly-pronta` em `legacyStepRedirects`, o comentário dela e o teste novo de `goal066-onboarding-sistema-atual.test.tsx`, todos da escolha (d).
- **Protótipo.** A substituição inversa (`Avenly→Atendly`, `avenly→atendly`, `AVENLY→ATENDLY`) sobre `docs/design-reference/` devolve a baseline byte a byte. Os 4 renomeados aparecem como `R`, e os dois `.zip` ficam intactos.
- **Inventário do §6.** `git grep -n -i atendly -- ':!docs' ':!graphify-out'` tem 444 linhas e `git grep -n -i atendly -- docs/design-reference` tem 11, classificadas sem resto. Linhas conferidas uma a uma pelo Tech Lead: os testes que enviam `"ATENDLY"` ficam em (iii), inclusive `service-schema.test.ts:64`; as chaves de storage `atendly:brand-signature-*` ficam em (ii), por D-120 (f); `atendly-platform` fica em (viii). `git ls-files | grep -i atendly` lista as 2 migrations, os 2 `.zip` e `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md`, registrado como pendência do 111.
- **Pacotes.** `node_modules/@avenly-ia` existe no BFF e no frontend, sem `@atendly-ia`. `is-avenly`, o favicon, o sprite e `agenda-avenly-pronta` estão consistentes no código e nos testes.
- **Gates do IA Loop na rodada 2,** todos com exit 0, sem reexecução pelo Tech Lead: typecheck dos 4 apps (WU-06 a WU-09), `validate:core` (WU-10, 122152 ms), `validate:ui` (WU-11, 52354 ms), `validate:integration` (WU-12, 733288 ms) e `git diff --check` (WU-14). Contagens da corrida da FIX-001: frontend 149 arquivos e 1841 testes (1840 mais o teste de (d)), `test:gate` 242, `validate:ui` 169 passed e 0 retentativas, `validate:integration` 36 de 36 passos, integração do BFF 515 em 68 arquivos e gate autenticado 275 com 0 retentativas.
- **`visual:compare`.** Na conferência do Tech Lead, o comando saiu com "BFF local indisponível" (porta 3002). O Tech Lead abriu então os `side-by-side.png` da corrida da FIX-001: 72 capturas, geradas depois de toda edição do frontend e do protótipo. Quadros vistos: 0, 2.1, 2.2, 2.I1, 4.2, 4.6, I1, I2, C1, A1 e NT1 nos 4 devices; L1 a L9 e H1 no mobile e no desktop, por imagens compostas; H1 também no tablet retrato. Avenly aparece nos dois lados e não há divergência nova. As diferenças vistas são estado da conta ou já aceitas nos Goals que portaram cada quadro.

## Pontos de julgamento de D-122, resolvidos

Os cinco ficam aceitos como propostos:

1. As duas URLs externas do Claude Design com `?file=Atendly.dc.html` (`claude-design/README.md:7` e `handoff/claude-code-prompt.md:9`) ficam em (viii): o arquivo do projeto externo tem esse nome lá.
2. As linhas 17 e 19 do `schema.prisma` do Scheduling, comentários `///` do ramo de legado do Goal109, ficam em (ii).
3. `scripts/final-production-audit.mjs:55`, que confere a ausência do serviço `atendly-ia-api` no `render.yaml`, fica em (viii).
4. `apps/frontend/tests/service-schema.test.ts:64` volta a `"ATENDLY"`, e o arquivo fica igual ao da baseline: a linha é (iii) de D-120 (i).
5. Exceção ao critério 8: `apps/bff/tests/goal109-avenly-calendar-source.test.ts` (1 linha, o `import` do pacote, forçado por (a)) e `apps/frontend/tests/goal109-avenly-values.test.tsx` (2 linhas, o rótulo da tela). Nenhuma outra linha de `goal109-*` ou `goal110-*` mudou, e nenhum valor legado foi tocado.

## Aceito sem prova completa

1. **Os gates e as contagens.** Os gates da rodada 2 vêm do IA Loop, e as contagens vêm da corrida da FIX-001. O Tech Lead não os reexecutou.
2. **`visual:compare` sem corrida do Tech Lead.** A conferência foi pelas capturas do Developer. Os tablets de L1 a L9 e o tablet paisagem de H1 não foram vistos e ficam aceitos pelos números, iguais aos do Goal091.
3. **O ambiente da corrida visual.** O BFF, o Scheduling e a IA da worktree rodaram contra bancos descartáveis num PostgreSQL 18 temporário, com a IA sem laços de fundo e com o LLM e o Evolution apontados para endereços mortos.
4. **Os quadros sem alvo em `targets.json`,** conferidos só pelo texto e pelos testes.

## Observações registradas, sem mudar a decisão

1. **Janela declarada de D-122 (c).** Uma aba aberta antes do deploy do frontend fica sem favicon e sem ícones do sprite até recarregar. Ainda não há usuário real ([FINAL_AUDIT](../FINAL_AUDIT.md) §7).
2. **O SHA-256 de `Avenly-standalone.html` em `claude-design/README.md`** é o do formato original exportado e não confere com o arquivo renomeado, como D-122 (e) declara.
3. **O `.md` solto de `docs/`** (`docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md`) fica com o nome antigo, porque o Goal proíbe tocar `docs/` fora de `docs/design-reference/` e `docs/migration/`. O nome dele é decisão do Goal111.
4. **Este review não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos no resultado de cada rodada.

## O que o aceite não prova

- O deploy real e a janela de D-122 (c).
- A troca dos nomes de ambiente (viii): Render, domínio, instância do WhatsApp, bancos locais e do CI.
- A documentação e os registros fora de `docs/design-reference/`, que são do Goal111.
- A contração da compatibilidade de D-120 e D-121, que tira (ii) e (vi).
- A versão legal definitiva.
- A conferência humana num aparelho real.
