# Goal 102 — O produto passa a se chamar Avenly nas telas, no código e no protótipo

**Status: ACCEPTED.** Preparado em 2026-10-03 pelo Tech Lead Agent após [Goal110 ACCEPTED](../reviews/110-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: L1, L3, L4, L5, L8, L9, H1, A1, NT1, 0, 2.1, 2.2, 2.I1, 4.2, 4.6, I1, I2, Mais-WhatsApp:C1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) que existe desde a v127 como PLANNED, **mantida com o mesmo ID e o título precisado na v134**: até a v133, "O produto passa a se chamar Avenly". Na v134 a linha foi dividida. Este Goal fica com o código, as telas, os pacotes, os documentos de instrução do repositório e o protótipo. A documentação em `docs/` (fora de `docs/design-reference/`) e os registros da migração vão para o novo **111**, que depende deste. O motivo está em "Por que dividir" e no histórico v134 do MASTER_PLAN.

## Baseline aceita

Baseline aceita: `90fe865b5b415ca77cbb168673bf414c99328068`

Goal anterior: 110 — As credenciais derivadas passam a Avenly sem derrubar sessão nem chamada entre serviços

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal110 já integrado em `main` (origem `2e14573dfc26ee60d0172a3002da8554de94c62c`). Foram **três rodadas**, com 2, 1 e 0 blockers, todos de documento. **D-121** foi aceita. A virada de status do documento do Goal110 para `ACCEPTED` entrou no commit de fechamento. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline ([review110](../reviews/110-review.md), [VALIDATION_GATE](../VALIDATION_GATE.md), seção do Goal110, e D-121 "Consequências"):

- `validate:core` com 15 passos e 2 pulados;
- suíte do frontend com **149** arquivos e **1840** testes;
- `test:gate` **242**;
- IA sem banco **1199** testes que passam e 101 pulados;
- Scheduling unitários **543**;
- `validate:integration` com **36** de 36 passos, integração do BFF com **515** testes em 68 arquivos, integração do Scheduling com **152** testes e gate autenticado com **275** `passed` e **0** retentativas;
- `validate:ui` com **169** `passed` e 0 retentativas. Essa contagem é do Goal109, rodada 1: o 110 não rodou `validate:ui`.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Ela traz a linha de resumo de cada passo de `validate:core` e de `validate:integration` que tem contagem, e o total de `validate:ui`.

## Objetivo

O operador pediu em 2026-10-02 que o produto passe a se chamar **Avenly**, porque o nome Atendly já está em uso por outra empresa. Os Goals 109 e 110 mudaram o que é gravado, conferido ou calculado com o nome antigo, com leitura compatível. Este Goal faz a troca de nome no resto do código e no protótipo:

- textos de tela, títulos e metadados das páginas;
- termos de uso e política de privacidade;
- mensagens de erro e textos da IA que citam o nome;
- identificadores, nomes de arquivo e nomes de pacote;
- comentários;
- os documentos de instrução do repositório;
- o texto das páginas do protótipo.

**Layout e logo não mudam.** O logo é só o ícone, e os arquivos mudam apenas de nome. A palavra muda nos dois lados, no app e no protótipo. Por isso cada quadro da linha acima continua igual ao app, como foi aceito no Goal que o portou.

## Por que dividir, e o que a evidência desta passada mostra

Conferido na baseline `90fe865`:

1. `git grep -i -l atendly` devolve **537** arquivos. São **289** fora de `docs/` e de `graphify-out/`, **53** em `docs/design-reference/`, **151** em `docs/migration/`, **34** em `docs/product-vault/` e mais 5 arquivos soltos em `docs/`. `graphify-out/` é gerado pelos hooks.
2. Os registros da migração citam de propósito os valores antigos que continuam valendo como legado: `"ATENDLY"`, `atendly_session`, `atendly_csrf`, `atendly:internal:v1`, `atendly:csrf:`, `CalendarSettings_source_atendly_check` e `ATENDLY_*`. Uma troca de texto ali faria D-120 e D-121 dizerem "`avenly_session`, com leitura de `avenly_session`". Os registros também citam caminhos que este Goal renomeia, como `atendly.css` e `integrations/atendly/provider.ts`. Esses caminhos só podem ser trocados nos registros depois que este Goal existir. Por isso a documentação vem **depois**, com uma regra própria de preservação, e sem os gates de código. Esse é o 111.
3. **Pacotes.** O nome do pacote raiz é `atendly-ia`. Os pacotes `@atendly-ia/public-api-contract` e `@atendly-ia/legal-contract` são resolvidos por `file:` com `install-links=true` (`apps/bff/.npmrc` e `apps/frontend/.npmrc`), copiados para `node_modules/@atendly-ia/` no `npm ci`. `scripts/build-public-api-contract.mjs` usa `PACKAGE_NAME = "@atendly-ia/public-api-contract"`, e `apps/frontend/next.config.ts` lista os dois em `transpilePackages` (linhas 23 e 24). Os apps também têm nome com esse escopo (`@atendly-ia/bff`, `@atendly-ia/ai-orchestrator` e `@atendly-ia/scheduling-service`).
4. **Arquivos com o nome antigo:**
   - 9 folhas de estilo `apps/frontend/src/shared/styles/atendly*.css`, importadas em `apps/frontend/src/app/globals.css`;
   - `public/brand/atendly-icon.svg` (favicon em `app/layout.tsx`) e `public/icons/atendly-icons.svg`;
   - no Scheduling, `modules/availability/atendly-availability.ts`, `modules/customers/atendly-customer-service.ts`, `modules/services/atendly-service-service.ts` e o diretório `modules/integrations/atendly/`;
   - no protótipo, `Atendly.dc.html` (o índice), `Atendly-standalone.html` e duas cópias de `atendly-logo-icon.png`;
   - **dois diretórios de migration do Scheduling**, cujo nome está gravado em `_prisma_migrations.migration_name`.
5. **Identificadores.** No Scheduling há as classes `Atendly*` (`AtendlyCalendarProvider`, `AtendlyAvailability`, `AtendlyCustomerService`, `AtendlyServiceService`, `AtendlyAppointmentHoldService`, `AtendlyAppointmentLifecycleService` e `AtendlyAppointmentSeriesService`) e a função `toAtendlyAppointment`. No frontend há as variáveis locais `atendly` em `AgendaBoard.tsx` e `AgendaDayColumn.tsx` e a classe CSS `is-atendly`.
6. **Telas.** O nome aparece como texto em login e cadastro (`AuthScreen.tsx`), na marca da barra lateral (`shared/ui/Brand.tsx`, que mostra a palavra ao lado do ícone), nos títulos (`app/layout.tsx`, `AppShell.tsx` e `RouteAnnouncer.tsx`) e no texto legal (`content/legal/*.pt-BR.ts`). Também aparece no onboarding, na importação, nas mensagens de erro de rede, no teste real, no WhatsApp e na conta. No protótipo, o nome aparece no texto dos quadros da linha acima e na marca das versões desktop.
7. **Rota de onboarding.** O passo `agenda-atendly-pronta` está em `features/onboarding/blocks.ts` e em `e2e/routes.ts`. `app/onboarding/[step]/page.tsx` já tem `legacyStepRedirects`, com `agenda-atendly-confirmar` e `agenda-atendly-metodo`. Nenhum desses nomes é gravado (precisão da v133).
8. **Versão legal.** `TERMS_VERSION` e `PRIVACY_POLICY_VERSION` valem `0.1-draft` em `packages/legal-contract`. O cadastro confere a versão com `z.literal` (`apps/bff/src/modules/auth/routes.ts:46`).
9. **Nomes de ambiente.** `render.yaml`, os `.env.example`, `apps/health-worker/` e os scripts e testes que os conferem citam nomes de serviço, host e banco do Render (`atendly-ia-*`, `atendly_scheduling`). `.github/workflows/validate.yml` e a mensagem de `scripts/validate-integration.mjs` citam o banco de teste `atendly_bff_test`. A instância `atendly-platform` do WhatsApp é configuração do ambiente. Nada disso é texto do produto: são nomes que vivem fora do repositório ou no ambiente.
10. **Constantes gravadas sem papel de chave.** D-121 (e) mostrou que `ACTIVATION_TEST_CONTACT_NAME` e `ACTIVATION_TEST_CLIENT_NAME` (`"Atendly (teste)"`), o nome de reserva `"atendly"` da instância nova do WhatsApp e os rótulos `service` de saúde não são usados como chave. Linha nova grava o nome novo, e linha antiga guarda o que já tinha.
11. Ainda não há usuário real (veredito de [FINAL_AUDIT](../FINAL_AUDIT.md) §7).

## Regra da troca

Toda ocorrência de `Atendly`, `atendly` e `ATENDLY` no escopo vira `Avenly`, `avenly` e `AVENLY`, inclusive dentro de identificadores compostos (`AtendlyCalendarProvider` vira `AvenlyCalendarProvider`, `@atendly-ia/bff` vira `@avenly-ia/bff`, `atendly-ia-bff` no rótulo de saúde vira `avenly-ia-bff`). Ficam de fora **só** as classes de exceção abaixo. A concordância em português não muda: "a Atendly" vira "a Avenly", e "da Atendly" vira "da Avenly".

### Classes de exceção (o que fica com o nome antigo)

As cinco primeiras vêm de D-120 (i) e de D-121 (e). As últimas três são deste Goal.

- **(i)** Migration antiga, inclusive o **nome do diretório**, e ensaio que monta o estado legado que ela lê. Nenhuma migration existente é editada nem renomeada.
- **(ii)** Constante ou ramo de legado de D-120 (b), (d), (e) e (f), por exemplo `LEGACY_CALENDAR_SOURCE = "ATENDLY"`, `LEGACY_SESSION_COOKIE_NAME`, `LEGACY_CSRF_COOKIE_NAME`, a leitura de `ATENDLY_*` e a chave antiga do `localStorage`.
- **(iii)** Teste que prova a compatibilidade e envia ou confere o valor antigo, incluindo os seis arquivos `goal109-*` e os quatro `goal110-*`.
- **(v)** Comentário histórico que descreve o que a migration do Goal027 fez.
- **(vi)** `LEGACY_INTERNAL_DERIVATION_PREFIX` na IA e no Scheduling e `LEGACY_CSRF_LABEL` no BFF.
- **(viii)** Nome de ambiente que vive fora do repositório ou no ambiente local: nomes de serviço, host e banco do Render, em `render.yaml`, nos `.env.example`, em `apps/health-worker/` e nos scripts e testes que os conferem; a instância `atendly-platform`; nomes de banco, container e volume do ambiente local e do CI, como `atendly_bff_test` em `.github/` e na mensagem de `validate-integration.mjs`. O supervisor ou o operador trocam esses nomes fora deste Goal.
- **(ix)** Nome antigo que existe para **reconhecer** o nome antigo: os aliases de rota em `legacyStepRedirects` e uma guarda de regressão que procura um identificador já retirado, como `findRequireAtendlyCalendarReferences` em `scripts/final-production-audit.mjs`, se for isso que ela procura. O relatório confere cada caso no código antes de classificá-lo.
- **(x)** Binário ou gerado: `docs/design-reference/claude-design/handoff/Atendly-Stage-1-delivery-handoff.zip` e `docs/design-reference/claude-design/prototype/Atendly-Stage-1-delivery.zip` mantêm nome e bytes, e `graphify-out/` não entra no diff. Se um hook regenerar `graphify-out/`, restaurar.

D-120 (iv), os scripts que enviam `"ATENDLY"` por D-120 (g), **passa a enviar `"AVENLY"`**, como D-120 propôs. O que prova a leitura do valor antigo são os testes de (iii). D-121 (vii) **troca**.

Literal que não cabe em nenhuma classe troca. Literal que parece caber em mais de uma, ou cuja troca muda algo gravado, conferido por outro serviço ou usado como chave, **não troca**. Nesse caso o relatório o leva ao Tech Lead.

## Escolhas de desenho desta passada

**(a) Pacotes passam ao escopo `@avenly-ia/`, e o pacote raiz passa a `avenly-ia`.** A troca é mecânica e segue a regra. Ela alcança `package.json`, os `package-lock.json` (campos de nome, chaves `node_modules/@avenly-ia/...` e dependências `file:`), os comentários dos `.npmrc`, `PACKAGE_NAME` em `scripts/build-public-api-contract.mjs`, **só** as duas strings de `transpilePackages` em `apps/frontend/next.config.ts`, e todo `import`. Os lockfiles são regenerados pelo `npm` e não editados à mão, e o diff deles só pode mudar nomes. O nome da pasta do projeto (`atendly-ia`) fica, por decisão do operador. Motivo: o pedido inclui "nomes de pacote", e o escopo só aparece no build e no `import`.

**(b) A versão legal fica `0.1-draft`.** O texto dos termos e da política muda só no nome do produto. Motivo:
- o texto ainda é rascunho, com campos de razão social e CNPJ preenchidos pelo ambiente;
- nenhum aceite real existe (evidência 11);
- trocar a versão abriria uma janela de deploy no cadastro: um frontend antigo enviaria a versão antiga ao `z.literal` do BFF novo, e o cadastro seria recusado.

A versão sobe junto com o texto legal definitivo. O Developer registra isso em D-122.

**(c) Arquivos públicos renomeados não ganham cópia com o nome antigo.** `/brand/atendly-icon.svg` e `/icons/atendly-icons.svg` passam a `/brand/avenly-icon.svg` e `/icons/avenly-icons.svg`. Uma aba aberta antes do deploy perde os ícones até recarregar. Motivo: ainda não há usuário real, e uma cópia seria um terceiro tipo de legado sem prova. D-122 registra isso como janela declarada.

**(d) O passo de onboarding passa a `agenda-avenly-pronta`, e `agenda-atendly-pronta` entra em `legacyStepRedirects`.** Os aliases antigos continuam valendo. Motivo: um link já aberto continua funcionando, como os aliases de hoje.

**(e) Protótipo: só a palavra muda.** Os arquivos de `docs/design-reference/claude-design/` mudam o texto, e `Atendly.dc.html`, `Atendly-standalone.html` e as duas cópias de `atendly-logo-icon.png` mudam de nome. Todo link e toda referência a eles é atualizado. Os dois `.zip` ficam como estão. Nenhum valor de px, cor, fonte, raio, espaçamento ou estrutura muda. Em `docs/design-reference/` a baseline não tem nenhuma ocorrência de "avenly" (`git grep -i -c avenly -- docs/design-reference` vazio). Por isso a prova é a **substituição inversa**: aplicar `Avenly→Atendly`, `avenly→atendly` e `AVENLY→ATENDLY` a cada arquivo mudado ou renomeado em `docs/design-reference/` devolve, byte a byte, o arquivo da baseline no caminho antigo.

**(f) Os registros da migração não são reescritos aqui.** `docs/migration/` só recebe o que o Goal manda escrever, por acréscimo (ver "Documentação"). O texto novo pode dizer Avenly, e cita caminhos antigos só quando fala da baseline.

## Escopo obrigatório

### 1. Pacotes

Aplicar (a). Depois, rodar `npm ci` (ou `npm install`, se o lockfile precisar ser regenerado) na raiz e em `apps/bff`, `apps/frontend`, `apps/ai-orchestrator`, `apps/scheduling-service` e `packages/public-api-contract`, e conferir:
- `node_modules/@avenly-ia/public-api-contract` e `node_modules/@avenly-ia/legal-contract` existem nos apps que os usam;
- `node_modules/@atendly-ia` não existe mais nesses apps.

O relatório cola a lista de linhas mudadas de cada lockfile, ou a contagem e a natureza delas, e mostra que só nomes mudaram.

### 2. Backend

Aplicar a regra em `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff`, `apps/evolution-go` e `apps/health-worker` (código, testes e comentários). Inclui:
- **Scheduling:** renomear os três arquivos e o diretório da evidência 4 com `git mv`, as classes e a função da evidência 5, e todo `import` e `export` que os cita.
- **IA:** a mensagem do teste real, os comentários e os nomes de teste (`ACTIVATION_TEST_*` por D-121 (vii)).
- **BFF:** o nome de reserva do WhatsApp, o rótulo de saúde e os comentários.
- **Go:** o rótulo `service` de `routes.go` e os textos de teste.

Em `schema.prisma` (BFF e Scheduling), só linhas de comentário `///` mudam. O relatório mostra que o diff desses dois arquivos não tem outra linha, e que `prisma validate` passa. Códigos de erro, rotas, contratos, status HTTP e o que é gravado não mudam, salvo os literais de D-121 (vii).

### 3. Frontend

Aplicar a regra em `apps/frontend`, inclusive em `e2e/` (marcadores de texto e o passo da evidência 7). Inclui:
- renomear as 9 folhas de estilo e os 2 arquivos públicos com `git mv`, e atualizar `globals.css`, o favicon e toda referência ao sprite;
- a classe `is-atendly` no TSX e no CSS;
- as variáveis locais;
- a marca (`Brand.tsx`, inclusive o `aria-label`);
- os títulos;
- o texto legal, sem mudar a versão;
- (d).

Testes que conferem o texto ou o caminho mudam só nesse texto ou caminho. Nenhuma regra de CSS muda além do nome da classe.

### 4. Protótipo

Aplicar (e) em `docs/design-reference/claude-design/`, inclusive `README.md`, `handoff/*.md` e os `_build/*.js`. `inventory.json` só muda se tiver o nome antigo. A prova da substituição inversa vem colada no relatório, com um comando ou script que roda sobre `git diff --name-status -M` contra a baseline.

### 5. Scripts, configuração e documentos de instrução

- **`scripts/` e `scripts/tests/`:** os scripts de D-120 (iv) passam a enviar `"AVENLY"`, e os textos e comentários seguem a regra. A configuração dos passos de `validate:*` não muda.
- **Documentos de instrução:** `AGENTS.md`, `CLAUDE.md` e `README.md` da raiz, os `AGENTS.md` e `README.md` dos apps, e `apps/bff/PUBLIC_API_V1.md`. O bloco do ai-memory em `AGENTS.md` ou `CLAUDE.md`, se houver, só muda onde cita o produto.
- **`render.yaml` e os `.env.example`:** só comentários e textos que não são nome de ambiente (viii).

### 6. Inventário do que sobra

No fim, o relatório cola e classifica a saída de dois comandos:

```
git grep -n -i atendly -- ':!docs' ':!graphify-out'
git grep -n -i atendly -- docs/design-reference
```

Cada linha recebe uma das classes (i), (ii), (iii), (v), (vi), (viii), (ix) ou (x), sem resto. Pode agrupar por arquivo quando todas as linhas do arquivo são da mesma classe, e linha por linha nos demais casos. O relatório diz também:
- quantas linhas de D-120 (i) e de D-121 (e) ainda existem e quais saíram;
- que nenhuma linha de (iv) ou (vii) sobra;
- que `git ls-files | grep -i atendly` devolve só os diretórios de migration (i) e os dois `.zip` (x).

### 7. O que este Goal não pode fazer

- Mudar valor gravado, enum, constraint, nome de cookie, chave de storage, rótulo de derivação, cabeçalho, nome de variável de ambiente ou qualquer ramo de legado dos Goals 109 e 110.
- Editar, renomear ou acrescentar migration. Mudar linha de `schema.prisma` que não seja comentário `///`.
- Mudar layout, cor, espaçamento, fonte, ícone, rota (salvo (d)), texto além do nome do produto, prompt da IA além do nome do produto, ou a versão legal.
- Editar `docs/migration/` fora do que "Documentação" manda, `docs/product-vault/`, `docs/architecture/`, `docs/landing-page/` ou os `.md` soltos de `docs/`. Isso é do 111.
- Trocar nome de ambiente (viii) ou o nome da pasta do projeto.
- Mudar passo, contagem de passos ou configuração de `validate:*`.
- Pular, remover ou marcar teste como `skip`/`todo`. Afrouxar asserção existente.

**Configuração de gate é intocável, inclusive em unidade de diagnóstico.** Nenhuma mudança em `vitest.config.*`, `playwright.config.*` ou `playwright.authenticated.config.ts`, nem temporária. A única linha autorizada fora do código é a das duas strings de `transpilePackages` em `apps/frontend/next.config.ts`, por (a). Falha de gate por ambiente é reexecutada ou reportada, nunca corrigida editando configuração.

## Pontos de implementação

- Usar `git mv` para todo arquivo renomeado, e conferir com `git diff --name-status -M` que cada um aparece como renomeação (`R`).
- Contagem exata de arquivos `.ts` varridos em `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (`DIAG-001` de D-120): este Goal só renomeia, então a contagem não deve mudar. Se mudar, o relatório diz por quê.
- As provas `goal110-*` varrem `src` atrás de `atendly:internal:v1`. Elas continuam passando sem mudança, porque as constantes de (vi) ficam.
- Busca de texto em teste (`getByText("…Atendly…")`, marcadores do `e2e/routes.ts`) muda junto com o texto da tela.
- **A troca não pode alcançar** o texto do valor antigo que um teste de (iii) envia de propósito. Rodar as provas `goal109-*` e `goal110-*` depois da troca e antes dos gates.

## Fora do escopo

- A documentação em `docs/` fora de `docs/design-reference/` e os registros da migração (111).
- Os nomes do ambiente Docker local e do CI, trocados pelo supervisor depois deste Goal, e os nomes do Render, o domínio, o remote git, a instância e a conta do WhatsApp, que dependem do operador.
- Contrair a compatibilidade de D-120 e de D-121.
- O deploy real.
- As lacunas visuais já registradas sem ID (C1 a C4, K1 a K6, 2.I2 a 2.I10), a observação 2 do review105 e os quadros sem alvo em `targets.json` (L2, L6, L7, 2.I3, 2.I6, 2.I8, 2.I9, 2.I10, 4.3, 4.10, W2 e C2). Neles, o nome muda no texto e é conferido pelo inventário e pelos testes, sem captura.

## Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-122** em `PROPOSED`, no formato de D-121. Ela registra a regra da troca, as classes (viii), (ix) e (x), as escolhas (a) a (f) com o motivo de cada uma, a janela declarada de (c), o inventário do §6 como lista do que sobra para o 111 e para a contração, e um "Revisar se". O "Revisar se" inclui: a versão legal definitiva; a troca dos nomes de ambiente pelo supervisor e pelo operador; e o 111. D-120 e D-121 não são reescritas.
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto. [VALIDATION_GATE](../VALIDATION_GATE.md) ganha uma subseção do Goal102 com:
  - a recontagem;
  - a prova da substituição inversa;
  - o resultado de `visual:compare`;
  - o inventário do §6;
  - as contagens da execução final.
- FINAL_AUDIT **não** ganha seção. O vault, `QA_LOCAL_REVIEW.md` e os demais registros não são editados.

Toda contagem em documento permanente nomeia a execução que a sustenta. Todo nome de arquivo, função ou teste citado é conferido contra o código antes da entrega. Seção aceita de outro Goal em VALIDATION_GATE ou CURRENT_STATE não é editada, nem o título dela: o texto deste Goal entra só por acréscimo.

**Blockers de documento.** Se o review apontar blockers de documento, cada um vira um item curto e separado, e o Developer confere item por item antes de devolver (regra do 097 e do 104).

## Validação e ordem

1. Recontar a baseline, como manda "Baseline aceita".
2. Fazer os §1 a §5 e rodar as provas `goal109-*` e `goal110-*`.
3. Fazer a última edição de código.
4. Rodar a execução final nesta ordem:
   1. typecheck de `apps/bff`, `apps/ai-orchestrator`, `apps/scheduling-service` e `apps/frontend`;
   2. `validate:core`;
   3. `validate:ui`;
   4. `validate:integration`, num banco recém-provisionado.
5. Rodar `npm run visual:compare -- --target L1,L3,L4,L5,L8,L9,H1,A1,NT1,0,2.1,2.2,2.I1,4.2,4.6,I1,I2,Mais-WhatsApp:C1` depois da última edição de código, e **olhar** as capturas lado a lado (protótipo × app, 4 devices).
6. Fazer o inventário do §6 e a prova da substituição inversa.
7. Escrever a prosa só depois disso.

**Retentativas e recurso do host.** Já houve:
- falha por memória em `validate:core` (101, passou com `VITEST_MAX_WORKERS=2`);
- `ERR_NO_BUFFER_SPACE` no gate autenticado (106);
- o Postgres local interceptado em `127.0.0.1:5555` (observação 3 do review105);
- a exigência de um PostgreSQL com `vector` nativo em loopback para `validate:integration` (observação 5 do review109).

Se algo assim se repetir, rodar a configuração padrão e a variante por variável de ambiente na mesma árvore, e registrar as duas. A configuração não muda.

## Critério de aceite

1. O inventário do §6 está no relatório e em VALIDATION_GATE, com cada linha classificada e sem resto. Nenhuma linha de (iv) ou (vii) sobra. `git ls-files | grep -i atendly` devolve só os diretórios de migration (i) e os dois `.zip` (x).
2. A substituição inversa sobre `docs/design-reference/` devolve a baseline byte a byte, e os renomeados aparecem como `R` em `git diff --name-status -M`.
3. Cada quadro da linha "Quadros do protótipo" fica **igual ao quadro nos 4 devices**, com Avenly nos dois lados, como foi aceito no Goal que o portou. O gate de `visual:compare` não mostra divergência nova. A largura, o contraste, o foco e o movimento ficam com `validate:ui`.
4. Os lockfiles mudam só nomes. O `npm ci` dos apps afetados passa, e `node_modules/@avenly-ia/*` substitui `node_modules/@atendly-ia/*`.
5. Typecheck dos quatro apps passa. `validate:core` passa, com `test:gate` em **242** ou mais e a suíte do frontend em **1840** testes ou mais. Nenhuma suíte tem teste a menos que a recontagem da baseline.
6. `validate:ui` passa com **169** `passed` ou mais e 0 retentativas, ou com cada retentativa medida e explicada.
7. `validate:integration` sai com exit 0 e **36** passos, rodado depois da última edição de código, com a integração do BFF em **515** testes ou mais e o gate autenticado em **275** testes e **0** retentativas. Retentativa é medida e reportada com a causa.
8. As provas `goal109-*` e `goal110-*` passam sem mudança no arquivo.
9. `git diff --stat` não mostra migration, `vitest.config.*`, `playwright*.config.*` nem arquivo de `docs/` fora de `docs/design-reference/` e dos três documentos de "Documentação". `apps/frontend/next.config.ts` muda só as duas strings de (a). `schema.prisma` muda só comentário `///`.
10. D-122 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final, com as contagens dela, e só por acréscimo.
11. `git status --porcelain=v1 -uall` lista só arquivos autorizados, sem configuração de gate alterada e sem `graphify-out/`.

**O que o aceite não prova:**
- o deploy real e a janela de (c);
- a troca dos nomes de ambiente;
- a documentação e os registros (111);
- os quadros sem alvo em `targets.json`, que só têm o texto conferido.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; pacotes (§1), lockfiles e `npm ci` |
| WU-02 | STANDARD | WU-01 | Backend (§2) e provas `goal109-*`/`goal110-*` do backend |
| WU-03 | STANDARD | WU-01 | Frontend (§3), inclusive `e2e/` e (d) |
| WU-04 | STANDARD | WU-03 | Protótipo (§4) e prova da substituição inversa |
| WU-05 | MECHANICAL | WU-02 | Scripts, configuração e documentos de instrução (§5) |
| WU-06 | DETERMINISTIC | WU-02, WU-05 | typecheck de `apps/bff` |
| WU-07 | DETERMINISTIC | WU-02, WU-05 | typecheck de `apps/ai-orchestrator` |
| WU-08 | DETERMINISTIC | WU-02, WU-05 | typecheck de `apps/scheduling-service` |
| WU-09 | DETERMINISTIC | WU-03 | typecheck de `apps/frontend` |
| WU-10 | DETERMINISTIC | WU-04, WU-06, WU-07, WU-08, WU-09 | validate-core |
| WU-11 | DETERMINISTIC | WU-10 | validate-ui |
| WU-12 | DETERMINISTIC | WU-10 | validate-integration |
| WU-13 | STANDARD | WU-11, WU-12 | `visual:compare` final, inventário (§6) e documentação (D-122, CURRENT_STATE, VALIDATION_GATE) |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |
