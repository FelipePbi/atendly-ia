# Goal 079 — Onboarding fiel ao protótipo: demonstração, estilo, promessas e boas-vindas

**Status: ACCEPTED.** Preparado em 2026-09-30 pelo Tech Lead Agent após [Goal072 ACCEPTED](../reviews/072-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v100, dividida do 072, PLANNED logo depois dele. A v101 a marca READY com o mesmo ID e o mesmo título e precisa o escopo com a evidência abaixo. O 072 entregou a moldura do onboarding (voltar no topo, progresso por capítulo, CTA na largura da coluna, seleção tonal) e os campos dos capítulos "Seu negócio" e "Sua agenda". Este Goal fica com o **conteúdo** que faltou: a Boas-vindas animada, a demonstração animada da IA, a amostra por estilo, as promessas da introdução do WhatsApp e a ordem de Tab dessa introdução. A v101 acrescenta uma parte que a linha da v100 não tinha: **as duas etapas animadas do capítulo "Sua IA" passam a ser medidas pelo gate autenticado**, porque hoje nenhum gate renderizado as abre (evidência 5).

## Baseline aceita

Baseline aceita: `68bc370031d71f4279626fc55613e388842ef58b`

Goal anterior: 072 — Onboarding fiel ao protótipo: moldura, negócio e agenda

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal072 já integrado em `main` (origem `7713c61a769de496e1549e92a7d107266e54a278`). A virada de status do documento do Goal072 para `ACCEPTED` entrou no próprio commit de fechamento. **Quatro rodadas**, com 3, 1, 1 e 0 blockers. O único defeito de código achado no review ficou fora do onboarding: o sprite de ícones com XML inválido, que nenhum gate detectou e que agora `goal072-icon-sprite.test.ts` guarda. **D-094** foi aceita e [FINAL_AUDIT §55](../FINAL_AUDIT.md) escrita sem reescrever §4 a §54. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review072](../reviews/072-review.md) e de FINAL_AUDIT §55 (execução final vigente, rodada 3 do IA Loop do Goal072): `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `test:frontend` **116** arquivos e **1189** testes; `test:gate` **233**; `validate:ui` **169** passando e **21** pulados; `validate:integration` **36** passos, com o gate autenticado em **160** testes e **0** retentativas. Backend que este Goal não toca, sem mudança desde o Goal077: `test:bff-integration` **60** arquivos e **465** testes; `test:ai-orchestrator` **1177** passando e **93** pulados de **1270**; `test:scheduling-service` **37** arquivos e **502** testes.

**A recontagem da baseline é obrigatória e vem colada no relatório da rodada 1.** O Goal072 pedia a mesma recontagem e nenhum relatório a trouxe (observação 3 do review072). Rode `test:frontend` e `test:gate` na baseline `68bc370` antes da primeira edição e cole as duas linhas de resumo. Esse é o piso usado para comparar a execução final; se divergir dos números acima, o relatório diz por quê.

## Objetivo e posição

Fazer a Boas-vindas, a demonstração da IA, a escolha de estilo e a introdução do WhatsApp baterem com os protótipos `Onboarding-1-Negocio-e-Agenda*.dc.html` (tela 0) e `Onboarding-3-IA-e-WhatsApp*.dc.html` (telas 3.1, 3.2 e 4.1), em `docs/design-reference/claude-design/prototype/project/`, e com o vault ([`02-Fluxos/01-Onboarding.md`](../../product-vault/02-Fluxos/01-Onboarding.md) §1, §7 e §8).

1. **Boas-vindas animada**: a composição conta a promessa em cerca de 3 segundos, mensagem → resposta da IA → horário na agenda, sem carrossel.
2. **Demonstração animada** (O-36, O-37): as mensagens entram uma a uma; a conversa usa o serviço, o preço, a duração, os dias e os horários reais do negócio; a IA oferece até três horários, a cliente escolhe, a IA confirma com a data completa; os eventos do sistema são linhas discretas dentro da conversa; o "Continuar" só aparece no fim.
3. **Estilo com amostra** (O-39, vault §8): cada estilo mostra a mesma resposta escrita naquele tom; "Equilibrada" vem pré-marcada e com o selo "recomendada"; o CTA diz "Continuar com <estilo>"; o título é o do vault.
4. **Promessas** (O-42): quatro linhas, cada uma com ícone próprio e a palavra-chave em negrito.
5. **Ordem de Tab** (observação 3 do [review065](../reviews/065-review.md)): na introdução do WhatsApp, a ordem de Tab é a ordem visual em todas as larguras.
6. **Gate**: `demonstracao-da-ia` e `tom-da-ia` entram nas rotas medidas pelo gate autenticado.
7. **Movimento**: toda animação nova respeita `prefers-reduced-motion`, e com ela a tela abre direto no estado final.

Achados da [revisão local](../QA_LOCAL_REVIEW.md) que este Goal fecha: **O-36**, **O-37**, **O-39** e **O-42**, mais a composição animada da Boas-vindas pedida em **O-01** e a observação 3 do review065. A busca por CEP de **O-15** continua fora: depende de serviço externo e está pendente de decisão humana, sem Goal.

## O que a evidência desta passada mostra

Conferido no código da baseline `68bc370`:

1. **A Boas-vindas é estática.** `WelcomeStepBody` (`blocks/business.tsx:67-97`) desenha uma `figure` `role="img"` com a mensagem, a resposta e um horário "15:30 · Ana Paula · Corte", sem animação. O docblock e o comentário do CSS (`atendly.css`, `.onboarding-welcome-scene`) ainda dizem que "a versão animada do protótipo é do Goal072"; essa frase fica falsa neste Goal. O protótipo mostra três linhas de agenda (14:00, 15:30 "Ana Paula · Corte", 17:00), com a de 15:30 entrando por último.
2. **A demonstração é estática e mais pobre que o protótipo.** `AiDemoStepBody` (`blocks/ai.tsx:50-124`) renderiza as seis mensagens de uma vez, oferece um horário só ("Tenho sim! Horário disponível às {startTime}."), põe os eventos como `message-meta` sob cada balão e abre com o aviso grande "Demonstração simulada…". O "Continuar" é o CTA genérico do `OnboardingScreen`, visível desde o início. O rascunho já tem o que a conversa do protótipo pede: `serviceName`, `serviceDuration`, `servicePrice`, `servicePriceType`, `days`, `dayHours`, `startTime`, `endTime` e `timezone` (`OnboardingRuntime.tsx:24-50`). `demoPriceReply` já trata os quatro tipos de preço (Goal065) e continua valendo.
3. **O estilo não tem amostra, nem padrão, e o título diverge do vault.** `aiStepBody` (`blocks/ai.tsx:126-157`) monta três `Choice` só com nome e adjetivos, nada pré-marcado com `tone` nulo, e o CTA é "Continuar". O título em `scenarios.ts` é "Como a IA deve conversar?"; o vault §8 diz "Gostou da forma como a IA conversou?" e "Default: Equilibrada", e o Q&A 707 do vault confirma o padrão Equilibrado. É código defasado frente ao vault, não decisão nova.
4. **As promessas são cinco linhas com o mesmo ✓.** `PERSONAL_NUMBER_POINTS` (`blocks/whatsapp.tsx:35-41`) tem cinco frases, todas com `Icon name="check"` e sem ênfase. O protótipo 4.1 tem quatro linhas que cobrem os mesmos pontos do vault: número pessoal ou profissional e um número por negócio; seguir usando o WhatsApp normalmente com as conversas organizadas; a IA sai de cena quando você responde; você escolhe quem a IA nunca responde.
5. **Nenhum gate renderizado abre a demonstração nem o estilo.** `ONBOARDING_ROUTES` (`e2e/routes.ts:124-191`) tem treze etapas e não tem `demonstracao-da-ia` nem `tom-da-ia`. A segunda conta do ensaio autenticado (`seedOnboardingAccount`, `scripts/goal033-authenticated-ui-rehearsal.mjs:1564`) grava só o bloco de negócio e a fonte da agenda. Sem serviço ativo e sem horário, a demonstração mostraria apenas o aviso "Configure…". O `PATCH /v1/onboarding` já aceita `service` e `availability`: são as mesmas gravações das etapas `servico-nome` e `horarios` (`blocks/schedule.tsx:705-745`). Sem essa extensão, largura, contraste, foco e `prefers-reduced-motion` das duas telas animadas ficam sem prova renderizada.
6. **A ordem de Tab da introdução ainda é invertida a partir do tablet.** `.onboarding-actions.is-stacked` tem `flex-direction: row-reverse` fora da media query do celular (`atendly.css`, perto da linha 2634). O comentário diz que a inversão existe para manter "Voltar" à esquerda, e o "Voltar" saiu do rodapé no Goal072. No DOM o principal vem primeiro e o secundário depois; a partir de 768 px o secundário aparece à esquerda. Nos três protótipos 4.1 o principal vem antes do secundário.
7. **Já existe um padrão para a preferência de movimento.** `shared/ui/Brand.tsx:16-20` lê `prefers-reduced-motion` por `matchMedia`, com guarda para ambiente sem `matchMedia`. O gate autenticado mede movimento recarregando a etapa com `reducedMotion: "reduce"` e exigindo zero animação em curso (`authenticated-matrix.spec.ts`, passo 5; `measureRunningAnimations` em `e2e/measure.ts:234`).

## Escolhas de desenho desta passada

- **Boas-vindas.**
  - A composição do protótipo tem três partes: a mensagem da cliente "Oi! Tem horário na sexta?", a resposta "Tenho sexta às 15h30. Posso confirmar?" e a agenda com 14:00, 15:30 "Ana Paula · Corte" e 17:00.
  - As partes entram nessa ordem, e a linha de 15:30 entra por último. A sequência inteira termina em até 3,5 s e não repete.
  - A `figure` continua `role="img"` com o `aria-label` de hoje. A animação é só visual, e o leitor de tela recebe a frase inteira de uma vez.
  - "Começar" fica visível e habilitado desde o primeiro quadro. A Boas-vindas não espera a animação.
  - O texto "Seu progresso fica salvo a cada etapa." continua.
- **Demonstração (O-36, O-37).**
  - Título e descrição do protótipo 3.1: "Veja sua IA atendendo" e "Uma conversa de exemplo com os seus serviços e horários. Nada é marcado de verdade.". O eyebrow é "Sua IA".
  - O aviso grande do topo sai. A distinção entre demonstração e teste real (G-25) fica na descrição e no último evento, "Agendamento simulado · nada foi marcado".
  - A conversa, com os dados do rascunho:
    1. a cliente pergunta o preço do serviço;
    2. evento "Serviço identificado · <serviço>";
    3. a IA responde com o preço, pelo `demoPriceReply` de hoje, mais a duração ("leva 45 min") e pergunta se quer marcar;
    4. a cliente pergunta por horário no dia da demonstração;
    5. evento "Agenda consultada · <n> horário(s) livre(s) <no dia>";
    6. a IA oferece os horários;
    7. a cliente escolhe um;
    8. a IA confirma com a data completa ("<serviço>, sexta-feira, 2 de outubro, às 15h30. Posso confirmar?");
    9. a cliente diz "Pode!";
    10. evento "Agendamento simulado · nada foi marcado";
    11. a IA confirma.
  - **O dia da demonstração** é a próxima data depois de hoje, no fuso do negócio (`draft.timezone`), cujo dia da semana está em `draft.days`.
  - **O intervalo** daquele dia é o de `dayHours`, com o intervalo-base como fallback. É a mesma regra que a gravação de `horarios` já usa (`dayHourOf`).
  - **Os horários** são candidatos que começam no início do intervalo e andam de `serviceDuration` em `serviceDuration`, enquanto início mais duração couber no fim. Mostre o primeiro, o do meio e o último, sem repetir: três se houver três ou mais candidatos, e menos se houver menos. A cliente escolhe o do meio quando há três e o primeiro nos outros casos.
  - **O formato** é "14h" para hora cheia e "15h30" nos outros casos. A lista usa vírgula e "ou" ("14h, 15h30 ou 17h").
  - Exemplo que o teste usa: "Corte feminino", `FIXED` 90, 45 min, sexta, 14:00–18:00, hoje quarta 2026-09-30. O resultado é "sexta-feira, 2 de outubro", com "14h, 15h30 ou 17h".
  - O cálculo é uma função pura num módulo próprio (por exemplo `features/onboarding/demo.ts`), testável com relógio fixo. Ela não lê a agenda real e não chama o BFF. **A demonstração continua sem porta de envio e sem escrita** em Appointment, Customer, Conversation ou Message.
  - **Sequência:** a primeira mensagem aparece no primeiro quadro, e as outras entram uma a uma em intervalos curtos. O último item entra em até 12 s. Cada item só existe no DOM depois de entrar: nada invisível fica esperando com `opacity: 0`.
  - O "Continuar" só aparece quando o último item entra. A tela sabe disso por um callback do corpo da etapa para o `OnboardingScreen`, no padrão de `onWhatsappStatusChange`.
  - A área da conversa tem `role="log"`, para que o leitor de tela ouça cada entrada.
  - Com `prefers-reduced-motion: reduce`, a conversa inteira e o "Continuar" aparecem no primeiro quadro, sem animação.
  - Sem serviço operacional ou sem horário válido, o aviso "Configure…" de hoje continua, e o "Continuar" aparece de imediato.
- **Estilo (O-39, vault §8).**
  - Título "Gostou da forma como a IA conversou?", descrição "Escolha o jeito de falar. Você pode mudar depois." e eyebrow "Sua IA".
  - Cada opção tem nome, descritor e amostra, na ordem do protótipo:
    - Profissional: "Clara e educada, sem emojis";
    - Equilibrada, com o selo "recomendada": "Simpática e direta, poucos emojis";
    - Descontraída: "Casual e próxima, com emojis".
  - A amostra é a mesma resposta da demonstração, a do preço e da duração, escrita nos três tons, com os dados reais do rascunho. Ela respeita os quatro tipos de preço como `demoPriceReply`: "a partir de" nunca vira preço fixo, e "sob consulta" nunca vira valor.
  - Com `tone` nulo no rascunho, "Equilibrada" aparece selecionada (`aria-pressed="true"`). Com um tom gravado, aparece o gravado.
  - O CTA diz "Continuar com <nome do estilo selecionado>". Enviar grava o estilo selecionado em `PATCH /v1/onboarding` (`ai.tone`), como hoje. Enviar sem tocar em nada grava `BALANCED`.
  - O nome acessível de cada opção começa pelo nome do estilo, e nenhum heading fica dentro do botão (regra de D-094).
  - A troca de estilo pode ter o pequeno "pop" do protótipo na amostra escolhida, sujeito a `prefers-reduced-motion`.
  - A amostra é prévia do frontend, não a saída do modelo. O orquestrador e o prompt do tom não mudam.
- **Promessas (O-42).**
  - Quatro linhas, na ordem do protótipo 4.1, cada uma com um ícone decorativo próprio (`aria-hidden`) e a palavra-chave em `<strong>`:
    1. "Use seu WhatsApp **pessoal ou profissional**. Só um número por negócio."
    2. "Continue usando o WhatsApp **normalmente**. Suas conversas ficam organizadas aqui."
    3. "Quando **você responde**, a IA sai de cena naquela conversa."
    4. "Você escolhe **quem a IA nunca responde**."
  - Cada linha usa um ícone diferente, e nenhuma usa o ✓ genérico. Ícone novo entra em `public/icons/atendly-icons.svg` e em `shared/icons/Icon.tsx`, e `goal072-icon-sprite.test.ts` continua passando.
  - O `h1` da etapa ("Agora vamos colocar sua IA para atender de verdade") não muda, porque é o `contentMarker` do gate.
- **Ordem de Tab (observação 3 do review065).**
  - Na introdução do WhatsApp, "Conectar meu WhatsApp" vem antes de "Fazer isso depois" no DOM e na tela, em todas as larguras. No celular, os dois ficam empilhados em largura total, como hoje e como o gate já confere (passo 1c).
  - Nenhum `row-reverse`, `column-reverse` ou `order` reordena essa linha. O comentário do CSS que fala em "Voltar" à esquerda sai.
- **Gate (evidência 5).**
  - `ONBOARDING_ROUTES` ganha, **só por acréscimo**, `onboarding-demonstracao-da-ia` e `onboarding-tom-da-ia`, cada uma com o `h1` da etapa como `contentMarker`, no padrão das outras entradas.
  - `seedOnboardingAccount` ganha **um** `PATCH /v1/onboarding` a mais, depois dos dois de hoje. Ele grava um serviço ativo com duração e preço e uma disponibilidade com pelo menos um dia, pelas mesmas formas de corpo que `servico-nome` e `horarios` já usam, e exige 200. O docblock passa a dizer "três `PATCH /v1/onboarding`" e continua dizendo que não há `POST /v1/onboarding/complete`. A conta continua sem IA ativa e sem WhatsApp.
  - `authenticated-matrix.spec.ts` não muda: o laço de `ONBOARDING_ROUTES` já mede cada entrada nas cinco larguras.
  - A demonstração é medida no quadro em que o gate a encontra depois de `networkidle`, e esse pode ser um quadro do meio da sequência. **Todo quadro da sequência** passa em largura, toque, contraste e foco. Com `reduce`, o gate encontra a tela sem animação em curso.
- **Sem mudança** no BFF, no contrato, no orquestrador, na ordem das etapas, em `onboardingFlow`, no que cada etapa grava (exceto o padrão `BALANCED` quando o tom é nulo, que é o default do vault), no teste real (Goal063), no painel de conexão (Goal071) nem na moldura do Goal072.

## Fora do escopo

- A busca por CEP de O-15: pendente de decisão humana.
- As telas 4.2 a 4.9 do protótipo: consentimento, conexão, contatos ignorados e teste real, entregues pelos Goals 063 e 071.
- `progressPercent` exportada sem uso em `blocks.ts` (observação 5 do review072): limite declarado em D-094.
- A observação 5 do review065 e as observações 1 e 2 do [review078](../reviews/078-review.md).
- `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/` e `tools/ia-loop/`. Em `scripts/`, só `seedOnboardingAccount`, como descrito acima.

## Dependências e contexto mínimo

- Goal072 ACCEPTED (baseline acima). O Goal065 escreveu a demonstração e o estilo conforme o vault, o Goal071 escreveu a introdução do WhatsApp e o consentimento, e o Goal072 escreveu a moldura, a regra de nenhum heading dentro de controle e o guard do sprite.
- Arquivos de partida: `apps/frontend/src/features/onboarding/blocks/ai.tsx`, `blocks/whatsapp.tsx`, `blocks/business.tsx` (só `WelcomeStepBody`), `blocks/shared.tsx` (só se `Choice` precisar aceitar a amostra), `OnboardingScreen.tsx`, `scenarios.ts`, `OnboardingRuntime.tsx` (só leitura do rascunho); `shared/ui/Brand.tsx` (só como padrão de `prefers-reduced-motion`); o CSS do onboarding em `shared/styles/atendly.css`; `e2e/routes.ts`; `scripts/goal033-authenticated-ui-rehearsal.mjs` (só `seedOnboardingAccount`).
- Testes de partida: `apps/frontend/tests/goal065-onboarding-copy-whatsapp.test.tsx`, `goal065-onboarding-schedule.test.tsx`, `goal018-onboarding-reachability.test.tsx`, `goal019-a11y.test.tsx`, `goal019-activation-test-screens.test.tsx`, `goal066-onboarding-importacao.test.tsx`, `goal072-onboarding-frame.test.tsx`, `goal072-icon-sprite.test.ts`.

## Pontos de implementação

| Parte | Onde |
| --- | --- |
| Boas-vindas | `features/onboarding/blocks/business.tsx` (`WelcomeStepBody`), `shared/styles/` |
| Demonstração | `features/onboarding/blocks/ai.tsx`, módulo novo do cálculo (por exemplo `features/onboarding/demo.ts`), `OnboardingScreen.tsx` (CTA no fim), `scenarios.ts`, `shared/styles/` |
| Estilo | `features/onboarding/blocks/ai.tsx`, `blocks/shared.tsx` (se precisar), `OnboardingScreen.tsx` (rótulo do CTA), `scenarios.ts`, `shared/styles/` |
| Promessas e ordem de Tab | `features/onboarding/blocks/whatsapp.tsx`, `shared/styles/`, `public/icons/atendly-icons.svg` e `shared/icons/Icon.tsx` (se entrar ícone) |
| Gate | `apps/frontend/e2e/routes.ts` (acréscimo), `scripts/goal033-authenticated-ui-rehearsal.mjs` (`seedOnboardingAccount`) |
| Testes | `apps/frontend/tests/goal079-*.test.ts(x)` |

## Escopo obrigatório

### 1. Boas-vindas animada (O-01, parte animada)

- Conforme as escolhas de desenho.

### 2. Demonstração (O-36, O-37)

- Conforme as escolhas de desenho, com o cálculo do dia e dos horários numa função pura.

### 3. Estilo (O-39, vault §8)

- Conforme as escolhas de desenho.

### 4. Promessas e ordem de Tab (O-42, observação 3 do review065)

- Conforme as escolhas de desenho.

### 5. O gate renderizado

- `onboarding-demonstracao-da-ia` e `onboarding-tom-da-ia` entram em `ONBOARDING_ROUTES`, e a segunda conta ganha serviço e disponibilidade, conforme as escolhas de desenho. As outras treze rotas continuam, com o mesmo `contentMarker`.
- Se uma medida reprovar (largura, toque, contraste, foco ou movimento), o Developer corrige a tela, sem desligar medida. Isso vale também para uma rota antiga que passe a reprovar porque a conta agora tem serviço e horário: por exemplo, `servico-nome` e `horarios` preenchidos.
- Cada opção de estilo, o "Continuar com…" e os dois botões da introdução são alvos de toque e precisam de pelo menos 24 px.
- A conversa da demonstração e as três amostras cabem em 360 px sem rolagem horizontal.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `68bc370`. Os testes ficam em `apps/frontend/tests/goal079-*.test.ts(x)` (jsdom), com o serviço de dados dublado como nos testes do Goal065 e do Goal072. Os testes com tempo usam relógio falso do Vitest. Os testes com preferência de movimento dublam `window.matchMedia`.

1. **Boas-vindas.** Sem `reduce`, no primeiro quadro só a mensagem da cliente está presente. Depois de 3,5 s, estão presentes a resposta e as três linhas da agenda, com "Ana Paula · Corte" em 15:30. Com `reduce`, tudo está presente no primeiro quadro. "Começar" está habilitado no primeiro quadro nos dois casos. A `figure` mantém `role="img"` e o `aria-label`.
2. **Sequência da demonstração.** Sem `reduce`, no primeiro quadro há uma mensagem e nenhum "Continuar". Depois de 12 s, há todas as mensagens, os três eventos e o "Continuar". Com `reduce`, tudo e o "Continuar" estão presentes no primeiro quadro. A conversa tem `role="log"`. O aviso "Demonstração simulada…" não existe mais.
3. **Conversa da demonstração.** Com "Corte feminino", `FIXED` 90, 45 min, só sexta, 14:00–18:00, e o relógio em quarta-feira 2026-09-30 no fuso `America/Sao_Paulo`, a tela mostra:
   - "Serviço identificado · Corte feminino";
   - o preço formatado e "45 min";
   - "Agenda consultada · 3 horários livres na sexta";
   - "14h, 15h30 ou 17h";
   - "sexta-feira, 2 de outubro, às 15h30";
   - "Agendamento simulado · nada foi marcado".

   Os eventos não são `message-meta` sob um balão. Nenhuma chamada de escrita sai durante a demonstração.
4. **Casos-limite do cálculo**, direto na função pura:
   - um candidato só (240 min em 14:00–18:00) dá "14h" e o singular "1 horário livre";
   - dois candidatos dão os dois;
   - o dia personalizado em `dayHours` vence o intervalo-base;
   - com hoje sendo dia de atendimento, a data é a próxima ocorrência depois de hoje;
   - `ON_REQUEST` responde "sob consulta" e `STARTING_AT` responde "a partir de".
5. **Estilo.**
   - O `h1` é "Gostou da forma como a IA conversou?".
   - As três opções têm o descritor e a amostra, e a amostra traz o nome e o preço do serviço do rascunho.
   - Com `tone` nulo, "Equilibrada" tem `aria-pressed="true"`, o selo "recomendada" e o CTA "Continuar com Equilibrada". Enviar grava `ai.tone: "BALANCED"`.
   - Tocar "Profissional" muda o CTA para "Continuar com Profissional", e enviar grava `PROFESSIONAL`.
   - Com `CASUAL` gravado, "Descontraída" vem selecionada.
   - Nenhum `h1`–`h6` fica dentro de `<button>`.
6. **Promessas.** São quatro itens, na ordem do protótipo. Cada um tem um ícone `aria-hidden`, e os quatro ícones são diferentes entre si e diferentes de `check`. As palavras-chave estão em `<strong>`: "pessoal ou profissional", "normalmente", "você responde" e "quem a IA nunca responde". "Só um número por negócio." continua presente.
7. **Ordem.** Na introdução, "Conectar meu WhatsApp" precede "Fazer isso depois" no DOM. Nenhuma regra de `atendly.css` cujo seletor contenha `.onboarding-actions` declara `row-reverse`, `column-reverse` ou `order`: o teste lê o arquivo, no padrão de `goal072-icon-sprite.test.ts`.
8. **Rotas do gate.** `ONBOARDING_ROUTES` contém `/onboarding/demonstracao-da-ia` e `/onboarding/tom-da-ia`. O `contentMarker` de cada uma é igual ao título da etapa em `onboardingScenarios`. As treze rotas da baseline continuam presentes.

Os testes existentes continuam passando. Só muda asserção que dependa de composição trocada aqui: por exemplo, o título "Como a IA deve conversar?", a oferta de um horário, as cinco promessas com ✓ e o aviso "Demonstração simulada…", nos testes dos Goals 018, 019, 065, 066 e 072. O relatório lista cada asserção mudada, com o motivo, e diz qual teste a substitui. As asserções de gravação, de guarda de demonstração sem serviço, de ausência de escrita na demonstração, de axe e de reachability não podem ser apagadas; podem mudar de seletor.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório, com a rodada de origem de cada um:

1. A Boas-vindas ignora `reduce` e anima sempre: o teste 1 reprova.
2. O "Continuar" da demonstração aparece desde o primeiro quadro: o teste 2 reprova.
3. A demonstração oferece só o primeiro candidato: o teste 3 reprova.
4. O dia personalizado deixa de vencer o intervalo-base: o teste 4 reprova.
5. O tom nulo deixa de pré-selecionar "Equilibrada": o teste 5 reprova.
6. Uma promessa perde o `<strong>`: o teste 6 reprova.
7. O `row-reverse` volta à linha da introdução: o teste 7 reprova.
8. `onboarding-tom-da-ia` sai de `ONBOARDING_ROUTES`: o teste 8 reprova.

### 8. Documentação

No mesmo diff:

- [DECISIONS](../DECISIONS.md) ganha **D-095** em `PROPOSED`, no formato de D-085 a D-094. Ela diz:
  - a Boas-vindas animada, que não espera a animação para oferecer "Começar";
  - a demonstração em sequência, com o CTA só no fim, o cálculo do dia e dos horários a partir do rascunho, os eventos dentro da conversa, a ausência de leitura da agenda real e de escrita, e o `role="log"`;
  - o estilo com amostra, o padrão Equilibrada do vault e o CTA com o nome do estilo; a amostra é prévia do frontend;
  - as quatro promessas e a ordem de Tab igual à visual;
  - as duas rotas novas do gate e o terceiro `PATCH` da segunda conta;
  - `prefers-reduced-motion` abrindo cada tela no estado final.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§56**, sem reescrever §4 a §55. Registra O-36, O-37, O-39, O-42 e a parte animada de O-01 corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as duas rotas novas do gate, a conferência humana pendente e as contagens da execução final.
- `apps/frontend/AGENTS.md` é atualizado **só** se alguma frase dele sobre a segunda conta do gate ou sobre as rotas do onboarding ficar falsa.
- O docblock de `WelcomeStepBody` e o comentário de `.onboarding-welcome-scene` deixam de dizer que a versão animada é do Goal072.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), o Product Vault e `docs/design-reference/` não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Ela protege §4–§55 e as decisões aceitas; **o texto ainda não aceito deste Goal é reescrito no lugar** quando fica falso, e não corrigido por nota acrescentada.

**Ordem obrigatória, a mesma dos Goals065 a 072:**

1. Recontar a baseline e rodar o vermelho da baseline.
2. Fazer a última edição de código.
3. Rodar a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`.
4. Rodar os oito controles do §7.
5. Escrever a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Se alguma edição de código acontecer depois dos controles, os controles e a execução final são refeitos e a prosa é reescrita no lugar. **Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.** Quando o review pede um teste como evidência, o teste entra na mesma rodada, mesmo que mude a contagem (rodada 2 do review072). O relatório de cada rodada de correção lista cada blocker recebido e diz, para cada um, o que foi feito no código, o que foi feito na evidência e o que ficou faltando. Antes de entregar uma rodada de correção, rode um grep, nos documentos do §8, de cada frase que o review apontou como falsa, e cole o resultado vazio no relatório.

### 9. O que só uma pessoa confere

- Que a Boas-vindas, a demonstração, o estilo e a introdução do WhatsApp, percorridos num aparelho real nas cinco larguras, batem com os protótipos do Objetivo.
- Que o ritmo da demonstração (cerca de 10 s) e o da Boas-vindas (cerca de 3 s) leem bem, e que o "pop" da amostra, se entrar, não incomoda.
- Que as amostras soam como cada tom.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal. Nenhum teste é declarado como prova de fidelidade visual.

### 10. O que este Goal não pode fazer

- Só toca `apps/frontend/`, `seedOnboardingAccount` em `scripts/goal033-authenticated-ui-rehearsal.mjs` e os documentos do §8. Não toca `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/`, `packages/public-api-contract/`, `tools/ia-loop/`, outras funções de `scripts/`, `docs/product-vault/`, `docs/design-reference/` nem `QA_LOCAL_REVIEW.md`.
- Nenhuma migration, nenhuma rota, nenhuma mudança de contrato.
- `e2e/routes.ts` muda só por acréscimo das duas entradas. Não muda configuração de teste nem de build: `vitest.config.*`, `playwright.config.*`, `next.config.ts`, `e2e/measure.ts` e `e2e/authenticated-matrix.spec.ts` ficam como estão.
- **Falha de gate por ambiente** (memória, contenção, porta, rede, a tela "Verificando seu acesso" que some na retentativa) é reexecutada ou reportada, nunca corrigida editando configuração (rodada 3 do review073, rodada 2 do review077, observação 1 do review072).
- Unidade `SKIPPED` por falta de `*_TEST_DATABASE_URL` é pré-condição do harness, não falha a corrigir no diff.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`;
  - nenhuma espera, `timeout` ou atraso acrescentado ao spec para "deixar a animação terminar".
- Não remove teste, não pula teste e não encolhe suíte.
- Não muda a ordem das etapas, e não muda o que cada etapa grava além do padrão `BALANCED` com tom nulo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. A Boas-vindas anima mensagem → resposta → horário em até 3,5 s, com "Começar" disponível desde o início, e abre no estado final com `reduce`. Provado pelo teste jsdom §6.1.
2. A demonstração entra item a item com o "Continuar" só no fim, e abre inteira com `reduce`. Provado pelo teste jsdom §6.2.
3. A conversa usa o serviço, o preço, a duração, o dia e até três horários do rascunho, com os eventos dentro da conversa e sem escrita. Provado pelos testes jsdom §6.3 e §6.4.
4. O estilo tem o título do vault, a amostra em cada tom, Equilibrada pré-marcada e recomendada, e o CTA com o nome do estilo, gravando o escolhido. Provado pelo teste jsdom §6.5.
5. As quatro promessas têm ícone próprio e ênfase, e a ordem de Tab da introdução é a visual. Provado pelos testes jsdom §6.6 e §6.7.
6. `demonstracao-da-ia` e `tom-da-ia` estão em `ONBOARDING_ROUTES`, e a segunda conta tem serviço e horário. Provado pelo teste §6.8 e pelo gate autenticado.
7. Largura, toque, contraste, foco e movimento de todas as etapas do onboarding, inclusive as duas novas, são decididos pelo gate autenticado dentro de `validate:integration`, com **0** retentativas. Os das rotas públicas são decididos por `validate:ui`. A fidelidade ao protótipo não é provada por teste; fica no §9.
8. Os oito controles negativos do §7 reprovam com o defeito e passam sem ele. Eles rodam depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck e lint de `apps/frontend` passam. `test:frontend` não tem teste a menos que a recontagem da baseline (referência: **116**/**1189**), e `test:gate` não tem teste a menos que **233**. `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos os **160** testes da baseline mais as duas rotas novas nas cinco larguras, e **0** retentativas. O relatório diz o total, e o número esperado é **170**. Provado por execução.
10. D-095 em `PROPOSED`, FINAL_AUDIT §56, CURRENT_STATE e VALIDATION_GATE foram escritos depois da execução final e dos controles. Eles trazem as contagens da execução final e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só arquivos de `apps/frontend/`, `scripts/goal033-authenticated-ui-rehearsal.mjs` e os documentos do §8, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que o onboarding bate com os protótipos aprovados, o que depende de conferência humana;
- que as amostras de estilo são o que o modelo de fato escreve em cada tom (a amostra é prévia do frontend);
- a busca por CEP, pendente de decisão humana.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Boas-vindas animada, promessas e ordem de Tab, com os testes §6.1, §6.6 e §6.7 (§1, §4) |
| WU-02 | STANDARD | WU-01 | Demonstração: cálculo puro do dia e dos horários, sequência, eventos, CTA no fim e `reduce`, com os testes §6.2 a §6.4 (§2) |
| WU-03 | STANDARD | WU-02 | Estilo: título, amostras, padrão Equilibrada e CTA com o nome, com o teste §6.5 (§3) |
| WU-04 | STANDARD | WU-03 | Gate: duas entradas em `ONBOARDING_ROUTES` e o terceiro `PATCH` da segunda conta, com o teste §6.8 (§5) |
| WU-05 | DETERMINISTIC | WU-04 | typecheck de `apps/frontend` |
| WU-06 | DETERMINISTIC | WU-04 | lint de `apps/frontend` |
| WU-07 | DETERMINISTIC | WU-04 | testes dirigidos de `apps/frontend` com o filtro `goal079` |
| WU-08 | DETERMINISTIC | WU-04 | testes dirigidos de `apps/frontend` com o filtro `goal065-onboarding` |
| WU-09 | DETERMINISTIC | WU-04 | testes dirigidos de `apps/frontend` com o filtro `goal072` |
| WU-10 | DETERMINISTIC | WU-05…WU-09 | validate-core |
| WU-11…WU-13 | DETERMINISTIC | WU-10 | gate-tests, validate-ui e validate-integration |
| WU-14 | STANDARD | WU-11, WU-12, WU-13 | Controles negativos (§7) e documentação (§8), depois da execução final |
| WU-15 | DETERMINISTIC | WU-14 | git-diff-check final |

Cada unidade de testes dirigidos leva um único filtro de arquivo do Vitest, sem alternância nem expressão regular.

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar num passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, sem editar configuração.
