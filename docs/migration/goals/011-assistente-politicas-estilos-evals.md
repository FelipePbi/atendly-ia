# Goal 011 — Assistente: políticas de conversa, três estilos e evals

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-12 pelo Tech Lead Agent após [Goal010 ACCEPTED](../reviews/010-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `84f079576489f1bbca0999ae1079c95e5f159b66`

Goal anterior: 010 — Importação única do Minha Agenda e corte do writer remoto

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal010 já integrado em `main` (origem `eb5d684e7fd3b96c7d45ca3cd17c3af1be711c1a`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fazer o assistente **respeitar, de forma verificável, as regras de conversa do produto e as invariantes que os Goals 004–010 já garantem no domínio**. O comportamento da IA hoje depende quase inteiramente do texto do prompt: o estilo tem dois valores em vez dos três do produto, o prompt manda respeitar uma "persona" que a regra de produto proíbe, o erro de infraestrutura chega cru ao modelo e pode virar mensagem para o cliente, o rascunho substituído continua segurando o horário anterior até o hold vencer e não existe nenhuma suíte que prove qualquer dessas políticas. Este Goal fecha G-21: estilo como **dado do negócio** com três valores, prompt versionado e sem personagem, confirmação explícita exigida por código e não por texto, exceção/desconto/abuso com caminho determinístico, vocabulário de erro de domínio separado do erro de infraestrutura, e uma suíte de **evals determinística** — com modelo dublê, sem rede e sem chave de API — no `validate:core`.

O que este Goal **não** faz: conhecimento, memória e sugestão de resposta ao humano são do Goal012; áudio, imagem e documento são do Goal013; a tela de conversa é do Goal017; a jornada de onboarding e a ativação são do Goal018; lembretes são do Goal020. Não há novo serviço, novo provider de modelo, novo framework nem mudança de fronteira entre apps. Nenhum aceite de 001–010 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (IA consome o núcleo operacional por tool e nunca escreve agenda por fora); D-005, D-006, D-009, D-011, D-021, D-023, D-024, D-025 e D-026 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 005, 006, 007, 008, 009 e 010 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e dos apps tocados. Consultar seletivamente no Product Vault apenas [IA e Conversas](../../product-vault/01-Regras/03-IA-e-Conversas.md), [Fluxos de Agendamento](../../product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md) e [Handoff e Atendimento Humano](../../product-vault/02-Fluxos/04-Handoff-e-Atendimento-Humano.md). Não abrir o vault inteiro; conhecimento e FAQ são do 012, mídia do 013.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-21 é o alvo deste Goal; G-23 e G-24 ficam explicitamente fora. [CURRENT_STATE](../CURRENT_STATE.md): seções de IA e conversa. [Review007](../reviews/007-review.md), [review008](../reviews/008-review.md), [review009](../reviews/009-review.md) e [review010](../reviews/010-review.md): resíduos direcionados ao 011.
- Usar Graphify apenas para confirmar os consumers de `AiTone`/`tone`, de `buildSystemPrompt`, de `graphToolFailure` e de `setPendingAction`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- O estilo é um enum de **dois** valores (`PROFESSIONAL_OBJECTIVE`, `LIGHT_CLOSE`) replicado em `apps/ai-orchestrator/prisma/schema.prisma` (`AiTone`, default `LIGHT_CLOSE`), `apps/bff/prisma/schema.prisma` (`AiTone`), `apps/bff/src/modules/settings/routes.ts`, `apps/bff/src/modules/onboarding/routes.ts`, `apps/bff/src/modules/whatsapp/routes.ts`, `apps/ai-orchestrator/src/modules/internal/routes.ts` (projeção `aiTenantConfigSchema`), `graph-state.ts`, `graph-runtime.ts`, `ChannelConnectionService.ts`, `tenant-config/ai-settings.ts`, `apps/frontend/src/data/mappers/publicApiSchemas.ts` e nas telas legadas de settings e onboarding.
- `prompts/response.ts` instrui "Respeite a persona configurada na Atendente Virtual" e "Use emoji somente conforme a persona" — contra a regra de produto de IA **sem** personagem próprio.
- `prompts/system.ts` monta o prompt por concatenação e carimba `env.AI_PROMPT_VERSION` (`scheduling_v1.0.0`), uma string de ambiente sem relação verificável com o conteúdo do prompt; `assistant.service.ts` grava essa string em cada log de decisão.
- `graphToolFailure` (`assistant.service.ts`) devolve ao modelo `{ code: "TOOL_EXECUTION_FAILED", message: toErrorMessage(error) }`, e o `SchedulingClient` produz mensagens como "Scheduling Service authentication is not configured." e "Trusted scheduling context is required." — texto de infraestrutura dentro do contexto do modelo.
- `message-graph.ts` já tem o guard antes de tool com efeito (Goal005) e um `processingErrorReply` genérico com handoff; esse caminho continua válido e não deve ser enfraquecido.
- `assistant-tools.ts` já implementa `prepare`/`confirm` com hold para agendamento, remarcação e série (Goals 008 e 009), mas `setPendingAction` **sobrescreve** o rascunho anterior sem liberar o hold que ele segurava e `clearPendingAction` o remove sem liberar hold; `SchedulingClient.releaseHold` já existe e hoje só é usado no caminho de série.
- `/internal/services` do Scheduling devolve `recurrenceIntervalDays`, mas o `serviceSchema`/`toService` da IA descarta o campo, então `list_services` não tem como oferecer recorrência.
- O padrão de suíte com modelo dublê já existe em `tests/assistant/assistant.service.test.ts` (`modelProvider = { invoke: vi.fn() }`), e o padrão de asserção por alcance de tool existe em `tests/tools/import-out-of-reach.test.ts` (Goal010).

## Pontos de implementação

- IA: `prisma/schema.prisma` e migration aditiva (valores novos do enum de estilo, backfill, default); `src/modules/tenant-config/ai-settings.ts`; `src/modules/prompts/` (`system.ts`, `response.ts`, `handoff.ts`, `scheduling.ts` e um módulo novo de estilo); `src/modules/assistant/assistant.service.ts` (saudação por estilo, `graphToolFailure`, versão efetiva do prompt); `src/modules/graph/message-graph.ts`, `graph-state.ts`, `graph-runtime.ts`; `src/modules/tools/assistant-tools.ts` (hold do rascunho, recorrência ofertável, confirmação explícita); `src/modules/scheduling-service/client.ts` e `types.ts`; `src/modules/internal/routes.ts`; `src/modules/channel/ChannelConnectionService.ts`; `src/lib/errors.ts`.
- BFF: `prisma/schema.prisma` e migration aditiva; `src/modules/settings/routes.ts`, `src/modules/onboarding/routes.ts`, `src/modules/whatsapp/routes.ts`, `apps/bff/PUBLIC_API_V1.md`.
- Frontend: `src/data/mappers/publicApiSchemas.ts`, serviços de dados afetados e o mínimo das telas legadas de settings/onboarding para não oferecer valor que o backend recusa; a UI definitiva é dos Goals 014–018.
- Gates: suíte nova de evals na IA dentro de `test:ai-orchestrator`; ensaio `scripts/goal011-ai-style-migration-rehearsal.mjs` e seu passo em `scripts/validate-integration.mjs`, com teste em `scripts/tests/`.
- Resíduos absorvidos, no mesmo diff: liberar o hold do rascunho substituído (review008 e review009); permitir que a IA **ofereça** recorrência a partir do intervalo de referência do serviço, sem criar nada por iniciativa própria (review007 e review009); normalizar os dois erros de lint pré-existentes (`apps/scheduling-service/src/modules/appointments/appointment-series-service.ts`, `apps/frontend/src/data/services/BffCalendarService.ts`) e os finais de linha dos dois arquivos do frontend apontados no review010.

## Escopo obrigatório

### 1. Estilo de conversa como dado do negócio, com três valores

Os três estilos do produto — profissional, equilibrado (**default**) e descontraído — passam a existir como valor de configuração do negócio, não como texto solto no prompt. A migração é **aditiva e em dois bancos** (IA e BFF): valores novos acrescentados com `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, backfill determinístico das linhas existentes (o "profissional e objetiva" de hoje vira profissional; o "leve e próxima", que é o default atual, vira equilibrado) e default do banco apontando para o equilibrado. Nenhuma linha existente é apagada; os valores antigos continuam **legíveis** e aceitos na entrada como alias declarado até o Goal024, e a saída passa a usar sempre o vocabulário novo. Estilo influencia registro, emoji e informalidade — **nunca** quantidade de mensagens, conteúdo factual, agressividade comercial ou qualquer regra de agenda: isso é critério de aceite, não recomendação.

### 2. Prompt sem persona, versionado e verificável

O prompt deixa de mandar respeitar "a persona configurada": a IA representa o negócio, não recebe nome nem personagem, não finge ser uma pessoa específica e, quando perguntada diretamente se é humana, responde com transparência que é a assistente virtual do negócio. A versão do prompt deixa de ser uma string de ambiente sem relação com o conteúdo: a montagem passa a ser determinística por estilo e a versão efetiva é **derivada e verificável** — uma suíte falha quando o conteúdo do prompt muda sem que a versão mude. A versão efetiva e o estilo usados continuam registrados no log de decisão de cada turno (`promptVersion` já existe) e não podem divergir do prompt realmente enviado.

### 3. Condução da conversa: ambiguidade, data vaga e mudança de assunto

Regra de produto aplicada por código onde é possível aplicar por código, e coberta por eval onde depende do modelo: cumprimento genérico de contato novo é acolhido sem oferecer serviço nem agenda (já vigente, preservar); serviço não identificado não gera consulta de disponibilidade genérica; múltiplos serviços possíveis sem contexto forte geram pergunta e não escolha silenciosa; referência vaga de data ("de manhã", "sexta", "dia 15") só chega às tools como data e horário **absolutos**, e o resumo de confirmação enunciado à cliente contém serviços, data, horário de início, horário de fim e valor total quando existirem; pergunta secundária no meio de um agendamento é respondida sem destruir o rascunho em andamento. Nenhuma dessas regras pode ser implementada inventando dado: sem informação real, a IA pergunta ou declara indisponibilidade.

### 4. Confirmação explícita exigida por código

`prepare` e `confirm` deixam de depender apenas do texto do prompt. Toda tool com efeito (criar, remarcar, cancelar, confirmar série) só executa sobre um rascunho **preparado em turno anterior**: preparar e confirmar dentro do mesmo turno de entrada é recusado com erro próprio e identificável, porque significa confirmar sem ter perguntado. O guard antes de efeito do Goal005 (humano assumiu, contato ignorado, cliente falou de novo) continua valendo e não é enfraquecido. A IA nunca cria encaixe, override, exceção, bloqueio ou desconto: a ausência desse caminho é provada por asserção de alcance de tool, no padrão do Goal010, e não por leitura do prompt. Pedido de exceção ou negociação de preço, ameaça e assédio persistente levam a `request_human_handoff`; irritação com pedido claro e resolvível **não** gera handoff automático.

### 5. Erro de domínio versus erro de infraestrutura

Passa a existir um vocabulário de erro que o modelo pode ver e, quando fizer sentido, traduzir para a cliente — horário indisponível, hold vencido, identidade ambígua, serviço inexistente, fora da janela de oferta — separado do erro de infraestrutura, que **não** entra no contexto do modelo nem em mensagem de cliente: falha de autenticação interna, timeout, indisponibilidade de serviço, erro de banco, URL, host, token, stack ou nome de serviço interno. O erro de infraestrutura vira um único código opaco para o modelo, com o detalhe real indo apenas para o log com `requestId`/`aiRunId`, e o turno termina com a mensagem genérica e o handoff já existentes. Nenhum segredo, credencial ou identificador interno aparece em mensagem enviada.

### 6. Rascunho, hold e recorrência ofertável

Substituir ou descartar um rascunho **libera** o hold que ele segurava, no mesmo caminho que grava o novo estado: propor outro horário, cancelar a intenção ou confirmar um rascunho diferente não pode deixar o horário anterior ocupado até o TTL vencer. Falha ao liberar não derruba a conversa, mas é registrada e não é silenciosa. A IA passa a **poder oferecer** recorrência quando o serviço tem intervalo de referência cadastrado (Goal007): o campo chega à IA e aparece nas tools de catálogo; oferecer não é criar — a série continua exigindo preparação com hold por ocorrência e confirmação global explícita (Goal009). Nada de follow-up automático quando a cliente some; quando ela volta e aceita uma opção antiga, a disponibilidade é consultada de novo antes de confirmar.

### 7. Evals determinísticos no gate

Uma suíte de evals com **modelo dublê** — sem rede, sem chave de API, sem custo — replica transcrições fixas e verifica as políticas acima: saudação genérica, serviço ambíguo, data vaga resolvida antes da confirmação, confirmação exigida antes do efeito, pergunta secundária sem perder o rascunho, pedido de desconto e pedido de encaixe levando a handoff, irritação sem handoff, pergunta "você é robô?" respondida com transparência, erro de infraestrutura sem vazamento e os três estilos produzindo a mesma decisão operacional com registro diferente. Cada caso declara o que prova; um eval que continua passando com o comportamento revertido não conta. A suíte roda em `test:ai-orchestrator`, dentro do `validate:core`, e sua ausência de rede é verificável.

### 8. Contratos

BFF: settings e onboarding aceitam os três estilos, continuam aceitando os dois valores antigos como alias declarado e sempre respondem com o vocabulário novo; a projeção enviada à IA carrega o estilo vigente; `PUBLIC_API_V1.md` atualizado; testes de integração do BFF para entrada antiga e nova. IA: a projeção interna (`aiTenantConfigSchema`) aceita os três valores e o legado, com default explícito. Frontend: schemas decodificam respostas antigas e novas, com teste de schema, e as telas legadas não oferecem valor que o backend recusa. `packages/contracts` continua por consumidor comprovado (D-011).

## Migração, compatibilidade e limites operacionais

- Migrations **aditivas** nos dois bancos, em passos separados quando o PostgreSQL exigir (valor de enum novo não é usável na mesma transação em que é criado): acrescentar valores, backfill das linhas existentes, então mover o default. Nenhuma linha apagada ou reescrita além do backfill declarado; divergência com o Prisma documentada no cabeçalho da migration, como nos Goals 005–010.
- Ensaio em banco descartável no padrão `scripts/goal010-migration-rehearsal.mjs`: fixture com tenants nos dois valores antigos, provando backfill linha a linha, default novo, leitura das linhas legadas, repetição sem mudança de estado e contagens que excluem sondas.
- Reversão: o binário anterior continua funcionando enquanto nenhum tenant estiver no estilo descontraído — esse valor não existe no vocabulário antigo e seria lido como desconhecido. Registrar o limite em DATA_MIGRATION.
- Sem WhatsApp real, sem chamada real de modelo em teste, sem deploy, sem credenciais reais em fixtures, sem commits pelo executor, sem push/merge/PR e sem alteração de provider ou framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018). Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras, registrar evidência e devolver a decisão ao Tech Lead.

## Testes e critérios de aceite

1. Estilo ponta a ponta: os três valores existem do frontend ao prompt; tenant legado em cada um dos dois valores antigos é lido sem erro e projetado no valor novo correspondente; entrada com valor antigo é aceita e normalizada; valor desconhecido é recusado com erro próprio; negócio sem configuração fica no equilibrado.
2. Estilo não muda decisão: para a mesma transcrição, os três estilos produzem a **mesma** sequência de tools, o mesmo rascunho e o mesmo resultado operacional; o que muda é registro, emoji e informalidade. Provado por eval com modelo dublê.
3. Persona: nenhum caminho do prompt manda respeitar persona, nome ou personagem; perguntada se é humana, a IA se identifica como assistente virtual do negócio. Asserção sobre o prompt **montado**, não apenas sobre o arquivo-fonte.
4. Versão do prompt: alterar o conteúdo do prompt sem alterar a versão faz a suíte falhar; a versão registrada no log de decisão é a do prompt efetivamente enviado, inclusive por estilo.
5. Confirmação explícita: preparar e confirmar no mesmo turno é recusado com erro próprio; confirmar sem rascunho é recusado; o guard do Goal005 continua bloqueando efeito sobre contexto vencido, com RED provado por mutação temporária.
6. Sem caminho de exceção: nenhuma tool permite encaixe, override de disponibilidade, alteração de preço ou desconto, provado por asserção de alcance que falha se o gateway for chamado e que conta os alcances para não ser vácuo; pedido de desconto e pedido de encaixe terminam em handoff; irritação com pedido claro e resolvível não gera handoff.
7. Erro de infraestrutura: falha de autenticação interna, timeout e 5xx do Scheduling não colocam texto de infraestrutura no contexto do modelo nem em mensagem enviada; o detalhe real aparece no log com `requestId`/`aiRunId`; erro de domínio continua chegando ao modelo com código próprio e permite oferecer alternativa.
8. Hold do rascunho: propor o horário B depois do A libera o hold de A; descartar a intenção libera o hold; confirmar B não deixa A ocupado; falha ao liberar não derruba o turno e é registrada. Provado contra PostgreSQL, olhando o estado do hold no banco.
9. Recorrência ofertável: serviço com intervalo de referência chega à IA e é ofertável; oferecer não cria nada; a série continua exigindo hold por ocorrência e confirmação global; sem intervalo cadastrado a IA não inventa cadência.
10. Data e ambiguidade: referência vaga nunca chega às tools sem data e horário absolutos; múltiplos serviços possíveis geram pergunta; o resumo de confirmação contém serviços, data, início, fim e total quando existirem; pergunta secundária não apaga o rascunho.
11. Isolamento e regressão: estilo e configuração de um negócio não afetam outro; as suítes de sessão, controle humano, inbox, outbox e importação continuam verdes, sem alteração de expectativa que não esteja justificada no relatório.
12. Ensaio das migrations em base nova e em fixture legada, com backfill, default e leitura do legado provados e repetição sem mudança de estado; auditoria estática verde; nenhum segredo no output.
13. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam; a suíte de evals está no `validate:core` e não abre rede; o ensaio novo está no `validate:integration`; skips explícitos do 002 mantidos; os dois erros de lint pré-existentes e os finais de linha apontados no review010 ficam normalizados.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo (nomes dos três valores de estilo e mapa de backfill, forma da versão derivada do prompt, fronteira exata entre erro de domínio e de infraestrutura, ponto onde o hold é liberado, formato dos casos de eval), migrations e compatibilidade, RED/GREEN dos casos negativos (persona no prompt, prepare e confirm no mesmo turno, mensagem de infraestrutura vazando para a cliente, hold do rascunho substituído continuando ocupado, estilo mudando decisão operacional, série criada sem confirmação global), comandos/resultados e limitações. Atualizar somente contratos e documentos afetados e registrar G-21 conforme evidência, sem alegar fechamento de G-23 ou G-24 nem prova de qualidade de modelo real que não foi feita. Goal011 termina IMPLEMENTED/REVIEW_REQUIRED até review do Tech Lead.

O review de 011 deve usar profundidade **DEEP dirigido** — migração do estilo nos dois bancos e nos consumers, prompt sem persona com versão verificável, confirmação explícita por código, fronteira entre erro de domínio e de infraestrutura, liberação do hold do rascunho e honestidade dos evals — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal012 permanece condicionado ao aceite011 e ao commit de fechamento011, cujo SHA será sua baseline aceita. Não gerar prompts de 012 ou posteriores.
