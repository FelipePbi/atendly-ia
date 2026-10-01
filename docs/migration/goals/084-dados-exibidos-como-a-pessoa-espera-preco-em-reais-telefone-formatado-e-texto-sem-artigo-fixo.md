# Goal 084 — Dados exibidos como a pessoa espera: preço em reais, telefone formatado e texto sem artigo fixo

**Status: READY.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal083 ACCEPTED](../reviews/083-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v103, por instrução do usuário (Felipe Borges), a partir do [re-teste local de 2026-09-30](../QA_LOCAL_REVIEW.md#re-teste-local-2026-09-30-depois-dos-goals-057080); READY na v106, com o mesmo ID, título e posição. O 082 continua PLANNED à espera de uma pessoa (motivo na v105 do MASTER_PLAN). O escopo foi precisado nesta passada por evidência conferida no código.

## Baseline aceita

Baseline aceita: `a16ef359d43de66cd9b303970acbd546ffb3d4c3`

Goal anterior: 083 — Novo agendamento conforme o protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal083 já integrado em `main` (origem `938bc0b50555aacb303ae0452dfa3b3f74f49947`). A virada de status do documento do Goal083 para `ACCEPTED` entrou no próprio commit de fechamento. **Três rodadas**, com um blocker na 1 e outro na 2. **D-098** foi aceita e [FINAL_AUDIT §59](../FINAL_AUDIT.md) escrita sem reescrever §4 a §58. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review083](../reviews/083-review.md) e de FINAL_AUDIT §59: `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **124** arquivos e **1280** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **175** testes e **0** retentativas.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** Rode, na baseline `a16ef35` e antes da primeira edição, `test:frontend` e `test:gate`, e cole a linha de resumo de cada um. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê. Nas recontagens do 081 e do 083, `test:gate` só passou depois de `npx prisma generate` no ai-orchestrator: é pré-condição do harness, não efeito do diff.

## Objetivo e posição

Fechar três achados do re-teste local em que a tela trata o dado de um jeito que a pessoa não espera:

- **R-03 (MÉDIA).** No campo de preço, digitar "60" grava **R$ 0,60**. A IA informa esse preço à cliente.
- **R-07 (MÉDIA).** O telefone de cliente aparece cru ("55<DDD+número>") na lista de Clientes, embora CL-04 e IM-10 pedissem exibição formatada.
- **R-04 (BAIXA).** A demonstração da IA escreve "Quanto custa **o** Escova?" e "**O** Escova custa…": artigo masculino fixo antes do nome do serviço.

O 084 vem antes do 085 na ordem da v103 e não depende do 082.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **A máscara de centavos é decisão aceita.** `CurrencyInput` (`apps/frontend/src/shared/ui/CurrencyInput.tsx`) trata todo dígito como centavo e o acrescenta ao fim: "60" vira R$ 0,60. É o item 4 de [D-074](../DECISIONS.md) (Goal058), reusado no onboarding pelo item 6 de D-094. Os dois únicos consumidores são `features/services/ServiceForm.tsx` (serviço novo e edição) e `features/onboarding/blocks/schedule.tsx` (etapa `servico-preco`). Os dois recebem **centavos** por `onValueChange` e convertem para reais na borda (`priceCents / 100` no formulário; `priceToCents` e `centsToPrice` no onboarding). Os testes que digitam preço digitam centavos: `goal058-service-form`, `goal065-onboarding-schedule` (digita "15000" e espera `price: 150`), `goal076-service-form`, `goal078-service-instruction-form` e `goal018-onboarding-reachability`. Nenhum teste de `e2e/` digita preço.
2. **O telefone nacional não é reconhecido.** `normalizeBrazilianPhoneDigits` (`apps/frontend/src/shared/phone.ts`) só reconhece número que começa com o `55` do país e tem 12 ou 13 dígitos. Desde o Goal062, o Scheduling grava `phone` na forma canônica `+55…`, mas **as linhas gravadas antes dele ficaram em forma nacional**: o item 3 de [D-079](../DECISIONS.md) proíbe reescrevê-las. Para elas, `formatBrazilianPhone` devolve `null` e `displayPhone` mostra o valor cru. Com DDD 55, o valor nacional de 11 dígitos começa com "55" e parece ter código do país, mas não tem.
3. **Quatro telas mostram `phone` sem `displayPhone`.** `personLabel` e o seletor de cliente em `features/agenda/NewAppointmentFields.tsx`; o resumo e as opções em `features/agenda/SeriesPreview.tsx`; o rótulo do cliente (`customerLabel`) em `features/agenda/occupancy.ts`; e a confirmação de duplicata em `features/customers/CustomerForm.tsx`. A lista, o perfil, o responsável e o detalhe do agendamento já usam `displayPhone`.
4. **O Scheduling e o BFF já têm a lista de DDDs.** `BRAZILIAN_DDDS` em `apps/scheduling-service/src/shared/phone/phone.ts`, igual à de `apps/bff/src/lib/phone.ts`. O frontend não tem a lista.
5. **O artigo é fixo em `demo.ts`.** `demoPriceReply` escreve "O valor do <nome>…" e "O <nome> custa…", e `buildDemoConversation` abre com "Oi! Quanto custa o <nome>?". `demoToneSample` reusa `demoPriceReply` e cai em "serviço" quando o nome está vazio. O protótipo (`Onboarding-3-IA-e-WhatsApp*.dc.html`) usa "o corte feminino", com o artigo certo para aquele exemplo fixo. Os testes `goal065-onboarding-schedule`, `goal079-demo-slots` e `goal079-onboarding-demo` afirmam os textos com artigo.

## Escolhas de desenho desta passada

- **(a) O campo de preço recebe reais.** Enquanto a pessoa digita, o campo é um campo de texto comum. O que ela digita fica onde ela digitou, e caractere fora do permitido é descartado. A vírgula separa os centavos, com no máximo duas casas. Ao sair do campo, o valor é formatado como "R$ 60,00". Ao entrar num campo já preenchido, o texto vira a forma editável, sem "R$" e sem ",00" quando não há centavos ("60", "60,5"). O componente continua entregando **centavos** a `onValueChange` em toda mudança, sem esperar o campo perder o foco. Por isso os consumidores, `PATCH /v1/onboarding`, `POST /v1/services` e `PATCH /v1/services/:id` gravam como antes. O teclado do celular é o decimal (`inputMode="decimal"`). Toda entrada continua chegando pelo `onChange`, nunca por `keydown`: tecla física, teclado virtual, IME, colar, ditado e preenchimento automático.
- **(b) A regra de leitura do texto é esta, e é toda testada:**

  | Texto | Centavos | Ao sair do campo |
  | --- | --- | --- |
  | `60` | 6000 | `R$ 60,00` |
  | `60,5` | 6050 | `R$ 60,50` |
  | `60,50` | 6050 | `R$ 60,50` |
  | `0,90` | 90 | `R$ 0,90` |
  | `1.200` | 120000 | `R$ 1.200,00` |
  | `1.200,50` | 120050 | `R$ 1.200,50` |
  | `R$ 1.234,56` (colado ou preenchido) | 123456 | `R$ 1.234,56` |
  | `60.50` (ponto seguido de uma ou duas casas no fim, sem vírgula) | 6050 | `R$ 60,50` |
  | vazio | `null` | vazio |

  Terceira casa depois da vírgula é descartada, e só a primeira vírgula conta. Valor acima de `Number.MAX_SAFE_INTEGER` centavos é recusado como hoje. O placeholder continua "R$ 0,00".
- **(c) O telefone nacional é reconhecido, só para exibição.** `normalizeBrazilianPhoneDigits` passa a reconhecer também a forma nacional:
  - 10 dígitos: DDD válido e assinante de 8 dígitos iniciado em 2 a 9. Iniciado em 6 a 9, ganha o 9º dígito, como já acontece com 12 dígitos.
  - 11 dígitos: DDD válido e assinante de 9 dígitos iniciado em 9.
  - Um `0` de tronco à frente de 11 ou 12 dígitos é descartado, como no Scheduling.

  A forma com país continua como está: 12 ou 13 dígitos começando com `55`. A lista de DDDs válidos é copiada da `BRAZILIAN_DDDS` do Scheduling para `shared/phone.ts`. O frontend não importa código de outro app. Com essa regra, "55991919817" (DDD 55) aparece como "(55) 99191-9817", e "12025550123" continua cru, porque o assinante começa em 0 (`goal062-availability-phone` afirma isso e não muda). **Nada é gravado nem reescrito:** nem `phone`, nem `normalizedPhone`, nem a busca. O campo de edição continua mostrando o valor gravado.
- **(d) Toda tela que mostra telefone de cliente usa `displayPhone`.** Isso vale para as quatro do item 3 da evidência e para o fallback de nome por telefone (`personLabel` e `customerLabel`). A busca por texto continua comparando o valor gravado, e a formatação não entra na chave de busca. A busca pelo número formatado ("(55) 99191") é fora do escopo.
- **(e) A demonstração não põe artigo nem contração antes do nome do serviço.** Os textos passam a ser:
  - "Oi! Quanto custa <nome>?"
  - "O valor de <nome> é sob consulta."
  - "O valor de <nome> ainda não foi informado."
  - "<Nome> custa a partir de <preço>."
  - "<Nome> custa <preço>."

  Quando o nome abre a frase, só a primeira letra vai para maiúscula, e o resto fica como a pessoa digitou. Isso vale também para o fallback "serviço" de `demoToneSample`. É **divergência declarada** frente ao protótipo, que usa "o corte feminino" para um nome fixo: com nome livre, o artigo não pode ser adivinhado.

## Fora do escopo

- O 082 inteiro, e qualquer leitura do portal ou da API da Minha Agenda.
- Máscara no campo de **digitar** telefone (CL-04 pedia "+55 (11) 9…"), a busca pelo número formatado e qualquer reescrita de `phone` ou `normalizedPhone` gravado.
- Preço digitado em qualquer outro lugar (não há outro consumidor de `CurrencyInput`), e a edição de preço no agendamento.
- Concordância de gênero em outros textos da IA real: a demonstração é prévia do frontend, não a saída do modelo.
- R-06, R-08, R-09 e R-10 (Goal085). A observação 2 do review083 (a prop `calendar` de `AppointmentFlowShell`).
- A pergunta do item 5 de D-098 (aviso à cliente na criação), que é de uma pessoa.

## Dependências e contexto mínimo

- Decisões: D-074 item 4 (máscara de centavos, que este Goal substitui), D-094 item 6 (preço com máscara no onboarding, mesmo valor gravado), D-079 item 3 (forma canônica do telefone, linhas antigas não reescritas), D-005 (telefone não prova identidade).
- Protótipo, só para conferir a divergência (e): a conversa de demonstração em `Onboarding-3-IA-e-WhatsApp.dc.html`.
- Não é preciso abrir o vault: nenhuma regra de produto muda.

## Pontos de implementação

- `apps/frontend/src/shared/ui/CurrencyInput.tsx`: (a) e (b). A interface pública (`defaultValueCents`, `onValueChange` em centavos e as demais props de `input`) não muda.
- `apps/frontend/src/features/services/ServiceForm.tsx` e `apps/frontend/src/features/onboarding/blocks/schedule.tsx`: só se for preciso para (a). O que eles gravam não muda.
- `apps/frontend/src/shared/phone.ts`: (c).
- `apps/frontend/src/features/agenda/NewAppointmentFields.tsx`, `features/agenda/SeriesPreview.tsx`, `features/agenda/occupancy.ts` e `features/customers/CustomerForm.tsx`: (d).
- `apps/frontend/src/features/onboarding/demo.ts`: (e).

## Escopo obrigatório

### 1. Preço em reais

Implemente (a) e (b). O nome acessível dos campos de preço não muda ("Preço em reais" no onboarding, "Preço" e "Valor inicial" no formulário de serviço). A mensagem de preço obrigatório do formulário continua igual.

### 2. Telefone formatado

Implemente (c) e (d). O formato de exibição continua "(DDD) 99999-9999" ou "(DDD) 9999-9999", pelo estilo `parens` que `displayPhone` já usa. O estilo `plus` da tela de WhatsApp não muda.

### 3. Demonstração sem artigo fixo

Implemente (e) em `demoPriceReply`, em `buildDemoConversation` e, por reuso, em `demoToneSample`. A ordem, a quantidade de itens, os eventos e os horários da conversa não mudam.

### 4. Testes existentes

Continuam passando. Só muda asserção que depende da máscara de centavos, que este Goal substitui, ou dos textos com artigo. Os testes que digitam centavos passam a digitar reais: "15000" vira "150", com a mesma expectativa de `price: 150`. Em `goal058-service-form.test.tsx`, o bloco "CurrencyInput ignora a posição do cursor" afirma a regra substituída. Cada teste dele é **reescrito** para a regra nova, sem ser removido. As propriedades que continuam valendo seguem afirmadas: a entrada só pelo evento `input`, sem `keydown`; colar; preenchimento automático com o texto trocado de uma vez; e o valor salvo que aparece formatado na edição. O relatório lista cada asserção mudada e o motivo.

### 5. Provas novas

Três arquivos novos, com dublês do `ProductRuntime` no padrão dos testes dos Goals 058, 062 e 079:

`apps/frontend/tests/goal084-price-input.test.tsx`:

1. A tabela de (b), linha a linha: o texto digitado ou colado entrega os centavos da tabela a `onValueChange` e, ao sair do campo, mostra o texto da tabela.
2. Serviço novo: digitar "60" no preço e criar envia `price: 60` em `POST /v1/services`.
3. Edição: o serviço com `price: 60` abre com "R$ 60,00"; trocar para "75,50" envia `price: 75.5`.
4. Onboarding, etapa `servico-preco`: digitar "60" grava `price: 60` em `PATCH /v1/onboarding`.

`apps/frontend/tests/goal084-phone-display.test.tsx`:

5. `formatBrazilianPhone(…, "parens")`: "55991919817" dá "(55) 99191-9817"; "5133334444" dá "(51) 3333-4444"; "5191234567" dá "(51) 99123-4567"; "051991234567" dá "(51) 99123-4567"; "+5555991919817" continua dando "(55) 99191-9817"; "12025550123" e "0099" continuam `null`.
6. Um cliente com `phone: "55991919817"` aparece como "(55) 99191-9817", e nunca como "55991919817", em todas estas telas: a lista de Clientes, o perfil, o seletor de cliente do novo agendamento, o detalhe do agendamento e a confirmação de duplicata do cadastro. Um cliente sem nome mostra o telefone formatado onde o nome apareceria.

`apps/frontend/tests/goal084-demo-article.test.ts`:

7. Com o serviço "Escova", nos quatro tipos de preço e nos três tons, nenhum texto da demonstração nem da amostra de tom contém "o Escova", "O Escova", "do Escova", "da Escova" ou "a Escova". Os textos são os de (e). Com o nome "escova", a frase que abre pelo nome começa com "Escova". Com o nome vazio, a amostra de tom começa com "Serviço".

As provas 1 a 7 **reprovam na baseline**. O relatório cola a saída dos três arquivos novos rodados contra os arquivos de produção da baseline, com a restauração conferida por hash.

### 6. Controles negativos, rodados depois da última edição de código

Aplique cada controle e reverta-o no mesmo passo, com a restauração conferida por hash. Cole a **saída real**:

1. `CurrencyInput` volta a tratar os dígitos como centavos: as provas 1, 2 e 4 reprovam.
2. O ramo nacional sai de `normalizeBrazilianPhoneDigits`: as provas 5 e 6 reprovam.
3. O seletor de cliente do novo agendamento volta a mostrar `item.phone` cru: a prova 6 reprova.
4. "Oi! Quanto custa o <nome>?" volta a `buildDemoConversation`: a prova 7 reprova.

### 7. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-099** em `PROPOSED`, no formato de D-090 a D-098. Ela substitui o item 4 de D-074 e diz:
  - (a) a (e), com o motivo de cada um;
  - que o item 6 de D-094 continua valendo no que diz ("o mesmo valor gravado");
  - que (c) é só exibição e não muda o item 3 de D-079;
  - a divergência (e) frente ao protótipo.

  O "Revisar se" inclui: a pessoa estranhar a formatação ao sair do campo; aparecer telefone nacional de outro formato que (c) não reconhece; e o produto passar a guardar o gênero do serviço.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§60**, sem reescrever §4 a §59. Ela registra R-03, R-07 e R-04 como corrigidos por este Goal e dá o veredito **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 5 `LIMITE-DECLARADO`**, sem contar os achados da revisão local, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou e as contagens da execução final.
- `apps/bff/PUBLIC_API_V1.md` **não** muda. O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§59 e as decisões aceitas. **O texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada. Todo nome de rota, arquivo, função, classe ou teste citado nos documentos do §7 é conferido contra o código antes da entrega.

**Ordem obrigatória, a mesma dos Goals 065 a 083:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os quatro controles do §6.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos, e a prosa é reescrita no lugar. É exatamente o blocker da rodada 2 do 083. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** O relatório de cada rodada de correção lista cada blocker recebido e diz o que foi feito no código, o que foi feito na evidência e o que ficou faltando.

### 8. O que só uma pessoa confere

- Digitar preço num navegador contra a pilha local, no onboarding, num serviço novo e numa edição, e achar natural o campo formatar ao sair.
- Ver a lista de Clientes da conta com a base importada e confirmar que os telefones aparecem formatados.
- Ler a demonstração com um nome de serviço feminino e com um masculino, e achar os textos de (e) naturais.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 9. O que este Goal não pode fazer

- Toca só os arquivos de "Pontos de implementação", os testes de `apps/frontend/tests/` e os documentos do §7. Não toca `apps/frontend/e2e/`, `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `scripts/`, `tools/ia-loop/`, o vault, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma rota de API, migration, reescrita de dado, campo de contrato ou opção nova em allowlist.
- **Falha de gate por ambiente** é reexecutada ou reportada, e nunca corrigida editando configuração. Isso vale para memória, contenção, porta, rede, a tela "Verificando seu acesso" ou "the session marker is missing" que some na retentativa (rodada 3 do review073, rodada 2 do review077, observação 1 do review072, observação 4 do review079, observação 1 do review080).
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma mudança em `vitest.config.*`, `playwright.config.*` ou `next.config.ts`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. "60" vira R$ 60,00 e grava `price: 60` em serviço novo, em edição e no onboarding, pela regra de (b). Provado pelas provas 1 a 4.
2. As propriedades da entrada que continuam valendo seguem afirmadas (só `onChange`, colar, preenchimento automático e valor salvo formatado). Provado pelos testes reescritos de `goal058-service-form.test.tsx`.
3. O telefone de cliente em forma nacional ou canônica aparece formatado na lista, no perfil, na Agenda e na confirmação de duplicata. Valor não brasileiro continua cru. Provado pelas provas 5 e 6 e por `goal062-availability-phone.test.tsx` sem edição.
4. A demonstração e a amostra de tom não põem artigo nem contração antes do nome do serviço. Provado pela prova 7.
5. A largura, o toque, o contraste, o foco e `prefers-reduced-motion` das telas tocadas são decididos pelo gate renderizado (`validate:ui` e o gate autenticado dentro de `validate:integration`, com **175** testes e **0** retentativas). A naturalidade da entrada e dos textos fica no §8.
6. Os quatro controles negativos do §6 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada.
7. Typecheck e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a recontagem da baseline (referências: `test:frontend` **124**/**1280**, `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam.
8. D-099 está em `PROPOSED`. FINAL_AUDIT §60 dá o veredito **0/7/5**. CURRENT_STATE e VALIDATION_GATE são escritos depois da execução final e dos controles, com as contagens dela, e dizem que a conferência do §8 não foi feita.
9. `git status --porcelain=v1 -uall` lista só os arquivos autorizados, sem resto de controle negativo nem artefato de `e2e-results/`.

**O que o aceite não prova:**

- que a pessoa acha natural o campo formatar ao sair, e os textos da demonstração, que é conferência humana;
- que as linhas reais da base importada estão todas num formato que (c) reconhece: a prova usa as formas conhecidas de IM-10 e CL-04;
- que a IA real concorda o gênero do serviço, porque a demonstração é prévia do frontend;
- a importação real da Minha Agenda (R-02, Goal082, à espera de uma pessoa).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem da baseline; preço em reais (§1); testes que digitam centavos reescritos (§4); `goal084-price-input` com o vermelho da baseline (§5, provas 1 a 4) |
| WU-02 | STANDARD | WU-01 | Telefone formatado (§2); `goal084-phone-display` com o vermelho da baseline (§5, provas 5 e 6) |
| WU-03 | MECHANICAL | WU-01 | Demonstração sem artigo fixo (§3); asserções de texto reescritas (§4); `goal084-demo-article` com o vermelho da baseline (§5, prova 7) |
| WU-04 | DETERMINISTIC | WU-02, WU-03 | typecheck de `apps/frontend` |
| WU-05 | DETERMINISTIC | WU-02, WU-03 | lint de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-02, WU-03 | testes dirigidos: `goal084-price-input` |
| WU-07 | DETERMINISTIC | WU-02, WU-03 | testes dirigidos: `goal084-phone-display` |
| WU-08 | DETERMINISTIC | WU-02, WU-03 | testes dirigidos: `goal084-demo-article` |
| WU-09 | DETERMINISTIC | WU-02, WU-03 | testes dirigidos: `goal058-service-form` |
| WU-10 | DETERMINISTIC | WU-04…WU-09 | validate-core |
| WU-11 | DETERMINISTIC | WU-10 | gate-tests |
| WU-12 | DETERMINISTIC | WU-10 | validate-ui |
| WU-13 | DETERMINISTIC | WU-10 | validate-integration |
| WU-14 | STANDARD | WU-11, WU-12, WU-13 | Controles negativos (§6) e documentação (§7), depois da execução final |
| WU-15 | DETERMINISTIC | WU-14 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular. WU-02 e WU-03 não tocam os mesmos arquivos e podem correr em paralelo depois da WU-01. A WU-01 vem antes porque é ela que reconta a baseline e porque `goal065-onboarding-schedule.test.tsx` é tocado por ela (preço) e pela WU-03 (texto).
