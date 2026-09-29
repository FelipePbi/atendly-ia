# Registro de decisões

Baseline factual do Goal0 `5fb5d51`; primeira versão em 2026-09-05, última atualização em 2026-09-06. `ACCEPTED` identifica restrição autorizada ou decisão técnica aceita em review identificado. Novas direções sem review permanecem `PROPOSED`; não são decisões do usuário presumidas. Somente questões de produto/custo sem fonte vigente exigem resposta específica do usuário.

## D-001 — Autoridade e escopo

**Status:** ACCEPTED.

**Contexto:** produto, protótipo e runtime divergem. **Decisão:** vault soberano; design orienta visual subordinado; Agenda Atendly única; importação única; um MVP; Goal0 somente documentos e só Goal001 detalhado. **Alternativas:** copiar legado/design como regra — rejeitadas. **Motivo:** instrução expressa do usuário. **Consequências:** documentação descreve dívida sem propagar regra substituída; implementação cabe ao Claude. **Revisar se:** usuário atualizar decisão de produto/escopo.

## D-002 — Preservar fronteiras físicas principais

**Status:** PROPOSED.

**Contexto:** BFF, Scheduling, IA e Evolution já têm consumers claros; locks/FKs/gateway úteis. **Decisão:** manter seis aplicações existentes, tecnologias e ownership lógico; agrupar clientes/catálogo/agenda/importação dentro de Scheduling. **Alternativas:** monólito único, bancos unificados, microserviços por entidade. **Motivo:** custo e risco de migração menores; nenhum problema observado exige essas mudanças. **Consequências:** HTTP/outbox entre donos, sem joins cross-database; BFF mantém módulos de plataforma. **Revisar se:** métricas e manutenção demonstrarem que uma fronteira é desnecessária ou inviável.

## D-003 — Autorização de instância vem antes da migração

**Status:** ACCEPTED em 2026-09-05 pelo Astra no [review001](reviews/001-review.md), para o diff identificado sobre HEAD4ca1301, sem commit/deploy. Testes reais de autorização passaram e o comportamento anterior foi reproduzido com os mesmos testes na baseline. Não aceita por extensão toda a superfície de autenticação do Go.

**Contexto:** advanced-settings autentica A e usa ID arbitrário. **Decisão:** token de instância acessa apenas seu alvo; 401 sem contexto válido, 403 para alvo diferente, antes de service/DB; sem mudar rotas administrativas. **Alternativas:** ocultar UI, confiar em UUID, migrar tudo para chave admin — rejeitadas. **Motivo:** falha de autorização confirmada, correção pequena e independente. **Consequências:** consumidores incorretos passam a falhar; contratos legítimos mantidos. **Revisar se:** aparecer contrato administrativo real que precise de outra rota explícita, sem ampliar acesso destas duas.

## D-004 — Tenant canônico e credencial restrita

**Status:** ACCEPTED em 2026-09-07 pelo Tech Lead Agent no [review003](reviews/003-review.md), para o diff aceito sobre a base `99a7210`, sem commit/deploy. Os contratos concretos adotados estão em D-019; multiusuário e novo número continuam fora do MVP.

**Contexto:** BFF conhece User/Tenant; WA BFF por user e IA por tenant; tokens globais e raw ampliam confiança. **Decisão:** tenant BFF canônico, instância vinculada ao negócio, FKs/scoping, credenciais por chamador/escopo, contexto interno autenticado; guardar segredos cifrados/versionados e fora de eventos persistidos. **Alternativas:** tenant enviado pelo browser, telefone como tenant, novo auth provider. **Motivo:** alinhar vínculo existente sem arquitetura nova. **Consequências:** inventário e rollout de tokens com compatibilidade; no Go apenas autorização de transporte, sem lógica de tenant de produto. **Revisar se:** novo número/multiusuário for aprovado fora deste MVP.

## D-005 — Identidade da pessoa independe do telefone

**Status:** ACCEPTED em 2026-09-08 pelo Tech Lead Agent no [review006](reviews/006-review.md), para o diff aceito sobre a base `8acd4c6`, sem commit/deploy. Os contratos concretos adotados estão em D-022. Regra de produto já vigente antes da implementação.

**Contexto:** unique por número/upsert pode renomear pessoa. **Decisão:** Customer no Scheduling por ID; telefone opcional/não exclusivo; Contact na IA é canal; referências/mapeamentos não fundem pessoas. **Alternativas:** ID=phone, heurística de merge. **Motivo:** manual sem telefone e familiares no mesmo número. **Consequências:** migrar tools/busca/importação antes de retirar índice; ambiguidade exige confirmação. **Revisar se:** nova modelagem de contato vier de evidência de uso, preservando identidade.

## D-006 — Transação de agenda e ledger de efeito

**Status:** ACCEPTED em 2026-09-09 pelo Tech Lead Agent no [review008](reviews/008-review.md), para o diff aceito sobre a base `26593db`, sem commit/deploy. Os contratos concretos adotados estão em D-024. Implementada em `apps/scheduling-service/src/modules/calendar/write-policy.ts`, que passou a ser o único caminho de escrita da agenda: confirmar, remarcar, cancelar, criar e remover bloqueio e criar/consumir/liberar hold executam em transação Serializable com lock de todos os dias afetados em ordem estável, revalidação dentro da transação e retry limitado de `40001`/`40P01`/`P2034`. Efeito, resultado idempotente e evento de histórico entram no mesmo commit. Outbox de agenda não foi necessário neste Goal e permanece fora do escopo aceito. **Estendida no Goal009** ([review009](reviews/009-review.md)): exceções de disponibilidade, séries de bloqueio/compromisso e a confirmação global da série de atendimento executam sob a mesma política, travando todos os dias afetados em ordem estável; os contratos correspondentes estão em D-025.

**Contexto:** Serializable/advisory existentes não cobrem todos writers e replay é posterior. **Decisão:** mesma política de conflito para create/reschedule/hold/block/exceção, e transação guarda efeito/snapshots/histórico/idempotency result/outbox. **Alternativas:** Redis lock separado, confiar no check anterior, serializar só IA. **Motivo:** consistência local simples com PostgreSQL já usado. **Consequências:** retry limitado de serialização, lock ordering e testes DB concorrentes; override humano explícito continua possível. **Revisar se:** contenda medida justificar outro particionamento.

## D-007 — Inbox/outbox duráveis, sem promessa de exactly-once remoto

**Status:** ACCEPTED em 2026-09-07 pelo Tech Lead Agent no [review004](reviews/004-review.md), para o diff aceito sobre a base `b3a019c`, sem commit/deploy. Os contratos concretos adotados estão em D-020.

**Contexto:** ACK prematuro, dedupe antecipado e envio com resultado incerto. **Decisão:** persistir antes de ACK, processamento com lease/resultados e outbox/receipts; mensagens possuem estado pending/sent/failed/unknown. **Alternativas:** Map/goroutine fire-and-forget; repetir envio em todo timeout. **Motivo:** preservar trabalho e evidência em restart. **Consequências:** nova persistência de trabalho nos bancos donos; receipt e reconciliação para efeitos externos; Go só confiabilidade de transporte. **Revisar se:** provider documentar garantia idempotente que permita reduzir incerteza.

## D-008 — Jobs no banco do dono; health permanece monitor

**Status:** PROPOSED, com a primeira aplicação comprovada no [review008](reviews/008-review.md): o loop de conclusão automática (`appointments/auto-complete-loop.ts`) roda dentro do próprio Scheduling, com lease por `pg_try_advisory_xact_lock`, intervalo configurável, desligamento por variável e rota interna para disparo em teste; duas instâncias em paralelo não duplicam trabalho (suíte de integração do Goal008). O Health Worker continua só sondando. A decisão segue PROPOSED porque lembretes, purge e importação — o restante do escopo de jobs — ainda não foram implementados sobre esse mecanismo.

**Contexto:** lembretes, lifecycle, purge e importação precisam sobreviver a restart; monitor não possui ownership. **Decisão:** jobs/outbox PostgreSQL e loops nos serviços existentes, lease/fencing/retry/dead-letter; nenhuma fila externa ou novo serviço por default. **Alternativas:** health genérico; broker externo; biblioteca PostgreSQL. **Motivo:** transação local e menor custo operacional; comparação em TARGET_ARCHITECTURE. **Consequências:** execução contínua precisa ser comprovada; eventual biblioteca só após decisão técnica com compatibilidade transacional. **Revisar se:** volume, atraso ou carga do processo justificarem executor dedicado.

**Nota de aplicação (Goal061):** aplicada à importação no Goal061, ver D-078. Status e texto acima não mudam.

## D-009 — Política de contato/sessão fora do LLM

**Status:** ACCEPTED em 2026-09-08 pelo Tech Lead Agent no [review005](reviews/005-review.md), para o diff aceito sobre a base `8551717`, sem commit/deploy. Os contratos concretos adotados estão em D-021; o relógio de sessão é `AI_SESSION_INACTIVITY_SECONDS` (86400) por inatividade do contato.

**Contexto:** JSON do agente e timeout de pausa não implementam as abas nem Ignorar IA. **Decisão:** Contact/Session/categoria/override/humano persistidos; sessão com expiração explícita em torno de 24h, proposta técnica de nova sessão após 24h sem interação do contato. Envio humano assume; leitura não; guards antes de uso de conteúdo e antes de efeitos. **Alternativas:** pedir ao prompt que se lembre de pausar, categoria permanente do telefone. **Motivo:** privacidade e controle operacional determinísticos. **Consequências:** revalidar pending state na troca de sessão; valor exato de fronteira/inatividade é testado e reavaliado no Goal. **Revisar se:** produto especificar relógio de sessão diferente; não alterar silenciosamente.

## D-010 — Configuração desejada e aptidão efetiva distintas

**Status:** PROPOSED.

**Contexto:** BFF grava enabled e sincroniza depois; shell presume conexão; onboarding exige WA. **Decisão:** BFF dono desired/version; IA informa applied/effective; completion onboarding separado de activation test; ativar somente após mínimos/WA/teste real. **Alternativas:** booleano local como estado universal, sucesso otimista. **Motivo:** não enganar usuário sobre operação. **Consequências:** outbox/reconciliação e read model de Home/Settings; histórico completed não reabre wizard. **Revisar se:** mudanças nas regras de ativação forem aprovadas.

## D-011 — Evoluir contratos por operação

**Status:** PROPOSED.

**Contexto:** pacote de domínio vazio e Zod duplicado em consumers. **Decisão:** schemas no packages/contracts só com produtor/consumer real; campos aditivos/readers antes de valores; endpoint novo local quando incompatível; retirar cópias após adoção. **Alternativas:** V2 de toda API de uma vez, compartilhar Prisma models, alterar só placeholders. **Motivo:** compatibilidade incremental verificável. **Consequências:** versões de replay e transformação de estado pendente; build do package antes dos consumers. **Revisar se:** contrato precisar de consumidores não TS, sem perder fonte de schema.

## D-012 — Import-only e histórico incompleto explícito

**Status:** PROPOSED (agenda única e conclusão única já autorizadas).

**Contexto:** job atual faz corte operacional e normaliza perdas. **Decisão:** adapter leitor separado do core, ImportSession/items/maps/concluir único; referência de catálogo opcional apenas no histórico importado incompleto, raw status preservado, valores desconhecidos null. **Alternativas:** reusar provider operacional, inventar catálogo ou converter falta de preço em zero. **Motivo:** fidelidade e continuidade com destino já preenchido. **Consequências:** constraints/testes e reconciliação; raw temporário sanitizado, descartado ao fechar/reconciliar; credenciais cessam após conclusão. **Revisar se:** capacidade real da origem impuser outro modo de preservar dado conhecido, nunca inventá-lo.

## D-013 — Preservar fronteira frontend e substituir experiência legada

**Status:** PROPOSED.

**Contexto:** adapters/session/primitivas úteis, visual e navegação incompatíveis. **Decisão:** manter Next/features/BFF e testes de transporte; substituir tokens/shell/composições conforme Recepção, sem novo framework/UI kit/store por preferência. **Alternativas:** copiar protótipo, reescrever frontend total ou manter visual antigo. **Motivo:** fidelidade com reaproveitamento defensável. **Consequências:** Clientes principal mobile, três vistas de agenda, acessibilidade/states/motion; QA visual seletiva antes de aceitar. **Revisar se:** limitações comprovadas de componentes exigirem biblioteca adicional.

## D-014 — Retenção cobre todas as cópias

**Status:** PROPOSED.

**Contexto:** payload/runs/checkpoint/vetores e transporte podem conter conversa além de Message. **Decisão:** lifecycle e purge por dono com confirmação/recibos/tombstones; períodos do vault para comercial/pessoal, suspensão imediata de automações em exclusão; restore só com reconexão/teste. **Alternativas:** deletar só tabela Message; cascata BFF como exclusão global. **Motivo:** cumprir comportamento real de privacidade. **Consequências:** inventário dos stores/attachments/backups e gate de política para categoria não classificada; não aplicar TTL de conversa a histórico operacional. **Revisar se:** revisão jurídica operacional especificar retenção adicional, fora do escopo jurídico deste Goal.

## D-015 — Mapeamento de tons e recuperação de senha

**Status:** PROPOSED quanto à recuperação de senha; a parte de **mapeamento de tons** foi implementada e aceita no Goal011 exatamente como proposta (`PROFESSIONAL_OBJECTIVE` → profissional, `LIGHT_CLOSE` → equilibrado, sem inferir descontraída para ninguém) — ver D-027 e [review011](reviews/011-review.md).

**Contexto:** dados com dois tons e recovery real fora do escopo. **Decisão:** proposta de backfill PROFESSIONAL_OBJECTIVE→Profissional, LIGHT_CLOSE→Equilibrada, preservando original; sem inferir Descontraída. Recuperação fica visual no MVP e não anuncia envio real; backend fica isolado até checar consumo implantado. **Alternativas:** escolher estilo casual para todos, remover recuperação/dados sem inventário, manter UX fora do escopo. **Motivo:** menor alteração de intenção e respeito ao MVP. **Consequências:** leitores compatíveis, reescolha normal do estilo, retirada posterior condicionada de rotas. **Revisar se:** inventário/decisão do usuário indicar semântica histórica diferente.

## D-016 — Aceite001, base de validação e segurança de metadados

**Status:** ACCEPTED como decisão de review/replanejamento em 2026-09-05; não aprova implementação futura ou custo.

**Contexto:** Goal001 satisfaz sua autorização delimitada. Duas fixtures Go falham no Windows também na baseline; foi encontrada consulta independente de status por ID global sem dono da instância. **Decisão:** aceitar001 com evidências; detalhar002 como base de validação reproduzível (fixtures, requestId, BFF real, build Scheduling, gates local/CI); exigir fechamento de G-35 no Goal003 antes de ampliar persistência em004. Centralização de DTOs não entra em002; D-011 continua por operação. **Alternativas:** bloquear001 por dívida independente; corrigir todo o Go dentro de001; ignorar G-35 porque SAVE_MESSAGES está false no exemplo. Rejeitadas por falta de relação com o diff ou ausência de prova sobre dados implantados. **Motivo:** manter revisões pequenas, checks confiáveis e scoping pronto antes dos novos dados. **Consequências:** ordem/IDs mantidos; segurança003 inclui ownership de metadados, tratamento de linhas legadas sem dono, teste A/B e alinhamento dirigido de docs. Não criar um segundo Goal redundante enquanto003 cobre esse escopo separado. **Revisar se:** evidência de exposição ativa/exploração exigir antecipar um security Goal, ou solução de ownership demandar divisão adicional. `source`/telefone não é chave de instância; desenho exato será decidido no prompt003.

## D-017 — Fechamento de Goal por commit e baseline aceita vigente

**Status:** ACCEPTED em 2026-09-06, por instrução do usuário, como decisão operacional do fluxo Astra ↔ Claude. Não altera arquitetura, produto nem status de nenhum Goal.

**Contexto:** Goals aceitos vinham ficando no working tree, com a baseline do Goal0 sendo reusada como referência operacional e sem um ponto formal de fechamento entre um Goal e o próximo. **Decisão:** depois do ACCEPTED, Astra atualiza a documentação afetada e cria o commit de fechamento do Goal; o SHA desse commit vira a baseline aceita vigente; só então o roadmap é reavaliado e o próximo Goal é escrito e marcado READY, declarando essa baseline. Claude entrega diff/testes/relatório e não cria o commit de fechamento. Sem ACCEPTED não há commit. **Alternativas:** manter tudo em working tree até o fim da migração; deixar Claude commitar ao terminar; commitar por rodada de correção — rejeitadas por não produzirem estado aceito rastreável, por confundir execução com aceite e por criar fechamentos sem review. **Motivo:** dar a cada Goal um estado aceito identificável por SHA, tornar o replanejamento incremental verificável e permitir que um chat novo do Astra recupere o fluxo lendo apenas o repositório. **Consequências:** a baseline do Goal0 fica como fotografia histórica; MASTER_PLAN carrega o procedimento e a DoD estendida; MIGRATION_STATUS registra o SHA aceito; Goals já concluídos não são reescritos. Push, merge e PR continuam exigindo autorização explícita. **Revisar se:** o usuário mudar o modelo de branch/PR ou passar a exigir commit em outra etapa do ciclo.

## Questões específicas do usuário, isoladas

| ID | Decisão pendente | Opções e recomendação | Impacto / ponto limite |
| --- | --- | --- | --- |
| U-01 — **DECIDIDA por Felipe Borges em 2026-09-27, aguardando Goal que implemente** | Prazo de conteúdo em Não classificadas | **Decisão: 90 dias, a regra de Comercial** (não a de Pessoal, default30) | O vault permite categoria indefinida, mas não fixa seu prazo. Gate **Goal023** — a referência ao 022 era do tempo em que retenção e central eram o mesmo Goal (v40/v42 do MASTER_PLAN). **O Goal023 chegou e não antecipou a resposta** ([D-039](#d-039--prazo-de-retenção-como-escolha-do-negócio-com-allowlist-do-servidor-varredura-no-bff-e-exclusão-no-dono-prazos-técnicos-fora-do-produto-e-não-classificadas-intocada-adotados-no-goal023), [review023](reviews/023-review.md)): `UNCLASSIFIED` não tem prazo, coluna, parâmetro, opção nem default em camada nenhuma, e o predicado da purga preserva também a linha órfã de janela de sessão. Nenhuma camada pode purgar esse grupo até um Goal aplicar os 90 dias decididos aqui |
| U-02 — **RESOLVIDA no Goal010** ([D-026](#d-026--contratos-de-importação-única-e-corte-do-writer-remoto-adotados-no-goal010)) | Tratamento de MigrationJob.COMPLETED legado, se existirem negócios assim | Resolvida por classificação, nunca conversão: `legacyClass` preenchido de forma idempotente, inventário por classe e `NEEDS_REVIEW` isolando explicitamente o caso sem prova de conclusão (`COMPLETED` sem `summary.imported`). Nenhuma linha é apagada ou reescrita | O direito de importação passou a ser estrutural — mora só em `ImportSession.completedAt`, e as duas tabelas não se comunicam —, então nenhum job legado o consome nem habilita uma segunda importação. Resta que o inventário não tem rota: é exercitado por ensaio e por suíte, não operável pelo produto (Goal019) |
| U-03 | Custo/provider para execução contínua e email crítico | **Provider de e-mail — adiado por Felipe Borges em 2026-09-27:** nenhum provider escolhido agora. Requisito para quando um Goal implementar o alerta externo (A-05/A-06): sem provider configurado, o envio deve ser **SKIPPED** — nunca falhar nem bloquear o fluxo principal da central de notificações. **Capacidade contínua (planos `plan: free` que hibernam) segue sem decisão, não perguntada ainda** | Nenhuma compra/mudança de provider autorizada. Gate antes de jobs reais/Goal021–024 continua valendo para a parte de capacidade contínua; a parte de e-mail crítico fica formalmente adiada, não bloqueando os demais Goals |
| U-04 — **RESPONDIDA por Felipe Borges em 2026-09-27** | Há tenants e dados legados em operação? (FINAL_AUDIT §3.2, sem ID até aqui; achado A-14) | **Resposta: não há nenhum negócio real rodando hoje.** Não existe dado legado a migrar; o corte real pode começar do zero | Simplifica qualquer Goal de corte/cutover real (A-04, A-08, A-13): não precisa de plano de migração de dado de negócio existente, só de ativação de um ambiente nascendo vazio |
| U-05 — **DECIDIDA por Felipe Borges em 2026-09-27, revista no mesmo dia** | Sequenciamento: quando fazer o deploy real (A-04)? | **Decisão: A-04 (deploy) adiado.** Validar tudo localmente primeiro; deploy real só depois, sem data ainda | **Só A-04 fica adiado por esta decisão.** A-07, A-08 e A-13 **não dependem de deploy** — são o Atendly chamando pra fora (Minha Agenda, WhatsApp), exercitável de ambiente local com credencial/número reais. Felipe confirmou ter conta de teste na Minha Agenda (destrava A-07/A-13) e telefone livre pra parear WhatsApp (destrava A-08). Credencial da Minha Agenda é por tenant, criptografada no banco (`decryptIntegrationCredentials`) — conectada pela própria tela do produto, nunca em arquivo nem repassada em chat; pareamento WhatsApp é por QR code do Evolution Go local, também sem segredo digitado. Goals para A-07/A-08/A-13 **podem ser propostos agora**, locais |
| U-06 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | Como a IA conduz a confirmação e o fim de um agendamento? ([QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) 4b, A-02 a A-04) | **Decisão:** (1) sem perguntas desnecessárias — se a cliente já disse "pode marcar" e a pessoa está clara, não perguntar de novo para quem é nem pedir 2–3 confirmações (o protótipo K1 tem **uma** pergunta: "Posso confirmar?"); (2) **nunca usar travessão** nas respostas da IA; (3) ao concluir um agendamento, mandar mensagem de encerramento no estilo "te vejo quarta-feira, obrigada, tenha um ótimo dia" | Regra de prompt/grafo da IA e do vault (conversa). Não afrouxa a regra de que confirmação só existe depois de persistida: é o oposto, ver A-01 do QA_LOCAL_REVIEW |
| U-07 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | Quais dados o dono informa para importar da Minha Agenda? (QA_LOCAL_REVIEW 4k, IM-01) | **Decisão: só e-mail e senha da Minha Agenda.** O endereço é o mesmo para todos (o dono entra por `https://portal.minhaagendaapp.com.br/login`; a API por trás é `https://api.minhaagendaapp.com.br`, verificado na revisão) e fica fixo no sistema. O sistema faz o login, obtém o token e o usa nas demais chamadas; chave do cliente OAuth, código do profissional e forma de pagamento padrão são descobertos ou configurados pelo sistema, nunca digitados | Muda a tela de conexão (`ConnectSourceScreen`) e o contrato `/v1/calendar/integration/connect` (hoje exige `basicAuth`, `baseUrl`, `employeeId`, `paymentMethod`). A credencial continua por tenant e cifrada; a senha continua sem ser guardada além do necessário para a importação |
| U-08 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | A Minha Agenda tem lista completa de clientes? (QA_LOCAL_REVIEW IM-06) | **Resposta: sim, tem.** A premissa gravada hoje (`CUSTOMER_DIRECTORY_UNAVAILABLE`, "a origem não expõe um endpoint de listagem de clientes") está errada; a importação deve trazer a base inteira de clientes, não só quem aparece em agendamento/bloqueio | O endpoint de listagem precisa ser identificado contra a API real (conta de teste disponível, U-05). Afeta a categoria `CUSTOMER` da análise e a copy da revisão. **Nota de aplicação (Goal062):** aplicada no Goal062, ver D-079. Status e texto acima não mudam. |
| U-09 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | Onde fica a importação: onboarding ou Configurações? (QA_LOCAL_REVIEW O-20) | **Decisão: nos dois lugares.** O onboarding oferece "Importar agora / Fazer depois" (vault `04-Especificacao-das-Telas.md:47-56`, protótipo `Onboarding-2-Importacao`) reaproveitando a mesma experiência; Configurações → Importação continua para quem pulou | Resolve a divergência entre vault e D-036 a favor do vault, sem retirar a entrada de Configurações |
| U-10 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | Senha no cadastro (QA_LOCAL_REVIEW C-02, C-03) | **Decisão: senha única, mínimo de 8 caracteres com letras e números**, com olho para mostrar; sem "Repita a senha" | Muda tela e API (`/v1/auth/register` exige `confirmPassword` hoje; o backend só exige `min(8)`). Mesma regra na redefinição de senha |
| U-11 — **DECIDIDA por Felipe Borges em 2026-09-27, na revisão local** | Teste real e ativação da IA (QA_LOCAL_REVIEW O-49, H-03, S-02) | **Decisão: teste real no onboarding e em Configurações → IA; a IA só liga depois de teste bem-sucedido** (vault Q14). Pular uma etapa opcional do onboarding não encerra o onboarding | Revê D-035 na parte "teste real só no onboarding"; o checkbox que liga a IA sem teste deixa de existir (**Nota de aplicação:** aplicada no Goal063, ver D-080) |

Capacidade da API Minha Agenda, volume, restore e estado das migrations são perguntas técnicas a verificar, não escolhas de produto a repassar ao usuário sem investigação. U-01/U-02/U-03/U-04/U-05 não bloqueiam Goal001 nem a entrega da auditoria.

## Replanning

## D-018 — Tech Lead Agent + IA Loop

**Status:** ACCEPTED em 2026-09-07, por instrução do usuário, como decisão operacional do fluxo de migração. Não altera arquitetura, produto nem status de nenhum Goal.

**Contexto:** até o Goal002 inclusive, o papel de Tech Lead / Reviewer foi exercido pelo Astra, num fluxo conduzido manualmente entre dois chats. O IA Loop (`tools/ia-loop/`) passou a existir como orchestrator, com workers, contratos, máquina de estados, tratamento de capacidade e persistência, tornando o transporte entre os papéis automatizável. **Decisão:** o papel de Tech Lead / Architect / Reviewer passa a ser exercido pelo Tech Lead Agent, hoje Claude Fable 5.1; o Developer / Executor permanece Claude Opus 5; o IA Loop automatiza transporte, estado, capacidade e Git. A documentação referencia **papéis**, e apenas [AGENT_ROLES](AGENT_ROLES.md) associa papel a modelo, de modo que trocar de modelo não exija reescrever a documentação. A autoridade está no papel, não no modelo: nenhum modelo é autoridade por si só. O repositório e a documentação continuam sendo o registro persistente — a sessão de qualquer agente é continuidade recente, não fonte de verdade. **Alternativas:** manter Astra como reviewer e usar o IA Loop só para o executor, rejeitada por deixar o ciclo dependente de condução manual justamente na etapa de decisão; deixar o IA Loop declarar o aceite, rejeitada por confundir transporte com autoridade; substituir "Astra" globalmente na documentação, rejeitada por reescrever histórico e por acoplar documentos a um modelo específico. **Motivo:** permitir que o ciclo Goal → implementação → review → aceite → fechamento → próximo Goal seja conduzido de ponta a ponta sem perder a separação entre decidir e executar. **Consequências:** D-017 permanece válida na substância — sem ACCEPTED não há commit de fechamento, e o SHA continua virando a baseline aceita vigente; muda apenas quem executa mecanicamente o commit, que passa a ser o IA Loop após validar as invariantes. O IA Loop não pode inferir ACCEPTED a partir de prosa, relatório ou ausência de erro. Reviews históricos não são reatribuídos e artefatos que mencionam Astra permanecem inalterados. A troca vale a partir do Goal003, que ainda não foi executado. **Revisar se:** o modelo de qualquer papel mudar, o IA Loop passar a executar etapas hoje reservadas ao Tech Lead, ou o usuário decidir retomar condução manual do review.

## D-019 — Contratos de segurança adotados no Goal003

**Status:** ACCEPTED em 2026-09-07 pelo Tech Lead Agent no [review003](reviews/003-review.md), como decisão de implementação do escopo de D-004 e D-016. Não aprova deploy, rotação de produção nem execução do corte do Go em banco implantado.

**Contexto:** D-004 e D-016 exigiam tenant canônico, credenciais por chamador, sessão revogável, CSRF e ownership de metadados sem novo identity provider nem plataforma de segredos. O review da rodada 1 mostrou que a entrega do token de CSRF por cookie não funciona quando frontend e BFF vivem em hosts distintos sob sufixo público, que resolver a credencial antes do ACK perderia eventos na transição e que o vínculo pendente não tinha caminho de resolução. **Decisão:** (1) credenciais internas derivadas por `HMAC-SHA256(INTERNAL_SERVICE_TOKEN, "atendly:internal:v1:<chamador>:<audiência>:<uso>")`, com override explícito por variável; o segredo raiz bruto não é aceito por nenhum receptor; a IA autoriza por escopo mapeado por método e caminho e rota interna sem escopo nasce negada; `x-service-audience`, `x-user-id` e `x-tenant-id` são lidos só depois da credencial e não autenticam. (2) Sessão revogável persistida (`UserSession`) com `sid` no JWT; JWT sem `sid` exige novo login sem criar sessão; token de CSRF derivado por sessão, conferido contra o hash guardado nela e entregue no cookie legível e no header de resposta `x-csrf-token`, exposto pelo CORS apenas à origem permitida; Bearer não exige CSRF. (3) Credencial de instância cifrada no BFF (AES-256-GCM, AAD do vínculo, key-id/versão, rotação na leitura, legado selado na primeira leitura) e projetada cifrada para a IA no provisionamento; resolução preguiçosa no envio, sem queda para a chave global; reprojeção idempotente em `GET /v1/whatsapp` como caminho de transição. (4) Vínculo tenant/instância com dois estados ambíguos distintos: pendente, descartável pelo próprio dono em `DELETE /v1/whatsapp`; divergente, reservado à operação. (5) Ownership de metadados no Go por `(instance_id, message_id)`, expand no boot, corte explícito por variável de ambiente e nenhum backfill de dono para linhas legadas. **Alternativas:** manter um segredo compartilhado único por serviço; rotear o frontend pelo rewrite same-origin em vez de expor o header; resolver a credencial antes do 202; permitir que o usuário resolvesse divergências entre negócios; deduzir dono de mensagem por telefone — rejeitadas por manter fallback de credencial, por acoplar a correção à topologia de deploy, por perder eventos, por decidir por outro negócio e por inventar proveniência. **Motivo:** fechar G-02/G-03/G-04/G-35 preservando serviços, bancos, providers e API pública, com evidência reproduzível no gate. **Consequências:** o produtor Go ainda envia `instanceToken` no payload e loga a URL com token — retirada fica para o Goal004; resposta gerada durante a janela de transição não é reenviada, pois o outbox é do 004; operadores geram `WHATSAPP_CREDENTIAL_KEYS` e `CHANNEL_CREDENTIAL_KEYS` (32 bytes base64, `sync: false` no Render); `resolveLinkState` deve passar a exigir `tenantId` nulo para classificar pendente, endurecimento registrado no review. **Revisar se:** multiusuário ou segundo número entrar no escopo, o frontend passar a ser servido no mesmo host do BFF, ou uma plataforma de segredos for adotada.

## D-020 — Contratos de transporte durável adotados no Goal004

**Status:** ACCEPTED em 2026-09-07 pelo Tech Lead Agent no [review004](reviews/004-review.md), como decisão de implementação de D-007. Não aprova deploy, capacidade de execução contínua nem broker.

**Contexto:** D-007 exigia persistir antes do ACK, processar com lease e resultado e manter outbox com estados, sem broker, serviço ou biblioteca de fila novos. O review da rodada 1 mostrou que reutilizar o guard de idempotência do grafo sobre trabalho já persistido descartava toda mensagem única, que selecionar só a cabeça global da fila bloqueava as demais conversas e que a janela de fragmentos precisava reproduzir a política adaptativa e a espera de mensagem ambígua sobre a inbox. **Decisão:** (1) a inbox é `ProcessedEvent` expandido: chave única `(tenantId, provider, eventKey)` gravada antes do 202, estado RECEIVED/PROCESSING/DONE/FAILED/IGNORED/LEGACY, tentativas com backoff limitado, lease com token e fencing, dead-letter sem reenvio em massa; o dedupe vive nessa linha e o grafo recebe `eventAlreadyGuarded` para todo lote vindo dela. (2) Serialização por conversa pela chave `tenant:canal:contato` (não pelo id da conversa, que pode ainda não existir), com claim por candidatos que excluem conversas de lease vivo, `FOR UPDATE SKIP LOCKED` e `pg_try_advisory_xact_lock`; conversas distintas correm em paralelo até `INBOX_MAX_CONCURRENT_CONVERSATIONS`. (3) Janela adaptativa de fragmentos e espera da primeira mensagem ambígua de contato sem histórico são heurísticas de transporte gravadas em `nextAttemptAt` sobre os pendentes da conversa; classificação de intenção continua no Goal005. Mensagem nova durante a execução marca supersede e cancela a resposta ainda não enviada. (4) A outbox é `Message` OUTBOUND: criada antes do transporte com `correlationId` estável, que viaja como id da mensagem no envio; estados PENDING/SENT/FAILED/UNKNOWN; timeout, 5xx e erro pós-envio viram UNKNOWN e só mudam por reconciliação (ID externo ou recibo Delivered/Read); 4xx é FAILED; retry automático apenas quando a falha ocorreu antes do envio; nenhuma transição apaga a tentativa; o DTO expõe o estado por operação (D-011) e a API não promete exactly-once. (5) Eventos que não são mensagem recebem 2xx: `Receipt` é trabalho de reconciliação, presença é descartada, ciclo de vida da conexão fica registrado; vínculo não resolvido devolve 503 porque 4xx é recusa definitiva no produtor. (6) No Go, a tentativa de webhook é persistida em `webhook_deliveries` antes da goroutine, com destino redigido, 4xx definitivo, 5xx/timeout pendente com retry limitado e retomada no boot resolvendo o destino real pela instância; o payload não carrega `instanceToken`. **Alternativas:** tabela de inbox separada de `ProcessedEvent`; broker externo; conversa como chave; `LIMIT 1` na cabeça da fila; retry cego em timeout; 404 para vínculo ausente — rejeitadas por duplicar dedupe, adicionar dependência, inverter recebimento e persistência, bloquear a fila, duplicar mensagem ao cliente e perder evento na janela de provisionamento. **Motivo:** fechar G-04 (resto), G-05, G-06 (transporte) e G-09 preservando serviços, bancos, providers e API pública, com evidência reproduzível contra PostgreSQL. **Consequências:** lease de 120 s sem renovação — heartbeat recomendado antes de execuções longas; `webhook_deliveries` guarda payload integral e entra na retenção do Goal022; reconciliação depende de o WhatsApp honrar `correlationId` como ID da mensagem; a espera ambígua termina em qualquer segundo fragmento até o Goal005 refinar; capacidade de execução contínua do worker é gate de operação. **Revisar se:** o provider documentar garantia idempotente, mais de uma instância da IA exigir coordenação além do claim, ou uma biblioteca de fila for adotada.

## D-021 — Contratos de contato, sessão e controle humano adotados no Goal005

**Status:** ACCEPTED em 2026-09-08 pelo Tech Lead Agent no [review005](reviews/005-review.md), como decisão de implementação de D-009. Não aprova deploy nem WhatsApp real.

**Contexto:** D-009 exigia Contact, Session, categoria, override e controle humano persistidos e determinísticos, fora do LLM. O review da rodada 1 mostrou que o espelho legado `Conversation.humanHandoff` sem relógio mantinha a IA bloqueada depois da rotação de sessão e que `/bot on` não liberava a sessão. **Decisão:** (1) `Contact` guarda o que é do contato — identidade externa, `ignored` (regra absoluta, com autor, origem e data), `aiPaused` (pausa explícita por `/bot off`, `/ia_pause` e legado, que sobrevive à troca de sessão) e `categoryOverride` (decisão manual que atravessa sessões); `ConversationSession` guarda o que é da sessão — categoria vigente com origem, sugestão do agente com proveniência, atendimento humano com origem e autor, `contextResetAt` e `inboundVersion`. (2) A sessão expira por inatividade do contato (`AI_SESSION_INACTIVITY_SECONDS`), rotaciona ao chegar a próxima interação e nasce sem atendimento humano, herdando só o que é do contato; ao rotacionar, o espelho legado da conversa é sincronizado (`syncLegacyPauseMirror`) salvo contato pausado ou ignorado. (3) Precedência: ignore do contato > sessão pessoal > canal > IA desligada > pausa do contato > atendimento humano; override manual > sugestão > Não classificadas; a classificação do agente é sempre sugestão. (4) A inbox é persistida antes de qualquer decisão de IA (`recordInbound` antes de `sessionGate`), e conteúdo ignorado ou pessoal não passa por classificação, modelo, RAG, embedding nem memória. (5) Envio humano — pelo WhatsApp ou pela Atendly — assume a sessão atomicamente e cancela a resposta automática pendente; abrir ou ler não assume; Retomar IA (`release`) e `/bot on` liberam a sessão, marcam `contextResetAt`, resetam o rascunho pendente e limpam a pausa explícita do contato; não há retomada silenciosa por relógio dentro da sessão; guards determinísticos antes de tool com efeito e antes de enviar comparam versão de entrada, controle humano, elegibilidade, categoria e ignore. (6) Contratos por operação: `PUT .../category` (com `null` para limpar) e `PUT .../ignore` sob `conversations:write`, filtros `category`/`handling`/`ignored` e DTO aditivo com padrão seguro. **Alternativas:** guardar pausa e override na sessão (rejeitada: a expiração desfaria decisões da profissional); tratar `/bot on` só como fim da pausa do contato (rejeitada: deixava o atendimento humano preso); mover a consulta de sessão para `isBotPaused` (rejeitada: lá o serviço não conhece `Contact.aiPaused`); índice único parcial para uma sessão aberta por conversa (adiada: Prisma não o expressa no schema). **Motivo:** fechar G-06 (resto), G-07, G-08 e G-22 com política determinística e testável sem banco e provada contra PostgreSQL. **Consequências:** handoffs `OPEN` legados não são resolvidos pela rotação; mensagens não textuais do contato não renovam a sessão; sessões expiradas são fechadas preguiçosamente; memória estruturada, notas, tags e identidade de pessoa ficam nos Goals 006 e 012; inbox em três abas no Goal017. **Revisar se:** o produto especificar outro relógio de sessão, transcrição ou memória estruturada exigirem novos pontos de política, ou multiusuário entrar no escopo.

## D-022 — Contratos de identidade de cliente adotados no Goal006

**Status:** ACCEPTED em 2026-09-08 pelo Tech Lead Agent no [review006](reviews/006-review.md), como decisão de implementação de D-005. Não aprova deploy nem importação real.

**Contexto:** D-005 exigia cliente por ID com telefone opcional e não exclusivo, sem que nenhum caminho renomeasse, fundisse ou deduplicasse pessoas por número; o Goal006 tinha de fazê-lo com todos os consumers no repositório e em passos ensaiados. **Decisão:** (1) `Customer.phone`/`normalizedPhone` opcionais e índice não exclusivo `(tenantId, normalizedPhone)`; a unicidade antiga cai em migration de corte separada da expansão, e `(tenantId, id)` continua a identidade referenciada pelas FKs. (2) `create` exige nome ou telefone e nunca consulta por telefone; `update` é a única operação que altera nome e telefone; `findCandidatesByPhone`/`list({ phone })` devolvem candidatos (zero, um ou vários) e a escolha é sempre explícita por `customerId`. (3) O cliente só nasce dentro da transação de confirmação do agendamento, depois de `lockCalendarDay` e da validação do slot; disponibilidade, preço e confirmação que falha não criam nem renomeiam ninguém; a Agenda externa (Minha Agenda) recusa agendamento por `customerId`. (4) Na IA, vários candidatos → `CUSTOMER_IDENTITY_AMBIGUOUS` e pergunta; um candidato → `proposedCustomerId` e confirmação; nenhum → criação na confirmação; `Contact.customerId` é preenchido na confirmação por tenant, canal e ID externo e pode apontar para pessoas diferentes ao longo do tempo, sem FK entre bancos e sem fundir contatos ou clientes. (5) `CustomerRelation` guarda um responsável principal por cliente com `proposedBy`/`status`/`confirmedBy` e datas: a IA só propõe, e a relação só vira permanente por confirmação de cliente ou profissional; `CustomerNote` e `CustomerTag` têm `aiAuthorized` nascendo `false`, a IA recebe um recorte próprio (`ai-context`) filtrado na consulta, que só inclui responsável `CONFIRMED`. (6) Contratos por operação no Scheduling (`/internal/customers` e sub-recursos de responsável, notas e tags, `ai-context`) e no BFF (`/v1/customers` equivalentes sob tenant da sessão e CSRF por cookie); `POST /v1/appointments` aceita `customerId` ou nome/telefone; DTO aditivo com telefone nulo, `primaryGuardian`, `notes` e `tags`. (7) A regra estática `no_tenant_scoped_phone_unique_constraint` recusa `@@unique` composto sobre telefone; o comportamento é provado por suíte própria do Scheduling (unit no core, integração no gate). (8) Resíduos do 005: a rotação de sessão resolve o handoff `OPEN` ao limpar o espelho legado, e uma sessão aberta por conversa passa a ser garantida por índice único parcial em SQL, com a violação absorvida pela criação da sessão. **Alternativas:** manter upsert por telefone com confirmação de nome (rejeitada: continua renomeando pessoas); criar o cliente ao consultar preço ou disponibilidade (rejeitada: cadastro sem agendamento); FK de `Contact` para `Customer` entre bancos (rejeitada: bancos separados); deixar a IA confirmar responsável (rejeitada: relação só por confirmação explícita). **Motivo:** fechar G-14 e a parte de cadastro de G-15 sem fusão, renomeação ou deduplicação e com criação atômica ao agendamento. **Consequências:** o binário anterior ao corte deixa de ser destino seguro depois da primeira pessoa com número compartilhado ou sem telefone; `CUSTOMER_PHONE_DUPLICATED` deixou de ser conflito de importação; a lista de compromissos futuros por telefone na IA devolve os candidatos do número, não o histórico de uma pessoa; o identificador `actor` de proveniência vem do cliente do BFF; `migrate diff` reporta o índice parcial da IA e o default de `updatedAt` das tabelas novas. Preferências com origem, resumo e métricas ficam no Goal012; telas de cliente no Goal015; importação no Goal010. **Revisar se:** o produto admitir mais de um responsável, exigir merge assistido de pessoas ou multiusuário entrar no escopo.

## D-023 — Contratos de catálogo e acordo comercial adotados no Goal007

**Status:** ACCEPTED em 2026-09-09 pelo Tech Lead Agent no [review007](reviews/007-review.md), para o diff aceito sobre a base `9494eb6`, sem commit/deploy. Não aprova importação real nem Minha Agenda real.

**Contexto:** o catálogo tinha dois tipos de preço, duração obrigatória e nenhum atributo do MVP; o mapper de importação fabricava `FIXED`/zero e copiava a duração total para cada item; a agenda, a IA, o BFF e o frontend estavam fechados nesses dois valores. **Decisão:** (1) `PriceType` com quatro valores — `FIXED`, `STARTING_AT` (a partir de), `ON_REQUEST` (sob consulta) e `NOT_INFORMED` (não informado); `FIXED` e `ON_REQUEST` preservam o significado original e nenhum registro é reclassificado; `price` obrigatório e não negativo só em `FIXED`/`STARTING_AT` e proibido nos outros dois, na aplicação e nas constraints SQL `Service_price_check`/`AppointmentItem_priceSnapshot_check`; preço zero só quando explícito, ausência nunca serializada como zero em nenhum consumer. (2) `durationMinutes` opcional; ausência é a única forma de entrar em revisão (`needsReview` em lockstep por `Service_review_check`), com `reviewOrigin` `IMPORT`/`MANUAL` apenas enquanto a pendência existe; corrigir a duração retira a pendência e `PATCH` que não toca a duração preserva a origem. (3) "Operacional" é predicado único — ativo, com duração e fora de revisão (`isOperationalService`) — usado por `listForScheduling`, por `CalendarService.listOperationalServices` (que alimenta `/internal/services` para qualquer fonte), por `requireActive` (que recusa serviço em revisão com `SERVICE_NEEDS_REVIEW`) e por `capabilities.aiActivationReady`, que o BFF exige para `PATCH /v1/settings/ai` com `enabled: true`; `/internal/service-catalog` continua listando serviço em revisão. (4) Atributos do MVP persistidos sem efeito operacional: `description`, `colorToken` (enum fechado `ROSE|AMBER|EMERALD|SKY|VIOLET|SLATE`, não cor livre nem número do Minha Agenda), `bufferBeforeMinutes`/`bufferAfterMinutes` (default zero; ocupação no Goal009) e `recurrenceIntervalDays` (uso pela IA no Goal011). (5) O acordo do atendimento é snapshot por item com as quatro semânticas e duração própria opcional; o total é derivado dos snapshots por regra única (`computeAgreementTotal` no Scheduling, reimplementada de forma equivalente na IA por D-011): soma quando todos são fixos, `STARTING_AT` quando há algum a partir de e nenhum sem preço, `NONE` nos demais; `totalPriceType` acompanha `totalPrice`; editar o catálogo não reescreve snapshots; a remarcação deriva a duração de `endAt − startAt`. (6) O mapper do Minha Agenda não fabrica semântica: preço desconhecido vira `NOT_INFORMED`, duração desconhecida vira ausência explícita e serviço importado sem duração nasce em revisão com origem `IMPORT`; item multi-serviço não herda a duração total. (7) Migração em dois passos obrigatórios — expansão (valores novos do enum, colunas, `DROP NOT NULL`, constraints de buffer/recorrência/revisão) e constraints (substituição das checks de preço e duração) — porque um valor de enum recém-adicionado não pode ser referenciado na transação que o criou; a troca das constraints é atômica e todos os consumers do repositório migram no mesmo diff. **Alternativas:** manter dois tipos e representar "a partir de" por flag (rejeitada: leitores continuariam somando como fixo); zero como ausência (rejeitada: confunde grátis com desconhecido); estado de revisão independente da duração (rejeitada: permitiria serviço "revisado" sem duração); cor livre em hex (rejeitada: acopla dado persistido à paleta). **Motivo:** fechar G-16 na parte de catálogo e snapshot e G-17 na parte de catálogo antes de agenda (008), disponibilidade (009), importação (010) e assistente (011) consumirem essas semânticas. **Consequências:** o binário anterior deixa de ser destino seguro assim que existir tipo novo, duração nula ou revisão pendente; replays de idempotência anteriores recebem `totalPriceType: NONE` por default; `countOperationalServices` consulta o provider da fonte vigente em cada leitura de `/internal/calendar`; a resposta do Minha Agenda não é validada por schema e preço numérico em string viraria `NOT_INFORMED` (Goal010); onboarding e formulário legado do diretório só editam os dois tipos originais (Goal015). Proposta versionada, hold, valor final, presença e eventos ficam no Goal008; modalidades e regras privadas do negócio no Goal018. **Revisar se:** o produto admitir combo comercial, preço por modalidade ou mais de um responsável pela revisão do catálogo.

## D-024 — Contratos de agenda transacional, hold, ciclo de vida e histórico adotados no Goal008

**Status:** ACCEPTED em 2026-09-09 pelo Tech Lead Agent no [review008](reviews/008-review.md), para o diff aceito sobre a base `26593db`, sem commit/deploy. Implementa D-006 e aplica D-008 ao loop de conclusão automática. Não aprova deploy, WhatsApp real nem migração de tenant real.

**Contexto:** confirmar e remarcar já usavam transação Serializable com advisory lock por dia, mas cancelamento e bloqueio escreviam fora dela, o resultado idempotente era gravado depois do commit (queda entre os dois deixava efeito sem resultado recuperável), não existiam hold, eventos, presença nem valor final, e `Appointment.status` era texto livre com `SCHEDULED`/`CANCELLED`.

**Decisão:** (1) `write-policy.ts` é o único caminho de escrita da agenda — toda mutação que ocupa ou libera tempo executa em transação Serializable com `lockCalendarDay` para **todos** os dias afetados em ordem estável de datas (a remarcação trava o dia original e o novo), revalidação de disponibilidade dentro da transação e retry limitado e configurável de `40001`/`40P01`/`P2034`, devolvendo `CALENDAR_WRITE_RETRY_EXCEEDED` quando o limite é excedido; a checagem de conflito de bloqueio passou para dentro da transação. (2) `CalendarMutationIdempotency` grava resposta e referência de efeito (`effectEntityType`/`effectEntityId`) no mesmo commit da mutação; `PENDING` vencido cuja referência já existe é recuperado como sucesso, nunca reexecutado; falha antes do commit deixa `FAILED` com código e o retry da mesma chave reexecuta sob a política; detecção de request diferente para a mesma chave e stale lock permanecem. (3) `AppointmentHold` é ocupação temporária por tenant, com serviços e duração propostos em JSON (efêmero, sem a modelagem relacional de `AppointmentItem`), `customerId` **ou** `contactRef` livre — a IA pode segurar horário antes de a identidade estar confirmada, sem fundir pessoa por telefone (D-005) —, origem `AI`/`USER` e `expiresAt` **TIMESTAMPTZ** calculado com `now()` do banco mais o TTL (300s por default). Vigência é sempre avaliada pelo relógio do banco: hold vigente conta como ocupação para todos exceto para a confirmação que o consome, e hold vencido é ignorado sem depender de worker. A fonte externa recusa holds. (4) `Appointment.status` fica restrito aos quatro estados do produto por `Appointment_status_check` (`CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), com o valor pré-normalização em `statusRaw`, gravado uma única vez e nunca reescrito por transição; conclusão, falta, presença e valor final são colunas separadas, idempotentes e com ator/data próprios; valor final é Decimal(12,2) e nunca inferido do preço previsto do acordo. (5) Todo efeito grava exatamente um evento em `AppointmentEvent` na **mesma transação**, com tipo, origem (`AI`/`USER`/`SYSTEM`/`INTEGRATION`), ator, motivo e antes/depois; o histórico nunca é apagado nem reescrito e a leitura cronológica ordena por `occurredAt` desempatando por `sequence`, porque `CURRENT_TIMESTAMP` é o instante de início da transação e eventos irmãos compartilham o valor. (6) Sobreposição só por decisão humana explícita — `source: USER`, flag e motivo obrigatórios, registrada como evento; a IA nunca a aplica e o override nunca é aceito de origem `AI`. Atendimento manual excepcional sem serviço cadastrado é aceito só para `USER`, com título e duração informados, sem `AppointmentItem` e com total `NONE`; a constraint trigger deferrable `Appointment_title_required_without_items` sustenta o título, por ser checagem entre tabelas fora do alcance do Prisma. Não existe constraint SQL de não sobreposição, justamente para preservar o override. (7) Conclusão automática é rotina idempotente no próprio Scheduling, com lease por `pg_try_advisory_xact_lock`, grace de 30 minutos após o término pelo relógio do banco, intervalo configurável, desligável por variável e disparável por rota interna; nunca toca cancelados nem faltas e admite correção posterior para falta. (8) Migração em três passos aditivos — expansão, normalização de status com guarda que aborta diante de valor fora do universo conhecido, e fixups em migration própria (nunca por edição de migration já aplicada, que invalidaria o checksum).

**Alternativas:** constraint de exclusão (`EXCLUDE USING gist`) para impedir sobreposição no banco (rejeitada: eliminaria o override humano que o produto exige); hold como linha de `Appointment` em estado provisório (rejeitada: poluiria histórico, snapshots e todas as leituras de agenda com registros efêmeros); expiração de hold por worker (rejeitada: cria janela em que um hold morto ocupa o slot e acopla correção a um processo vivo); `updatedAt` como trilha (rejeitada: não guarda ator, origem nem antes/depois); backfill de `COMPLETED` pela data na migração (rejeitada: inventaria fato operacional não observado).

**Motivo:** fechar G-11, G-12 e G-18 antes de disponibilidade (009), importação (010), assistente (011) e telas de agenda (016) dependerem dessas invariantes.

**Consequências:** o binário anterior a este Goal deixa de ser destino seguro de rollback assim que existir hold, evento ou atendimento em `COMPLETED`/`NO_SHOW` — ele grava `SCHEDULED` e ignora holds. As rotas internas aceitavam `source` do corpo em vez de derivá-lo do token do chamador — o provider era o único ponto de recusa e o BFF forçava `USER`, mas um chamador interno futuro poderia se declarar `USER` e obter override; **fechado no Goal009** ([review009](reviews/009-review.md)), onde `callerSource` deriva a origem da credencial (BFF → `USER`, IA → `AI`) e o `source` do corpo é ignorado. A IA não libera o hold de um rascunho substituído por nova proposta, que ocupa o slot até o TTL. Só `expiresAt` é `TIMESTAMPTZ`; `createdAt`/`occurredAt` continuam `TIMESTAMP` com default do banco, então insert SQL cru fora do Prisma grava hora local da sessão. Exceções de disponibilidade, compromisso pessoal, bloqueios recorrentes e séries ficam no Goal009; lembretes e presença por lembrete no Goal021; telas no Goal016.

**Revisar se:** o produto admitir hold com TTL por tipo de serviço, mais de um hold simultâneo por conversa, ou uma origem interna adicional que precise de override sem ser um humano do negócio.

## D-025 — Contratos de disponibilidade, ocupação por buffer, exceções e séries adotados no Goal009

**Status:** ACCEPTED em 2026-09-09 pelo Tech Lead Agent no [review009](reviews/009-review.md), para o diff aceito sobre a base `9013f14`, sem commit/deploy. Estende D-006 (mesma política de escrita) às exceções, regras e séries, e completa D-023 dando efeito operacional aos buffers e à recorrência do catálogo. Não aprova deploy, WhatsApp real, migração de tenant real nem qualquer tela.

**Contexto:** o motor de disponibilidade gerava slots a partir do `stepMinutes` **da requisição**, sem antecedência mínima ou máxima e sem buffers; `AvailabilityException` era lida mas não tinha rota de gestão; `TimeBlock` não distinguia compromisso pessoal de bloqueio nem tinha recorrência; `bufferBeforeMinutes`/`bufferAfterMinutes` e `recurrenceIntervalDays` existiam no catálogo desde o Goal007 sem efeito operacional; e as rotas internas ainda aceitavam `source` do corpo (resíduo do Goal008).

**Decisão:** (1) As regras de oferta do negócio — antecedência mínima em minutos, máxima em dias e granularidade em minutos — são **dado persistido do tenant** em `CalendarSettings`, com constraint SQL própria, e são aplicadas dentro do motor a **toda** oferta, contadas contra o `now()` do banco; quem chama não escolhe o passo nem o horizonte. `stepMinutes` sai do contrato de disponibilidade e permanece aceito e ignorado nos contratos de confirmação e hold, por compatibilidade. Só o override humano de sobreposição escapa da grade; a IA nunca. (2) O buffer do serviço é **ocupação externa com snapshot**: o atendimento e o hold ocupam `[start − bufferBefore, end + bufferAfter]` a partir de valores gravados na própria linha na confirmação/proposta, nunca recalculados do catálogo, e em multi-serviço o buffer externo é o maior de cada lado — buffers intermediários nunca são somados. O horário exibido não muda; a ocupação estendida é dado separado no DTO. Como o `WHERE` compara colunas cruas, a janela de busca é alargada pelo maior buffer efetivamente gravado no tenant somado ao do conjunto proposto, sendo um superconjunto cujo descarte fica no teste de sobreposição. (3) Exceções de disponibilidade passam a ser geridas por rota sob a política única de escrita; indisponibilidade que cobre atendimento confirmado é recusada, salvo decisão humana explícita gravada com ator e motivo na própria exceção, e exceção nunca altera atendimento existente. (4) Compromisso pessoal é um `kind` de `TimeBlock`, não uma entidade nova. Séries de bloqueio/compromisso são **sempre finitas** — por data OU por contagem, nunca as duas nem nenhuma, com teto configurável — e suas ocorrências são **materializadas** como `TimeBlock` na criação, nunca geradas sob demanda; conflito é reportado por ocorrência e só uma decisão humana o resolve (pular ou forçar com motivo); remover ou mover uma ocorrência não toca a série; editar "desta data em diante" encerra a série atual e cria outra, preservando o passado; remover a série remove só as futuras. (5) A recorrência de atendimento é série finita orientada pelo serviço: a pré-visualização ajusta cada ocorrência ao horário disponível mais próximo dentro de uma janela configurável e cria **um hold por ocorrência**; a confirmação é global e atômica — uma transação, lock de todos os dias afetados em ordem estável, consumo de cada hold, um evento `CREATED` por atendimento — e, se qualquer ocorrência falhar, nada é criado e a resposta identifica a ocorrência e oferece alternativas, distinguindo hold morto de horário tomado. O resultado é gravado como efeito idempotente próprio (`APPOINTMENT_SERIES`), então a retentativa da mesma chave faz replay. Depois de confirmados, os atendimentos são independentes e `seriesId` é só referência de leitura. (6) A origem da mutação é **derivada da credencial** do chamador, nunca do corpo, e a IA é barrada por completo em exceção, bloqueio, compromisso pessoal, séries deles e regras de oferta. (7) Migração em passo único, aditivo e retomável: todo campo novo nasce com o default que o motor já praticava.

**Alternativas:** granularidade como parâmetro do chamador com validação (rejeitada: mantém a grade do negócio na mão de quem consulta e a IA voltaria a decidir a oferta); buffer somado à duração do atendimento (rejeitada: mudaria o horário exibido e o acordo, e somaria buffers intermediários em multi-serviço); buffer lido do catálogo na hora de calcular a ocupação (rejeitada: editar o serviço moveria a ocupação de atendimentos já confirmados); ocorrências de série geradas sob demanda a partir da regra (rejeitada: impossibilita exceção por ocorrência, conflito por ocorrência e lock por dia); série de atendimento confirmada ocorrência a ocorrência (rejeitada: deixaria a pessoa com metade da recorrência criada); teto de buffer fixo no catálogo para limitar a janela de busca (rejeitada por ora: é decisão de produto, e o agregado por tenant é correto e conservador).

**Motivo:** fechar G-13 na parte de domínio e contratos e DATA-11 antes de a importação (010) trazer bloqueios e disponibilidade da origem, de o assistente (011) oferecer recorrência e de as telas de agenda e configurações (016, 018) dependerem dessas entidades.

**Consequências:** o binário anterior a este Goal continua sendo destino seguro de rollback apenas enquanto não existir série, exceção criada por rota, buffer diferente de zero em snapshot ou regra de oferta diferente do default — depois disso ele ofereceria horário que fura a antecedência, o passo ou o buffer de um atendimento confirmado, e não saberia interpretar as séries. `decidedBy` da decisão humana na indisponibilidade vinha do corpo e não do chamador autenticado, ao contrário de `createdBy` da série; **fechado no Goal016** (D-032), que passou a derivá-lo da sessão autenticada e a ignorar o valor do corpo. O maior buffer do tenant é agregado a cada busca de slots, sem recorte de intervalo, e a pré-visualização da série repete a busca por ocorrência: custo que cresce com o histórico. `upstreamDetails` no cliente HTTP interno vale para todas as rotas internas, embora só a série o documente. Visualizações, dias ocultos e telas ficam no Goal016; modalidades e dados do negócio no Goal018; a oferta proativa de recorrência pela IA e a liberação do hold de rascunho substituído no Goal011.

**Revisar se:** o produto admitir regra de oferta por serviço ou por profissional, série recorrente sem término, buffer com teto no catálogo, ou confirmação parcial de recorrência por decisão humana.


## D-026 — Contratos de importação única e corte do writer remoto adotados no Goal010

**Status:** ACCEPTED em 2026-09-12 pelo Tech Lead Agent no [review010](reviews/010-review.md), para o diff aceito sobre a base `e381c15`, sem commit/deploy. Resolve U-02 e substitui o protocolo de migração bidirecional como caminho vigente; reusa D-006/D-024 (política única de escrita e idempotência com resultado no mesmo commit) em vez de criar mecanismo paralelo. Não aprova deploy, credencial real do Minha Agenda, importação de tenant real nem qualquer tela.

**Contexto:** `CalendarMigrationService` exigia destino vazio, importava em **uma transação monolítica**, bloqueava todos os itens quando havia qualquer conflito, concluía e trocava a fonte automaticamente; a execução era coordenada por `Set`/`queueMicrotask` do processo e `resumeIncomplete` varria `MigrationJob` de todos os negócios no boot, sem lease e sem recorte por tenant, reiniciando inclusive job vivo. Não havia sessão, item, decisão, identidade da conta de origem, versão de preview nem conclusão do usuário. O client do Minha Agenda fazia cast/`JSON.parse` sem schema de resposta, o snapshot reaproveitava filtros operacionais (excluindo cancelados e serviços desativados) e não lia bloqueios. A `CalendarProviderFactory` ainda devolvia o provider remoto para escrita e oferta.

**Decisão:** (1) A importação é uma **sessão por negócio** (`ImportSession`), com item (`ImportItem`), decisão (`ImportDecision`) e cobertura por categoria (`ImportSessionCategory`) como entidades próprias. O **direito de importação é estrutural**: mora só em `ImportSession.completedAt`, garantido pelo índice único **parcial** `ImportSession_one_completed_per_tenant` sobre `("tenantId") WHERE "completedAt" IS NOT NULL` — a segunda conclusão é recusada pelo **banco**, inclusive com duas conexões concorrentes, e não por checagem de código. `ImportSession_one_live_per_tenant` faz a "uma sessão por negócio": substituir uma sessão viva exige movê-la antes para `SUPERSEDED`/`FAILED`, então **falha técnica antes da conclusão não consome o direito**. (2) A análise **não escreve dado operacional**: persiste só preview e contadores. Cada reanálise incrementa `previewVersion` e reconcilia por `(category, externalId)` — a linha do item nunca é apagada nem recriada, decisão tomada não é apagada e item já resolvido por execução anterior não é revertido. `previewVersion` é **obrigatória** na execução, no Scheduling e no BFF: executar é executar o preview aprovado, e preview obsoleto é recusado com `409 IMPORT_PREVIEW_STALE`. Recusa de preview obsoleto nunca é opt-in de quem chama. (3) Conflito é decidido **por item**: `EXACT` mescla, `SIMILAR` apenas sugere, `DIVERGENT` exige decisão explícita. Telefone repetido entre pessoas diferentes é situação normal de importação, nunca conflito impeditivo nem fusão automática. (4) A execução é **por item**, com efeito, `ExternalEntityMap` (a chave de idempotência por origem/item) e checkpoint gravados no **mesmo commit**, sob `runCalendarWrite` e os locks do Goal008; falha ou conflito de um item marca aquele item e o lote segue. Agendamento futuro cujo intervalo já está ocupado por atendimento vigente que não veio da importação **não é sobreposto**: `findSlotHolder` lê a ocupação dentro do lock de dia e o item vai para `NEEDS_REVIEW` com `APPOINTMENT_SLOT_TAKEN`. A checagem vale só para agendamento futuro — histórico, cancelado e falta não ocupam agenda, e recusá-los apagaria registro real. (5) A coordenação da execução é **lease pelo relógio do banco** na própria linha da sessão, reivindicado por um único UPDATE condicional, com TTL configurável (`IMPORT_LEASE_TTL_SECONDS`); a retomada é por tenant e sob lease. A varredura global de boot foi removida. (6) A resposta da origem é **validada por schema antes de qualquer mapeamento** e lida por categoria, com `raw` preservado e cobertura declarada. Categoria que a origem não fornece vira **limitação declarada e quantificada**, nunca dado fabricado. (7) Os fluxos operacionais novos não instanciam o provider remoto: a factory recusa com `409 MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED`, a leitura da origem sobrevive só dentro da importação, a origem é somente leitura (`409 INTEGRATION_WRITES_NOT_SUPPORTED`) e desconectá-la nunca desativa a agenda operacional. (8) **U-02 resolvida:** job legado é **classificado, nunca convertido** — `legacyClass` idempotente, inventário por classe e isolamento explícito dos casos sem prova. `COMPLETED` sem `summary.imported` vira `NEEDS_REVIEW`, nunca conclusão presumida; nenhum job legado consome o direito nem habilita uma segunda importação, e nenhum é apagado. (9) A importação é **só humano**: não existe contrato de importação do lado da IA, e isso é asserção executável na suíte, não convenção.

**Alternativas:** conclusão única garantida por checagem de código antes do UPDATE (rejeitada: duas conexões concorrentes passam pela checagem e as duas commitam — a invariante tem de ser do banco); predicado da conclusão única sobre o enum de status em vez de `completedAt` (rejeitada: `completedAt` é o dado que registra a decisão, e o CHECK amarra os dois sentidos); manter a transação monolítica com retry (rejeitada: poucos conflitos bloqueariam milhares de registros válidos e uma queda reiniciaria o lote inteiro); `schedule()` em memória com `Set` de ids (rejeitada: não é coordenação entre instâncias — não impede segundo start, segunda instância nem reinício); converter `MigrationJob.COMPLETED` legado em conclusão de importação (rejeitada: consumiria o direito do negócio com base num lote técnico que nunca foi decisão do usuário); deixar `previewVersion` opcional com checagem quando presente (rejeitada: transformaria a recusa de preview obsoleto em opt-in de quem chama); confiar no lock de dia para impedir sobreposição na importação (rejeitada: o lock serializa, não verifica ocupação — provado por teste que gravava um segundo atendimento por cima de uma confirmação humana).

**Motivo:** fechar G-19, avançar G-20 na medida do que a origem comprovadamente fornece e fechar G-10 na parte de corte de writers/leitores operacionais, antes de o onboarding (018) oferecer importação como caminho de entrada, de a UI de importação e histórico (019) compor a experiência e de a retirada do legado (024) remover o código.

**Consequências:** o binário anterior a este Goal deixa de ser destino seguro de rollback assim que existir uma `ImportSession` concluída — ele ainda oferece migração bidirecional e troca automática de fonte, e reabriria um direito já consumido. O protocolo antigo continua alcançável como **compatibilidade temporária declarada** até o Goal024, mas seu `start` passou a chamar `assertImportAvailable`. Tenant legado com `CalendarSettings.source = MINHA_AGENDA` ainda não tem caminho novo para voltar a `ATENDLY`: só o `importToAtendly` legado faz essa transição, a tratar no Goal024 ou por migração de dados dirigida. O inventário do U-02 existe como serviço, exercitado por ensaio e por suíte de unidade, mas ainda não tem rota — não é operável pelo produto. `EXTERNAL` permanece no contrato público como dívida declarada. A capacidade da API **real** do Minha Agenda continua sem prova e permanece gate operacional antes do corte (M4), registrado em [DATA_MIGRATION §3](DATA_MIGRATION.md#3-minha-agenda-matriz-de-destino). Telas de importação, preview visual e histórico ficam no Goal019.

**Revisar se:** a origem passar a expor listagem de clientes ou falta como estado próprio; o produto admitir mais de uma importação por negócio, importação por profissional ou reprocessamento autorizado depois da conclusão; ou surgir necessidade comprovada de sincronização — que hoje é explicitamente não oferecida em nenhum momento.


## D-027 — Contratos de política de conversa, estilo e erro adotados no Goal011

**Status:** ACCEPTED em 2026-09-13 pelo Tech Lead Agent no [review011](reviews/011-review.md), para o diff aceito sobre a base `0f4ac74`, sem commit/deploy. Fecha G-21 e implementa o mapeamento de tons que D-015 tinha deixado PROPOSED. Reusa D-005, D-006, D-009, D-021, D-023, D-024, D-025 e D-026 — a IA continua consumindo o núcleo operacional por tool e nunca escreve agenda por fora. Não aprova modelo novo, provider novo, mídia (G-23) nem conhecimento e memória (G-24).

**Contexto:** o comportamento do assistente dependia quase inteiramente do texto do prompt. O estilo era enum de **dois** valores replicado nos dois bancos, nas rotas de settings/onboarding/whatsapp, na projeção interna e nas telas legadas; `prompts/response.ts` mandava respeitar "a persona configurada" e `system.ts` mandava "parecer uma atendente humana", contra a regra de produto de IA sem personagem próprio; a versão do prompt era `env.AI_PROMPT_VERSION`, string de ambiente sem relação verificável com o conteúdo; `graphToolFailure` devolvia ao modelo a mensagem crua do erro de infraestrutura; `setPendingAction` substituía o rascunho sem liberar o hold anterior, que segurava o horário até o TTL vencer; `/internal/services` não emitia `recurrenceIntervalDays`, então a recorrência do Goal007 não era ofertável; e nenhuma suíte provava qualquer dessas políticas.

**Decisão:** (1) Estilo é **dado do negócio** com três valores — `PROFESSIONAL`, `BALANCED` (equilibrado, default) e `CASUAL` —, expandido nos dois bancos por migration **aditiva em passos separados**, com backfill determinístico `PROFESSIONAL_OBJECTIVE` → `PROFESSIONAL` e `LIGHT_CLOSE` → `BALANCED`. Nenhum valor antigo é removido do tipo nem de `schema.prisma`: eles continuam legíveis e são aceitos **só na entrada**, como alias declarado até o Goal024, enquanto toda saída usa sempre o vocabulário novo. Valor fora dos cinco é recusado com erro próprio `AI_CONVERSATION_STYLE_UNKNOWN`, nunca com validação genérica. (2) `tone` nulo no BFF significa "o negócio ainda não escolheu" e por isso a coluna do BFF **não** ganha default de banco — o equilibrado é projeção de aplicação para a IA, nunca escolha gravada silenciosamente; a distinção sustenta a pendência `AI_TONE_NOT_SELECTED` do onboarding. (3) Estilo muda registro, emoji e informalidade e **nada mais**: a mesma transcrição produz a mesma sequência de tools, o mesmo rascunho e o mesmo resultado operacional nos três estilos, e isso é critério de aceite verificado por eval, não recomendação. (4) A IA não tem persona: sem nome, sem personagem, sem instrução de parecer ou fingir humana; perguntada, identifica-se como assistente virtual do negócio. (5) A versão do prompt é **derivada do conteúdo montado**, por estilo (`prompt-v1-<estilo>-<hash>`), e cobre todo o texto estático que entra no prompt; mudar o conteúdo sem mudar o identificador semântico quebra a suíte, e a versão registrada no log de decisão é a do prompt efetivamente enviado. (6) Confirmação explícita é exigida **por código, não por texto de prompt**: tool com efeito só executa sobre rascunho preparado em turno **anterior** (turno derivado da mensagem de entrada, `channelId:messageId`), com dois códigos de recusa distintos, `CONFIRMATION_REQUIRED_SAME_TURN` e `NO_PENDING_CONFIRMATION`. O guard antes de efeito do Goal005 permanece intacto. (7) Não existe caminho de exceção: encaixe, override de disponibilidade, alteração de preço e desconto não são alcançáveis por nenhuma tool, e isso é asserção executável de alcance, com contagem para não ser vácuo — pedido de exceção, negociação de preço, ameaça e assédio vão para `request_human_handoff`, enquanto irritação com pedido claro e resolvível **não** gera handoff automático. (8) Erro de **domínio** e erro de **infraestrutura** são vocabulários separados, classificados na origem pelo `SchedulingClient`: o domínio chega ao modelo com o código real, para permitir alternativa; toda infraestrutura vira um único código opaco (`TOOL_INFRASTRUCTURE_ERROR`) com mensagem genérica, e o detalhe real existe só no log, com `requestId` e `aiRunId`. Nenhum host, URL, token, stack ou nome de serviço interno entra no contexto do modelo ou em mensagem enviada. (9) Rascunho substituído ou descartado **libera o hold** no mesmo caminho que grava o novo estado; falha ao liberar não derruba o turno, mas é registrada — nunca silenciosa. (10) A IA pode **oferecer** recorrência quando o serviço tem intervalo de referência, o que exigiu `/internal/services` passar a emitir `recurrenceIntervalDays`; oferecer não é criar — a série continua exigindo hold por ocorrência e confirmação global explícita. (11) As políticas de conversa têm suíte de **evals determinística** no `validate:core`, com modelo dublê, sem rede, sem chave e sem custo, que afirma apenas o que o runtime executou, recusou e persistiu, e que falha quando um passo do roteiro do dublê não é consumido.

**Alternativas:** renomear os valores antigos com `ALTER TYPE ... RENAME VALUE` ou recriar o tipo com a lista final (rejeitada: derrubaria o binário anterior e reescreveria a coluna; a compatibilidade de leitura é o que mantém o deploy reversível); manter estilo como texto livre do prompt (rejeitada: não é verificável, não é dado do negócio e deixa o produto sem contrato); dar default de banco `BALANCED` também no BFF (rejeitada: apagaria a distinção entre "não escolheu" e "escolheu o equilibrado", de que o onboarding depende); manter `AI_PROMPT_VERSION` como versão do prompt (rejeitada: string de ambiente não tem relação verificável com o conteúdo enviado); exigir confirmação apenas por instrução no prompt (rejeitada: política que só existe em texto não é política — o modelo pode preparar e confirmar no mesmo turno); repassar ao modelo a mensagem de erro do upstream e confiar que ele não a repita (rejeitada: o texto de infraestrutura já vazava para o contexto e podia virar mensagem para a cliente); liberar o hold do rascunho só no vencimento do TTL (rejeitada: deixa o horário ocupado depois de a cliente já ter mudado de ideia); eval com modelo real (rejeitada: rede, chave, custo e não determinismo dentro do gate).

**Motivo:** fechar G-21 e tornar verificáveis, por código e por suíte, as invariantes que os Goals 004–010 já garantem no domínio, antes de conhecimento e memória (012), mídia (013), telas de conversa (017), onboarding e ativação (018) e lembretes (020) dependerem delas.

**Consequências:** o binário anterior continua sendo destino seguro de rollback **enquanto nenhum tenant estiver em `CASUAL`** — valor que ele não conhece; a partir do primeiro tenant nesse estilo a estratégia é correção para frente, sem down migration, conforme registrado em [DATA_MIGRATION](DATA_MIGRATION.md). Os dois valores antigos permanecem no tipo e no vocabulário de entrada até o Goal024. Os evals provam guards do runtime e **não** qualidade de modelo real: nenhum modelo real é chamado no gate, e nenhuma afirmação sobre comportamento em produção deriva deles. Os dois resíduos registrados no [review011](reviews/011-review.md) foram fechados no Goal012, no mesmo diff: `serviceSchema.recurrenceIntervalDays` virou obrigatório e nulo no cliente da IA, com resposta sem o campo recusada como resposta inválida, e `DOMAIN_ERROR_CODES` ficou com os códigos realmente emitidos, com o que ninguém emite movido para `RESERVED_DOMAIN_ERROR_CODES`, explicitamente reservado. `AiTenantConfig.promptVersion` continua vindo de `env.AI_PROMPT_VERSION`, conceito distinto da versão derivada usada no log de decisão.

**Revisar se:** o produto passar a admitir um quarto estilo ou algum estilo que mude decisão operacional; a IA receber autorização explícita para algum caminho de exceção hoje inalcançável; ou passar a existir eval com modelo real, que exigiria decidir custo, não determinismo e onde ele roda — hoje explicitamente fora do gate.

## D-028 — Contratos de conhecimento, memória do cliente e sugestão ao humano adotados no Goal012

**Status:** ACCEPTED em 2026-09-13 pelo Tech Lead Agent no [review012](reviews/012-review.md), para o diff aceito sobre a base `4116149`, sem commit/deploy. Fecha G-24 e os dois resíduos de vocabulário que o review011 dirigiu ao 012. Reusa D-005, D-006, D-009, D-021, D-022, D-023, D-026 e D-027 — a IA continua consumindo o núcleo operacional por tool e nunca escreve agenda por fora. Não aprova modelo novo, provider novo, provider de embedding novo, mídia (G-23) nem retenção (Goal022).

**Contexto:** a infraestrutura de conhecimento existia (pgvector, `KnowledgeDocument`/`KnowledgeChunk`, nó `retrieval` no grafo), mas o único caminho de escrita era `npm run knowledge:seed` por arquivo JSON: não havia rota, versionamento operacional, FAQ por serviço, campo livre do negócio nem hierarquia entre fontes. A memória era um JSON dentro de `Conversation.state`, por conversa, sem origem, sem permissão e sem validade, que nunca sobrevivia à sessão. A única sugestão que a IA produzia era a categoria da sessão, e não havia forma de a profissional pedir ajuda de redação sem arriscar que a IA enviasse algo sozinha. `AiRun` não distinguia propósito: toda chamada de modelo era indistinguível de um turno.

**Decisão:** (1) Conhecimento é **editável pelo módulo, por rota**, nunca por seed: `GET/POST /internal/knowledge/documents`, `GET/PUT/DELETE /internal/knowledge/documents/:id` e `PUT /internal/knowledge/other-info` na IA, com o BFF expondo `/v1/knowledge/...` sob tenant de sessão e CSRF; o seed passa a usar o mesmo serviço e é ferramenta de desenvolvimento. (2) Cada salvamento cria **versão nova e inativa a anterior na mesma transação**; a identidade estável do documento é o `source`, a chave única `(tenantId, type, source, version)` continua valendo e desativar é `INACTIVE`, nunca apagar — retenção é do Goal022. Conteúdo igual (mesmo `checksum`) não gera versão nem reindexação. (3) O embedding é calculado **antes** da transação: falha do provider devolve erro de infraestrutura próprio `KNOWLEDGE_INDEX_UNAVAILABLE` e não altera nada no banco, de modo que documento `ACTIVE` sem chunks é impossível por construção, não por convenção. (4) FAQ pode ser **do serviço**: `KnowledgeDocument.serviceId` referencia o serviço do Scheduling por ID e tenant, sem FK entre bancos, e é nulo para documento geral. O campo livre "Outras informações importantes" é um único `BUSINESS_INFO` por negócio, com `source` fixa. (5) A recuperação filtra tenant, `ACTIVE` e `serviceId IS NULL OR = ANY(focus)`, com o serviço em foco lido **só do estado persistido** (rascunho ou ação pendente) — documento de outro serviço não entra —, e o prompt apresenta os trechos na **precedência do produto**: regra do serviço em foco > FAQ > dados estruturados do negócio > campo livre, seguindo apenas a fonte de maior precedência em conflito, sem reescrever o conteúdo original dela. Pergunta secundária desconhecida recebe resposta simples **sem handoff**; pergunta material para decisão ou segurança vai para handoff; a IA não completa com conhecimento geral o que o negócio não cadastrou. (6) A memória da pessoa é `CustomerMemory` no banco da IA, por `(tenantId, customerId)` do Scheduling, com tipo, valor, **origem** (`CUSTOMER_STATED`/`AI_INFERRED`/`PROFESSIONAL`), permissão de uso pela IA **por linha**, confiança quando inferida, conversa e mensagens de origem, `observedAt`/`lastReinforcedAt`, `supersededById` e `removedAt`/`removedBy`. A permissão nasce negada, é coluna e não convenção, e é filtrada **na própria consulta** — o prompt nunca recebe linha não permitida. Contradição do mesmo tipo **substitui** marcando `supersededById`, sem apagar. A `ConversationMemory` de sessão continua separada e não vira memória da pessoa por si só. (7) A IA só infere memória a partir de **efeito verificável do turno** — `AiToolCall` `SUCCEEDED` do `AiRun` daquele turno, `create_appointment` com `action = confirm` ou `confirm_recurring_appointments` —, nunca do JSON de decisão do modelo nem de rascunho não confirmado: hipótese de conversa não vira dado da pessoa. `RECURRING_SERVICE` só nasce de série recorrente confirmada; atendimento avulso apenas reforça e nunca cria linha. Não há inferência de contato ignorado, sessão pessoal ou turno atendido por humano. (8) Relevância decresce sem apagar: item mais antigo que `CUSTOMER_MEMORY_STALE_DAYS` (180) entra no prompt **marcado como antigo**, de menor peso, e `CUSTOMER_MEMORY_PROMPT_LIMIT` (12) corta por relevância, recente primeiro, nunca aleatoriamente. (9) A profissional lista, cria (origem `PROFESSIONAL`, permissão explícita e negada por padrão), altera a permissão e **remove** qualquer item, inclusive inferido; a rota nunca aceita origem vinda do chamador. (10) O resumo do cliente é gerado sob demanda, só a partir de material autorizado — memória permitida, notas e tags `aiAuthorized` do Scheduling, próximos atendimentos —, não é persistido como verdade e **nunca roda sem `AiRun`**: sem pessoa vinculada recusa `CUSTOMER_NOT_LINKED`, sem conversa para ancorar o registro recusa `SUMMARY_NOT_AUDITABLE` (409), ambos antes de qualquer chamada ao modelo, e `aiRunId` é obrigatório no DTO dos três apps. (11) A sugestão de resposta ao humano roda **fora do grafo**, com binding de tools **somente leitura**: nenhuma tool com efeito é sequer oferecida ao modelo, e nenhum hold, rascunho, `Message` ou linha de outbox nasce — asserção executável de alcance, com contagem. Até três sugestões, devolvidas ao chamador e nunca enviadas: o envio continua sendo o caminho humano existente, inalterado. Cinco recusas próprias, todas anteriores ao modelo e ao `AiRun`: `CONTACT_IGNORED`, `SESSION_PERSONAL`, `HUMAN_HANDLING_REQUIRED`, `AI_DISABLED` e `NO_TEXTUAL_MESSAGE`. Sugestão nunca é gerada por comando de WhatsApp. (12) `AiRun.kind` (`TURN` default, `SUGGESTION`, `SUMMARY`) torna toda chamada de modelo auditável pela mesma tabela e distinguível por propósito. (13) Cada família de rota interna tem escopo próprio (`knowledge:read/write`, `customer-memory:read/write`, `customer-summary:write`), com o destino `internal:unmapped` preservado: caminho interno sem escopo declarado continua falhando fechado. (14) O texto novo de prompt entra em `buildStablePromptContent`, com os hashes fixados recalculados de forma consciente, e a versão efetiva é registrada em turno, resumo e sugestão; estilo continua mudando só registro.

**Alternativas:** manter o seed como interface operacional e expor só leitura (rejeitada: o negócio não consegue corrigir o que a IA responde); apagar a versão anterior ao salvar (rejeitada: destrói a única trilha de por que a IA respondeu o que respondeu, e retenção é decisão do Goal022); calcular o embedding dentro da transação (rejeitada: falha do provider deixaria documento ativo sem chunks, isto é, conhecimento que a IA nunca acha); guardar permissão de uso como regra de aplicação em vez de coluna (rejeitada: permissão que não está na linha não pode ser filtrada na consulta e vaza no primeiro caminho novo); inferir memória do JSON de decisão do modelo (rejeitada: é o que o modelo **afirmou**, não o que aconteceu — foi exatamente o defeito da rodada 1); tratar uma menção de serviço como recorrência (rejeitada: uma ocorrência não é recorrência, e o rótulo chegaria à profissional como fato); permitir resumo sem `AiRun` quando não há conversa (rejeitada: seria chamada real de modelo sobre dado pessoal sem registro de auditoria); gerar a sugestão dentro do grafo com as tools normais e confiar em guard de envio (rejeitada: a garantia tem de ser de alcance — tool com efeito não pode nem ser oferecida ao modelo); reusar `AiRun` sem `kind` (rejeitada: sugestão e resumo ficariam indistinguíveis de turno na auditoria).

**Motivo:** fechar G-24 — a IA responde só com o que o negócio cadastrou, lembra do cliente só com o que tem permissão de usar e ajuda a profissional sem nunca enviar nada sozinha — antes de as telas de conhecimento, cliente e conversa (Goals 015, 017 e 018) consumirem esses contratos, e sem tocar mídia (G-23, Goal013).

**Consequências:** a migration é aditiva e o binário anterior ignora `serviceId`, `kind` e `CustomerMemory`, mas **a segmentação por serviço não sobrevive a uma reversão de binário**: documento com `serviceId` volta a ser tratado como geral, porque a versão anterior não filtra por serviço em lugar nenhum — limite registrado em [DATA_MIGRATION](DATA_MIGRATION.md). A persistência de `KnowledgeChunk` com embedding continua sem prova contra banco nesta máquina: o PostgreSQL descartável dos gates não tem a extensão `vector` e o ensaio pula essa parte com skip nomeado. Memória `AI_INFERRED` entra no prompt já na **primeira** confirmação, então `PREFERRED_DAY`/`PREFERRED_PERIOD` se comportam como "último dia marcado" rotulado de preferência — resíduo dirigido ao próximo Goal que tocar memória (o 015 exibe a lista): exigir reforço por conversa diferente antes de levar `AI_INFERRED` ao prompt. `RECURRING_SERVICE` inferido depende de série confirmada porque não existe porta de histórico de atendimentos passados na IA. O modo sugestão recupera conhecimento **sem** serviço em foco, ao contrário do turno. FAQ por serviço só é recuperável depois de o serviço entrar no rascunho ou na ação pendente: serviço apenas citado em texto livre não conta. `PUBLIC_API_V1.md` descreve as recusas de sugestão por situação sem listar os códigos, que ficam registrados no [review012](reviews/012-review.md) para o consumidor do contrato (Goal017). Os evals continuam provando guards do runtime e não qualidade de modelo real: nenhum modelo e nenhum provider de embedding real foi chamado em teste.

**Revisar se:** o produto admitir base de conhecimento por arquivo/PDF ou sugestão automática de FAQ (hoje explicitamente fora do MVP); a IA passar a aprender conhecimento a partir de conversa humana; existir porta de histórico de atendimentos na IA, que mudaria a regra de `RECURRING_SERVICE`; ou a retenção do Goal022 definir descarte de documento inativo e de memória removida.

## D-029 — Contratos de mídia, transcrição de áudio e transporte sem perda adotados no Goal013

**Status:** ACCEPTED em 2026-09-13 pelo Tech Lead Agent no [review013](reviews/013-review.md), para o diff aceito sobre a base `e602b4b`, sem commit/deploy. Fecha G-23. Reusa D-007 (inbox/outbox duráveis), D-009 (política de contato/sessão fora do LLM), D-021 (contato, sessão e controle humano), D-027 (confirmação explícita por código) e D-028 — a IA continua consumindo o núcleo operacional por tool e nenhum guard foi enfraquecido para aceitar áudio. Não aprova provider de modelo novo, framework novo, armazenamento durável de mídia, visão computacional, leitura de PDF, telas de conversa (Goal017) nem retenção (Goal022).

**Contexto:** toda mensagem não textual recebia a resposta fixa "consigo responder melhor por texto", não era persistida como `Message` — ficava invisível na inbox —, não renovava a sessão e não tinha transcrição. Ao mesmo tempo, a mídia atravessava o transporte de um jeito que ninguém tinha decidido: com `MINIO_ENABLED=false` (default), o Evolution Go baixava o arquivo na recepção e o embutia em base64 no webhook; a IA persistia esse payload inteiro em `ProcessedEvent.rawPayload`, de modo que bytes de mídia já entravam no PostgreSQL; e, sem `bodyLimit` declarado, o Fastify recusava com `413` qualquer corpo acima de 1 MiB, que o produtor de webhook do Go trata como rejeição definitiva — mídia acima de ~750 KB era simplesmente perdida.

**Decisão:** (1) **Toda** mensagem recebida do contato é persistida como `Message`, texto ou não, com `kind` (`TEXT` default, `AUDIO`, `IMAGE`, `DOCUMENT`, `VIDEO`, `STICKER`, `UNKNOWN`); mídia gera uma linha `MessageAttachment` por `(tenantId, messageId)` com mimetype, nome, tamanho, duração, `mediaUrl` quando o provedor hospedou, `tooLarge` e o resultado da transcrição com proveniência. Contato ignorado e sessão pessoal continuam persistindo a mensagem e parando antes do processamento, como no Goal005. (2) A IA **não retém byte de mídia**: `data.Message.base64` é dado de trânsito, removido de `Message.rawPayload` na persistência e de `ProcessedEvent.rawPayload` em todo ponto terminal do evento (conclusão, falha exaurida, registro já ignorado), com backfill da mesma purga sobre o estoque já concluído — evento **pendente** nunca é tocado, porque o base64 é a fonte de bytes do processamento em curso. As demais chaves do proto (`url`, `mediaKey`, `directPath`, `fileSHA256`) são preservadas: são a chave do download sob demanda, não os bytes. A purga **não é reversível** e a plataforma não guarda cópia própria. (3) O limite de corpo do webhook passa a ser **explícito** e por rota (`EVOLUTION_WEBHOOK_BODY_LIMIT_BYTES`, 32 MiB) em vez do 1 MiB implícito do Fastify, e o Go aplica um teto de mídia embutida (`WEBHOOK_MEDIA_INLINE_MAX_BYTES`, 16 MiB) por função pura testada: acima dele o webhook segue **sem** `base64`, com metadados e `mediaTooLarge: true`. A política de entrega do webhook no Go não muda — a rejeição definitiva por `4xx` continua, e o que deixa de existir é o `4xx` por tamanho. (4) A transcrição roda num nó do grafo **entre `recordInbound` e `sessionGate`**, e a posição é a regra: depois do primeiro porque precisa do attachment persistido, antes do segundo porque a inbox mostra o texto do áudio **também** com a IA desligada, em pausa e em atendimento humano. Os únicos bloqueios são contato ignorado e sessão pessoal, que gravam `SKIPPED` com motivo nomeado antes de qualquer byte ou chamada de rede. (5) A transcrição é uma **porta** (`TranscriptionProvider`), com implementação OpenAI por HTTP sobre a conta já configurada — sem dependência nova, sem provider novo — e dublê em teste; nenhum teste chama a API real. Os bytes vêm do `base64` do evento em processamento ou, na falta dele, de `POST /message/downloadmedia` no Go, pela mesma credencial de instância do envio. Teto de tamanho e de duração geram `SKIPPED` com motivo, nunca transcrição parcial. (6) Falha de transcrição **não inventa texto**: grava `FAILED` com motivo (`MEDIA_UNAVAILABLE`, `PROVIDER_FAILED`, `EMPTY_TRANSCRIPT`), a IA pede o conteúdo por escrito e a inbox mostra a indisponibilidade. (7) A transcrição concluída vira o texto do turno **marcada como transcrição** (`[audio transcrito]`), com a seção de prompt correspondente dizendo que o texto é automático e pode errar palavra, nome, número, data e horário, e que dado crítico ilegível se pergunta em vez de adivinhar. **Confirmação clara em áudio vale como confirmação** sob exatamente os mesmos guards de rascunho preparado em turno anterior e confirmação explícita do Goal011: nenhuma exceção nova. (8) Imagem não é interpretada: com a IA elegível ela gera **handoff determinístico** (`reason` `image_received`) com resposta curta fixa, decidido antes de qualquer chamada de modelo e sem tratar a legenda como pedido; com atendimento humano em curso, apenas persiste. (9) Documento e vídeo são visíveis sem interpretação, com confirmação fixa e sem handoff; a legenda de documento segue como texto do contato pelo caminho normal. Sticker, GIF e `unknown` persistem sem resposta, sem handoff e sem renovar a sessão — GIF é `videoMessage` com `gifPlayback: true` e fica ao lado de sticker por decisão de produto, não por tipo de arquivo. Áudio, imagem, documento e vídeo renovam a sessão como qualquer interação do contato. (10) A mídia é exibível **sob demanda**, nunca por URL no DTO: `GET /internal/conversations/:id/messages/:messageId/media` (BFF `/v1/...`, tenant da sessão) devolve os bytes por `mediaUrl` ou por download no Go, com recusas próprias (`MESSAGE_NOT_FOUND`, `MEDIA_TOO_LARGE`, `MEDIA_UNAVAILABLE`) em vez de `500` genérico; o DTO expõe `kind`, `attachment` e `mediaAvailable`, com `kind` e `attachment` opcionais e a ausência significando `TEXT` sem anexo. (11) `generateSuggestions` aceita a transcrição `DONE` do último áudio como texto do cliente; imagem, documento e transcrição indisponível continuam recusados como `NO_TEXTUAL_MESSAGE`. (12) O texto novo de prompt entra em `buildStablePromptContent` e o template sobe para **v3**, com os hashes fixados recalculados de forma consciente.

**Alternativas:** manter mídia fora da inbox até o Goal017 (rejeitada: a conversa fica com buracos e a profissional não sabe o que a cliente mandou); guardar os bytes da mídia no PostgreSQL da IA para garantir exibição futura (rejeitada: transforma o banco da conversa em armazenamento de arquivo e cria retenção de dado pessoal que ninguém decidiu — armazenamento durável é decisão de infraestrutura própria); aumentar só o `bodyLimit` da IA sem teto no Go (rejeitada: empurra o limite para frente sem eliminar a classe de perda, porque `4xx` do produtor é definitivo); transcrever **depois** do `sessionGate` (rejeitada: a inbox deixaria de mostrar o áudio justamente quando a profissional está atendendo, que é quando ela mais precisa); transcrever também contato ignorado, para a inbox ficar completa (rejeitada: Ignorar IA é absoluto e anterior a qualquer leitura de conteúdo — D-009 e G-22); devolver texto aproximado quando a transcrição falha (rejeitada: inventar fala da cliente é pior do que admitir que não deu para ouvir); interpretar a legenda da imagem como pedido (rejeitada: é interpretação de imagem por via indireta, e o produto manda encaminhar a humano); tratar GIF como vídeo comum (rejeitada: o produto o coloca junto de sticker, e responder a um GIF é ruído); expor `mediaUrl` no DTO (rejeitada: vazaria URL do provedor para o navegador, fora do escopo de tenant).

**Motivo:** fechar G-23 — a conversa não textual passa a seguir o fluxo do produto em vez de morrer numa resposta genérica — e deixar a inbox pronta para a tela de conversa do Goal017, resolvendo no caminho duas falhas de transporte que já existiam na baseline (bytes de mídia no PostgreSQL e mídia perdida por `413`), sem tocar fronteira entre apps, framework ou provider.

**Consequências:** a migration é aditiva e o binário anterior ao Goal013 ignora `kind` e `MessageAttachment` — volta a tratar mídia como `unsupported`, mas não perde a linha. A purga, essa sim, é definitiva: depois que um evento concluído perde o `base64`, nenhum binário o recupera a partir do banco. A disponibilidade de mídia para exibição depende inteiramente da origem (WhatsApp pelo `directPath`, ou MinIO quando habilitado) e **não é garantida para mensagem antiga**; mídia `tooLarge` fica visível só como metadado, sem bytes e sem transcrição. `webhook_deliveries` no Go continua guardando o payload integral do evento, incluindo o `base64` — mesmo limite já registrado em G-04, que pertence ao Goal022. Nenhuma transcrição real foi executada em teste: todo provider é dublê e os evals provam roteamento e guards, não qualidade de reconhecimento de voz. O proxy de mídia do BFF usa `INTERNAL_HTTP_TIMEOUT_MS` (10 s) enquanto o download sob demanda da IA admite até 60 s, então mídia que exija download da origem pode virar `UPSTREAM_ERROR` 502 no BFF — resíduo dirigido ao Goal017. `Message` e `MessageAttachment` são criados fora de uma transação única: falha entre os dois deixa o áudio sem attachment e a transcrição daquele turno vira `SKIPPED`/`NO_ATTACHMENT`, sem retomada automática.

**Revisar se:** o produto adotar armazenamento durável próprio de mídia (MinIO/S3), que muda a garantia de disponibilidade e reabre a decisão de retenção; a IA passar a interpretar imagem ou documento (visão/PDF), hoje explicitamente fora do MVP; o envio de mídia pela profissional (Goal017) exigir caminho de saída além do texto; ou a retenção do Goal022 definir descarte de attachment, transcrição e payload de evento.

## D-030 — Fundação visual, shell compartilhado e status honesto adotados no Goal014

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review014](reviews/014-review.md), para o diff aceito sobre a base `7ad3b66`, sem commit/deploy. Fecha G-31 na parte de fundação, G-30 na parte de read model e shell e G-34 na parte de UX. Reusa D-007 (frontend fala só com o BFF), D-017 e D-018. Não aprova design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo, tema escuro, recuperação de senha real, reconciliação desired/effective nem redesenho das telas de módulo.

**Contexto:** o backend dos Goals 004–013 já entregava contratos e estados confiáveis, mas o frontend os apresentava com o shell antigo — três destinos mais “Mais” no mobile, com Clientes escondido —, com a identidade Inter/IBM Plex Mono, com rotas de preview e `personas-ui` misturadas ao produto e, sobretudo, com `whatsapp = "connected"` assumido por omissão quando o caller não informava estado. Ao mesmo tempo, `GET /v1/settings` devolvia o `ai.enabled` **desejado** do BFF enquanto a IA guardava o `AiTenantConfig.enabled` **efetivo**, sem rota de leitura: não existia lugar nenhum onde a diferença entre os dois fosse visível.

**Decisão:** (1) Os tokens semânticos passam a viver num arquivo único (`src/shared/styles/tokens.css`) na direção Recepção, cobrindo cor, tipografia, espaçamento, raio, sombra, foco, z-index e movimento com `prefers-reduced-motion`, em **tema claro apenas**; o CSS por módulo das telas ainda não redesenhadas sobrevive, mas herda esses tokens, de modo que nenhuma tela fica visualmente partida enquanto espera seu Goal. (2) Tipografia é **servida localmente**: Literata e Hanken Grotesk em woff2 sob `public/fonts/`, com o `OFL.txt` de cada família versionado e fallback declarado — nenhuma fonte carregada de terceiro em runtime. (3) O modelo de navegação é **dado**, não markup: `shared/layout/navigation.ts` declara destinos, abas do mobile, destinos de “Mais” e ação contextual, o que torna a regra de produto (cinco destinos, Clientes visível, “Mais” como lista) testável sem render. (4) O shell é montado **uma vez** por `app/(platform)/layout.tsx`; as telas declaram destino, título, ação e sinalizadores por `useShellConfig`, com a invariante de **uma chamada por árvore renderizada** — o hook aplica um layout effect sem lista de dependências, então duas declarações vivas na mesma cadeia com configs divergentes produzem loop infinito de render. (5) Status é **lido**, nunca inferido: `GET /v1/status` no BFF verifica Evolution e IA na própria requisição e devolve `whatsapp` (`CONNECTED`/`DISCONNECTED`/`UNKNOWN` com `phoneNumber` e `checkedAt`), `ai` (`desiredEnabled` local, `effectiveEnabled` da IA ou `null`, `state` derivado `ACTIVE`/`OFF`/`PENDING`/`UNKNOWN`) e `degraded`; dependência indisponível vira `UNKNOWN` com `200` e `degraded: true`, **nunca** `500`, e o erro fica no log. `GET /v1/dashboard` não muda de contrato — `/v1/status` é aditivo. (6) A leitura do efetivo é uma rota interna própria da IA (`GET /internal/ai-tenant-config`) sob escopo **de leitura** (`tenant-config:read`, concedido só ao uso `command`), que devolve `null` quando o tenant nunca foi projetado, sem fabricar default. (7) Na UI, os quatro estados visuais são distintos e nunca comunicados só por cor: carregando enquanto a primeira resposta não chega, desconhecido quando a leitura falha, ativo só com confirmação e desligado no resto — não existe mais default conectado no código. (8) A autenticação real do Goal003 é preservada inteira e só o visual muda; a recuperação de senha é **experiência visual** por máquina de estados pura, sem rede e sem qualquer copy que afirme envio de e-mail, e o fluxo real por link continua existindo **sem entrada pela UI**. (9) Preview, telas de demonstração e `personas-ui` saem do repositório: o que está no produto é produto.

**Alternativas:** manter o default `connected` e só trocar a cor do indicador (rejeitada: é exatamente a mentira que G-30 descreve — o usuário acredita que a automação funciona); derivar o status da configuração salva em vez de verificar a dependência (rejeitada: dado salvo é desejado, não efetivo); devolver `500` quando Evolution ou IA não respondem (rejeitada: transforma indisponibilidade de dependência em falha da tela inteira, quando o honesto é dizer “não sei”); colapsar `PENDING` em `OFF` já no contrato (rejeitada: o BFF perderia a única informação que o Goal018 precisa para reconciliar — a UI colapsa na apresentação, o contrato não); carregar as fontes do Google Fonts como o protótipo faz (rejeitada: dependência de terceiro em runtime e dado de navegação vazando para fora); adotar Tailwind/shadcn ou um design system de terceiros para acelerar as primitivas (rejeitada por guardrail do produto); redesenhar as telas de módulo junto (rejeitada: cada uma tem Goal próprio e o escopo aqui é a base compartilhada); manter as rotas de preview como ambiente de demonstração (rejeitada: obrigavam o gate de sessão a ter exceção e confundiam inventário de feature com frame).

**Motivo:** abrir o bloco de interface pela base compartilhada, para que os Goals 015–018 e 023 construam sobre tokens, primitivas, shell e status já resolvidos, e para que a primeira coisa que o produto mostra sobre si mesmo — se o WhatsApp está conectado e se a IA está respondendo — deixe de ser uma suposição.

**Consequências:** toda tela nova precisa declarar sua configuração de shell **uma única vez** por árvore renderizada; violar isso não dá erro de tipo, dá loop infinito em runtime. Desde o Goal015 existe gate para isso em jsdom (`tests/goal015-shell-invariant.test.tsx` monta `ShellConfigProvider` mais as telas reais), mas o gate de browser continua só em rota pública. `/v1/status` é uma consulta síncrona a duas dependências por chamada, e `/inicio` hoje a faz por dois pollers independentes (shell e tela), cada um revalidando a 45 s e no foco. `PENDING` chega ao frontend mas ainda se apresenta como desligado, então quem ligou a IA e ainda não teve o tenant projetado lê a mesma copy de quem a desligou. `PUBLIC_API_V1.md` descreve `OFF` como independente do que a IA relate, enquanto a derivação verifica a disponibilidade da dependência antes do desejado — a combinação “desejado desligado com a IA fora do ar” responde `UNKNOWN`. As telas ainda não redesenhadas dependem de o CSS de módulo herdar os tokens; em ≤1099px o rail da sidebar ficou sem indicador de status por uma regra legada. O fluxo real de recuperação por link permanece no código sem porta de entrada — dívida declarada, não removida.

**Revisar se:** o Goal018 assumir a reconciliação desired/effective e a autoativação, que reabre a semântica de `PENDING` e a copy do status; o produto decidir recuperação de senha real, que reabre G-34; o shell precisar de estado compartilhado além de configuração de tela, que reabre a escolha de não ter store global; ou o gate renderizado passar a cobrir sessão autenticada, que muda o que pode ser provado sobre o shell.

## D-031 — Decomposição por módulo, identidade por ID e autorização negada por padrão na UI, adotadas no Goal015

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review015](reviews/015-review.md), para o diff aceito sobre a base `908c4a1`, sem commit/deploy. Fecha G-15 na parte de interface e G-17 na parte de tela, e avança G-31 nas duas primeiras telas de módulo. Reusa e não altera D-005 (pessoa por ID, telefone não é identidade), D-007, D-017, D-018 e D-030. Não altera nenhum contrato público: `apps/bff/PUBLIC_API_V1.md` não muda e nenhum endpoint foi criado.

**Contexto:** o modelo de domínio dos Goals 006, 007 e 012 estava inteiro no backend e inteiramente mapeado no adapter do frontend, e nenhuma tela o alcançava. Clientes e Serviços viviam num único arquivo de 1318 linhas servindo sete rotas, com cinco chamadas de `useShellConfig` sustentadas por branches mutuamente exclusivos, mostrando do cliente apenas nome e telefone e do serviço apenas dois campos. O histórico do cliente era carregado por `customerPhone` — a identidade que o Goal006 removeu do domínio, mas que a interface ainda usava.

**Decisão:** (1) Cada módulo de produto vira uma pasta de feature própria, com um componente de topo que **despacha os estados da tela** (lista, criação, detalhe, edição) e declara `useShellConfig` uma única vez por branch, com os valores derivados do estado — nunca uma chamada por componente aninhado. A invariante do D-030 passa a ser provada por **render**, montando `ShellConfigProvider` mais a tela real em jsdom, e não por leitura de código. (2) Toda requisição de agenda ou histórico feita a partir do cliente usa `customerId`; `customerPhone` permanece no adapter apenas para os chamadores que consultam por número, e nenhuma tela de cliente o usa. Filtrar a agenda de uma pessoa por telefone é reintroduzir na UI a identidade que o domínio abandonou. (3) Observação, tag e memória criadas pela profissional nascem **não autorizadas** para a IA, sem exceção e sem controle marcado por conveniência de formulário; a autorização muda só por ação explícita, e a UI diz o que autorizar significa. (4) A tela só mostra o que o read model devolve: campo que o contrato não tem não aparece, não é fabricado e não é insinuado por controle de filtro ou paginação inexistente. Ausência de dado legítima — cliente sem nome, cliente sem telefone, serviço sem duração — tem apresentação própria e explícita, nunca string vazia ou placeholder. (5) Estado nunca é comunicado só por cor: ativo/inativo, pendência de revisão e autorização de IA carregam texto ou ícone. (6) Formulário com muitos campos usa progressive disclosure nativa, com o essencial visível e o restante revelável, e a revelação nasce aberta quando o registro editado já usa algum campo escondido. (7) Ampliar read model para alimentar tela é decisão de escopo própria, não efeito colateral de um Goal de UI: o que falta se declara como limite.

**Alternativas:** manter o arquivo único e só redesenhá-lo (rejeitada: as cinco chamadas de `useShellConfig` continuariam dependendo de branches mutuamente exclusivos, invariante silenciosa que a primeira composição nova quebraria); provar a invariante do shell por convenção ou revisão de código (rejeitada: o Goal014 mostrou que a leitura passa e o runtime estoura); manter `customerPhone` na agenda do perfil por compatibilidade com a fonte externa (**rejeitada na rodada 2**: os clientes vêm sempre do store da Atendly, onde dois cadastros podem compartilhar número, então o perfil voltaria a exibir atendimentos de outra pessoa); bloquear a agenda em fonte externa com painel próprio (rejeitada na rodada 3: o perfil inteiro já é barrado antes por `requireAtendlyCalendar`, e o painel descreveria um estado que não ocorre); preencher último/próximo atendimento e contagem na lista com o que a agenda devolve (rejeitada: seria N requisições por lista e um read model inventado na tela); nascer autorizado para reduzir cliques (rejeitada por guardrail de produto).

**Motivo:** a operação depende desses dois cadastros, e o que o produto promete sobre dado pessoal — que a IA só usa o que foi autorizado e que cada pessoa tem sua própria ficha — só é verificável quando a tela mostra a autorização, a proveniência e a identidade real.

**Consequências:** os Goals 016–018 e 023 herdam o formato: uma pasta de feature por módulo, um despachante de estados, uma declaração de shell por árvore e teste renderizado provando isso. `features/directory/` ficou vazia, `atendly-directory.css` ficou importado sem dono e `features/customers/types.ts` e `features/services/types.ts` ficaram sem importador — **todos removidos no Goal016**. O provider Minha Agenda ignora `customerId` e só filtra por `customerPhone`, então qualquer tela futura de agenda em fonte externa precisa de guard explícito por fonte — o Goal016 o declarou na interface (D-032) sem alterar o provider. Métricas do cliente, último/próximo atendimento e contagem na lista, busca de servidor e paginação seguem indisponíveis por falta de read model. O gate de browser continua em rota pública: nada sobre largura, contraste ou foco das telas novas está provado por render real.

**Revisar se:** o Goal016 precisar de agenda em fonte externa, que obriga a resolver identidade externa ou a declarar guard por fonte; algum Goal ampliar `GET /v1/customers` com último/próximo atendimento, contagem ou filtro de servidor, que reabre o desenho da lista; o gate renderizado passar a cobrir sessão autenticada, que muda o que pode ser provado sobre essas telas; ou o produto decidir que alguma superfície de dado pessoal pode nascer autorizada, que reabre (3).

## D-032 — Contratos da Agenda na interface: leitura de bloco, ator derivado da sessão, hold com ciclo de vida e guard por fonte, adotados no Goal016

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review016](reviews/016-review.md), para o diff aceito sobre a base `2297b71`, sem commit/deploy. Fecha G-13 na parte de interface e avança G-31 na Agenda. Reusa e não altera D-005 (pessoa por ID, telefone não é identidade), D-006, D-024, D-025, D-030 e D-031. Muda `apps/bff/PUBLIC_API_V1.md` em **dois** pontos e em nenhum outro.

**Contexto:** o domínio da agenda estava inteiro desde os Goals 008 e 009 — política única de escrita, hold pelo relógio do banco, sobreposição só por decisão humana registrada, estado/presença/valor final separados, histórico por evento, compromisso pessoal distinto de bloqueio, séries finitas, exceções geridas — e o adapter do frontend mapeava quase tudo. Nenhuma tela consumia nada disso: a agenda era uma lista de uma semana com filtro local, criava atendimento com um serviço só exigindo telefone, e não mostrava bloqueio algum, porque **não existia rota de leitura de bloco em camada nenhuma**. O `decidedBy` da indisponibilidade ainda vinha do corpo, resíduo que o [review009](reviews/009-review.md) dirigiu às telas de agenda.

**Decisão:** (1) A ocupação exibida tem de ser a ocupação real, e para isso a leitura de bloco vira contrato: `GET /internal/time-blocks` e `GET /v1/time-blocks?startDate&endDate`, escopados por tenant, com **janela obrigatória** — leitura sem limite não é oferecida — e a mesma forma das respostas de escrita, inclusive `kind`, `title` e `seriesId`, porque sem o `id` da ocorrência a tela não pode editá-la nem movê-la. (2) **Identidade de ator não vem do cliente:** `decidedBy` deixa de ser campo de corpo e passa a ser derivado de `internalContext(request).userId`, como o `source` da mutação no Goal009; `decidedReason` continua vindo do corpo, porque é conteúdo humano e não identidade. Corpo antigo que ainda envie o campo é aceito com o valor ignorado, nunca `400`. (3) O hold tem **ciclo de vida na interface**, não só no domínio: escolher horário reserva, confirmar consome, abandonar o fluxo ou trocar de horário libera, e expirar tem mensagem própria que leva a reescolher — a tela nunca finge que o horário continua garantido, e nunca transforma hold perdido em erro genérico. (4) Sobreposição é decisão humana com motivo: a tela mostra o que ocupa o intervalo e recusa o envio sem `overlapOverrideReason`, junto ao campo, em vez de pedir uma recusa do servidor que ninguém entende. (5) **Ocorrência e série são coisas diferentes na UI**, com chamadas diferentes e texto que explica o efeito — editar a série a partir de uma data encerra a atual e preserva o passado, e confundir as duas apagaria trabalho da profissional. (6) Série de atendimento é atômica: a pré-visualização mostra ocorrência ajustada como ajustada e indisponível como indisponível, e a confirmação é única com `Idempotency-Key`; a tela não oferece confirmar "as que deram certo". (7) **Guard por fonte antes de montar o fluxo:** `calendar.source` e `calendar.capabilities` são resolvidos antes de qualquer outra requisição, operação indisponível é explicada pela capability correspondente e não oferecida, e leitura que a fonte não sabe escopar não é emitida. (8) Fluxo que existe só como componente não é entrega: cada cenário precisa de rota alcançável, e rota nova criada por exigência de fluxo é declarada.

**Alternativas:** derivar a ocupação de bloco a partir das respostas de escrita ou de busca de disponibilidade (rejeitada: não devolve o `id` da ocorrência, e a agenda continuaria mentindo sobre o que já está ocupado); manter `decidedBy` no corpo por compatibilidade (rejeitada: o único consumidor é o frontend deste repositório, e aceitar identidade declarada pelo cliente é o oposto do que o Goal009 fez com `source` — a compatibilidade foi preservada ignorando o campo, não honrando-o); buscar bloco e exceção sempre e tratar o erro (**rejeitada na rodada 1**, depois de ter sido implementada assim: as duas rotas caem em `requireAtendlyCalendar` e uma rejeição derrubava a tela inteira em tenant externo, regredindo o que a baseline já entregava); confiar no filtro por pessoa do provider externo (rejeitada: `minha-agenda/provider.ts` ignora `customerId` e listaria a agenda inteira do profissional como se fosse de uma pessoa); Dia como lista ordenada por horário (rejeitada na rodada 1: o produto promete grade cronológica, e a mecânica de posição já existia na Semana); entregar os fluxos de série e exceção como componentes a compor depois (**rejeitada na rodada 1**: componente sem rota não existe para quem usa).

**Motivo:** a Agenda é o núcleo operacional. Uma tela que esconde bloqueio, que trata reserva temporária como garantia, que deixa sobrepor sem registro, que confunde ocorrência com série ou que oferece operação que a fonte vai recusar não é uma versão incompleta do produto — é uma versão que faz a profissional perder horário, trabalho e confiança.

**Consequências:** `GET /v1/time-blocks` passa a ser contrato público mantido, com janela obrigatória; qualquer leitor novo de bloco usa essa forma. `POST /v1/availability-exceptions/unavailable` não tem mais campo de ator, e o mesmo padrão vale para toda rota futura que registre decisão humana. A agenda vive em `features/agenda/` com nove rotas e dois call sites de `useShellConfig` — o formato do D-031 confirmado num módulo de nove cenários. Bloco que atravessa a meia-noite não é exibido depois da virada: `timeBlockEntries` atribui o dia de início e trunca em 24h, e hoje não há produtor na UI, mas a rota devolve esses blocos por sobreposição de janela. O provider Minha Agenda continua sem identificar pessoa por ID: o risco foi fechado na interface, não na fonte. Nenhum gate cobria `apps/frontend/tests/` — **fechado no Goal017** (D-033), que ampliou o script de lint do frontend para `src` e `tests` com `--max-warnings=0` e corrigiu na origem o que a ampliação acusou, inclusive nas suítes deste Goal. Nenhuma tela autenticada foi exercitada em browser.

**Revisar se:** algum consumidor precisar ler bloco sem janela ou por outro recorte, que reabre (1); a fonte externa passar a identificar pessoa por ID, que torna o guard de (7) conservador demais; a UI passar a criar bloco que atravessa a meia-noite, que obriga a partir a entrada em dois dias; o gate renderizado ganhar sessão autenticada, que muda o que pode ser provado sobre essas telas; ou o produto decidir que alguma sobreposição pode ser automática, que reabre (4) e contraria D-006.

## D-033 — Conversas na interface: um campo de identidade, dois sucessos de envio distintos, teto próprio para mídia e a recusa de afirmar o que nenhuma camada calcula, adotados no Goal017

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review017](reviews/017-review.md), para o diff aceito sobre a base `6582a65`, sem commit/deploy. Fecha G-22, G-23 e G-09 na parte de interface e avança G-31 na última tela de módulo pesada. Reusa e não altera D-005 (pessoa por ID, telefone não é identidade), D-018, D-030, D-031 e D-032. Muda `apps/bff/PUBLIC_API_V1.md` em três pontos: o campo novo do DTO de conversa, a semântica dos dois sucessos do envio e a tabela nominal das recusas de sugestão.

**Contexto:** tudo o que a tela de conversas precisava já existia atrás dela desde os Goals 004, 005, 011, 012 e 013 — estado de entrega persistido antes do transporte, categoria de sessão com override manual e ignore absoluto, controle humano gravado no envio, sugestões com binding somente leitura, mídia com transcrição e download sob demanda. A interface não consumia quase nada disso: um monolito de 964 linhas servindo duas rotas, com filtros locais (`ai`/`waiting`/`paused`/`resolved`/`unread`) que não são vocabulário do produto, busca em memória sobre 100 itens carregados, quatro métodos do adapter sem consumidor, e uma aba, um contador e um badge de não lidas alimentados por um `unreadCount` que a origem devolve sempre zero.

**Decisão:** (1) **Identidade também na conversa:** `customerId` nulável passa a ser projetado no DTO de conversa e aceito como opcional em todas as camadas, porque o painel de contato precisa ligar para a pessoa — casar por telefone é a identidade que os Goals 006, 015 e 016 removeram. É o único campo novo, e é aditivo. (2) **A tela não afirma o que nenhuma camada calcula:** aba, contador e badge de `unreadCount` foram removidos em vez de mantidos com valor falso; criar estado de leitura é persistência nova e fica fora. A mesma regra derruba a copy que chamava `201` de entrega confirmada. (3) **Dois sucessos com sentidos distintos não podem virar um:** o BFF passou a repassar o status do serviço interno (`requestWithStatus`), porque colapsar `202` em `201` apresentava como despachada uma tentativa que a plataforma não conseguiu despachar; `deliveryState` continua sendo quem fala de entrega. (4) **Filtro é query, não memória:** abas, ignorados e busca viajam como `category`, `ignored` e `search` para o BFF, com limite explícito e sem afirmar total. (5) **Estado é derivado do contrato**, não de heurística sobre nome de filtro, e o componente automatizado chama-se IA. (6) **Mídia só pelo proxy:** bytes sob demanda como blob local, cancelável, sem nenhuma URL da origem na árvore, com `mediaAvailable: false` e `tooLarge` ditos como são e as recusas próprias lidas de `upstreamCode`. (7) **Caminho de transporte tem teto próprio:** o proxy de mídia deixou de herdar o teto das rotas JSON e passou a ter um maior que o download sob demanda da IA. (8) **Operação declarada entregue tem de existir na tela:** método de adapter sem consumidor conta como não entregue, como o `setIgnored` da rodada 1 mostrou.

**Alternativas:** manter `unreadCount` na tela por continuidade visual (rejeitada: três afirmações que nunca podem ser verdadeiras); criar estado de leitura neste Goal para que a contagem passasse a valer (rejeitada: persistência nova, sem contrato em camada alguma, fora do escopo de uma tela); manter o contrato `201`-sempre e apenas remover o ramo morto de `202` (**considerada e não escolhida na rodada 2**: era aceitável, mas apagava do consumidor a diferença que a IA já sabe declarar); filtrar em memória com o que a lista já carregou (rejeitada: a busca do BFF existe e é servida pelo `contains` da IA, e filtro local mente sobre o conjunto); exibir mídia por URL da origem (rejeitada: a plataforma não guarda bytes e expor a origem vazaria caminho de terceiro); ampliar o teto JSON para caber no download de mídia (rejeitada: afrouxaria todas as rotas para resolver uma).

**Motivo:** a inbox e o chat são onde a profissional decide o que fazer com a pessoa do outro lado. Uma tela que mostra contagem inventada, que chama tentativa de confirmação, que esconde o motivo do handoff, que oferece reenviar o que pode ter chegado ou que apresenta transcrição como se fosse texto digitado não é uma versão incompleta do produto — é uma versão que faz a profissional agir sobre fato que não existe.

**Consequências:** `customerId` passa a ser o vínculo esperado por qualquer consumidor novo do DTO de conversa, sempre nulável. Cliente do BFF que trate `202` como `201` apresenta como enviada uma tentativa não despachada — a distinção agora é responsabilidade de quem consome. `INTERNAL_HTTP_MEDIA_TIMEOUT_MS` (90 s) é mais um parâmetro de ambiente a manter coerente com o teto de download da IA (60 s): baixá-lo abaixo dele reintroduz o `502` prematuro. Conversas vive em doze módulos de `features/conversations/` com um call site de `useShellConfig` por cenário — o formato do D-031 confirmado na quarta e última tela pesada. O lint do frontend passou a cobrir `tests/`, então teste com código morto quebra o gate. Ficam declarados fora, por falta de contrato e não por falta de tempo: envio de mídia pela profissional, estado de leitura por usuário e evento interno como linha própria no histórico (`source` só admite `CUSTOMER`, `AI` e `OWNER`). "IA com instabilidade" continua derivada por substring sobre o `handoffReason` livre. O gate de browser segue em rota pública.

**Revisar se:** o produto pedir estado de leitura, que reabre (2) e exige persistência nova; o transporte ganhar envio de mídia, que reabre o contrato dos três serviços; `handoffReason` virar vocabulário fechado, que torna determinística a derivação de instabilidade; a IA passar a marcar evento interno no histórico de mensagens, que reabre o item de eventos recolhíveis; ou o gate renderizado ganhar sessão autenticada, que muda o que pode ser provado sobre estas telas.

## D-034 — Negócio como dado do BFF, projeção versionada com falha visível e conclusão do onboarding sem WhatsApp, adotados no Goal018

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review018](reviews/018-review.md), para o diff aceito sobre a base `4606f54`, sem commit/deploy. Fecha G-26 na parte de dado e projeção versionada e G-25 na parte de conclusão sem WhatsApp; avança G-31 na última superfície de entrada. Reusa e não altera D-018, D-021, D-027, D-030, D-031, D-032 e D-033. Muda `apps/bff/PUBLIC_API_V1.md` em quatro pontos: os três campos aditivos de negócio, o estado de projeção, os oito códigos de pendência nomeados e a **remoção** dos dois códigos de WhatsApp de `POST /v1/onboarding/complete`.

**Contexto:** o negócio quase não existia como dado — `BusinessProfile` guardava nome, categoria, timezone, idioma e moeda, e a IA recebia dois campos, `businessName` e `timezone`; modalidade de atendimento e endereço não existiam em camada nenhuma. O onboarding exigia WhatsApp em dois lugares (a rota `complete` e a tela), contra o fluxo do vault, que conclui sem WhatsApp com a IA inativa. A última tela do onboarding afirmava "WhatsApp: Conectado" e "Negócio: Configurado" como texto fixo, sem ler estado. `features/onboarding/` eram 2 437 linhas com um protótipo inalcançável embutido e 34 cenários declarados, dos quais mais de vinte só o protótipo servia. E a projeção do contexto para a IA acontecia em dois lugares sem deixar rastro: se falhasse, o dado ficava no BFF, a resposta virava erro e nenhuma camada sabia que os dois lados divergiam.

**Decisão:** (1) **O BFF é o dono do negócio, e modalidade é dado, não texto livre:** `modalities` (`ON_SITE`, `AT_HOME`, `ONLINE`) e `address` entram por migration aditiva sem backfill, com `[]` significando "ainda não escolhido" — distinto de "nenhuma modalidade" — porque fabricar escolha a partir de categoria, nome ou serviço seria inventar dado de negócio. `category` continua sendo o segmento: não se cria taxonomia concorrente no banco para resolver um problema de interface. (2) **Omissão não é valor:** corpo sem `modalities` preserva o gravado e nunca grava conjunto vazio; chave `address` ausente preserva o endereço, e retirar `ON_SITE` deixa de exigir o endereço sem apagá-lo. A regra vive numa função única consumida pelas duas rotas, e o frontend omite a chave em vez de enviar `null` — sem isso, a garantia não existe pelo caminho que o produto oferece. (3) **Nada de negócio vai para o Scheduling:** nenhum consumidor de lá lê segmento, modalidade ou endereço, e projetar por precaução criaria duas fontes da mesma verdade. (4) **Divergência entre dono e projeção é estado observável, não exceção:** duas versões gravadas no BFF (corrente e projetada) e `PROJECTED`/`PENDING` derivado da comparação — booleano de "sincronizado" ficaria mentindo depois da mudança seguinte. (5) **Falha de projeção não desfaz gravação nem vira `500`:** o dado é do BFF e foi gravado; a resposta diz o que foi salvo e que a IA ainda não recebeu, e a tela apresenta isso como aviso. Reconciliação automática é trabalho com o seu próprio produtor e fica no Goal018B. (6) **Concluir o onboarding não exige WhatsApp e não liga a IA:** as duas coisas são independentes, e a segunda passou a ser invariante provada por teste que falha se alguém as acoplar. (7) **Código inalcançável não é entrega parcial:** o protótipo, a prop `preview`, `types.ts` e os cenários que só ele servia saíram, e cada cenário sobrevivente é alcançável pelo fluxo do produto — a mesma regra dos Goals 015, 016 e 017. (8) **Progresso é vocabulário do negócio, não contagem de telas:** quatro blocos nomeados, nenhuma "Etapa 7 de 18". (9) **A tela não afirma o que nenhuma camada calcula:** o resumo de texto fixo saiu, e o quarto item do checklist do vault — "teste concluído" — não entrou porque não existe produtor; entra no Goal018B junto com ele. (10) **Um poller por árvore renderizada:** a leitura de `GET /v1/status` passou a ser compartilhada por provider, no mesmo espírito da invariante de `useShellConfig`, e é provada por render.

**Alternativas:** criar coluna própria de segmento ao lado de `category` (rejeitada: duas fontes da mesma verdade para resolver uma escolha de interface); fazer o backfill derivar modalidade da categoria ou do catálogo (rejeitada: fabrica escolha de negócio que ninguém fez, e um `ON_SITE` inventado passaria a exigir endereço); apagar o endereço ao retirar `ON_SITE` (rejeitada: destrói dado informado para simplificar validação); manter `500` quando a projeção falha (rejeitada: o dado do BFF foi gravado, e responder erro faria o negócio salvar de novo achando que nada aconteceu); marcar a projeção com um booleano de sincronizado (rejeitada: não sobrevive à mudança seguinte); exigir modalidade em `businessContextConfigured` (rejeitada: endureceria o predicado de "dá para conversar" e derrubaria tenant existente); implementar a reconciliação aqui (rejeitada: é retentativa com produtor próprio, e este Goal entrega o estado que a torna possível); manter os cenários do protótipo como rota estática por continuidade (rejeitada: rota que ninguém alcança é código morto com custo de build); e manter o resumo fixo da tela `validacao` até haver leitura (rejeitada: é a afirmação sem fonte que o Goal017 removeu no `unreadCount`).

**Motivo:** a entrada é onde o negócio decide se o produto entendeu o que ele faz. Um onboarding que exige a etapa que o vault torna opcional, que termina afirmando que o WhatsApp está conectado sem ler nada, que pede dado e não o entrega à IA, ou que salva no BFF e deixa a IA com outra versão sem ninguém saber, não é uma versão incompleta do produto — é uma versão que faz o negócio confiar em configuração que não está valendo.

**Consequências:** `modalities` e `address` passam a ser esperados por qualquer consumidor novo do perfil, com `[]` sempre significando escolha ausente e nunca "não atende". `contextProjectionStatus` é o canal por onde divergência BFF/IA aparece: consumidor que o ignore mostra configuração como aplicada quando ela pode não estar. `POST /v1/onboarding/complete` aceita requisição que antes recusava — cliente que dependia do `409` por WhatsApp deixa de recebê-lo. O onboarding vive em dez módulos com despachante, e cenário novo sem bloco declarado falha em `blockForScenario`. `GET /v1/status` passou a ser lido por um provider único: tela que monte o próprio poller reintroduz a duplicação que este Goal removeu. `PROMPT_TEMPLATE_VERSION` v4 muda o hash do prompt, então comparação com runs anteriores a este Goal não é comparação do mesmo template. Ficam declarados fora, por falta de produtor e não por falta de tempo: teste real, autoativação, reconciliação automática e o item "teste concluído" do checklist. `PATCH /v1/settings/ai` continua engolindo falha de projeção sem marcar `PENDING` — o estado só aparece em `GET /v1/status`. O gate de browser segue em rota pública, e as rotas de onboarding exigem sessão.

**Revisar se:** o teste real chegar (Goal019), que liga ativação a evidência e reabre (6) na parte de ativação; a reconciliação automática chegar, que reabre (5) no que hoje é só observável e exige decidir retentativa e ordem; o Scheduling passar a precisar de modalidade ou endereço, que reabre (3); o produto pedir taxonomia fechada de segmento, que reabre (1); ou o gate renderizado ganhar sessão autenticada, que muda o que pode ser provado sobre estas telas.

## D-035 — Número da plataforma como configuração, teste real que exercita a IA, remoção pelos IDs criados e autoativação por prova, adotados no Goal019

**Status:** ACCEPTED em 2026-09-14 pelo Tech Lead Agent no [review019](reviews/019-review.md), para o diff aceito sobre a base `1564c92`, sem commit/deploy. Fecha G-25 na parte de ativação por teste real, com o envio real declarado como gate operacional, e fecha G-26 na parte de reconciliação desired/effective da IA. É a decisão que **aplica** D-010; reusa e não altera D-007, D-018, D-021, D-027, D-030, D-031, D-033 e D-034. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: três rotas novas, os estados da execução, o formato do progresso e a tabela de códigos de recusa.

**Contexto:** o vault define o teste real como "uma conversa real enviada para o WhatsApp conectado **por um número oficial da Atendly**", e esse número não existia em camada nenhuma — `ChannelConnection` é única por `(tenantId, provider)`, `WhatsAppInstance` é única por `userId` e por `tenantId`, e nenhum `.env.example` declarava instância, credencial ou número de plataforma. A ativação da IA exigia apenas "ao menos um serviço operacional": nada provava que a IA de fato atende. `GET /v1/status` já distinguia desejado de efetivo desde o Goal014, mas só lia. E o quarto item do checklist da Home ficou fora do Goal018 por falta de produtor.

**Decisão:** (1) **A instância da plataforma é configuração do serviço, não vínculo de negócio:** três variáveis de ambiente resolvidas por um resolvedor próprio, e o remetente da plataforma é **mais um uso da porta de envio que já existia**, não um caminho de transporte novo. Ela não cria linha em `ChannelConnection`/`WhatsAppInstance`, não aparece em listagem de conexões e sua credencial não é alcançável pelo caminho que resolve credencial de negócio — ausência de vínculo do tenant continua sendo recusa, nunca fallback. (2) **Sem configuração, o produto recusa com código próprio** (`PLATFORM_NUMBER_NOT_CONFIGURED`) em vez de cair na demonstração: é a recusa que torna a distinção exigida pelo G-25 verificável num ambiente sem número real, no mesmo padrão do gate M4 do Goal010. (3) **Demonstração e teste real são coisas distintas provadas por teste, não por copy:** a demonstração não chama a porta de envio e não escreve em agenda, cliente, conversa ou mensagem; o teste real chama as duas. (4) **O teste exercita o atendimento inteiro, e não uma imitação dele:** a fala do cliente simulado entra pela mesma porta de inbound, a resposta sai pelo canal do tenant e os marcos derivam do que a IA registrou. Um teste que compusesse a resposta e chamasse a agenda por conta própria provaria apenas que o serviço sabe escrever texto — foi o que a rodada 1 recusou. (5) **Progresso é fato gravado:** `factKind`/`factId` são `NOT NULL`, de modo que marco sem fonte não é representável no banco; nada deriva de temporizador, animação ou texto fixo. (6) **Remove-se o que a execução criou, pelos IDs gravados na criação:** a persistência separa o alvo (`conversationId`/`contactId`, que pode ser linha preexistente) do que foi criado (`createdConversationId`/`createdContactId`, que autoriza remoção), e a limpeza nunca busca por telefone, nome, data ou padrão. (7) **Cancelar não é remover:** atendimento cancelado continua na agenda, então a remoção definitiva por ID passou a existir no Scheduling, interna, só para a agenda própria, apagando item e evento na mesma transação — em vez de mudar os FKs `ON DELETE RESTRICT`, que protegem o histórico do resto do produto. (8) **Limpeza parcial é resíduo declarado, nunca sucesso:** `CLEAN` é inalcançável com sobra, o resíduo guarda alvo e razão, e repetir a limpeza é idempotente. (9) **Autoativação soma exigência à regra vigente, nunca a substitui:** sucesso — e só sucesso — ativa, e ainda assim pela regra de serviço operacional; a execução que autorizou fica gravada em `AiSettings.activatedByRunId`, o que dá idempotência e permite desligar quando a prova deixa de valer. (10) **O teste vale para a instância contra a qual rodou:** revincular o WhatsApp atualiza a mesma linha de `ChannelConnection`, então a execução grava `channelInstanceId` e é superada pela troca — testar não vira ferramenta recorrente, mas trocar o número volta a exigir prova. (11) **Reconciliação é em requisição, não é job:** no máximo uma tentativa por leitura de status ou de dashboard, idempotente, sem lançar para o consumidor, sem laço e sempre deixando estado honesto legível. Nenhum agendador novo foi criado. (12) **Estado de projeção deixa de mentir em `PATCH /v1/settings/ai`:** sucesso continua sendo sucesso, porque o dado do BFF foi gravado, mas o estado relatado é o real. (13) **Execução abandonada termina, em vez de travar o tenant:** parada sem sinal de vida é encerrada como falha na leitura seguinte, e falhar não ativa. (14) **Prova não pode vir de dublê que afirma o contrário da produção:** as três recusas deste Goal foram exatamente isso — cascata inexistente no schema, id de linha que a produção não devolvia e o caminho que liga o teste à IA sem teste nenhum —, então o dublê passou a refletir a restrição real e cada invariante ganhou teste sensível a reversão.

**Alternativas:** criar um tenant técnico para a Atendly e reusar o caminho de credencial de negócio (rejeitada: o vínculo é único por tenant e provider, a plataforma apareceria como conexão de alguém e as duas credenciais voltariam ao mesmo resolvedor); sem número configurado, apresentar a demonstração como se fosse o teste (rejeitada: é exatamente a confusão que o G-25 manda eliminar); reimplementar a conversa do teste dentro do próprio serviço, com texto fixo e chamada direta à agenda (rejeitada na rodada 1: os marcos afirmariam comportamento da IA que não aconteceu); entregar a resposta gravando a mensagem e deixando o envio para depois (rejeitada na rodada 2: o negócio veria a conversa de teste de um lado só); remover o agendamento de teste por cancelamento (rejeitada: cancelado continua listado, e o critério exige que a agenda e a lista de clientes voltem ao que eram); trocar os FKs `ON DELETE RESTRICT` por cascata para viabilizar a remoção (rejeitada: afrouxaria a proteção do histórico de todo o produto para servir um caso de teste); buscar os dados de teste por telefone, nome ou data na limpeza (rejeitada: apagaria linha que a execução não criou); ativar a IA direto ao concluir o teste, sem passar pela regra vigente (rejeitada: este Goal acrescenta exigência, não remove a existente); resolver a reconciliação com job ou cron (rejeitada: o Goal proíbe processo de fundo novo, e a leitura já é o momento em que a divergência importa); e deixar `PATCH /v1/settings/ai` respondendo `PROJECTED` por continuidade (rejeitada: é o resíduo nominal que o review018 dirigiu a este Goal).

**Motivo:** ligar a IA é a decisão com maior custo de erro do produto — a partir dela, uma máquina responde clientes reais em nome do negócio. Ativar por "tem um serviço cadastrado" é ativar por indício; ativar por um teste que o próprio produto encena é pior, porque produz a aparência de prova. E um teste que cria dado real no negócio só é aceitável se a remoção for exata: apagar por semelhança é destruir dado de cliente para limpar o próprio rastro.

**Consequências:** o ambiente passa a ter três variáveis de plataforma, e sem elas o teste real não existe — o produto diz isso em vez de simular. `ActivationTestRun` vira a fonte de "este negócio já provou que a IA atende", e consumidor que ignore `cleanupState`/`cleanupResidue` apresentará como completa uma limpeza que pode ter deixado resíduo. `AiSettings.activatedByRunId` passa a ser a marca de ativação por prova: nulo significa "não foi ligada por teste", nunca "o teste falhou". `GET /v1/status` e `GET /v1/dashboard` deixaram de ser leituras puras — elas convergem antes de responder, de forma limitada e idempotente, e `ai.reconciled` é o que torna isso legível. A remoção definitiva por ID existe no Scheduling e não tem entrada por `/v1`: quem a expuser precisa decidir autorização, que aqui não foi decidida. Trocar o WhatsApp desliga a IA que uma execução anterior tinha ligado. O envio real continua sem prova: porta e modelo são dublê e o PostgreSQL é descartável, então a capacidade fica na mesma classe do M4 do Goal010.

**Revisar se:** o número oficial da Atendly existir de fato em algum ambiente, o que transforma o gate operacional em prova e permite fechar o limite declarado aqui; a reconciliação precisar cobrir mais do que `AiSettings.enabled` e o contexto de negócio — o timezone replicado é o caso conhecido —, o que exige decidir ordem e dono; surgir mecanismo comum de jobs (Goals 021–023), que reabre (11) na parte de continuidade fora de requisição; a retenção e a exclusão de conta (Goal023) precisarem das operações de remoção definitiva, que reabre (7) na parte de exposição e autorização; ou o teste real passar a ser oferecido fora do onboarding, que reabre (10).

## D-036 — Estado da importação como leitura própria, escolha de categoria persistida e honrada, e a conclusão única protegida de chegar por acidente, adotados no Goal020

**Status:** ACCEPTED em 2026-09-15 pelo Tech Lead Agent no [review020](reviews/020-review.md), para o diff aceito na rodada 2 sobre a base `c977cbf`, sem commit/deploy. Fecha G-19 na parte de experiência e G-10 na parte de consumidor de frontend; avança G-31 no módulo de Importação. É a decisão que **expõe** D-026 na interface; reusa e não altera D-018, D-026, D-030, D-031, D-032, D-033 e D-034. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: duas rotas novas, a tabela de recusas nomeadas delas e a datação da ausência de consumidor do protocolo pré-Goal010. Sem migration: o esquema da importação está pronto desde o Goal010.

**Contexto:** o domínio inteiro da importação única foi construído e aceito no Goal010 e não tinha um único consumidor — sete métodos de adapter no frontend sem chamador, `ImportCompletionService.getHistory()` sem chamador em camada nenhuma, e `ImportSessionCategory.selected` lido pela execução e nunca escrito, de modo que "importar tudo por padrão, com opção de escolher categorias" era inalcançável. Não havia leitura do estado da importação em lugar nenhum: recarregar a página perdia a sessão, Configurações não tinha como mostrar histórico e a única forma de descobrir se o negócio já tinha importado era tentar criar e levar `409 IMPORT_ALREADY_COMPLETED` — descobrir por erro. Enquanto isso, a interface ainda dirigia o protocolo legado `MigrationJob` por `ProductMigrationScreen`, com 878 linhas servindo nove rotas, e ainda oferecia migrar *para* o Minha Agenda: troca de fonte que o backend recusa desde o corte do writer remoto.

**Decisão:** (1) **O estado da importação é uma leitura própria, e é leitura:** direito, sessão viva e histórico numa resposta só, que não abre sessão, não move `status`, não incrementa `previewVersion` e não consome direito — porque a alternativa vigente era o consumidor descobrir o estado provocando a recusa da criação. (2) **Negócio sem conexão, sem sessão e sem histórico é resposta válida e vazia, não erro:** a rota interna fica fora de `requireIntegration` de propósito, já que esse é o estado de todo negócio novo e é dele que a UI decide o ponto de entrada. (3) **Estado de conexão nunca é credencial:** a resposta diz se há conexão, com status e rótulo, e nenhum campo de credencial — cifrado ou parcial — entra no DTO. (4) **A escolha de categoria é escolha sobre o preview aprovado, não releitura da origem:** `setCategorySelection` grava apenas `selected` e nunca toca `previewVersion` nem os itens, e o upsert de `analyze` nunca sobrescreve a escolha, de modo que ela sobrevive a qualquer número de reanálises. (5) **Sessão terminal recusa decisão com código próprio** (`IMPORT_SESSION_NOT_SELECTABLE`), e `EXECUTING` fica **fora** do conjunto terminal: a execução relê as categorias no início de cada passada, então a escolha vale a partir da próxima e recusá-la no meio de uma corrente não protegeria nada. (6) **Um CTA que promete "tudo" não pode importar menos do que promete:** o resumo lê `session.categories[].selected` e só usa o `@default(true)` do schema quando a sessão ainda não tem categoria nenhuma; com algo de fora, o rótulo passa a dizer quantos registros entram e a tela explica que o resto não terá segunda chance. A regra não é cosmética — categoria desmarcada vira `SKIPPED/CATEGORY_NOT_SELECTED`, status que nunca é reprocessado e que a conta de `outstanding` exclui, então o descarte não apareceria nem na confirmação final nem no histórico. (7) **`Idempotency-Key` é por corpo, não por tela:** aceitar pendências muda o corpo, o domínio inclui `acceptPending` no hash da idempotência e reusar a chave seria recusado com `409 IDEMPOTENCY_KEY_REUSED` — o que deixaria a decisão irreversível sem saída dentro da tela. Retentativa do mesmo corpo continua reusando a chave, que é o que a torna segura. (8) **`acceptPending` só nasce de confirmação explícita**, com a copy do vault, incluindo "Esta é sua única importação."; sem pendência, a confirmação não aparece. (9) **Progresso é fato do banco:** a tela lê `GET .../progress` a cada chamada e **para** em estado terminal; nenhum contador local soma o que a tela acha que aconteceu. (10) **`previewVersion` é a que a tela mostrou ao negócio**, e preview obsoleto é estado de produto explicado, nunca erro genérico. (11) **A interface deixa de oferecer operação que o backend recusa:** o protocolo `MigrationJob` e a direção `para-minha-agenda` saíram da UI, **sem** tocar as rotas `/v1/calendar/migrations`, que continuam respondendo o que respondiam e cuja retirada é do Goal026. (12) **Vocabulário do módulo não recria porta sem implementador:** `features/imports/types.ts` reexporta os tipos do contrato que as telas consomem e nada mais — descrever uma segunda vez a porta cujo implementador real é `BffMigrationService` só poderia divergir dela, que é o código morto que este Goal removeu de `features/migration/types.ts`.

**Alternativas:** derivar o estado da importação tentando criar a sessão e interpretando `409 IMPORT_ALREADY_COMPLETED` (rejeitada: descobrir estado por erro, e a tentativa não é leitura); colocar a leitura atrás de `requireIntegration` por simetria com as demais rotas do módulo (rejeitada: negócio novo receberia `404` no exato momento em que a UI precisa decidir o ponto de entrada); devolver também o estado da credencial para a tela "lembrar" a conexão (rejeitada: credencial não sai do backend em forma nenhuma); fazer a escolha de categoria invalidar o preview ou incrementar `previewVersion` (rejeitada: não é releitura da origem, e invalidar forçaria reanálise a cada desmarcação); recusar a escolha durante `EXECUTING` (rejeitada: a execução relê as categorias a cada passada, então a recusa protegeria uma janela que não existe); manter o resumo apresentando todas as categorias e reselecionar tudo antes de executar (rejeitada na rodada 1: apagaria silenciosamente uma escolha que o negócio já tinha feito, invertendo o defeito em vez de corrigi-lo); manter uma `Idempotency-Key` por tela, mais simples (rejeitada na rodada 1: o backend real recusa a mesma chave com corpo diferente, e o caminho de aceitar pendências ficava sem saída); gerar chave nova a cada tentativa (rejeitada: perderia a proteção contra a requisição que não se sabe se chegou — exatamente o que a conclusão única não pode perder); remover as rotas `/v1/calendar/migrations` junto com a UI que as consumia (rejeitada: é escopo declarado do Goal026, e compatibilidade de contrato público não se retira de carona); e manter `ImportStage`/`ImportSessionService` no módulo novo por simetria com o antigo (rejeitada: nenhum implementador, nenhum consumidor).

**Motivo:** concluir a importação consome o direito único do negócio — não existe segunda importação, e é a primeira decisão irreversível da interface do produto. Uma tela que chegue a essa decisão por acidente, por duplo clique, por retomada mal lida ou por um preview obsoleto executado no lugar do aprovado não é uma versão incompleta da jornada: é uma jornada que destrói dado que o negócio nunca teve chance de rever. Foi por isso que as duas recusas da rodada 1 foram ambas nesse caminho, e ambas invisíveis para uma suíte que fala com dublê.

**Consequências:** `GET /v1/calendar/imports` passa a ser a fonte única do ponto de entrada da importação: tela que monte estado próprio reintroduz a divergência que este Goal eliminou. `POST .../categories/:category/selection` acrescenta três recusas nomeadas ao vocabulário do módulo, repassadas pelo envelope `UPSTREAM_ERROR` mais `details.upstreamCode`. `ImportSessionCategory.selected` passa a ter dois escritores — o upsert do preview, que só cria com o default, e esta rota —, e qualquer consumidor novo do preview precisa ler `selected` antes de apresentar contagem, sob pena de prometer o que não será importado. `features/migration/` e as rotas `migracao/[step]` não existem mais; link para elas quebra. As rotas legadas de migração ficam com zero consumidor e a linha correspondente do contrato público passou a ser verdadeira e datada. `ProductSettingsScreen` ganhou mais um bloco sem ser decomposta, o que aumenta o trabalho declarado do Goal024. E a fronteira de prova continua onde estava: domínio contra PostgreSQL real, jornada da interface em jsdom sobre dublê — a origem real do Minha Agenda segue sem prova, na mesma classe do gate M4.

**Revisar se:** a credencial autorizada do Minha Agenda existir, o que transforma o gate M4 em prova e permite verificar o comportamento da interface diante das limitações reais por categoria; o produto passar a admitir mais de uma importação ou reabertura do direito, que reabre (6), (7) e (8) inteiras; a escolha de categoria precisar de granularidade por item em vez de por categoria, que reabre (4); o Goal024 redecompor `ProductSettingsScreen`, que reabre onde `ImportSettingsSection` vive; o Goal026 retirar `/v1/calendar/migrations`, que fecha (11) na parte de código; ou o gate renderizado ganhar sessão autenticada, que muda o que pode ser provado sobre estas telas.

## D-037 — Lembrete como intenção durável do dono, versão do compromisso como identidade do envio, aviso de alteração explícito e presença com ator derivado do chamador, adotados no Goal021

**Status:** ACCEPTED em 2026-09-15 pelo Tech Lead Agent no [review021](reviews/021-review.md), para o diff aceito na rodada 2 sobre a base `9df7bf7`, sem commit/deploy. Fecha G-27 na parte de lembretes, confirmação de presença e notificação de alteração, e fecha o resíduo nominal de G-18 (presença alimentada por lembrete). É a decisão que **aplica** D-008 pela segunda e terceira vez e **completa** D-024 na coluna que o Goal008 deixou reservada; reusa e não altera D-006, D-015, D-018, D-020, D-021, D-024, D-025, D-027, D-030, D-031, D-032 e D-034. G-28 continua aberto. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: três rotas novas, um campo opcional em remarcar e cancelar, e o vocabulário fechado de estado e motivo das intenções. **Com migration:** `20260915120000_goal021_reminder_schedule`, aditiva — três tabelas que nascem vazias e uma coluna com default, sem nenhum `UPDATE` em linha existente.

**Contexto:** este é o primeiro Goal em que a plataforma fala com o cliente sem que ele tenha falado antes. Até aqui toda mensagem era resposta a uma mensagem recebida, ou um teste que a própria profissional disparou. Lembrete não existia em camada nenhuma — nenhum modelo, rota, job, configuração ou tela; a única ocorrência da palavra no código era campo de payload do Minha Agenda. `Appointment.presenceConfirmedAt` existia desde o Goal008 com o comentário "alimentado a partir do Goal021" e sem produtor, e `confirmPresenceWithin` gravava o evento com `source: "USER"` literal, embora `callerSource` derive `AI`/`USER` do chamador autenticado desde o Goal009. As telas de remarcar e cancelar do Goal016 não tinham nenhuma ocorrência de "notificar", contrariando a regra do vault, e o detalhe do agendamento não dizia nada sobre lembrete. O que torna isso caro de errar não é o tamanho: lembrete duplicado, lembrete com horário velho e lembrete de atendimento cancelado são danos que nenhuma tela desfaz.

**Decisão:** (1) **O dono da agenda decide o envio; a IA entrega.** O Scheduling calcula vencimento, revalida e compõe os fatos; a IA aplica elegibilidade do contato, estilo e transporte. (2) **A direção da chamada interna continua sendo uma só:** quem reivindica trabalho é a IA, por rotas de claim e settle atrás de `requireDeliveryCaller` — papel de entregador, simétrico ao `requireHumanCaller`. Fazer o Scheduling chamar a IA criaria uma segunda direção de chamada interna e uma superfície de credencial nova. (3) **"Até dois lembretes" é invariante de esquema, não validação de aplicação:** a posição é coluna com CHECK dentro de chave primária composta por tenant, e antecedência positiva com teto também é CHECK. Não existe caminho que grave um terceiro. (4) **Ausência de configuração é ausência de escolha, e continua distinguível:** sem linha, vale um lembrete 24 horas antes, por constante nomeada e única, sem backfill; linha com zero regras é desligar de propósito. Mesma regra que o Goal018 aplicou a `modalities`. (5) **A versão do compromisso é a identidade do envio, e sobe só no que o cliente precisaria saber:** data, horário, serviços do acordo e status incrementam; observação, valor final, presença e snapshot de buffer não. O incremento é fragmento de `data` anexado ao próprio `update` do efeito, dentro da política única de escrita — nunca trigger paralelo, nunca segundo caminho. (6) **A intenção de envio nasce e morre na mesma transação da mutação:** criar, remarcar, cancelar, concluir, marcar falta, operar série e importar recomputam as intenções no mesmo commit, de modo que não existe instante em que o compromisso exista sem que o lembrete dele tenha sido decidido. Só `PENDING` é cancelada — `CLAIMED` está sob lease de quem já reivindicou e é resolvida na revalidação. (7) **O que vale é o estado do momento do envio:** a revalidação roda dentro da própria transação do claim; versão divergente cancela em vez de enviar, posição que a configuração deixou de prever é dispensada com motivo, e cliente sem telefone é dispensa, não erro — telefone de cliente é nulável por decisão de identidade desde o Goal006. (8) **Entrega é no mínimo uma vez, declarada como tal:** a defesa contra duplicata é `correlationId` determinístico gravado antes do transporte e verificado no outbox, não a eliminação do risco; não há heartbeat de lease porque o orçamento de uma entrega é um envio de texto, não um lote de modelo. `UNKNOWN` é terminal, nunca motivo para reenviar. (9) **Lembrete não é a profissional assumindo a conversa:** a entrega não passa pela rota de envio humano e a porta de sessão foi reduzida a `resolveContext`, de forma que `assumeHumanControl` é inalcançável — se passasse por ali, toda conversa com lembrete sairia do controle da IA e a resposta do cliente nunca seria interpretada. (10) **O texto do lembrete não é gerado por modelo:** as frases factuais são compostas uma vez e entram idênticas nos três estilos; estilo muda registro, informalidade e emoji. Instante nunca é formatado pela IA — data e hora chegam prontas do dono, no fuso do negócio, e são usadas literalmente. (11) **Aviso de alteração é escolha explícita; cancelar as pendentes não é:** a intenção de aviso só nasce com `notifyCustomer === true` na mutação **e** versão que subiu, com omitir significando não notificar no contrato e marcado por padrão na interface; o cancelamento das intenções pendentes acontece sempre, independente do aviso. (12) **Confirmação de presença pela conversa é gate do negócio mais tool própria**, com o id do agendamento e sem booleano "não vem" — recusa continua exigindo cancelar ou remarcar explícito —, e o evento passou a gravar o ator derivado do chamador autenticado, de modo que o histórico deixa de atribuir à profissional uma decisão que não foi dela. (13) **A tela afirma o estado deste compromisso, não a configuração do negócio:** o detalhe lê as intenções daquele agendamento por rota própria, que não expõe `facts` nem lease, mostra lembrete e aviso em eixos distintos, trata envio sem confirmação como categoria própria e não afirma nada quando não há intenção.

**Alternativas:** criar broker, fila externa, cron do sistema operacional ou serviço novo para os lembretes (rejeitada: o padrão de trabalho durável já existia duas vezes — `AutoCompleteLoop` no Scheduling e `InboxWorker` na IA — e o Goal proíbe processo novo); fazer o Scheduling chamar a IA quando o lembrete vence (rejeitada: inverteria a única direção de chamada interna vigente e criaria superfície de credencial nova); validar "no máximo dois lembretes" na aplicação (rejeitada: validação de aplicação é contornável por qualquer escritor futuro, e a garantia precisava sobreviver ao esquema); materializar o default de 24 horas por backfill em todo tenant (rejeitada: apagaria a diferença entre "nunca configurou" e "escolheu isto", que é a mesma distinção que o Goal018 preservou); incrementar a versão em qualquer escrita do compromisso (rejeitada: observação e preço administrativo passariam a notificar o cliente, contra a regra literal do vault); reaproveitar `POST /internal/conversations/:id/messages` para entregar o lembrete (rejeitada: aquele caminho assume controle humano antes do transporte, de propósito, e o lembrete deixaria a conversa fora da IA); compor o texto do lembrete por LLM (rejeitada: o Goal proíbe, e frase factual gerada por modelo pode divergir do fato); formatar data e hora na IA (rejeitada: o fuso é do negócio e está no dono); heartbeat de lease na entrega (rejeitada: complexidade desproporcional ao orçamento de um envio de texto, com a janela residual declarada em vez de escondida); notificar o cliente sempre que a versão subir, sem escolha (rejeitada: o vault exige a marcação por padrão, não a obrigatoriedade); tool de presença com booleano "não vem" (rejeitada: recusar comparecimento é cancelar ou remarcar, e são efeitos diferentes com regras próprias); e derivar a linha de lembrete do detalhe a partir da configuração do tenant (rejeitada na rodada 1: afirma lembrete que o domínio já dispensou para aquele compromisso).

**Motivo:** um lembrete é uma mensagem que sai sozinha, para o telefone de uma pessoa real, sobre um compromisso que pode ter mudado dez minutos atrás. Errar aqui não produz uma tela ruim: produz um cliente indo a um atendimento cancelado, ou dois lembretes contraditórios sobre o mesmo horário, e nenhuma correção posterior desfaz isso. Por isso a decisão prende a identidade do envio a uma versão do compromisso e coloca a revalidação dentro da transação que reivindica o trabalho — e por isso a janela de duplicata que resta é declarada em vez de omitida.

**Consequências:** `Appointment.notifiableVersion` passa a ser contrato interno: qualquer escrita futura de agenda que não passe pela política única de escrita deixa a versão parada e faz o lembrete errado ser enviado como se estivesse certo. `AppointmentNotificationIntent` vira a fonte de "o que a plataforma disse ao cliente sobre este compromisso" e é o produtor que o Goal022 vai ler para falha de lembrete visível ao negócio; a retenção e a purga do que ela guarda em `facts`/`detail` continuam sem prazo definido e são do Goal022. `requireDeliveryCaller` cria um terceiro papel de chamador interno, hoje com um único ocupante — a IA —, e quem acrescentar ocupante decide autorização que aqui não foi decidida. `confirmPresenceWithin` passou a exigir `source` do chamador: consumidor que fixe `"USER"` volta a mentir no histórico. O processo da IA passa a ter dois loops, e `NOTIFICATION_DELIVERY_*` no ambiente decide se o segundo roda. `ProductSettingsScreen` ganhou mais um bloco sem ser decomposta, o que aumenta o trabalho declarado do Goal024. E a fronteira de prova continua onde estava: domínio contra PostgreSQL real, interface em jsdom sobre dublê, e nenhuma mensagem entregue a um número de WhatsApp real — mesma classe do gate M4.

**Revisar se:** a entrega real por WhatsApp ganhar prova em algum ambiente, o que transforma o gate operacional em evidência e permite medir a janela de duplicata de (8) em vez de apenas declará-la; o produto passar a exigir mais de dois lembretes ou antecedência por serviço, o que reabre (3) e (4) no esquema; surgir necessidade de lembrete por push ou e-mail (Goal022), que reabre (1) na parte de transporte e (10) na parte de composição; a central de notificações do Goal022 precisar de estado que a intenção não guarda, o que reabre o recorte de leitura de (13); a retenção do Goal023 alcançar `facts`/`detail`, que fecha o resíduo declarado aqui; ou um segundo entregador aparecer, o que reabre a autorização de (2).

## D-038 — Central de notificações como leitura reconciliada do BFF, dedupe pela identidade do fato no dono, condição que reabre e `payload` durável mínimo, adotados no Goal022

**Status:** ACCEPTED em 2026-09-15 pelo Tech Lead Agent no [review022](reviews/022-review.md), para o diff aceito na rodada 2 sobre a base `c3142fd`, sem commit/deploy. Fecha **G-28** na parte de central, níveis, estado lida/não lida, resolvido identificado como resolvido, banner persistente e preferência, e o deixa **explicitamente aberto** na parte de alerta externo por e-mail, que depende de U-03. Aplica D-008 mais uma vez (trabalho durável no dono, sem fila nem serviço novo) e **consome** o que D-036 e D-037 registraram como fonte auditável; reusa e não altera D-008, D-018, D-021, D-024, D-030, D-031, D-034, D-036 e D-037. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: quatro rotas novas com cinco operações, mais o vocabulário fechado de espécie, nível e forma. **Com duas migrations:** `20260915140000_goal022_notification_center` no BFF, aditiva — três tabelas que nascem vazias e três enums, sem nenhum `UPDATE` em linha existente — e `20260915130000_goal022_notification_center_index` no Scheduling, **só índice**.

**Contexto:** a central não existia em camada nenhuma — nenhum modelo no BFF, nenhuma rota, nenhuma tela, nenhuma entrada de navegação —, enquanto os fatos que ela precisa mostrar já eram gravados por quem é dono deles: `Handoff` OPEN/RESOLVED na IA desde o Goal005, `AppointmentNotificationIntent` com estado e motivo terminais desde o Goal021, `ImportSession.completedAt` desde o Goal010/020, `AppointmentEvent` `CREATED`/`AI` com `sequence` monotônico desde o Goal008, e a condição corrente de WhatsApp e IA que `GET /v1/status` verifica na própria requisição desde o Goal014. O problema não era produzir o fato: era não ter lugar durável onde ele vira notificação com nível, fica lido quando a pessoa o lê e — quando é condição — fica marcado como resolvido quando o problema passa. E-mail crítico ficou fora por falta de qualquer infraestrutura de envio em qualquer serviço (v40 do [MASTER_PLAN](MASTER_PLAN.md)).

**Decisão:** (1) **A notificação é registro durável do BFF, e a idempotência é do banco.** `TenantNotification` é única por `(tenantId, dedupeKey)`; reconciliar dez vezes a mesma fonte produz uma linha porque o índice recusa a segunda, não porque o código conferiu antes. (2) **A `dedupeKey` é a identidade do fato no dono** — a conversa, a intenção, a sessão de importação, o `sequence` do evento, o par tenant/espécie para condição —, nunca `now()`, nunca contador local, nunca o texto exibido. Em particular, *cliente esperando humano* deduplica pela **conversa**, porque a IA pode gravar mais de um `Handoff` OPEN para a mesma conversa e uma conversa esperando é uma notificação. (3) **Nível e forma são do produto, não de quem materializa:** tabela fixa única no código mapeia `kind` → `level` → `shape`; mudar o nível de uma espécie é mudar uma linha ali, não caçar chamadores. `EVENT` fica no histórico; `CONDITION` abre e resolve, e só ela recebe `resolvedAt`. (4) **A materialização é por leitura reconciliada dentro de requisição que já existe**, sob throttle por negócio persistido e configurável: sem worker, sem cron, sem broker, sem fila e sem um terceiro loop de processo. (5) **A direção das chamadas internas continua sendo uma só:** quem lê é o BFF, que já tem cliente e credencial para Scheduling e IA; nenhum dono ganhou cliente de saída, rota de push nem superfície de credencial nova. (6) **Fonte indisponível degrada o `kind` dela, não a central:** a reconciliação nunca lança, deixa aquela espécie **intocada** — nem materializa, nem resolve — e reporta degradação, como `/v1/status` já fazia. (7) **Rematerializar não reescreve o leitor:** `readAt`, `occurredAt` e `resolvedAt` de um fato já materializado não são tocados enquanto o fato é o mesmo. (8) **Condição resolvida que a fonte volta a reportar reabre a mesma linha** — `resolvedAt` de volta a nulo, não lida, `occurredAt` do episódio novo —, porque a chave de dedupe de uma condição é a identidade da condição e não a da ocorrência; sem isso a central calaria a partir da segunda queda do canal. A reabertura é filtrada por `resolvedAt IS NOT NULL`, o que a torna idempotente sob concorrência e deixa intocada a condição ainda aberta. (9) **Condição resolvida não é apagada:** a linha permanece no histórico, e nada é deletado neste Goal. (10) **`payload` durável carrega só o que a copy e a navegação precisam.** Telefone, credencial, `facts` de intenção, `leaseToken` e payload cru não passam a existir no BFF porque a central passou a ler o dono — e identificação que só existe como telefone **não** é persistida: a tela de Conversas identifica lendo a conversa, o registro durável não. (11) **Uma fonte por superfície:** o banner persistente deriva de `/v1/status`, que afirma a condição **agora**, e a central guarda **desde quando** e **até quando**; o contador do chrome vem do mesmo tick do `SystemStatusProvider`, sem segundo poller e sem contagem local somada na tela. (12) **Preferência só onde o vault manda e só do que o vault prevê:** *agendamento criado pela IA* nasce silencioso, com o cursor avançando mesmo desligado para que ligar a preferência não materialize retroativamente; nenhum canal de e-mail entra no contrato enquanto nenhuma camada o honrar.

**Alternativas:** worker, cron, broker ou fila para materializar (rejeitada: o Goal proíbe processo novo, e o segundo loop do processo da IA, criado no Goal021, é o último — a reconciliação em requisição já é o padrão vigente de `/v1/status` desde o Goal019); Scheduling ou IA empurrando eventos para o BFF (rejeitada: inverteria a única direção de chamada interna e criaria superfície de credencial nova); deduplicar *cliente esperando humano* pela linha de `Handoff` (rejeitada: `pauseForHuman` cria sem checar, e a mesma conversa geraria várias notificações); abrir uma linha nova por episódio de condição (considerada e não escolhida: resolve o mesmo problema que (8), mas multiplica linhas numa tabela que este Goal declaradamente não purga); `level` como coluna livre preenchida pelo chamador (rejeitada: o produto decide o que é crítico, não quem grava); tratar `UNKNOWN` de WhatsApp como desconectado (rejeitada: desconhecido não é o mesmo que desconectado, e o read model do Goal014 se recusa a afirmar o que não verificou); notificar `ai.state === "OFF"` (rejeitada: é a profissional tendo desligado a IA, não indisponibilidade); notificar `DISMISSED`/`CANCELLED` de intenção (rejeitada: são decisões legítimas do domínio, e alarmá-las transformaria funcionamento correto em falha); criar rota nova no Scheduling para a importação (rejeitada: `GET /v1/calendar/imports` já é a leitura própria de D-036, e duplicá-la recriaria a decisão pela metade); reescrever "configuração essencial" numa segunda regra para `SETUP_INCOMPLETE` (rejeitada: duas definições divergiriam — daí a extração de `onboardingState`); derivar o banner da central em vez de `/v1/status` (rejeitada: com o throttle atrasado, banner e chip poderiam se contradizer); um segundo poller para o contador (rejeitada: regressão explícita do Goal018/WU-10); definir retenção da central aqui (rejeitada: produziria um segundo prazo paralelo ao que o Goal023 vai definir); entregar preferência de e-mail sem camada que a honre (rejeitada: é a mesma classe de defeito que a rodada 1 do review021 recusou); e persistir o telefone formatado como identificação de quem espera (rejeitada na rodada 1: é telefone gravado em tabela sem prazo de retenção, contra o critério explícito do Goal).

**Motivo:** a central é a superfície onde a profissional descobre que algo não aconteceu — um cliente esperando, um lembrete que falhou, o WhatsApp caído. O modo de falhar aqui não é ruído: é silêncio. Uma central que deduplica pela chave errada, que não reabre uma condição que voltou, ou que some com o problema em vez de marcá-lo como resolvido, parece funcionar exatamente até o dia em que o negócio precisa dela. Por isso a idempotência é do esquema, a identidade é do dono e a reabertura é explícita — e por isso um registro durável que nasce sem prazo de retenção não recebe telefone.

**Consequências:** `(tenantId, dedupeKey)` vira contrato: quem acrescentar espécie escolhe uma chave derivada da identidade do fato no dono, ou reintroduz duplicata ou silêncio. `NOTIFICATION_SPECIES` passa a ser o único lugar onde nível e forma existem — chamador que os informe está fora do desenho. A reconciliação dentro de `GET /v1/status` e das rotas de notificação acopla a frescura da central ao tráfego real: negócio que não abre o produto não reconcilia, o que é aceitável enquanto não houver alerta fora de sessão e deixa de ser quando houver. O custo de uma passada é da ordem de sete chamadas internas por negócio, governado por `NOTIFICATIONS_RECONCILE_MIN_INTERVAL_SECONDS`. `apps/bff/src/lib/onboarding-state.ts` vira dependência de duas superfícies: mudar "configuração essencial" ali muda a recusa da conclusão do onboarding **e** a espécie `SETUP_INCOMPLETE`, de propósito. `TenantNotification` cresce sem purga, limitada só pela janela de leitura de 90 dias, e entra na conta do Goal023 junto com `facts`/`detail` das intenções. O contador do chrome conta fora dessa janela, então uma não lida muito antiga aparece no badge e não na lista até alguém marcar todas. E a fronteira de prova continua onde estava: domínio contra PostgreSQL real, interface em jsdom, nenhum alerta entregue fora do produto.

**Revisar se:** U-03 for resolvida por uma pessoa, o que reabre (12) na parte de canal e traz e-mail crítico de volta ao escopo de G-28; a retenção do Goal023 alcançar `TenantNotification`, o que fecha o resíduo declarado aqui e pode tornar (9) e a janela de 90 dias negociáveis; alguma espécie nova precisar de estado que o dono não guarda, o que reabre (2) e (5); o produto passar a exigir notificação fora de sessão, o que reabre (4) e, com ela, a decisão de não criar processo novo; a central passar a ser fonte de decisão operacional automática, o que reabre (11) por exigir uma fonte só; ou o volume de reconciliação passar a pesar, o que reabre o throttle de (4) antes de qualquer worker.

## D-039 — Prazo de retenção como escolha do negócio com allowlist do servidor, varredura no BFF e exclusão no dono, prazos técnicos fora do produto e Não classificadas intocada, adotados no Goal023

**Status:** ACCEPTED em 2026-09-15 pelo Tech Lead Agent no [review023](reviews/023-review.md), para o diff aceito na rodada 3 sobre a base `0ae5d29`, sem commit/deploy. Fecha **G-29 na parte de conteúdo** — prazo configurável, opções fechadas, defaults por categoria, redução que confirma e purga de todas as cópias — e o deixa **explicitamente aberto na parte de conta** (exclusão recuperável em 7 dias, desligamento de automações, desconexão do WhatsApp, cancelamento dentro do prazo e restore), que é do Goal025 — o Goal024 fechou sem tocá-la, como o seu escopo declarava, e a redivisão está na v44 do [MASTER_PLAN](MASTER_PLAN.md#histórico-de-planejamento). Fecha também o resíduo de retenção que **G-04** e **G-23** arrastavam desde o Goal004: o payload integral em `webhook_deliveries`. Aplica D-008 mais uma vez, agora no processo do **BFF**, e **consome** o que D-037 e D-038 registraram como resíduo sem prazo; reusa e não altera D-008, D-018, D-021, D-024, D-030, D-031, D-034, D-037 e D-038. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: duas rotas novas e um campo nulável no DTO de conversa. **Com quatro migrations, todas aditivas:** `20260915150000_goal023_retention` e `20260915180000_goal023_retention_sweep` no BFF (duas tabelas que nascem vazias), `20260915160000_goal023_conversation_content_expiry` na IA (uma coluna nulável) e `20260915170000_goal023_notification_content_retention_index` no Scheduling (só índice). Nenhum backfill e nenhum `UPDATE` em linha existente; todas retomáveis, corrigindo o padrão que o [review022](reviews/022-review.md) registrou como divergente.

**Contexto:** até aqui a plataforma nunca tinha apagado dado de cliente de propósito, e a retenção era indefinida em todos os serviços: `Message`/`MessageAttachment`, `AiRun`/`AiToolCall` e `ProcessedEvent.rawPayload` na IA, `facts`/`detail` das intenções no Scheduling desde o Goal021, `TenantNotification` no BFF desde o Goal022 — que nasceu declaradamente sem purga — e o payload integral do evento em `webhook_deliveries`, no transporte em Go, desde o Goal004. O vault é explícito sobre o que deveria existir (prazo em Configurações → Conversas, quatro opções, Comercial 90 / Pessoal 30, redução que explica e confirma, conversa que continua na lista com informação mínima), e nenhuma camada cumpria. O que torna isto caro de errar não é o tamanho do diff: **nada do que é apagado volta** — não há lixeira, undo nem exportação prévia.

**Decisão:** (1) **O prazo é escolha do negócio, mas a lista é do servidor.** `RetentionSettings` guarda uma linha por negócio; a allowlist 30/90/180/365 é validada no servidor por união de literais, e valor fora dela é recusado sem gravar nada. O seletor lê as opções da resposta em vez de declarar a própria lista. (2) **A ausência de linha é o default do produto**, Comercial 90 / Pessoal 30, resolvida em código — nenhum boot, migration ou login escreve linha para todo mundo, mesmo padrão de `ReminderSettings` no Goal021. (3) **Reduzir prazo exige confirmação no próprio contrato:** `PATCH` que diminua qualquer categoria sem `confirmReduction: true` é recusado com erro nomeado que diz a categoria e o de/para, antes de qualquer escrita; aumentar nunca exige. A confirmação não pode viver só no diálogo da UI, porque um segundo consumidor da API teria um caminho mais curto para apagar do que a profissional tem na tela. (4) **Reduzir não apaga na hora, e nenhuma rota pública apaga nada:** a redução passa a valer na varredura seguinte, e a resposta diz isso em vez de sugerir efeito imediato. (5) **A varredura é um laço batido no processo do BFF; a exclusão executa no dono.** O registro de negócios só existe no banco do BFF e a única direção de chamada interna aceita é BFF → donos, então quem enumera é o BFF e quem apaga é quem é dono do dado, por rota interna tenant-scoped que recebe o cutoff **já calculado** e um teto de linhas, e devolve contagens e se há resto. É a diferença deliberada em relação a D-038: lá o efeito era criar linha e podia esperar alguém abrir o app; apagar não pode, porque o negócio que parou de usar o produto é justamente aquele cujo conteúdo precisa expirar. (6) **O laço nasce desligado e é inteiramente governado por ambiente** — ligar, intervalo, lease, negócios por passada, linhas por store e piso entre passadas do mesmo negócio —, com `RetentionSweepState` por negócio, claim condicional atômico, lease em `TIMESTAMPTZ` e fencing por token na liquidação. Desligado, o produto continua inteiro. (7) **A passada é batida, retomável e idempotente por construção:** "apagar o que é mais velho que o cutoff" repetido não faz mal, cada fonte lê uma linha a mais que o teto para que "restou trabalho" seja fato observado e não inferência, e a segunda passada imediata não apaga nada. Fonte indisponível degrada só ela; o laço não lança para fora e nenhuma rota pública devolve `500` por causa dele. (8) **A categoria que governa uma linha é a da sessão cuja janela contém o instante dela** — a categoria vive na sessão, não na conversa —, escrita **uma única vez** no predicado da purga, para `Message` por `createdAt` e para `AiRun` por `startedAt`. (9) **U-01 é honrada por construção, não por lembrança:** `UNCLASSIFIED` não tem prazo, coluna, parâmetro, opção nem default em camada nenhuma, e o predicado exige que exista sessão governante **e** que *nenhuma* sessão governante recuse a purga — de modo que conteúdo não classificado, órfão de janela e janela ambígua sobrevivem. Nenhuma copy promete, sugere ou insinua exclusão desse grupo. (10) **O que expira é conteúdo, não identidade.** No Scheduling a intenção terminal tem `facts`/`detail` esvaziados e **a linha permanece**, porque ela é a identidade de dedupe do Goal021 e apagá-la ressuscitaria lembrete antigo; `PENDING`/`CLAIMED` são inalcançáveis por não terem `settledAt`. Na IA, `Conversation`, `ConversationSession`, `Contact`, `Handoff`, `CustomerMemory` e conhecimento sobrevivem à purga do conteúdo. (11) **A expiração é marca durável que só avança, e é o que a interface lê:** `Conversation.contentExpiredThrough` vai até o instante da linha mais nova apagada naquela conversa — não até o cutoff, que anunciaria perda que não houve — e é gravada por `UPDATE` cru, para que apagar conteúdo antigo não jogue uma conversa morta para o topo da inbox. A tela nunca infere expiração pela ausência de mensagem. (12) **A central usa a janela que já existe:** `EVENT` e `CONDITION` **já resolvida** fora da janela de histórico de 90 dias são apagadas, condição aberta nunca é, e `unreadCount` passou a aplicar a mesma janela da lista — o que fecha a divergência declarada em D-038 sem inventar um segundo prazo. (13) **Três prazos são técnicos e não são escolha da profissional:** o inbox durável da IA (`INBOX_RETENTION_DAYS`, 180 dias, só `DONE`/`IGNORED`/`LEGACY`), o conteúdo das intenções (`RETENTION_INTENT_CONTENT_DAYS`, 90 dias) e o outbox do transporte (`WEBHOOK_OUTBOX_RETENTION_HOURS`, 30 dias). Vêm de ambiente, não aparecem na interface, e o motivo de cada default está escrito junto da constante — inclusive a consequência de apagar evento concluído sobre o dedupe de entrada `(tenantId, provider, eventKey)`. (14) **Quem guarda o rastro é quem o expira:** o prune do outbox roda dentro do processo do transporte, no boot e periodicamente, em lotes, sem rota nova e sem chamada entre serviços — o payload do webhook é dado do transporte, e o BFF não manda ninguém apagá-lo.

**Alternativas:** aplicar a Não classificadas o prazo de Pessoal ou de Comercial (rejeitada: é U-01, decisão de uma pessoa, e apagaria conteúdo possivelmente pessoal sob presunção); tratar mensagem órfã de janela de sessão pela categoria mais provável (rejeitada pelo mesmo motivo — inventar categoria para conteúdo órfão é purgar sob presunção); validar a allowlist só no seletor (rejeitada: a lista é invariante do servidor, não da tela); exigir a confirmação de redução apenas no diálogo da UI (rejeitada: daria a um segundo consumidor da API caminho mais curto para apagar); apagar na hora da redução (rejeitada: faria rota pública de escrita executar exclusão irreversível dentro da requisição); estimar e devolver "quantas mensagens serão perdidas" (rejeitada: exigiria varrer o dono dentro de uma requisição de leitura); materializar a purga por leitura reconciliada, como D-038 (rejeitada: retenção que só roda quando alguém abre o app não é retenção); cron do sistema operacional, fila, broker ou serviço novo (rejeitada: o padrão de trabalho durável com lease já existe desde D-008 e o Goal proíbe processo novo); o BFF apagando direto nos bancos dos donos (rejeitada: inverteria o ownership e daria ao BFF escrita destrutiva em banco que não é dele); o dono chamando o BFF para saber o prazo (rejeitada: inverteria a única direção de chamada interna vigente); derivar o prazo técnico das intenções de `RetentionSettings` (rejeitada na rodada 1: tornaria configurável pelo produto um rastro técnico, e um negócio em 365/365 passaria a guardar telefone e fatos formatados por 365 dias); apagar a linha da intenção junto com o conteúdo (rejeitada: a linha é identidade de dedupe e sua ausência ressuscita lembrete); apagar condição aberta antiga na central (rejeitada: ela ainda descreve o agora); criar uma segunda janela para a purga da central (rejeitada: duas janelas divergem, e a divergência de D-038 era exatamente essa); o BFF mandando o transporte em Go apagar o outbox (rejeitada: criaria rota e chamada entre serviços para dado que é do transporte); marcar a conversa até o cutoff em vez de até a linha mais nova apagada (rejeitada: anunciaria perda de conteúdo que sobreviveu); e inferir expiração na tela pela ausência de mensagem (rejeitada: a ausência também é conversa vazia, e a tela passaria a afirmar perda que não houve).

**Motivo:** exclusão não tem desfazer. Todo o resto do sistema aceita correção posterior — uma tela errada se conserta, um contrato se versiona, uma notificação duplicada se marca como lida —, e este não: a mensagem apagada por um prazo errado, por uma categoria inferida ou por uma varredura que vazou de um negócio para outro não volta. Por isso as invariantes caras deste Goal não são detalhe de implementação: a lista de prazos é do servidor, a redução é confirmada no contrato, o `tenantId` do contexto é o único filtro de toda consulta de purga, o predicado de categoria preserva em caso de dúvida, e a decisão que ninguém tomou (U-01) não é antecipada por código.

**Consequências:** o processo do BFF passa a ter um laço, o primeiro — `RETENTION_SWEEP_ENABLED` decide se ele roda, e com ele desligado nada é apagado em lugar nenhum, o que é um estado operacional legítimo e silencioso. `Conversation.contentExpiredThrough` vira contrato: qualquer purga futura que não o avance faz a interface mentir sobre o que ainda existe, e qualquer código que o retroceda anuncia recuperação que não houve. A regra de categoria governante fica dependente de `ConversationSession`: mudar a semântica de `startedAt`/`endedAt` muda o que é apagado. Conteúdo não classificado **cresce sem prazo** enquanto U-01 não for decidida, e quanto mais a decisão demorar, maior o volume que qualquer prazo futuro alcançará de uma vez. A reconciliação da central pode rematerializar notificação de intenção `FAILED` já purgada e reapagá-la na varredura seguinte — trabalho circular invisível ao usuário, declarado no [review023](reviews/023-review.md). O prazo do inbox durável passa a significar que reentrega do mesmo evento depois de 180 dias seria reprocessada. E a fronteira de prova continua onde estava, com um limite novo e específico: nenhuma purga foi executada contra dado real, e toda evidência vem de PostgreSQL descartável.

**Revisar se:** U-01 for resolvida por uma pessoa, o que reabre (9) e transforma o grupo Não classificadas em conteúdo purgável — com o acúmulo já existente sendo alcançado na primeira passada depois da decisão; o Goal025 entregar exclusão de conta — o Goal024 fechou sem ela —, o que precisa decidir se a conta apagada leva junto o que (10) preserva por identidade; o volume tornar o teto por passada insuficiente, o que reabre (6) e (7) antes de qualquer fila; algum dono novo passar a guardar conteúdo de conversa, o que o obriga a entrar em (5) como porta própria em vez de ser purgado de fora; o produto passar a exigir prazo por conversa, por cliente ou fora da allowlist, o que reabre (1); a janela de histórico da central mudar, o que move junto o que (12) apaga; ou a retenção passar a precisar de recuperação — lixeira, exportação prévia ou período de graça —, o que reabre a premissa de que nada do que é apagado volta.

## D-040 — Configurações decomposta por módulo reaproveitando as seções já isoladas, conhecimento consumido sem mudar contrato e revogação de sessões como rota aditiva sobre mecanismo existente, adotados no Goal024

**Status:** ACCEPTED em 2026-09-16 pelo Tech Lead Agent no [review024](reviews/024-review.md), para o diff aceito na rodada 2 sobre a base `eee9a05`, sem commit/deploy. Fecha **G-31** na parte de Configurações — a última superfície de tela da migração que ainda não tinha sido redesenhada — e fecha o resíduo de tela que **G-24** arrastava desde o Goal012, dando a `BffKnowledgeService` seu primeiro consumidor real. **Não** toca G-29: a parte de conta (exclusão recuperável, desligamento de automações, desconexão de WhatsApp, cancelamento e restore) continua **explicitamente aberta**, redirecionada ao **Goal025**, como o Goal023 já registrava. Reusa e não altera D-018, D-030, D-031 (decomposição por módulo, provada por render), D-032, D-033, D-034 e D-039 (nenhuma regra de retenção/central é reaberta). **Diferença em relação à aplicação anterior de D-031:** o call site de `useShellConfig` continua único em `ProductSettingsScreen.tsx`, idêntico à baseline — os oito módulos de seção não chamam o hook —, o que este documento registra como achado, não como decisão tomada. Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: uma rota nova, `POST /v1/auth/logout-all`, e nenhum outro contrato — conhecimento, retenção, lembretes, central, negócio, IA, disponibilidade e WhatsApp são consumidos exatamente como estavam. Sem migration: nenhum schema mudou.

**Contexto:** `ProductSettingsScreen.tsx` era o último monolito de tela da migração — 942 linhas, dezesseis cenários, oito rotas, um único `useShellConfig` calculando destino/título/ação por cenário —, e o Goal023 tinha declarado de propósito que não o redecomporia. Em paralelo, `BffKnowledgeService` existia desde o Goal012, registrado em `registry.ts`, sem um único `.tsx` que o referenciasse: o contrato de FAQ/orientações/cuidados/procedimentos/políticas/campo livre que a IA já consultava no prompt não tinha onde ser cadastrado pela profissional. E "sair de todos os dispositivos" era item nominal do vault sem rota pública, apesar de `revokeAllUserSessions` já existir e já ser usado na troca de senha.

**Decisão:** (1) **A decomposição é refactor puro, não redesenho de comportamento.** Cada seção vira módulo próprio em `features/settings/`; o call site de `useShellConfig` continua único, em `ProductSettingsScreen.tsx` como despachante — os módulos de seção não o chamam diretamente, idêntico à baseline —, os dezesseis cenários de `types.ts` continuam todos existindo e alcançáveis, as oito rotas continuam nos mesmos caminhos, e nenhum formulário muda campo, validação, destino ou mensagem fora do que §2/§3/§5 do Goal pediu. (2) **Seção já isolada não é redigerida.** `RetentionSection` (Goal023), `ReminderSettingsSection` (Goal021) e o painel de WhatsApp são só remontados pelos módulos novos — reescrevê-los seria trabalho sem motivo e risco de regressão em contrato que não muda aqui. `ImportSettingsSection` (Goal020) é diferente: perdeu o único consumidor que tinha quando o hub passou a apontar direto para `/importacao` (item 3) e saiu do repositório por isso, não por reescrita. (3) **O hub segue o vault, não o histórico de onde cada seção foi implementada primeiro:** Importação ganha entrada própria apontando para `/importacao`, saindo de dentro de Agenda; Lembretes continua dentro de Agenda porque o vault não os aloca em seção própria. (4) **Conhecimento é consumido como o contrato já é, não redesenhado.** A seção nova em Configurações → IA lista, cria, edita e desativa pelas rotas que o Goal012 deixou prontas, recusa `BUSINESS_INFO` em todo seletor (o contrato já recusa com `409`) e trata `502`/`KNOWLEDGE_INDEX_UNAVAILABLE` dizendo explicitamente que nada foi salvo — honestidade de estado, não elaboração de contrato novo. (5) **Revogação de sessões é rota aditiva sobre mecanismo que já existe**, não um novo modelo de sessão: `POST /v1/auth/logout-all` chama `revokeAllUserSessions` com o motivo próprio `LOGOUT_ALL_DEVICES`, sob sessão e CSRF como as demais mutações, sem aceitar identidade do chamador no corpo. (6) **"Todos os dispositivos" inclui o próprio.** A sessão que fez a chamada também é revogada, e a tela leva a `/login` pelo mesmo caminho que "Sair da conta" já usa — reversível por novo login, então sem o peso de confirmação de uma exclusão. (7) **A Home foi conferida, não retrabalhada.** `DashboardScreen.tsx` foi checada contra a seção "Início" do vault e contra `GET /v1/status`/`GET /v1/dashboard`; nenhuma divergência real foi encontrada, então nenhuma linha da tela mudou — decomposição, métrica nova e poller novo continuam fora de escopo por decisão, não por omissão.

**Alternativas:** reescrever `RetentionSection`/`ReminderSettingsSection`/`ImportSettingsSection`/o painel de WhatsApp junto da decomposição (rejeitada: nenhuma delas precisa mudar, e reescrever sem motivo é o mesmo churn que D-039 já recusou para Lembretes); mover Lembretes para seção própria do hub (rejeitada: o vault não pede isso, e mover seria melhoria não solicitada); expor conhecimento como CRUD genérico fora da seção IA (rejeitada: o vault liga conhecimento ao comportamento da IA, e a profissional precisa ver os dois juntos); mudar o contrato de conhecimento para simplificar a tela — por exemplo devolver `BUSINESS_INFO` na mesma lista dos demais tipos (rejeitada: o Goal proíbe mudar contrato existente sem motivo, e o `409` do servidor já resolve a exclusão de tipo sem ajuda da tela); permitir que `POST /v1/auth/logout-all` aceite `userId`/`tenantId` do chamador para reuso administrativo futuro (rejeitada: abriria caminho para revogar sessão de terceiro sem prova de identidade — a rota só existe para o próprio usuário autenticado); poupar a sessão que fez a chamada da revogação, por conveniência de navegação (rejeitada: contradiria o texto "todos os dispositivos", que a profissional lê antes de confirmar); decompor `DashboardScreen.tsx` já que as outras telas de módulo passaram por isso (rejeitada: a Home já serve uma rota com um call site de `useShellConfig` — não é o padrão de monolito que G-31 persegue, e decompor sem necessidade seria escopo não pedido); e acrescentar métrica ou card novo à Home a partir da conferência (rejeitada: o Goal proíbe explicitamente métrica nova sem aprovação de produto).

**Motivo:** as duas maiores superfícies deste Goal — decompor a última tela monolítica e dar tela a um contrato que já existia havia dois Goals — têm o mesmo risco: reescrever mais do que o necessário. A decisão de não tocar seções já isoladas, não mudar contrato de conhecimento e não decompor a Home não é economia de esforço, é a mesma disciplina que D-031/D-033 já aplicaram: só o que o vault pede muda, o resto é preservado byte a byte de comportamento.

**Consequências:** `ProductSettingsScreen.tsx` deixa de ser o resíduo citado em G-31 a cada Goal anterior — não há mais tela monolítica pendente na migração de frontend. `BffKnowledgeService` passa a ter cobertura de teste de render (listar, criar, editar, desativar, campo livre, `502`) em vez de ser código morto sob risco de dessincronizar do schema sem ninguém notar. `POST /v1/auth/logout-all` é a primeira rota pública que expõe `revokeAllUserSessions` fora do fluxo de troca/reset de senha; qualquer mudança futura em `UserSession` ou no motivo de revogação passa a ter três chamadores a considerar, não um. G-29 na parte de conta permanece aberto com o mesmo tamanho de antes — este diff não reduz nem aumenta esse resíduo, só entrega a seção Conta decomposta em que o Goal025 vai construir.

**Revisar se:** o Goal025 entregar o ciclo de vida de conta (exclusão recuperável, desligamento de automações, desconexão de WhatsApp, cancelamento e restore), o que exige decidir como a revogação de sessão de (5)/(6) se encaixa num fluxo destrutivo que hoje não existe; o vault passar a pedir Lembretes como seção própria do hub em vez de dentro de Agenda, o que reabre (3); o contrato de conhecimento mudar — por exemplo passar a devolver o conteúdo indexado ou deixar de recusar `BUSINESS_INFO` fora do campo livre —, o que reabre (4); `POST /v1/auth/logout-all` precisar de reuso administrativo para revogar sessão de terceiro, o que reabre a recusa registrada em (5); ou a Home passar a ganhar métrica nova aprovada por produto, o que reabre (7) e a decisão de não decompor `DashboardScreen.tsx`.

## D-041 — Máquina de estados da exclusão de conta, guarda contra reativação automática e purga por negócio derivada do schema, adotados no Goal025

**Status:** ACCEPTED em 2026-09-16 pelo Tech Lead Agent no [review025](reviews/025-review.md), para o diff aceito na rodada 5 sobre a base `5983c9a` (quatro rodadas anteriores de CHANGES_REQUIRED), sem commit/deploy. Fecha **G-29 na parte de conta** — exclusão recuperável em 7 dias, desligamento de automações, desconexão do WhatsApp, cancelamento dentro do prazo e purga —, que o Goal023 fechou só na parte de conteúdo (D-039) e que o Goal024 deixou explicitamente aberta (D-040), redirecionada em v44 do MASTER_PLAN ao Goal então planejado como 024B e renumerado para Goal025 em v46 (motivo operacional do contrato `PlanningDecision`, que exige `nextGoalId` de três dígitos; nada do escopo mudou). Reusa e não altera D-008 (mesmo formato de laço batido no processo do dono, com lease por relógio do banco e fencing por token), D-018, D-030 a D-034 e D-039 (nenhuma regra de retenção de conteúdo é reaberta; a purga de conta é apagamento total, não expiração de conteúdo). Muda `apps/bff/PUBLIC_API_V1.md` de forma aditiva: duas rotas novas (`POST`/`DELETE /v1/account/deletion`) e um campo `accountDeletion` em `GET /v1/status`. Com uma migration aditiva no BFF (`20260916000000_goal025_account_deletion`, uma tabela nova sem chave estrangeira para `Tenant` nem `User`) e, na IA e no Scheduling, um escopo interno novo (`tenant:purge`) mais uma rota interna própria por dono (`POST /internal/retention/tenant`; a IA ganha também `DELETE /internal/channel-connections/evolution` para derrubar o canal).

**Contexto:** o vault promete que excluir a conta é recuperável por sete dias e que, vencido o prazo, o negócio e tudo o que ele gerou nas três lojas (IA, Scheduling, BFF) mais a instância do WhatsApp deixam de existir. Nada disso tinha mecanismo: não havia estado durável de "exclusão pedida", nenhuma rota para pedir ou cancelar, nenhuma guarda contra a IA voltar a ligar sozinha numa conta esperando purga, e nenhum caminho de apagamento total do negócio em nenhuma das três lojas — a varredura do Goal023 (D-039) apaga só conteúdo por prazo configurável, nunca a linha do negócio inteira. Sem a guarda, uma conta com exclusão `SCHEDULED` mas ainda dentro da janela de purga podia ter a IA reativada pela própria reconciliação (Goal019/D-035) caso um teste real terminasse `SUCCEEDED` nesse intervalo — o mecanismo de autoativação não sabia que a conta estava de saída.

**Decisão:** (1) **A máquina de estados é só decisão, sem efeito, e mora sozinha em `state.ts`.** Três estados por negócio — `SCHEDULED`, `CANCELLED`, `PURGED` —, uma linha por `tenantId` (chave primária), reescrita em vez de duplicada a cada novo ciclo pedir→cancelar→pedir. `decideStart` recusa sobre `SCHEDULED` (`ACCOUNT_DELETION_ALREADY_SCHEDULED`, sem empurrar o vencimento do primeiro pedido) e sobre `PURGED` (`ACCOUNT_DELETION_ALREADY_PURGED`); `decideCancel` recusa sem pedido, depois do vencimento (`ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED`) e sobre estado terminal. O vencimento é sempre `requestedAt` mais os sete dias de `ACCOUNT_DELETION_GRACE_PERIOD_DAYS`, constante de produto sem variável de ambiente nem campo por negócio — ao contrário de `RetentionSettings` (Goal023). (2) **O relógio nunca é lido dentro da decisão nem da purga.** `isAccountDeletionDue` recebe `now` por parâmetro em todo chamador de produto, e a mesma função decide "posso cancelar" (em `decideCancel`) e "venceu para a purga" (no `WHERE` do claim), para que as duas leituras do mesmo instante nunca divirjam. (3) **Iniciar grava o estado e desliga a IA desejada na mesma transação.** `AccountDeletion.status = SCHEDULED` e `AiSettings.enabled = false` (com `activatedByRunId: null`) commitam juntos em `service.ts`; depois desse commit não existe instante em que a exclusão exista e a automação continue ligada. Falha remota (projetar na IA, derrubar o canal, desconectar o WhatsApp) é tolerada e reportada, nunca derruba o pedido — o dono continua podendo excluir a própria conta com uma dependência fora do ar, mesmo princípio já aplicado a G-25/G-27. (4) **Cancelar não restaura nada.** Sem porta de efeito nenhuma em `cancelAccountDeletion`; é a implementação literal da promessa de produto, não uma lacuna — voltar a operar exige reconectar o número e refazer o teste real pelos fluxos que já existem. A senha atual só é exigida para iniciar (mesmo grau de `PATCH /v1/auth/password`); cancelar usa só a sessão vigente, como as demais mutações. (5) **A guarda de não-reativação vive no caminho comum de reconciliação, mais uma segunda guarda explícita no único chamador que grava `enabled: true` por pedido humano fora dele.** `reconcileAiActivation` (`ai-activation.ts`) consulta `AccountDeletion` a cada passada e, com `SCHEDULED` em vigor, o desejado do negócio deixa de vir de `AiSettings.enabled` e passa a ser `false` — inclusive contra uma execução de teste `SUCCEEDED`, que em qualquer outra conta autoativaria (D-035). Isso cobre autoativação e convergência, mas não cobre `PATCH /v1/settings/ai`: essa rota grava `AiSettings.enabled = true` e projeta `enabled: true` na IA na mesma requisição, sem passar pela reconciliação, o que abriria uma janela com a IA de uma conta em exclusão respondendo cliente. Por isso `assertAiActivationNotBlockedByDeletion` (`account/service.ts`) existe como segunda guarda, chamada só por esse caminho antes de checar serviço operacional, e recusa com `409 CONFLICT` sem `details`. As duas guardas não competem: a comum cobre todo caminho que só projeta o já gravado, e a explícita cobre o único caminho que grava `enabled: true` fora da reconciliação — uma guarda por chamador em geral seria uma guarda que o próximo chamador esquece, mas aqui há exatamente um chamador com esse formato, e ele tem uma função para chamar em vez de uma condição para repetir. (6) **A purga por negócio é enumeração exaustiva por schema, não cascata a partir de uma raiz.** Nem a IA nem o Scheduling têm uma tabela "Tenant" própria (essa raiz só existe no BFF); `TENANT_PURGE_TABLES` em cada serviço lista toda tabela com `tenantId` do próprio schema, na ordem seguindca de chave estrangeira, e um teste falha se um modelo novo não estiver nem na lista nem em `TENANT_PURGE_CASCADE_ONLY`. Só o BFF apaga por cascata (`Tenant` → `TenantMember` etc.), porque só ele tem a raiz relacional. (7) **A ordem entre as três lojas é correção, não estilo.** IA e Scheduling primeiro, por rota interna própria (`POST /internal/retention/tenant`, escopo `tenant:purge` — deliberadamente distinto de `retention:purge`, porque apagar todo o rastro do negócio não é consequência de poder apagar só conteúdo de conversa); o BFF por último, porque `Tenant`/`User` cascateiam e são a única forma de alcançar o negócio dali em diante — apagar o `User` primeiro deixaria linhas órfãs e inalcançáveis nas outras duas lojas. Dentro do BFF, a instância do WhatsApp na Evolution é removida **antes** do `DELETE` local, porque a credencial selada vive em `WhatsAppInstance`, que o `DELETE` do `Tenant` cascatearia embora. (8) **`PURGED` é a última escrita, e só quando as três lojas confirmaram.** Falha de qualquer loja, ou teto de linhas atingido com resto declarado (`hasMore`), mantém a linha `SCHEDULED` para a passada seguinte retomar — nunca por ter começado. Purgar duas vezes não é erro: as rotas internas são idempotentes por contrato, os `deleteMany` locais não encontram linha, e conta já `PURGED` nem chega a ser reivindicada. (9) **O claim é atômico e com fencing, mesmo padrão de D-008/D-039.** Um `UPDATE ... WHERE status='SCHEDULED' AND dueAt<=now() AND lease morto` grava um `leaseToken` novo e o devolve; a liquidação exige o mesmo token, então uma instância que perdeu o lease por vencimento não sobrescreve quem assumiu depois dela. (10) **O laço da purga é próprio e desligado por default, variável separada da varredura de retenção de conteúdo** (`ACCOUNT_PURGE_ENABLED`, mesmo motivo do Goal023 item 6, mais forte aqui porque a passada apaga o negócio inteiro e o dono). (11) **A linha `AccountDeletion` sobrevive à purga como prova, sem dado pessoal.** Sem chave estrangeira para `Tenant` nem `User` — uma FK com cascade apagaria a prova junto com o dono; uma FK sem cascade bloquearia a própria purga — e, depois de `PURGED`, a linha não guarda e-mail, nome, telefone ou conteúdo: só IDs, instantes e o rastro do lease.

**Alternativas:** reativar ou restaurar algo ao cancelar, por conveniência de quem mudou de ideia rápido (rejeitada: contradiria a promessa de produto de que cancelar só interrompe a purga, não desfaz o desligamento — reconectar e reativar continuam exigindo os fluxos e o teste real de sempre); reusar `ACCOUNT_PURGE_ENABLED`/o laço de retenção de conteúdo do Goal023 para a purga de conta (rejeitada: ligar expiração de conteúdo não pode ligar, por consequência, apagamento de conta inteira — mesmo princípio do Goal023 item 6, agora sobre um efeito mais destrutivo); apagar o `User`/`Tenant` do BFF antes das duas lojas remotas (rejeitada: as duas só são alcançáveis por `tenantId`, e apagar a raiz primeiro deixaria linhas órfãs inalcançáveis); reusar `retention:purge` como escopo da purga de negócio inteiro (rejeitada: quem pode apagar conteúdo de conversa não deve poder, por consequência, apagar o rastro inteiro do negócio — escopo próprio, `tenant:purge`); recusar o pedido de exclusão quando IA ou WhatsApp estão fora do ar (rejeitada: impediria o dono de excluir a própria conta por uma dependência que não é dele, mesma tolerância já aplicada a outros efeitos remotos do produto); colocar a guarda de não-reativação em cada rota que só lê ou projeta o desejado já gravado, em vez do caminho comum de reconciliação (rejeitada: qualquer chamador novo desses esqueceria de checá-la; o caminho comum não deixa escapatória — isso não inclui `PATCH /v1/settings/ai`, o único caminho que grava `enabled: true` por pedido humano fora da reconciliação, que precisa e tem guarda própria, item (5)); apagar a linha `AccountDeletion` junto com o resto do negócio (rejeitada: sem ela não sobra prova de que a exclusão aconteceu, nem forma de a rota pública distinguir "nunca pediu" de "já foi purgado"); marcar `PURGED` assim que a passada começa, em vez de só quando as três lojas confirmam (rejeitada: uma falha no meio deixaria a conta marcada como purgada sem estar, perdendo a possibilidade de a passada seguinte retomar); apagar a instância da Evolution depois do `DELETE` local em vez de antes (rejeitada: a credencial selada vive na linha que o `DELETE` cascateia embora, e sem ela não sobra como identificar a instância remota).

**Motivo:** este é o primeiro mecanismo do produto que apaga um negócio inteiro, em três bancos diferentes, de forma irreversível — a mesma categoria de risco que D-039 já tratou para conteúdo, agora sem trapdoor: não há "reduzir prazo com confirmação", só "sete dias e depois não existe mais". Por isso a ordem entre lojas não é estilo, o claim é atômico com fencing em vez de otimista, `PURGED` só é escrito quando as três confirmaram, e a guarda de reativação está no caminho que toda requisição já passa, não num chamador que alguém pode esquecer de atualizar.

**Consequências:** o BFF ganha um segundo laço de fundo, independente do `RetentionSweepWorker` do Goal023, desligado por default pela mesma disciplina; com ele desligado, nenhuma conta é apagada em lugar nenhum. `reconcileAiActivation` passa a fazer uma consulta extra (`AccountDeletion`) em toda reconciliação, mesmo para o negócio que nunca pediu exclusão. `AccountDeletion` é a primeira tabela do BFF desenhada de propósito para sobreviver ao apagamento do próprio `Tenant`/`User` que ela referencia por ID solto — qualquer alteração futura em `Tenant`/`User` precisa lembrar que essa linha não tem FK e não vai cascatear. Dois serviços (IA, Scheduling) ganham rota de apagamento total do negócio pela primeira vez, sob escopo próprio; qualquer tabela nova com `tenantId` em qualquer um dos dois passa a exigir entrada em `TENANT_PURGE_TABLES` sob pena de o teste de cobertura falhar. G-29 deixa de ter parte aberta — conteúdo no Goal023, conta neste Goal.

**Revisar se:** o apagamento local do BFF passar a precisar de teto por passada — hoje é o único dos três que roda como `DELETE` em cascata sem limite, aceito porque as tabelas por tenant do BFF são limitadas por natureza, e o item (8) fala em teto "por loja"; o produto passar a permitir múltiplos donos por negócio (fora do MVP hoje), o que reabre quem pode pedir/cancelar a exclusão e como `requestedByUserId` decide o que sobrevive em (11); a IA ou o Scheduling ganharem um dono de dado de negócio sem coluna `tenantId` própria, o que passa a exigir entrada em `TENANT_PURGE_CASCADE_ONLY` antes de a tabela existir; ou o produto exigir algum grau de recuperação pós-purga — lixeira, exportação prévia, período adicional —, o que reabre a premissa de que a purga é definitiva.

## D-042 — Retirada do protocolo de migração legado, do writer remoto e do pacote de contratos vazio, com regra estática contra o retorno, aceita no Goal026

**Status:** ACCEPTED em 2026-09-19 pelo Tech Lead Agent no [review026](reviews/026-review.md), rodada 3, para o diff aceito sobre a base `7253ce0`, sem commit/deploy. A forma aceita difere da proposta na rodada 1 em dois pontos, ambos exigidos em review: a retirada do writer alcançou também `minha-agenda/client.ts` (os sete métodos de escrita e de leitura operacional que perderam o último consumidor nesta mesma remoção), e a regra estática passou a reprovar nome de método de escrita em qualquer arquivo da origem, não apenas o nome antigo da classe. Fecha **G-10** na parte de código do protocolo antigo e do writer remoto (a parte de vocabulário público `EXTERNAL`/`source`/`target` segue aberta, sem Goal atribuído) e retira o pacote vazio de **G-32**, que a remoção **não fecha** — contratos por operação com produtor+consumidor provados continuam sem existir. Reusa e não altera D-026 (contratos de importação única e corte operacional do writer remoto, Goal010): nenhuma linha de `MigrationJob` já gravada é tocada, e a classificação de legado (U-02) continua lendo essas linhas como histórico.

**Contexto:** o Goal010 (D-026) cortou o writer remoto e o protocolo de migração bidirecional **operacionalmente** — a factory parou de entregar `MinhaAgendaCalendarProvider` para escrita/oferta, e `assertImportAvailable` impediu o protocolo antigo de reabrir o direito de importação —, mas preservou o **código** como compatibilidade declarada: as três rotas antigas (`POST /v1/calendar/migrations/diagnose`, `POST /v1/calendar/migrations`, `GET /v1/calendar/migrations/:id`), `CalendarMigrationService` (939 linhas) inteira no Scheduling, e a classe `MinhaAgendaCalendarProvider` continuando a implementar `CalendarProvider` por completo — todos os métodos de escrita (`createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `getAvailability`, `listAppointments`, `getMigrationSnapshot`) — mesmo sem nenhum chamador de produto alcançando-os desde o diff010. O diff020 já tinha removido o único consumidor de frontend desse protocolo (`ProductMigrationScreen`); nenhuma tela ou fluxo dependia do que sobrava no backend. Paralelamente, `packages/contracts` existia desde o Goal0 como doze índices de domínio vazios (placeholders) mais utilitários `common`, sem nenhum import de runtime encontrado em app nenhum ([CURRENT_STATE](CURRENT_STATE.md)), e ainda assim `validate:core` compilava e listava o pacote a cada execução — o único efeito prático de mantê-lo era o tempo de gate, não cobertura de contrato real, porque G-32 continuava aberto do mesmo jeito com ou sem o pacote.

**Decisão:** (1) **Retirada do protocolo com preservação das linhas gravadas (D-026).** As três rotas antigas saem de `PUBLIC_API_V1.md`, do módulo `migrations` do BFF (`apps/bff/src/modules/migrations/routes.ts`, com os helpers `publicMigration`/`internalSource`/`publicSource`), do client interno do BFF para o Scheduling (`diagnoseMigration`/`createMigration`/`getMigration` e os schemas `migrationDiagnosisSchema`/`migrationSchema`) e das rotas internas do Scheduling (`POST /internal/calendar/migrations/diagnose`, `POST /internal/calendar/migrations`, `GET /internal/calendar/migrations/:id`); `CalendarMigrationService` é apagada inteira. Nenhuma migration de schema acompanha esta mudança: nenhuma tabela, coluna ou linha de `MigrationJob` é tocada — o serviço de classificação (`LegacyMigrationJobReconciliation`, U-02) continua lendo exatamente as mesmas linhas pela mesma tabela, porque a retirada é de rota e de orquestração, não do registro histórico que D-026 já tinha decidido preservar. É **a primeira remoção subtrativa de rota pública** desta migração — as anteriores só acrescentaram, reescoparam ou trocaram vocabulário. (2) **Morte do writer remoto com sobrevivência da leitura de importação.** A classe que implementava `CalendarProvider` (`provider.ts`) é renomeada para `MinhaAgendaImportSourceReader` (`import-source-reader.ts`) e deixa de implementar essa interface: todo método de escrita, disponibilidade e listagem operacional sai junto (~600 linhas), e só `listServices`/`getImportSnapshot` permanecem — as duas leituras que o ciclo de importação única (`ImportSession`, Goal010) de fato chama, nos mesmos dois pontos de instanciação de antes (validação de `connect` e `buildMinhaAgendaReader`). Nenhum comportamento do ciclo de importação muda: é a mesma classe, com menos código morto, não uma reescrita de contrato. A forma aceita vai além do adapter e alcança o **client HTTP da origem** (`minha-agenda/client.ts`) e seus tipos: `createAppointment`, `updateAppointment`, `cancelWithComments`, `createCustomer`, `getAppointment`, `appointmentExists` e `searchCustomers` saem da classe e da interface `MinhaAgendaSourceClient`, porque perderam o último consumidor exatamente nesta remoção — o adapter apagado. Sobram as quatro leituras que `import-source-reader.ts` chama (`listServices`, `findAppointmentsByDateRange`, `getCompanyWorkSchedule`, `getEmployeeWorkScheduleByEmployeeId`). Um writer que existe e não é chamado não é um writer inexistente: essa correção foi exigida na rodada 1 do [review026](reviews/026-review.md) e é parte do que está aceito. (3) **Retirada do pacote de contratos vazio sem declarar G-32 fechado.** `packages/contracts` inteiro (código, `package.json`, `tsconfig.json`, lockfile) sai do repositório, junto dos passos `build:contracts` e `test:contracts` do gate (`scripts/validate-core.mjs`, `scripts/build-all.sh`, `package.json` raiz). Isto é remoção de código morto por ausência de consumidor, não a entrega de contrato por operação que G-32 pede: os três parsers duplicados (frontend, client interno do BFF, rotas do Scheduling) continuam duplicados exatamente como estavam, e a linha G-32 em [GAP_ANALYSIS](GAP_ANALYSIS.md) é reescrita para dizer isso explicitamente, sem o marcar fechado. O resíduo de auth morto desde o Goal014 (`src/mocks/services/MockAuthService.ts`, `src/mocks/index.ts`, o branch `preview` de `AuthScreen.tsx`/`types.ts`, apontado como pendente pelo [review015](reviews/015-review.md)) sai na mesma varredura, por ser a mesma classe de código morto sem consumidor. (4) **Regra estática como forma de impedir o retorno.** `scripts/final-production-audit.mjs` ganha quatro checagens, cada uma com caso positivo e negativo em `scripts/tests/final-production-audit-legacy-regression.test.mjs`: nenhuma fonte sob `apps/` referencia `/v1/calendar/migrations` ou `/internal/calendar/migrations`; nenhuma fonte referencia `CalendarMigrationService` (arquivo, import, export, classe ou instanciação); nenhum arquivo sob `apps/scheduling-service/src/modules/integrations/minha-agenda` declara `MinhaAgendaCalendarProvider`, `implements CalendarProvider` **ou qualquer um dos dezesseis nomes de método de escrita, hold, disponibilidade e leitura operacional** (`createAppointment`, `updateAppointment`, `rescheduleAppointment`, `cancelAppointment`, `cancelWithComments`, `createCustomer`, `createHold`/`listHolds`/`getHold`/`releaseHold`, `getAvailability`, `getAppointment`, `appointmentExists`, `searchCustomers`, `listAppointments`, `getMigrationSnapshot`); e `apps/frontend/src/mocks` não existe. Regra que passaria com o legado de volta não conta: a primeira versão da terceira regra só olhava o nome antigo da classe e aprovava um `client.ts` com `createAppointment` de volta, e foi por isso reprovada na rodada 1 do [review026](reviews/026-review.md). Um retorno futuro de qualquer um desses quatro padrões falha `validate:core` em vez de passar despercebido por review.

**Alternativas:** manter as três rotas antigas e `CalendarMigrationService` como "documentação viva" do protocolo anterior (rejeitada: código sem consumidor e sem teste de comportamento novo só acumula risco de divergir do que a linha `MigrationJob` realmente significa, sem benefício — a classificação de U-02 já cumpre esse papel de auditoria); reescrever `MinhaAgendaCalendarProvider` do zero como leitor, em vez de remover os métodos de escrita da classe existente (rejeitada: reescrever sem necessidade arrisca divergir do comportamento de leitura já provado pelo Goal010, e o objetivo aqui é subtração, não redesenho); declarar G-32 fechado porque o pacote vazio saiu (rejeitada: fechar um gap de contrato por remover o que nunca foi o contrato seria a mesma dívida escondida que G-32 descreve, só que atrás de uma remoção em vez de um placeholder); adiar a remoção do resíduo de auth para um Goal futuro "que possa tocar auth" (rejeitada: este Goal já toca o mesmo tipo de código morto por ausência de consumidor, e adiar de novo repetiria o mesmo adiamento que o review015 já registrou); e regra estática só para o protocolo de migração, sem cobrir o writer remoto e os mocks de auth (rejeitada: os três são a mesma classe de risco — código morto que pode voltar por engano —, e uma regra por classe de risco é mais fácil de manter do que três regras dispersas em três PRs diferentes).

**Motivo:** o próprio nome do Goal — retirada do protocolo legado e do writer remoto — descreve uma subtração, e subtração sem prova automática de que não volta é a mesma classe de risco que uma regressão silenciosa: nada no runtime observaria a diferença até um consumidor futuro tropeçar numa rota que deveria estar morta. A escolha de preservar `MigrationJob` intocado, em vez de arquivá-lo ou apagá-lo, segue D-026 à risca — o dado histórico nunca foi o alvo da retirada, só o código que o produzia e as rotas que o expunham.

**Consequências:** `PUBLIC_API_V1.md` perde três rotas pela primeira vez nesta migração, o que muda o padrão de leitura do documento — até aqui, "o contrato só cresce ou reescopa" era verdade observável; deixa de ser. `packages/contracts` deixando de existir significa que uma futura tentativa de centralizar contrato por operação (G-32) começa do zero, sem base parcial para aproveitar — os doze índices placeholder não continham nada que valesse herdar. O gate fica mais rápido por um passo a menos, mas isso é efeito colateral, não motivo da decisão. `scripts/final-production-audit.mjs` ganha quatro invariantes permanentes que qualquer diff futuro precisa respeitar; um deles (`minha_agenda_origin_has_no_writer`) trava a origem Minha Agenda em "só leitura" no nível de nome de método, e não só da interface implementada — reintroduzir escrita ali exige tocar essa regra conscientemente, não por acidente. Duas consequências de escopo ficam registradas pelo aceite: `.github/workflows/validate.yml` deixa de instalar `packages/contracts`, sem o que o CI quebraria na instalação antes de chegar ao gate; e os skips declarados de `validate:core` caem de três para dois (`test:bff`, `test:health-worker`).

**Revisar se:** G-32 for retomado com contratos por operação reais — o desenho não deve reusar nenhum artefato de `packages/contracts`, que não existe mais; o produto precisar de fato de sincronização com o Minha Agenda além da importação única, o que reabriria a necessidade de um writer remoto e exigiria revisar as quatro regras estáticas deste D-042 antes de reintroduzir qualquer um dos quatro padrões que elas recusam; ou aparecer consumidor real de alguma das três rotas ou de `CalendarMigrationService` que esta análise não localizou — o review026 não encontrou nenhum, e um achado posterior reabriria a remoção do item (1).

## D-043 — Retirada da fonte externa da agenda: dado reescrito sob constraint, enum preservado por histórico de `MigrationJob`, contrato público reduzido, hold sem exceção silenciosa e regra estática por campo, aceita no Goal027

**Status:** ACCEPTED no [review027](reviews/027-review.md) (rodada 6 de 6, 2026-09-20). Cobre o diff das Work Units WU-01 a WU-07 do Goal027 sobre a baseline `c3255982a00c365831de979b46779ccc6ad8656b` (fechamento do Goal026), mais as correções das rodadas 2 a 6. Fecha a parte de vocabulário público que o [D-042](#d-042--retirada-do-protocolo-de-migração-legado-do-writer-remoto-e-do-pacote-de-contratos-vazio-com-regra-estática-contra-o-retorno-aceita-no-goal026)/G-10 deixou explicitamente aberta ("a parte de vocabulário público `EXTERNAL`/`source`/`target` segue aberta, sem Goal atribuído"). A regra estática do item (6), rodada contra a árvore real na rodada 1, encontrou três referências residuais fora do escopo das WU-01 a WU-06, registradas no item (6); a rodada 2 (FIX-001) corrigiu as três, e a rodada 3 estreitou o tipo de `SchedulingClient.configureCalendar` (item 6), o único resíduo que restava. Reusa e não altera D-026 (contratos de importação única e corte operacional do writer remoto, Goal010) e D-042 (retirada do protocolo legado e do writer remoto, Goal026): nenhuma linha de `MigrationJob` é tocada, e a classificação de legado (U-02) continua lendo essas linhas como histórico. Muda `apps/bff/PUBLIC_API_V1.md` de forma subtrativa pela segunda vez nesta migração — não a retirada de uma rota, mas a redução do domínio do campo `calendar.source`, que perde `EXTERNAL`. Com uma migration no Scheduling (`20260919120000_goal027_calendar_source_atendly`): reescreve `CalendarSettings.source` de `MINHA_AGENDA` para `ATENDLY` e trava a tabela com uma `CHECK`.

**Contexto:** desde o corte operacional do Goal010, um negócio com `CalendarSettings.source = MINHA_AGENDA` recebe `409` em toda escrita, toda oferta e toda leitura operacional da agenda — ele não tem uma agenda externa funcionando, tem um rótulo que só o impede de usar a própria, sem nenhum caminho de volta a `ATENDLY` no código (`PATCH /internal/calendar` recusava a mudança de fonte com `409 CALENDAR_MIGRATION_REQUIRED`; só o `importToAtendly` do protocolo antigo fazia essa transição, e o Goal026 apagou esse protocolo sem tocar no dado, tornando o limite explícito — ver [DATA_MIGRATION §5.6](DATA_MIGRATION.md#56-rollback-e-limites)). O mesmo rótulo vazava para o contrato público (`calendar.source: "EXTERNAL"`) e para código morto em três camadas: a IA engolia a falha de hold com um `null` silencioso para o caso "fonte sem hold", que depois deste Goal é um caso impossível de esconder atrás de um `null`; o Scheduling recusava histórico e ciclo de vida com um erro próprio (`EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED`) para uma fonte que não tem mais como existir; e o BFF mapeava `MINHA_AGENDA` para `EXTERNAL` em dois lugares (`onboarding-state.ts`, `calendar/routes.ts`) só para o consumidor ver um rótulo que o frontend já não oferece como opção.

**Decisão:**

1. **Reescrita declarada, com a constraint como trava, não como intenção.** A migration primeiro reescreve toda linha de `CalendarSettings` com `source <> 'ATENDLY'` para `ATENDLY` (`UPDATE ... WHERE`), avançando `updatedAt` só nas linhas de fato tocadas, e só depois acrescenta `CalendarSettings_source_atendly_check CHECK ("source" = 'ATENDLY')`. É a primeira migration deste repositório que reescreve dado existente em vez de só acrescentar estrutura, e por isso o ensaio (`scripts/goal027-calendar-source-migration-rehearsal.mjs`) não se contenta em provar que ela aplica: prova coluna a coluna o que muda (negócio já `ATENDLY` fica intocado, nem `updatedAt` se move; negócio `MINHA_AGENDA` só muda `source`/`updatedAt`; negócio sem linha continua sem), reporta a contagem de linhas reescritas em vez de deixar a reescrita silenciosa, e tenta de verdade — não só lê o SQL — um `UPDATE`/`INSERT` de volta para `MINHA_AGENDA` depois da migration, exigindo `23514` (violação de `CHECK`) do PostgreSQL real. A trava é o que impede o estado de existir de novo mesmo por escrita fora do serviço; a reescrita sozinha, sem ela, seria só descrever o presente sem impedir o retrocesso.
2. **O enum `CalendarSource` não é reduzido — preservação do valor por causa do histórico de `MigrationJob`.** `ATENDLY` e `MINHA_AGENDA` continuam os dois membros do tipo Postgres. A constraint nova é só na tabela `CalendarSettings`; `MigrationJob.source`/`MigrationJob.target` — histórico preservado por D-026 e reafirmado por D-042 — continuam gravando `MINHA_AGENDA` para descrever de onde para onde uma importação foi, e apagar o valor do enum reescreveria esse histórico ou exigiria um segundo tipo só para não tocá-lo. Nenhuma linha de `MigrationJob`, `MigrationJobItem`, `MigrationConflict`, `IntegrationConnection` ou `ImportSession` é tocada por esta migration.
3. **Redução do domínio do contrato público, sem remoção de campo.** `calendar.source`, em toda rota que o expõe (`GET`/`PATCH /v1/onboarding`, `GET /v1/calendar`, `GET`/`PATCH /v1/settings`, `GET /v1/dashboard`), passa a ser `"ATENDLY" | null` — `EXTERNAL` deixa de ser valor possível de leitura. Em `PATCH /v1/onboarding`, `calendar.source` continua aceito na escrita, mas o schema público (`sourceSchema`) passa de `z.enum(["ATENDLY", "EXTERNAL"])` para `z.enum(["ATENDLY"])`: qualquer outro valor é `400` antes de chegar ao Scheduling. O mapeador que convertia `MINHA_AGENDA` em `EXTERNAL` para o consumidor (`onboarding-state.ts`, `calendar/routes.ts`) sai junto — sem outro valor possível para mapear, ele não tinha mais o que fazer. `CALENDAR_INTEGRATION_NOT_CONNECTED` sai do vocabulário de `onboardingIssues`: `AVAILABILITY_REQUIRED` passa a valer para toda fonte escolhida, porque não existe mais fonte cuja disponibilidade dependa de uma integração conectada — o campo `calendar.source` continua existindo, só o que ele pode valer encolheu.
4. **Morte dos códigos de erro de fonte externa.** Cinco códigos saem do vocabulário do produto porque a condição que cada um recusava deixou de ser alcançável: `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED` (o `throw` da factory que nunca mais roda, porque ela só instancia `AtendlyCalendarProvider`), `EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED` e o método `requireAtendlySource` que o lançava em `calendar-service.ts` (ciclo de vida e histórico agora exigem só `CalendarSettings` existir — `404`, não `409`, e as mesmas rotas preservam o `404` de tenant sem calendário configurado), `EXTERNAL_CALENDAR_HOLD_UNSUPPORTED` (não há mais fonte sem hold para recusar), `EXTERNAL_CALENDAR_SERIES_UNSUPPORTED` (mesma razão, no caminho de série) e `CALENDAR_INTEGRATION_NOT_CONNECTED` (item 3). Um código morto que continua no vocabulário é uma recusa que ninguém aciona nem testa mais — deixá-lo seria a mesma dívida silenciosa que D-042 já recusou para o protocolo antigo.
5. **Hold na IA para de esconder falha atrás de um `null`.** Antes deste Goal, `holdProposedSlot` tratava duas falhas de forma oposta de propósito: fonte externa sem hold devolvia `null` e a proposta seguia sem reserva (comportamento correto **enquanto existia** uma fonte legitimamente sem hold); "o horário não está livre" propagava como erro real. Hoje toda agenda tem hold — não existe mais fonte sem essa capacidade —, então uma falha ao criar o hold é informação real sobre a agenda, da mesma classe de "horário ocupado", e esconder isso atrás de `null` seria mentir sobre o estado dela. `holdsUnsupported` e o `catch` que o chamava saem inteiros; a falha propaga pelo caminho normal de erro da tool, coberto por teste (WU-04, `assistant-tools.test.ts`).
6. **Regra estática que distingue fonte de agenda de origem de importação, com achado próprio.** `findCalendarSourceExternalComparisons` (`scripts/final-production-audit.mjs`) recusa qualquer comparação (`===`/`!==`/`==`/`!=`) entre `source`/`calendarSource` e `"EXTERNAL"`/`"MINHA_AGENDA"`, exigindo o operador colado ao nome do campo — o que a separa de `IntegrationProvider.MINHA_AGENDA` e `provider: "MINHA_AGENDA"` da importação única, que continuam legítimos e não acionam a regra. Somam-se duas outras: nenhum dos cinco códigos do item (4) aparece como string literal, e `requireAtendlyCalendar` não é referenciado (o guard que ele impunha nas telas de agenda por pessoa, [G-10 em CURRENT_STATE](CURRENT_STATE.md), saiu junto com a fonte que ele distinguia). Vinte casos positivo/negativo cobrem as três em `scripts/tests/final-production-audit-legacy-regression.test.mjs`. **Rodada contra a árvore real na rodada 1, a primeira regra encontrou três referências genuínas fora do escopo das WU-01 a WU-06:** `apps/frontend/src/features/settings/shared/labels.ts` (`sourceLabel` ainda ramificava em `"EXTERNAL"` para devolver "Minha Agenda" — ramo inalcançável desde que `calendarSourceSchema` virou `"ATENDLY"` único, Goal027/WU-05); `apps/scheduling-service/src/modules/internal-api/routes.ts` (`sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"])` ainda validava `MINHA_AGENDA` em `PATCH /internal/calendar`, e `/internal/customers`/`/internal/service-catalog` ainda ramificavam em `settings.source === "MINHA_AGENDA"`/`"ATENDLY"` — ramo que a `CHECK` do item (1) tornou inalcançável em runtime, mas que o código ainda declarava como possível); e `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` (o tipo do fixture de teste ainda declarava `calendarSource?: "ATENDLY" | "MINHA_AGENDA" | null`, sem nenhum caso que usasse o segundo valor). **A rodada 2 (FIX-001) corrigiu as três:** `sourceLabel` só reconhece `"ATENDLY"`, `sourceSchema` interno virou `z.enum(["ATENDLY"])` com os dois ramos mortos removidos, e o fixture de teste declara só `"ATENDLY" | null`. O único chamador vivo de `PATCH /internal/calendar` (`onboarding/routes.ts`, via `configureCalendar`) só consegue enviar `"ATENDLY"` desde o item 3 — por isso o resíduo era vocabulário morto reafirmado, nunca um caminho de escrita alcançável. A rodada 3 estreitou o tipo de `configureCalendar` no client do BFF, que hoje declara `{ source: "ATENDLY"; timezone: string }`, sem `MINHA_AGENDA`. `scripts/final-production-audit.mjs` roda hoje com 23 checagens: 22 passam (incluindo esta) e 1 é o skip declarado `production_health` — **`smoke:final-audit`/`validate:core` fecham limpos.**

**Alternativas:** reduzir o enum `CalendarSource` para um único valor `ATENDLY`, movendo `MINHA_AGENDA` para um tipo à parte só de `MigrationJob` (rejeitada: quebraria compatibilidade binária com toda leitura existente de `MigrationJob.source`/`target` sem nenhum ganho — a `CHECK` já impede o valor de voltar a `CalendarSettings`, que é o único lugar onde ele importava operacionalmente); deixar a falha de hold da IA devolver `null` silenciosamente por compatibilidade com o formato de resposta anterior (rejeitada: um `null` de hold hoje não descreve mais "fonte sem essa capacidade", descreve uma falha real, e apresentá-la como ausência normal esconderia o defeito do próprio agendamento); consertar os três resíduos que a regra nova encontrou dentro desta mesma Work Unit de documentação (rejeitada: WU-08 é documentação, não implementação — corrigi-los pertence às Work Units donas desses arquivos ou a uma rodada seguinte, e um achado de auditoria genuíno se documenta, não se esconde fechando a lacuna por fora do processo); declarar G-10 fechado porque o dado, os guards operacionais e o contrato público estão tratados (rejeitada: fechar um gap com uma regra estática própria ainda vermelha contra a árvore real repetiria o mesmo erro que D-042 recusou para G-32 — declarar fechado o que a própria prova automatizada diz que não está); não adicionar a terceira regra (`requireAtendlyCalendar`) por já não haver chamador nenhum (rejeitada: é exatamente um guard morto sem chamador — o mesmo padrão de risco que D-042 tratou para o protocolo antigo — que uma regra futura poderia reintroduzir sem ninguém notar).

**Motivo:** a retirada da fonte externa só é real se o dado, o contrato e o código pararem de admitir um estado que o produto não sustenta mais; reescrever sem travar seria a mesma dívida que D-026 já descrevia como resíduo, e travar sem preservar o histórico de `MigrationJob` reescreveria um registro que D-026/D-042 já decidiram manter. A regra estática nova é o mesmo tipo de proteção que D-042 aplicou ao protocolo antigo — impedir que o vocabulário retirado volte por acidente —, e ela mesma, ao ser exercitada contra a árvore real em vez de contra o diff isolado, cumpriu esse papel imediatamente: achou resíduo genuíno que nenhuma revisão manual tinha nomeado ainda.

**Consequências:** `CalendarSettings.source` nunca mais é lido como `MINHA_AGENDA` em produção — qualquer leitura futura que ainda espere esse valor está lendo um enum que a tabela não pode mais conter, embora o tipo Postgres ainda o declare. `PUBLIC_API_V1.md` registra a segunda remoção subtrativa desta migração (a primeira foi de rota, no Goal026; esta é de domínio de campo). A IA deixa de ter um caminho de "proposta sem hold" no código — qualquer regressão futura que precise reintroduzir uma fonte sem hold exigiria decisão de produto explícita, não um `catch` esquecido. `scripts/final-production-audit.mjs` ganha três invariantes permanentes; a que nasceu vermelha contra a árvore real na rodada 1 foi corrigida na rodada 2 (FIX-001) — `apps/frontend/src/features/settings/shared/labels.ts`, `apps/scheduling-service/src/modules/internal-api/routes.ts` e `apps/bff/tests/goal018-onboarding-complete.integration.test.ts` já não declaram `EXTERNAL`/`MINHA_AGENDA` como valor de `source`/`calendarSource`. Com o tipo de `SchedulingClient.configureCalendar` estreitado para `"ATENDLY"` na rodada 3, G-10 fecha por inteiro em [GAP_ANALYSIS](GAP_ANALYSIS.md).

**Revisar se:** o produto precisar de fato de uma segunda fonte de agenda operacional no futuro, o que reabriria a decisão de nunca reduzir `CalendarSource` e exigiria revisar as três regras estáticas deste D-043 antes de reintroduzir qualquer um dos padrões que elas recusam; ou `MigrationJob` for descontinuado como histórico (fora de qualquer escopo hoje), o que reabriria a necessidade de manter `MINHA_AGENDA` no enum.

## D-044 — Ensaio de release e de restore como passo de gate, configuração de produção conferida por regra estática com caso negativo, e flag de loop em produção como decisão escrita, aceita no Goal028

**Status:** ACCEPTED no [review028](reviews/028-review.md) (rodada 2 de 2, 2026-09-20). Cobre o diff028 sobre a baseline `977256ac7e592b9eac4cc9cf83a81c2888110fe2` (fechamento do Goal027), mais as correções da rodada 2. Os seis blockers da rodada 1 foram fechados e conferidos na árvore: o falso positivo da própria regra de segredo literal sobre `PASSWORD_RESET_PUBLIC_URL`, a imagem do CI sem pgvector, o campo `source` residual do `ShellConfig`, a documentação de §8 ausente, a exceção ao critério 4 não escrita e os gates não reexecutados sobre a árvore final. O reviewer não conseguiu reexecutar `validate:integration` na rodada 2 — o cluster descartável do Developer não existia mais — e aceitou o log nativo da execução, com saída real (migrations aplicadas, contagens por tabela e o `23514` no banco restaurado); está declarado no review. Avança **M5** na parte observável em máquina descartável e a exigência de "plano de restore seguro" de **M6** ([DATA_MIGRATION §11](DATA_MIGRATION.md#11-gates-de-rollout-e-remoção), [§15](DATA_MIGRATION.md#15-ensaio-de-release-restore-e-configuração-de-produção-goal028)); move a linha **G-33** em [GAP_ANALYSIS](GAP_ANALYSIS.md) na parte de ensaio de restore. Reusa e não altera D-043 (retirada da fonte externa da agenda, Goal027): a `CHECK` daquele Goal é justamente a prova negativa deste. **Nenhuma migration nova em nenhum serviço** e nenhuma migration existente editada, renomeada ou removida. **Não** toca contrato público, rota interna, escopo interno nem tela de produto fora do resíduo de `SystemScreen`.

**Contexto:** a migração acumulou dezoito ensaios de migration por Goal, e nenhum deles prova o que a primeira subida de produção faz. Cada ensaio aplica **uma** migration sobre um recorte de schema reconstruído à mão; `migrate:bff-test-database` roda `prisma migrate deploy` só no BFF. Ninguém tinha verificado que o histórico **completo** dos três serviços leva um banco vazio até o schema vigente, nem que o resultado desse histórico bate com o `schema.prisma` que o código usa. Do lado de configuração, `render.yaml` era texto que ninguém conferia: uma chave lida por `config/env.ts` e ausente do blueprint só apareceria como falha em runtime hospedado, e o valor de um flag de loop em produção era o default do schema, não uma decisão. E o "restore ensaiado" que M0 exige desde o Goal001 era plano escrito, nunca executado — a classe de defeito que ele existe para achar (constraint que não sobrevive ao dump) nunca tinha sido testada.

**Decisão:**

1. **O histórico completo aplica do zero, e o drift é erro de gate, não achado de review.** `rehearse:goal028-release-migrations` (`scripts/goal028-release-rehearsal.mjs`) cria um banco descartável **vazio** por serviço, aplica `prisma migrate deploy` do zero, exige que as linhas de `_prisma_migrations` com `finished_at IS NOT NULL` batam com o número de diretórios lido de `prisma/migrations` (não escrito à mão), exige nenhuma linha com `rolled_back_at`, exige que a segunda execução não aplique nada, e exige `prisma migrate diff` vazio entre o banco migrado e o `schema.prisma`. Rodado contra a árvore real, esse último item nasceu **vermelho** em dois serviços: 6 itens na IA e 25 no Scheduling — colunas `updatedAt` sem `@default(now())`, FKs sem `map:` explícito e a relação `Contact.channel` (`Contact_channel_fkey`), que existe no banco desde o Goal005 e não estava declarada. A correção foi editar `schema.prisma`, não criar migration: a divergência estava na **declaração**, o banco já estava certo, e uma migration "aditiva" aqui não teria conteúdo — emite zero SQL. O critério 4 do Goal previa a correção por migration nova; a forma entregue é a que o defeito real admitia, e fica declarada aqui em vez de escondida.
2. **Restore com integridade verificada, com prova negativa real.** `rehearse:goal028-restore` (`scripts/goal028-restore-rehearsal.mjs`) semeia um conjunto **mínimo e representativo** em cadeia nos bancos que o passo anterior deixou migrados, executa `pg_dump` em formato custom, restaura em banco novo e vazio e compara origem e destino em contagem de linhas por tabela, linhas de `_prisma_migrations`, existência dos índices e das constraints nomeadas e valores dos enums. A prova que dá sentido ao passo não é a comparação, é a negativa: um `UPDATE` que viole `CalendarSettings_source_atendly_check` no banco **restaurado** precisa falhar com `23514`. Constraint que não sobrevive ao restore é exatamente a classe de defeito que um plano de restore não executado esconde. Ausência de `pg_dump`/`pg_restore` no PATH é **recusa** com `exit 2` e mensagem própria, nunca skip.
3. **Configuração de produção é conferida por regra estática com caso negativo executável.** `scripts/final-production-audit.mjs` ganha cinco checagens, cada uma função pura: toda chave de `config/env.ts` está declarada em `render.yaml`, tem default seguro ou é derivada por HMAC (reconhecida **por nome**, com a justificativa em comentário); os cinco flags de loop têm valor explícito; nenhum `*_BASE_URL`, `FRONTEND_ORIGIN` ou `PASSWORD_RESET_PUBLIC_URL` resolve para host de desenvolvimento, `NODE_ENV`/`COOKIE_SECURE` têm valor de produção e nenhum segredo entra literal no arquivo; todo `rootDir` e todo `buildFilter.paths` existe na árvore; e `.env.example` e `config/env.ts` declaram o mesmo conjunto de chaves nos três serviços. Regra sem contraexemplo que ela reprova de verdade não conta — o review026 já rejeitou uma que devolvia `[]` contra o contraexemplo —, então cada uma tem caso negativo em `scripts/tests/goal028-production-config.test.mjs`. **Achado corrigido na árvore, não na regra:** a checagem de segredo literal reprovava `PASSWORD_RESET_PUBLIC_URL` porque o nome contém `PASSWORD`. A correção foi excluir chave de URL pública do teste de segredo — ela **precisa** de valor literal no blueprint, justamente para a checagem de host de desenvolvimento poder conferir o domínio de produção —, com os dois casos negativos correspondentes; o restante dos achados (chaves ausentes do blueprint, `NODE_ENV` faltando no BFF, flags implícitos) foi corrigido em `render.yaml` e nos `.env.example`.
4. **Flag de loop em produção é decisão escrita, nunca default.** Os cinco flags aparecem em `render.yaml` com valor explícito e o motivo ao lado: `RETENTION_SWEEP_ENABLED=false` e `ACCOUNT_PURGE_ENABLED=false` porque a purga é destrutiva e nenhuma rota, leitura ou tela depende do laço; `INBOX_WORKER_ENABLED=true`, `NOTIFICATION_DELIVERY_ENABLED=true` e `CALENDAR_AUTO_COMPLETE_ENABLED=true` porque são o próprio caminho de mensagem, de lembrete e de conclusão de atendimento, não varredura opcional. O que a regra proíbe não é um valor, é que ligado/desligado em produção seja efeito colateral do default do schema.
5. **Inventário de loops sem contratar nada — U-03 e M4 preservados.** [VALIDATION_GATE](VALIDATION_GATE.md) passa a trazer os cinco laços com arquivo, flag, default, intervalo, lote, lease e custo por ciclo em consultas, todos lidos do código, e diz explicitamente o que o inventário **não** prova: que os loops sustentam volume real, que um plano gratuito os mantém vivos e que o deploy hospedado funciona. **U-03 continua aberta e é decisão de pessoa**; nenhum provider foi trocado, nenhuma capacidade foi contratada e **M4 continua aberto**. Nenhum throughput foi medido e nenhuma carga foi simulada — de propósito, porque medir capacidade num ambiente que não é o de produção produziria um número que pareceria decisão sem ser.
6. **Requisito de infraestrutura descoberto pelo ensaio: pgvector no servidor.** `CREATE EXTENSION vector` está no histórico da IA desde `20260829180000_rag_pgvector`, e nenhuma migration instala extensão — a biblioteca precisa existir no servidor antes. O ensaio de release confere `pg_available_extensions` **antes de criar banco** e recusa com `exit 2`. O CI declarado usava `postgres:16-alpine`, que não a traz; `.github/workflows/validate.yml` passou a usar `pgvector/pgvector:pg16`. Isto é requisito de produção, não conveniência de teste: um PostgreSQL sem pgvector não recebe o serviço de IA.
7. **Resíduo de tela do Goal027.** O cenário `external-unavailable`, a rota `"agenda-indisponivel"` e a frase "Minha Agenda está indisponível" saem de `SystemScreen.tsx`; o `ShellConfig` perde o campo `source?: "atendly" | "external"` **inteiro** — nenhum componente escrevia outro valor além de `"atendly"` — e `AppShell` deixa de ramificar o rótulo de agenda oficial, que vira a constante `"Agenda Atendly"`. Os cenários sobreviventes (`offline`, `error`, `session-expired`) são provados por `apps/frontend/tests/goal028-system-scenarios.test.tsx`.

**Alternativas:** corrigir o drift por migration nova e aditiva, como o critério 4 do Goal previa (rejeitada: não havia nada para adicionar ao banco — a migration teria corpo vazio e registraria no histórico uma mudança que não existe; a divergência era do `schema.prisma`, e corrigi-lo é a única correção que descreve a verdade); relaxar a regra de segredo literal para que a árvore passasse (rejeitada explicitamente pelo próprio Goal: ajustar `render.yaml`/`.env.example` é esperado, afrouxar regra não — o que foi feito é distinto, a regra passou a distinguir chave de URL pública de chave de segredo, e ganhou dois casos negativos que provam a distinção); manter o campo `source` do `ShellConfig` com um único valor possível depois de remover o ramo `"external"` (rejeitada: prop declarada, comparada em `sameConfig` e nunca lida é resíduo com aparência de contrato); trocar a imagem do CI por um `postgres:16-alpine` com pgvector instalado em passo de `apt` (rejeitada: reinstalar a extensão a cada job é mais lento e mais frágil que usar a imagem oficial que já a traz, e esconderia o requisito em vez de declará-lo); e medir throughput dos loops para dar um número a U-03 (rejeitada: máquina descartável não prevê produção, e um número assim viraria decisão de capacidade por acidente — exatamente o que o Goal proíbe).

**Motivo:** um plano de restore que nunca foi executado não é um plano, é uma intenção; e um histórico de migrations que nunca aplicou do zero não é um histórico verificado, é uma sequência de diffs que por acaso passaram um por vez. As duas lacunas só aparecem na primeira subida de produção, que é o pior momento possível para descobri-las — e a primeira delas, o drift entre histórico e `schema.prisma`, de fato existia e foi encontrada na primeira execução. A mesma lógica vale para `render.yaml`: configuração que ninguém confere é configuração que falha em runtime hospedado, onde o custo de descobrir é maior.

**Consequências:** `validate:integration` passa de 29 para 31 passos e o CI precisa de uma imagem de PostgreSQL com pgvector — a mudança de imagem não é opcional, o job falharia por configuração sem ela. `validate:core` ganha cinco invariantes permanentes sobre `render.yaml` e `.env.example`: acrescentar chave em `config/env.ts` sem declará-la nos dois lugares passa a reprovar o gate, o que é atrito deliberado. O `schema.prisma` da IA e do Scheduling passa a declarar nomes de constraint explícitos; renomear FK nesses modelos agora exige tocar o `map:` conscientemente. E o gate passa a depender de `pg_dump`/`pg_restore` no PATH da máquina que o roda — sem eles, recusa com `exit 2` em vez de pular, que é o comportamento pretendido e também um pré-requisito novo de ambiente de desenvolvimento.

**Revisar se:** U-03 for resolvida por uma pessoa, o que transforma o inventário de loops em base de uma decisão de capacidade e pode mudar o valor dos cinco flags; M4 for exercitado contra a origem real, o que reabre a parte de M5 que este Goal declarou fora de alcance; alguma migration futura passar a exigir outra extensão de servidor, que o ensaio passa a cobrir sozinho por ler a exigência da árvore, mas que exige revisar a imagem do CI; ou o volume real de produção tornar o tempo de `pg_dump` relevante, o que pediria um ensaio de capacidade que este Goal declaradamente não fez.

## D-045 — Fuso único do negócio: dono, propagação fora da transação, reconciliação sem transação comum entre bases e contrato reduzido a uma entrada, aceita no Goal029

**Status:** ACCEPTED no [review029](reviews/029-review.md) (rodada 3 de 3, 2026-09-20). Cobre o diff029 sobre a baseline aceita `f1a8b7b818f6adea13621e897094c60f0ca6adf1` (fechamento do Goal028), mais as correções das rodadas 2 e 3. Os três blockers das duas primeiras rodadas foram fechados e conferidos na árvore: a ausência de prova permanente da reconciliação nas duas rotas de leitura, o fail-soft que transformava indisponibilidade do Scheduling em "agenda não configurada" na resposta pública (revertido — `502 UPSTREAM_ERROR` preservado) e a criação indevida de `CalendarSettings` numa leitura pura, corrigida na raiz pelo outcome `ABSENT` do item 5. Fecha **G-26** na parte de timezone entre `BusinessProfile` e `CalendarSettings`, resíduo aberto desde o Goal018; a cópia projetada para a IA não é terceira decisão e não foi tocada. Reusa e não altera D-002 (fronteiras físicas separadas entre bases), D-008 (o que merece laço), D-010 (reconciliação desired/effective em requisição), D-018, D-026, D-042 (`packages/contracts` não voltou) e D-043 (`source` continua `ATENDLY` e travado pela `CalendarSettings_source_atendly_check`). Muda `apps/bff/PUBLIC_API_V1.md` de forma subtrativa pela terceira vez nesta migração: redução do domínio de `calendar.timezone`/`availability.timezone`, que continuam existindo mas não decidem nada sozinhos. **Nenhuma migration nova em nenhum serviço**, nenhum `schema.prisma` alterado e nenhuma migration existente editada, renomeada ou removida. `validate:integration` passou de 31 para 32 passos, sem remover, renomear nem enfraquecer passo existente.

**Contexto:** [G-26](GAP_ANALYSIS.md) registrava `BusinessProfile.timezone` (BFF), `CalendarSettings.timezone` (Scheduling) e a cópia projetada para a IA como três lugares com o mesmo dado, sem reconciliação entre eles. Na prática, três entradas públicas distintas podiam gravar um fuso independente em `CalendarSettings`: `calendar.timezone` e `availability.timezone` em `PATCH /v1/onboarding`, e `timezone` em `PATCH /v1/settings/availability`. Nenhuma delas conferia contra `BusinessProfile.timezone`, e nada convergia a divergência depois de criada — duas bases sem transação comum, cada uma podendo decidir, é exatamente o estado em que uma leitura não sabe qual das duas é o fuso do negócio.

**Decisão:**

1. **Dono único.** `BusinessProfile.timezone` é o único decisor (`businessTimezoneOwner`, `apps/bff/src/lib/timezone-reconciliation.ts`). `CalendarSettings.timezone` é réplica derivada: continua sendo a base da matemática de data do Scheduling e continua sendo lida por quem já a lê, mas deixa de ser uma decisão própria.
2. **Propagação na escrita, fora da transação do BFF.** `PATCH /v1/settings/business` chama `reconcileBusinessTimezone` uma vez, depois de commitar sua própria transação, e só quando `timezone` de fato mudou nesta requisição — negócio sem mudança de fuso não paga chamada nova ao Scheduling. A chamada nunca lança: falha vira log de `WARN` e a resposta da escrita do dono continua `200`, porque o dado do dono já está gravado e comitado antes dela.
3. **Reconciliação nas duas leituras que expõem `calendar.timezone`.** `GET /v1/settings` e `GET /v1/calendar` tentam convergir antes de responder, sem laço de fundo e sem consulta nova ao Scheduling além da que a própria rota já fazia: no máximo uma tentativa por requisição, idempotente (tenant já convergido devolve `NOOP` sem escrita), nunca lança (o Scheduling recusando a **escrita de convergência** deixa a leitura responder `200` com o `timezone` que já tinha sido lido, sem afirmar convergência que não aconteceu) e honesta (`UNKNOWN` quando ainda não há dono gravado, `ABSENT` quando não há réplica). **A reconciliação converge réplica que existe; ela nunca cria `CalendarSettings`.** Negócio que nunca escolheu agenda não tem a linha, e criá-la numa leitura mudaria `calendar.source` de `null` para `ATENDLY` e todas as `capabilities` de agenda de `false` para `true` — uma rota de leitura ligaria a agenda de quem nunca a escolheu, e uma rota pública mudaria de resposta por efeito colateral. A reconciliação é efeito de favor sobre uma leitura que já existia, então ela não altera o que a leitura do próprio calendário sempre fez: Scheduling indisponível continua `502 UPSTREAM_ERROR`, e nenhuma das duas rotas passou a devolver um calendário vazio no lugar de uma leitura que falhou.
4. **Contrato público reduzido a confirmar/herdar.** As três entradas que antes aceitavam um fuso independente (`calendar.timezone`/`availability.timezone` em `PATCH /v1/onboarding`, `timezone` em `PATCH /v1/settings/availability`) passam a ter `timezone` opcional: ausente herda `business.timezone` já gravado (ou o que acabou de ser gravado na mesma requisição de onboarding); presente e divergente é recusado com `400`; sem `business.timezone` gravado nenhuma das duas resolve, também `400` — nenhuma seção vira dona do fuso por um caminho que não seja `business.timezone`.
5. **Nada de agenda é reescrito, e nada de agenda é criado.** O único efeito de escrita deste mecanismo, em qualquer caminho, é a atualização de `CalendarSettings.timezone` numa linha que já existia — nunca a criação da linha, em nenhum dos três pontos (a escrita do negócio e as duas leituras). Nenhuma linha de `Appointment`, `AvailabilityRule`, `AvailabilityException` ou `TimeBlock` é lida ou escrita por ele — provado por `scripts/goal029-timezone-reconciliation-rehearsal.mjs` (passo `rehearse:goal029-timezone-reconciliation` de `validate:integration`), que exerce `GET /v1/settings` e `GET /v1/calendar` no BFF real e lê as duas bases diretamente depois delas, nunca só a resposta HTTP.

**Alternativas:** transação distribuída/2PC entre BFF e Scheduling (rejeitada: nenhuma infraestrutura de transação comum existe entre as duas bases — D-002 preserva fronteiras físicas separadas —, e o padrão já estabelecido para o mesmo problema geral, D-010/`ai-activation.ts`, é reconciliação em requisição, não transação distribuída); Scheduling passando a consultar o BFF para obter o fuso, invertendo a direção (rejeitada: acopla disponibilidade de um serviço à do outro em toda leitura de agenda, sem necessidade — a direção continua sempre BFF → Scheduling); manter as três entradas aceitando fuso independente e resolver só por reconciliação de leitura, sem reduzir o contrato (rejeitada: não fecha a causa — três escritores continuariam podendo criar divergência nova a cada chamada; reduzir as entradas a confirmar/herdar é o que impede a divergência de nascer de novo); job de fundo dedicado à reconciliação periódica (rejeitada: a classe de trabalho que D-008 reserva para jobs é a que precisa sobreviver a um restart e não pode esperar a próxima leitura — lembrete, entrega, conclusão automática; convergência de fuso não tem essa urgência e não justifica um sexto laço competindo pelo mesmo orçamento de capacidade que U-03, ainda aberta em D-044, já deixa em aberto).

**Motivo:** duas bases sem transação comum não podem ter dois decisores — se as duas decidissem, a divergência seria estado válido e nenhuma leitura saberia qual das duas é o fuso do negócio. A mesma forma já resolvia o problema equivalente da ativação da IA (D-010): no máximo uma tentativa por requisição, idempotente, nunca lança, honesta sobre o que aconteceu.

**Consequências:** `GET /v1/settings` e `GET /v1/calendar` ganham, no máximo, uma chamada HTTP interna a mais (`PATCH configureCalendar`) só quando há divergência real; `PATCH /v1/settings/business` faz o mesmo, uma vez, depois de commitar sua própria transação. `apps/bff/PUBLIC_API_V1.md` registra a terceira redução de domínio do contrato público (depois das duas de D-042/D-043): `calendar.timezone`/`availability.timezone` continuam existindo, mas um valor lido fora de sincronia com `business.timezone` é estado transitório que converge na próxima leitura de uma das duas rotas, nunca mais uma configuração que um cliente grava de forma independente. `validate:integration` ganha o passo `rehearse:goal029-timezone-reconciliation`, que semeia divergência real em duas bases descartáveis próprias e prova a convergência por leitura direta das duas, nunca pela resposta HTTP. A cópia projetada para a IA (`AiTenantConfig.settings.businessContext.timezone`) não foi tocada: continua a seguir `BusinessProfile.timezone` pela mesma projeção versionada de `modalities`/`address` (Goal018/019).

**Revisar se:** o Scheduling passar a ter um consumidor próprio que precise decidir fuso sem depender do BFF, o que mudaria a direção da propagação; a reconciliação em requisição se mostrar insuficiente em volume real e exigir um job, o que mudaria o default de D-008/D-010 para este caso; ou o produto passar a expor fuso numa unidade menor que o negócio (por serviço, por profissional), o que exigiria revisitar "dono único" nesse nível.

## D-046 — Veredito de conformidade da auditoria final do MVP, limite do que ela prova e classificação fechada de pendência, proposta no Goal030

**Status:** ACCEPTED no [review030](reviews/030-review.md) (rodada 1 de 1, 2026-09-20, zero blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). O aceite é do **trabalho de auditoria** — ensaio de composição, testes de guard, reprodução declarada de achado e documentação —, nunca um aceite de conformidade do produto: o item 3 abaixo era o veredito vigente, com A-01 aberto e endereçado a Goal de correção próprio. **Superado no que diz respeito a A-01 pelo [D-047](#d-047--régua-de-alvo-de-toque-medindo-o-alvo-real-caixa-do-rótulo-associado-quando-o-controle-é-um-input-visualmente-escondido-e-correção-do-único-achado-que-era-defeito-de-produto-propostas-no-goal031) e por [FINAL_AUDIT §8](FINAL_AUDIT.md#8-fechamento-de-a-01--goal031-2026-09-20):** o Goal031 corrigiu a régua e o alvo, A-01 deixou de reproduzir, e a contagem passou de 1 para 0 `BLOQUEADOR-MVP`. Os itens 1, 2, 4 e 5 e o restante do texto continuam valendo como estão, e o registro original de A-01 não foi reescrito. Cobre a auditoria final do MVP sobre a baseline aceita `b64936a2e692605d523b5edf449e2b9d1a91e2d1` (fechamento do Goal029). Não fecha nem reabre nenhum gap de [GAP_ANALYSIS](GAP_ANALYSIS.md), nenhum gate de [DATA_MIGRATION §11](DATA_MIGRATION.md#11-gates-de-rollout-e-remoção) nem nenhuma decisão anterior — reusa e não altera D-002, D-006, D-008, D-010, D-018, D-026, D-042, D-043, D-044 e D-045. **Nenhuma migration, nenhuma rota, nenhum arquivo de `apps/*/src` e nenhum contrato público mudou neste diff**: o único código novo é o ensaio de composição (`scripts/goal030-mvp-journey-rehearsal.mjs`, passo `rehearse:goal030-mvp-journey`) e a reprodução declarada de um achado (`apps/bff/tests/goal030-a03-contract-drift.repro.mjs`).

**Contexto:** os Goals 1 a 29 fecharam domínio por domínio, cada um com prova própria contra fixture, banco descartável do próprio domínio ou dublê. Nenhum tinha percorrido um negócio único ponta a ponta contra os serviços próprios reais compostos, e nenhum documento consolidava, num só veredito, o estado de conformidade de todos os 35 gaps, dos sete gates de migração e das oito incertezas contra a árvore final — em vez de contra a documentação que a descreve, que foi exatamente onde o diff028 e o diff029 mostraram gate verde sobre fato falso.

**Decisão:**

1. **A auditoria é conferência da árvore, não do documento.** [FINAL_AUDIT](FINAL_AUDIT.md) inventaria G-01–G-35, M0–M6, U-01–U-03, cinco incertezas sem ID e os guardrails verificáveis de `AGENTS.md`, cada linha com estado em vocabulário fechado (`fechado`/`fechado em parte`/`aberto`/`não aplicável ao MVP`), evidência apontável (`arquivo:linha`, nome de teste ou nome de passo de gate — nunca outro documento de migração) e força (`EXECUTADO`/`INSPECIONADO`/`DECLARADO`, assimétrica de propósito: sem gate nomeável, a força é `INSPECIONADO`, nunca `EXECUTADO`).
2. **Achado é classificado em vocabulário fechado, e `BLOQUEADOR-MVP` sem reprodução executável é rebaixado com o motivo escrito.** Dezenove achados (A-01 a A-19): 1 `BLOQUEADOR-MVP` com reprodução executável (A-01), 11 `PENDENCIA-POS-MVP` — três deles (A-04, A-07, A-08) rebaixados de `BLOQUEADOR-MVP` por dependerem de ambiente ou origem externa que não existe nesta árvore, com o motivo escrito em cada achado — e 7 `LIMITE-DECLARADO` (limite conhecido e assumido, sem correção pendente). Nenhum achado é corrigido pela auditoria: correção pertence a Goal próprio.
3. **Veredito de conformidade.** O MVP tem 1 achado `BLOQUEADOR-MVP` (A-01: alvo de toque de 13×13 pixels no aceite legal do cadastro e no `/login` em mobile, herdado de uma exceção do diff014 sem prazo cumprido) e por isso **não está pronto para o primeiro usuário real enquanto A-01 não for corrigido em Goal próprio.**
4. **Limite do que esta auditoria prova.** Ela prova composição de fatias sobre serviços próprios reais e bancos descartáveis reais, e conformidade de código contra os 35 gaps e os guardrails verificáveis. Ela **não** prova deploy hospedado (M4/M5 continuam abertos na parte de operação real), fidelidade visual à referência aprovada (segue conferência humana, [FINAL_AUDIT §5.3](FINAL_AUDIT.md#53-o-que-o-gate-não-decide)), capacidade real da API Minha Agenda, envio real de WhatsApp nem volume/SLA/RPO/RTO de produção.
5. **Ferramental do diff029 corrigido dentro deste Goal.** `scripts/validate-integration.mjs` e seu teste, mais `scripts/goal029-timezone-reconciliation-rehearsal.mjs`, receberam correção de dívida de execução (`validate:integration` nunca tinha concluído com exit 0 medido) — sem mudar nenhuma asserção de produto do Goal029 nem reabrir [D-045](DECISIONS.md).

**Alternativas:** aceitar o estado das linhas de GAP_ANALYSIS como prova de conformidade sem reconferir a árvore (rejeitada: é exatamente a lacuna que o diff028 e o diff029 expuseram — gate verde documentado sobre fato que já tinha mudado); classificar todo achado sem reprodução como `LIMITE-DECLARADO` para simplificar o vocabulário (rejeitada: apagaria a diferença entre "limite assumido" e "pendência real rebaixada só por falta de ambiente", que é informação que o próximo planejamento precisa); e omitir o veredito de bloqueador até o achado ser corrigido, para não haver Goal com pendência aberta na auditoria (rejeitada: uma auditoria que esconde o próprio resultado desfavorável repete o erro que ela existe para achar).

**Motivo:** conformidade de produto não é lida de documento — é conferida contra código, teste e gate nomeáveis; quando não há o que nomear, isso é declarado, nunca disfarçado de prova.

**Consequências:** `validate:integration` ganha o 33º passo (`rehearse:goal030-mvp-journey`); nenhum passo existente foi removido, renomeado ou enfraquecido. A-01 vira pendência de escopo para um Goal de correção próprio, com reprodução executável já registrada; os 11 `PENDENCIA-POS-MVP` e os 7 `LIMITE-DECLARADO` ficam nomeados em FINAL_AUDIT para o planejamento seguinte decidir prioridade, sem que esta auditoria decida por ele.

**Revisar se:** A-01 for corrigido e a exceção nomeada de `KNOWN_SMALL_TARGETS` deixar de reproduzir; um ambiente hospedado passar a existir, o que reabriria a reprodução de A-04/A-07/A-08 como `BLOQUEADOR-MVP` caso o defeito ainda exista; ou o Tech Lead Agent, na inspeção deste diff, encontrar achado que esta rodada não nomeou.

## D-047 — Régua de alvo de toque medindo o alvo real (caixa do rótulo associado, quando o controle é um `<input>` visualmente escondido) e correção do único achado que era defeito de produto, propostas no Goal031

**Status:** ACCEPTED no [review031](reviews/031-review.md) (rodada 4 de 4, 2026-09-20), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff031 (WU-01 a WU-08) sobre a baseline aceita `d37e1fe5646131a1acbc3e95c585d402dfb80f33` (fechamento do Goal030), mais as correções das rodadas 2, 3 e 4; sem commit e sem deploy. Os oito blockers das três primeiras rodadas foram fechados e conferidos na árvore, todos da mesma classe — régua capaz de aprovar um controle real abaixo de 24px, ou documento enunciando regra mais ampla que a do código: a união da caixa do controle com a de qualquer `<label>` ancestral (que fazia o `<button>` do olho herdar a caixa do campo inteiro), a união de retângulos contra caixa degenerada `(0,0,0,0)` de `display: none` e contra `label[for]` distante, a mutação de controle negativo contra `.field-action` não executada e depois substituída sem declarar a troca, a história de mutações que contradizia o registro da rodada 1, e as passagens de documento — incluindo o título desta decisão — que ainda enunciavam a regra ampla. A régua final é `targetBox = labelBox ?? ownBox`, e o item 4 abaixo descreve a prova executada contra ela. É exatamente a condição de revisita que [D-046](#d-046--veredito-de-conformidade-da-auditoria-final-do-mvp-limite-do-que-ela-prova-e-classificação-fechada-de-pendência-proposta-no-goal030) tinha deixado escrita: "A-01 for corrigido e a exceção nomeada de `KNOWN_SMALL_TARGETS` deixar de reproduzir". Não fecha nem reabre nenhum gap de [GAP_ANALYSIS](GAP_ANALYSIS.md) além do que o item 4 abaixo descreve, nenhum gate de [DATA_MIGRATION](DATA_MIGRATION.md) e nenhuma decisão anterior — reusa e não altera D-018, D-030 (fundação visual e a exceção original do diff014) e D-046 (o veredito e a classificação de A-01 que este diff recontou, sem reescrever). **Nenhuma migration, nenhuma rota, nenhum contrato público e nenhum arquivo fora de `apps/frontend` mudou neste diff.**

**Contexto:** [FINAL_AUDIT](FINAL_AUDIT.md) e [D-046](DECISIONS.md) tinham registrado A-01 como `BLOQUEADOR-MVP` com reprodução executável — três controles abaixo de 24px em mobile, herdados de uma exceção do diff014 sem prazo cumprido. A régua que mediu esse achado tinha, ela própria, um defeito: media a caixa isolada do elemento nativo (`getBoundingClientRect()` do `<input>`), não o alvo que um dedo realmente toca quando o controle é um checkbox nativo envolvido por `<label>`. Corrigir o produto sem antes corrigir a régua arriscava tratar como defeito de produto algo que era defeito de medição, e deixar passar despercebida a próxima régua errada.

**Decisão:**

1. **A régua vem primeiro.** `apps/frontend/e2e/viewport-matrix.spec.ts` passou a medir, para um `<input>` visualmente escondido (`opacity: 0`, `visibility: hidden` ou `display: none`) com um `<label>` associado (`el.closest("label")` ou `label[for="id"]`), a caixa do próprio `<label>` — o alvo real que um dedo toca — em vez da caixa do `<input>`; nos demais controles a régua continua medindo a caixa própria do elemento, sem união das duas. Geometria pura, sem exceção por seletor, classe ou rota; e sem unir as duas caixas, porque um controle escondido por `display: none` reporta caixa degenerada `(0,0,0,0)`, e uma união por `Math.min`/`Math.max` contra ela esticaria a região medida da origem do viewport até o canto do rótulo, em vez de medir o rótulo. Uma rota cujo seletor não coleta nenhum controle agora falha (`measured.length` maior que zero), em vez de passar por "nada para medir".
2. **Produto corrigido só onde a régua nova confirma defeito real.** O link `Voltar para entrar` em `/link-expirado` dependia só da altura de linha do texto (115×18px); `AuthScreen.tsx` ganhou a classe `auth-link--standalone`, e `atendly.css` define `min-height: 24px` com `display: inline-flex` e `padding: 4px 2px`, sem alterar fonte nem cor.
3. **Os dois checkboxes não são achado de produto.** `remember` (`/login`) e `terms` (`/cadastro`) sempre foram `<input>` aninhado dentro de `<label className="check">` com o texto inteiro clicável — o alvo real sempre mediu mais que 24px. Nenhuma linha de produto mudou para eles; o que mudou foi só o que a régua enxerga.
4. **A régua ainda morde.** `KNOWN_SMALL_TARGETS` ficou vazia; a asserção "exceção que deixou de reproduzir falha" permanece no arquivo, e o comentário em `viewport-matrix.spec.ts:31`–`:54` registra três mutações de controle negativo aplicadas e revertidas nesta rodada, cada uma contra um seletor diferente: `.check` (`remember`/`terms`, vermelho nomeando o `<input>` a 350×16px pela caixa do rótulo associado nas duas rotas), `.auth-link--standalone` (`link-expirado`, vermelho nomeando o link a 115×16px) e `.field-action` (o botão de olho de `PasswordField`, vermelho nomeando o botão a 16×16px pela própria caixa, nunca pela união com um rótulo, porque é `<button>`, não `<input>` escondido) — cada uma rodada com `npm run build && npx playwright test -g "<rota>.*touch targets" --project=mobile-390` e revertida depois de confirmado o vermelho, provando que a régua nova ainda reprova um controle real abaixo de 24px. Com isso, [FINAL_AUDIT §8](FINAL_AUDIT.md#8-fechamento-de-a-01--goal031-2026-09-20) recontou o inventário: 0 achados `BLOQUEADOR-MVP` (era 1), 11 `PENDENCIA-POS-MVP` e 7 `LIMITE-DECLARADO` sem alteração — nenhum achado de A-02 a A-19 foi tocado por este diff.

**Alternativas:** corrigir só o CSS dos três controles sem tocar a régua (rejeitada: teria "corrigido" um problema de produto que dois dos três controles não tinham, e teria deixado o defeito de medição — caixa isolada do elemento nativo — livre para produzir o próximo falso positivo ou falso negativo); apagar `KNOWN_SMALL_TARGETS` e a asserção de exceção obsoleta já que a lista ficou vazia (rejeitada: o mecanismo é o que torna a próxima dívida nomeável, não um artefato do estado atual); e classificar A-01 como corrigido sem provar que a régua ainda falha para um controle real (rejeitada: sem essa prova, uma régua acomodada silenciosamente teria o mesmo efeito prático de apagar a exigência de 24px).

**Motivo:** um achado de acessibilidade só está corrigido quando a medida que o gerou é a medida certa; corrigir o produto contra uma régua errada resolve o sintoma que a régua relata, não o defeito que o usuário sente.

**Consequências:** A-01 deixa de ser `BLOQUEADOR-MVP` na auditoria (FINAL_AUDIT §8); o identificador não é renumerado nem reaproveitado, e o registro original de A-01 em FINAL_AUDIT §6 permanece como estava. `npm run validate:ui` continua com o mesmo número de testes e o mesmo escopo de rotas e larguras — nenhum passo foi criado, removido, renomeado ou enfraquecido. A-02 (nenhuma tela autenticada é medida pelo gate) continua aberto, sem Goal atribuído.

**Revisar se:** um controle real voltar a medir abaixo de 24px em rota pública, o que a régua nova deve reprovar sem exceção nomeada preexistente; ou o gate renderizado passar a alcançar tela autenticada (A-02, aberto), quando a régua encontrará padrões de controle que as sete rotas públicas não exercitam. A inspeção do Tech Lead ocorreu: [review031](reviews/031-review.md), rodada 4 de 4, com os resíduos declarados lá — `validate:core` rodou exit 0 sobre a árvore final sem ficar registrado em nenhum destes documentos, e `apps/frontend/tests/goal024-settings-shell-invariant.test.tsx` trocou `getByRole` por `await findByRole` (corrida com o skeleton `aria-busy` de `RetentionSection`) sem que a correção de produto tenha mudado o markup afirmado por esse teste.

## D-048 — Fronteira do OpenAI configurável por ambiente e prova de composição da resposta automática sem substituto interno, propostas no Goal032

**Status:** ACCEPTED no [review032](reviews/032-review.md) (rodada 1 de 1, 2026-09-20, zero blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff032 sobre a baseline aceita `dcc00466abf82cdfabadf14ead54648e2181d260` (fechamento do Goal031); sem commit e sem deploy. O aceite se apoia em execução própria do reviewer contra cluster descartável, não só na leitura do diff: ensaio exit 0 com as três contagens em 1 (evento `DONE` mais uma `Message` `OUTBOUND` com o texto do dublê daquela execução, um envio ao transporte com esse texto e o telefone do contato, linha `OUTBOUND` já existente quando o transporte foi chamado) e espera real de 1309 ms contra teto de 60000 ms; e os quatro elos quebrados um a um por `GOAL032_BREAK_LINK`, cada um com `exit 1` e mensagem própria. Três observações não bloqueantes ficaram registradas no review: `package.json` não mudou (nenhum ensaio anterior tem script próprio, e o passo roda pelo `validate:integration` existente), o item 1 abaixo descreve `createChatOpenAI()` como método quando é função exportada de módulo, e a prova positiva não exercita embeddings — essa fronteira fica coberta só pelo teste de unidade, que é o que o Goal exige. Não fecha nem reabre nenhum gap de [GAP_ANALYSIS](GAP_ANALYSIS.md) além da evidência de composição registrada em G-09, G-21 e do passo novo em G-33, nenhum gate de [DATA_MIGRATION](DATA_MIGRATION.md#11-gates-de-rollout-e-remoção) e nenhuma decisão anterior — reusa e não altera D-046 e D-047. **Nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/`, `package.json` e `docs/migration/` mudou neste diff**; nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova e nenhum contrato público.

**Contexto:** o percurso do Goal030 provou a composição de 29 fatias do produto contra serviços próprios reais, mas declarou no próprio cabeçalho do ensaio (`scripts/goal030-mvp-journey-rehearsal.mjs:81`) que a resposta automática da IA ficava fora — o provedor de modelo ali é um dublê que lança se chamado. `CURRENT_STATE`, delta030, registrou isso como FATO revelado: recebimento durável e persistência na conversa estavam provados; a mensagem que o cliente receberia, nunca. A v52 do MASTER_PLAN deixou essa lacuna para o planejamento seguinte decidir, e a v53 abriu o Goal032 para fechá-la.

**Decisão:**

1. **A fronteira do OpenAI passa a ser configurável por ambiente, como a do WhatsApp já era.** `LangChainModelProvider.createChatOpenAI()` (`apps/ai-orchestrator/src/modules/model/model-provider.ts:57`–`:66`) e `OpenAIEmbeddingProvider` (`apps/ai-orchestrator/src/modules/knowledge/embedding-provider.ts:12`–`:18`) passam `configuration: { baseURL: env.OPENAI_BASE_URL }` ao `ChatOpenAI` e ao `OpenAIEmbeddings`, do mesmo jeito que `openai-transcription-provider.ts:41` já fazia. O default não muda (`https://api.openai.com/v1`), nenhuma variável de ambiente nova foi criada, e `requireOpenAiEnv()`/`requireEmbeddingEnv()` continuam exigindo exatamente o que exigiam. `apps/ai-orchestrator/tests/model/openai-base-url.test.ts` afirma a base efetiva dos dois provedores, no default e redirecionada — nunca só "não lançou". É a única costura que este diff introduz em `apps/*/src`: nenhum parâmetro novo em `buildInboundMessageProcessor`, nenhuma injeção na fábrica de produção, nenhum ramo condicional por variável de ensaio.
2. **A prova da resposta automática exige o caminho de produção inteiro, sem substituto interno.** `scripts/goal032-auto-reply-rehearsal.mjs` sobe o orquestrador de IA real, com `INBOX_WORKER_ENABLED` ligado, contra um banco PostgreSQL descartável próprio, e entrega a mensagem por `POST /webhooks/evolution` real. O `InboundEventDispatcher` roda **sem** `buildProcessor` injetado, então quem processa é `buildInboundMessageProcessor` de produção — grafo, assistente, sessão, memória e ferramentas reais. Os dois únicos dublês são as duas fronteiras **externas**, redirecionadas por `OPENAI_BASE_URL`/`EVOLUTION_BASE_URL` para servidores HTTP em `127.0.0.1`, cujo endereço efetivo é conferido depois do `listen`. As janelas que adiam o trabalho (`AI_DEBOUNCE_*`, `AI_AMBIGUOUS_*`, `INBOX_POLL_INTERVAL_MS`) são encurtadas por ambiente; não há claim manual nem relógio falso — quem reivindica o evento é o worker real, e a espera tem teto declarado (`WORKER_WAIT_TIMEOUT_MS`).
3. **A prova é por leitura do banco e pelo que o transporte recebeu, nunca pelo `200` da resposta.** O ensaio confere, contra o `ProcessedEvent` e a `Message` do banco do dono, e contra as chamadas recebidas pelo dublê de transporte, que a linha `OUTBOUND` já existia quando o transporte foi chamado (a ordem do G-09), com o mesmo texto que o dublê de modelo devolveu naquela execução.
4. **Controle negativo por elo, não por asserção relaxada.** `GOAL032_BREAK_LINK` derruba o ensaio com `exit 1` e mensagem própria quando um dos quatro elos obrigatórios deixa de acontecer — `human-control`, `ignore-ai`, `idempotency`, `supersede` (`BREAKABLE_LINKS` em `scripts/goal032-auto-reply-rehearsal.mjs`). Quebrar um elo é sempre pular uma etapa do percurso, nunca relaxar uma asserção nem tocar código de produção.
5. **Guards do ensaio com teste permanente.** A recusa de destino não descartável (`resolveRehearsalPlan`) e o registro dos quatro elos (`BREAKABLE_LINKS`) têm suíte própria em `scripts/tests/goal032-auto-reply-rehearsal.test.mjs`, rodada por `npm run test:gate` — fechando, para este ensaio, o resíduo de ferramental que o [review029](reviews/029-review.md) declarou e o Goal030 herdou. O ensaio é o novo último passo de `validate:integration` (`rehearse:goal032-auto-reply`), depois de `rehearse:goal030-mvp-journey`; nenhum passo, suíte ou limiar existente foi removido, renomeado, pulado ou condicionado.
6. **O que este diff não fecha.** **M4** — envio real a número real — continua aberto como gate operacional: nenhuma chamada saiu, neste diff, para um provedor de LLM real nem para o WhatsApp real, e nenhum documento afirma o contrário. O laço de ferramentas contra o Scheduling real, áudio, mídia e grupo continuam declaradamente fora do ensaio (`SCHEDULING_SERVICE_BASE_URL` aponta para loopback onde nada escuta).

**Alternativas:** injetar o `ModelProvider` na fábrica de produção só para o ensaio (rejeitada: criaria costura de teste dentro de `apps/*/src` além da fronteira de ambiente, e o próprio Goal a proíbe — provaria o ensaio, não o caminho de produção); manter texto fixo de resposta comparado consigo mesmo (rejeitada: não provaria que o texto atravessou o grafo real vindo do dublê); e afirmar M4 fechado por analogia com a fronteira do WhatsApp já redirecionável (rejeitada: `EVOLUTION_BASE_URL` sempre foi configurável e nunca proveu envio real a número real — as duas coisas são independentes).

**Motivo:** a promessa central do produto — a mensagem que chega pelo WhatsApp é respondida automaticamente pela IA — só está provada quando o caminho de produção inteiro roda sem substituto interno; fabricar a prova com um atalho interno repetiria, com aparência de prova, o mesmo limite que o Goal030 já tinha declarado.

**Consequências:** `validate:integration` ganha o 34º passo (`rehearse:goal032-auto-reply`). `OPENAI_BASE_URL` passa a valer para modelo e embeddings, além da transcrição, em produção e não só em ensaio. G-09 e G-21 ganham evidência de composição sem reabrir o que já estava fechado; G-33 registra o passo novo.

**Revisar se:** M4 (envio real a número real) for endereçado por um Goal de operação; o laço de ferramentas contra Scheduling real, áudio, mídia ou grupo entrar em escopo de prova; ou o Tech Lead Agent, na inspeção deste diff, encontrar achado que esta rodada não nomeou.

## D-049 — Gate renderizado alcança as telas autenticadas com sessão real, régua compartilhada e o passo mora em `validate:integration`, propostas no Goal033

**Status:** ACCEPTED no [review033](reviews/033-review.md) (rodada 3 de 3, 2026-09-20), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff033 (WU-01 a WU-06) sobre a baseline aceita `dbea66416e8025a75cedf51a60a7cc921ac45fd0` (fechamento do Goal032); sem commit e sem deploy. Duas rodadas de `CHANGES_REQUIRED` precederam o aceite (4 e 1 blockers), todas sobre precisão documental e sobre duas medidas que tinham sobrado duplicadas — nenhuma sobre a sessão, a régua ou a prova de rota. Três desvios ficaram aceitos e registrados no review: a mudança de harness fora do escopo de arquivos declarado no Goal (item abaixo, no mesmo parágrafo), `/agenda` em `desktop-1440` `flaky` com retry (34 `expected`, 1 `flaky`, 0 `unexpected`), e o controle negativo de login quebrado executado com o config temporariamente reduzido a `mobile-360` e `retries: 0`, por causa do throttle real de login. Fecha **A-02** ([FINAL_AUDIT §10](FINAL_AUDIT.md#10-fechamento-de-a-02--goal033-2026-09-20)) — o achado que a auditoria do Goal030 tinha nomeado e que [D-046](#d-046--veredito-de-conformidade-da-auditoria-final-do-mvp-limite-do-que-ela-prova-e-classificação-fechada-de-pendência-proposta-no-goal030) e [D-047](#d-047--régua-de-alvo-de-toque-medindo-o-alvo-real-caixa-do-rótulo-associado-quando-o-controle-é-um-input-visualmente-escondido-e-correção-do-único-achado-que-era-defeito-de-produto-propostas-no-goal031) tinham deixado aberto, sem Goal atribuído. Não fecha nem reabre nenhum outro gap de [GAP_ANALYSIS](GAP_ANALYSIS.md) além da evidência nova em G-31 e G-33, nenhum outro gate de [DATA_MIGRATION](DATA_MIGRATION.md) e nenhuma decisão anterior — reusa e não altera D-018, D-046, D-047 e D-048. **Nenhuma migration, nenhuma rota e nenhum contrato público mudou neste diff.** Fora de `apps/frontend/`, `scripts/` e `docs/migration/`, o único arquivo tocado é o próprio harness do IA Loop — `tools/ia-loop/lib/deterministic-executor.mjs` (`patternRelativeToScope`, para o filtro de teste escopado não duplicar o prefixo do diretório e devolver "No test files found" em vez de rodar a suíte pedida) e seu teste em `tools/ia-loop/tests/deterministic-executor.test.mjs`; nenhum app em `apps/*/src` fora do frontend mudou.

**Contexto:** o gate renderizado do Goal031 media sete rotas públicas, porque nunca teve uma sessão real para medir com — uma sessão fabricada provaria layout contra dado que nenhum usuário vê, e o próprio comentário de `routes.ts` já dizia isso desde antes deste Goal. Tudo o que o produto é feito de — a Agenda em 360px, a Inbox, Clientes, Serviços, Configurações, Início, Notificações — nunca tinha sido medido por nada com layout. O Goal032 provou, por execução, a peça que faltava para levar essa régua adiante: os três serviços próprios sobem em processo contra bancos descartáveis e o produto responde por HTTP real.

**Decisão:**

1. **Uma régua só, extraída para um módulo, nunca uma segunda régua.** `apps/frontend/e2e/measure.ts` recebe a medição que vivia dentro de `viewport-matrix.spec.ts` — os mesmos limiares (`TOUCH_TARGET_AA` 24px, `TOUCH_TARGET_COMFORTABLE` 44px, `OVERFLOW_TOLERANCE` 1px), a mesma regra de rótulo associado (`targetBox = labelBox ?? ownBox`, nunca uma união de caixas) e a mesma asserção de exceção obsoleta — consumida pelos dois specs. O comportamento do gate público não muda: mesmas sete rotas, mesmo resultado.
2. **A sessão é real, e o gate prova que é.** `scripts/goal033-authenticated-ui-rehearsal.mjs` sobe o BFF, o Scheduling e a IA reais em três bancos PostgreSQL descartáveis **próprios**, semeia um negócio inteiramente pelas rotas do produto — sem `INSERT` direto nenhum, inclusive a mensagem entrante da conversa, que é entrada externa e entra pelo caminho durável real do webhook —, constrói o frontend com `NEXT_PUBLIC_BFF_URL` já embutida (a variável é lida no `next build`, e por isso a porta do BFF precisa estar decidida antes dele) e o serve em porta fixa própria. `apps/frontend/e2e/authenticated-matrix.spec.ts` recebe só um e-mail e uma senha e os digita em `/login` — nenhum `addCookies`, nenhum `storageState` escrito à mão, nenhuma chamada à rota de sessão para montar contexto de browser. A sessão é digitada uma vez por worker e reusada entre os testes dele, porque o login do produto tem limite de dez tentativas por IP a cada quinze minutos e o ensaio mede 35 vezes (sete rotas, cinco larguras) — logar a cada medição bateria no limite. Antes de medir, cada teste prova que a URL final é a rota pedida (não `/login` nem `/onboarding`, os destinos para onde `ProductRuntime` redireciona uma sessão que não é a certa), que o destino ativo do shell está marcado, que o negócio semeado aparece na tela e que o conteúdo real — não o esqueleto — carregou.
3. **O passo mora em `validate:integration`, nunca em `validate:ui`.** `rehearse:goal033-authenticated-ui` é o 35º e último passo de `validate:integration`, depois de `rehearse:goal032-auto-reply` — nenhuma entrada `rehearse:*` nova em `package.json`, seguindo o padrão que o [review032](reviews/032-review.md) já tinha confirmado vigente. `validate:ui` **não muda**: continua as mesmas sete rotas públicas, as mesmas cinco larguras, `npm run start` e nenhuma pré-condição de banco. Amarrar o gate público a PostgreSQL transformaria o único gate renderizado que roda sem pré-condição em mais um passo que falha por ambiente — isso enfraqueceria o gate, não o fortaleceria. A sessão real só existe do lado que já paga o custo de banco.
4. **Regra assimétrica entre o que a régua reprova.** Overflow horizontal não tem linha de base: é defeito de produto e é corrigido. Alvo de toque e contraste são corrigidos quando a correção cabe no controle (tamanho, `padding`, token de cor já existente aplicado errado); só viram linha de base nomeada — e, por regra, também achado a partir de A-20 — quando corrigir exigiria decidir composição visual nova, que é conferência humana. Neste diff as duas telas que a régua reprovou (`/agenda` em `mobile-360`, `<h1>Agenda</h1>` comprimido a uma caixa 0×33px porque `grid-template-columns: minmax(0, 1fr) auto` dava a largura inteira à coluna de ações; `/notificacoes` em mobile, checkbox nativo de 13×13px) couberam na correção do controle — `apps/frontend/src/shared/styles/atendly-agenda.css` e `apps/frontend/src/shared/styles/atendly.css`. `KNOWN_SMALL_TARGETS` e `KNOWN_CONTRAST_FAILURES` do spec autenticado ficam vazios, e por isso **nenhum achado novo abre a partir de A-20** — a regra não obriga achado onde não há linha de base.
5. **Controle negativo por medida, não por asserção relaxada.** No padrão dos Goals 031 e 032: overflow forçado, alvo de toque real encolhido abaixo de 24px, par de cores reprovado e login quebrado por credencial errada — cada um derruba o gate ou o ensaio com falha nomeada, cada um revertido depois de confirmada a falha, nenhum sobrou na árvore final.

**Alternativas:** medir a tela autenticada com sessão fabricada (`addCookies`/`storageState` escrito à mão) — rejeitada: proveria layout contra uma sessão que nenhum usuário real produz, exatamente o que o comentário original de `routes.ts` recusava; criar um limiar próprio, mais frouxo, para a tela autenticada — rejeitada: o Goal031 defendeu a régua atual em três rodadas de recusa, e uma segunda régua mais frouxa devolveria a dívida que aquele Goal fechou; amarrar `validate:ui` à pré-condição de banco para poder medir a sessão ali — rejeitada: o único gate renderizado sem pré-condição passaria a falhar por ambiente, o que é enfraquecer gate; e nomear as duas telas reprovadas como linha de base em vez de corrigi-las — rejeitada: as duas correções cabiam no controle, e nomear dívida evitável como linha de base seria dívida escondida, blocker de review pelo próprio texto do Goal.

**Motivo:** o gate renderizado só prova o que o produto realmente mostra quando mede a tela que o usuário vê — e a maioria do produto só existe atrás de login; medir sete rotas públicas para sempre deixaria a Agenda, a Inbox, Clientes, Serviços, Configurações e Notificações sem nenhuma prova de overflow, alvo de toque, contraste, foco ou movimento reduzido.

**Consequências:** `validate:integration` ganha o 35º passo (`rehearse:goal033-authenticated-ui`). `apps/frontend/e2e/measure.ts` passa a ser a única implementação da régua, consumida pelos dois specs. G-31 ganha a evidência de que a fundação visual foi exercitada em sessão real nas sete telas autenticadas; G-33 registra o passo novo. FINAL_AUDIT §10 recontou o veredito: A-02 sai de `PENDENCIA-POS-MVP`, passando a auditoria a 0 `BLOQUEADOR-MVP`, 10 `PENDENCIA-POS-MVP` (era 11) e 7 `LIMITE-DECLARADO`, sem tocar A-03 a A-19.

**Revisar se:** um controle real de tela autenticada voltar a medir abaixo de 24px ou reprovar contraste sem exceção nomeada preexistente; `/importacao`, `/sistema` ou `/onboarding` ganharem layout fixo que permita medi-los pela mesma régua; ou fidelidade visual à referência aprovada (`docs/design-reference/claude-design/`) entrar em escopo de prova automatizada — o que este diff não faz e não afirma fazer.

## D-050 — Guardrail absoluto sustentado por invariante, código e prompt separados, e a recusa de grupo restrita à resposta da IA, propostas no Goal034

**Status:** ACCEPTED no [review034](reviews/034-review.md) (rodada 3 de 3, 2026-09-20), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff034 (WU-01 a WU-09) sobre a baseline aceita `090ee2897835142b59c979ddb24d4372c2f4398e` (fechamento do Goal033), mais as correções das rodadas 2 e 3; sem commit e sem deploy. Duas rodadas de `CHANGES_REQUIRED` precederam o aceite (2 e 3 blockers), todas da mesma classe que o Goal declara inegociável — invariante ou prova afirmada além do que existia: o check `group_discard_is_not_configuration` lia só arquivos-fonte de `apps/` enquanto quatro textos (o `details` do próprio check, VALIDATION_GATE, esta decisão e a fixture do teste de regressão) afirmavam cobertura sobre qualquer arquivo de `apps/**`; e o controle negativo de pilha real foi substituído por um proxy mais fraco — remoção do registro em `BREAKABLE_LINKS` em vez de `GOAL032_BREAK_LINK=group` —, deixando o ramo quebrado de `exerciseGroupLink` sem execução, com FINAL_AUDIT §11 afirmando o contrário. O escopo do check foi alargado (`configurationFiles("apps")` somado a `appsSources`, com teste de integração que roda o script real contra um `.env.example` mutado), e o controle negativo foi executado pelo próprio reviewer contra o cluster descartável, nos dois sentidos, na rodada 3. Uma observação não bloqueante ficou registrada no review: o teste de fechamento de `PRODUCT_OWN_TEXTS` varre literais dentro de `messages: [...]` de `assistant.service.ts`, então um texto novo emitido por `text:` ou por `return "..."` escaparia do fechamento — escopo declarado na documentação, aperto deixado para Goal futuro. Fecha **A-09**, **A-10** e **A-18** ([FINAL_AUDIT §11](FINAL_AUDIT.md#11-fechamento-de-a-09-a-10-e-a-18--goal034-2026-09-20)) — os três achados que a auditoria do Goal030 tinha nomeado como guardrail de `AGENTS.md` sustentado por default de ambiente, ausência na árvore ou nada. Não fecha nem reabre nenhum outro achado, nenhum gate de [DATA_MIGRATION](DATA_MIGRATION.md) além do elo novo em [§20](DATA_MIGRATION.md#20-elo-de-controle-de-grupo-no-ensaio-da-resposta-automática-goal034), e nenhuma decisão anterior — reusa e não altera D-018, D-046 a D-049. **Nenhuma migration, nenhuma rota e nenhum contrato público mudou neste diff**; nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/` e `docs/migration/` foi tocado.

**Contexto:** três guardrails de `AGENTS.md` — "grupos não são atendidos pela IA", "a IA não anuncia que está consultando" e "MVP em tema claro" — eram verdadeiros na árvore do Goal030 sem que nada os sustentasse como invariante: o descarte de grupo dependia de uma variável de ambiente com default seguro, a regra de espera não existia em prompt nem em teste, e o tema claro era ausência de código, não regra. Nenhum dos três ficava vermelho quando violado.

**Decisão:**

1. **Guardrail absoluto vira invariante de código, nunca configuração.** `EVOLUTION_IGNORE_GROUPS` deixou de existir — não virou uma constante `true` escondida, porque isso ainda dependeria de alguém não trocá-la de volta sem que nada reclamasse. `InboundMessageProcessor.ts` descarta grupo incondicionalmente, `message-graph.ts` recusa despachar a resposta da IA para destino de grupo como segunda camada, e `audit:static` (`group_discard_is_not_configuration`) reprova tanto o literal da variável antiga quanto qualquer `if` novo que volte a condicionar o descarte a `env`/`config` sob outro nome. As três camadas — entrada, saída, gate estático — mais o elo novo do ensaio do Goal032 são o que torna a invariante verificável, não só verdadeira hoje.
2. **O que o código garante e o que o prompt orienta são coisas diferentes, e o limite fica escrito.** `PRODUCT_OWN_TEXTS` é o conjunto fechado e testado dos textos que o **produto** emite por conta própria, sem passar pelo modelo — aqui a garantia é de código, absoluta, e o teste reprova vocabulário de espera nesse conjunto fechado. A fala do **modelo** é orientada pela regra nova de `MAIN_RULES` (`PROMPT_TEMPLATE_VERSION` v6), e a eval nova prova só o que o runtime controla: o turno de tool não emite mensagem própria. O cabeçalho da eval e esta decisão dizem, por escrito, que aderência do modelo real ao prompt não é demonstrável com um dublê roteirizado — misturar as duas garantias sob o mesmo nome fabricaria uma prova de A-09 que este Goal se recusa a fazer.
3. **A recusa de destino de grupo vale só para a resposta da IA.** `GroupDispatchRefusedError` em `message-graph.ts` intercepta apenas o caminho que despacha a decisão do assistente (`provider.sendText` chamado por esse módulo); envio humano (`internal/routes.ts`), lembrete (`NotificationDeliveryService`) e teste de ativação (`ActivationTestReplySender`, `PlatformWhatsAppSender`) não foram tocados e continuam livres para usar o WhatsApp do profissional como ele quiser. O guardrail de `AGENTS.md` proíbe a **IA** de atender grupo — não proíbe o profissional de usar o próprio número em grupo.

**Alternativas:** trocar `EVOLUTION_IGNORE_GROUPS` por uma constante `true` no mesmo lugar — rejeitada: nada ficaria vermelho se alguém reintroduzisse a leitura de `env`, que é exatamente o achado original; provar A-09 com uma eval em que o dublê nunca diz "aguarde" porque o roteiro não permite — rejeitada: isso proveria que o teste escolheu bem a fala do dublê, não que o modelo real obedece à regra; estender a recusa de grupo do `message-graph.ts` para todo `sendText`, inclusive envio humano — rejeitada: o guardrail de `AGENTS.md` é sobre a IA, e ampliá-lo bloquearia o profissional de responder no próprio grupo de WhatsApp, uma restrição que o produto nunca prometeu.

**Motivo:** os três achados eram da mesma classe — "verdade hoje, sem nada que fique vermelho amanhã" — e a correção de cada um segue o mesmo critério usado nos Goals 031, 032 e 033: não afirmar invariante que não existe, e separar prova real de prova fabricada.

**Consequências:** `apps/ai-orchestrator/src/config/env.ts`, `.env.example` e `docker-compose.yml` perdem uma chave; `audit:static` ganha dois checks nomeados (`group_discard_is_not_configuration`, `frontend_has_no_dark_theme_css`); `scripts/goal032-auto-reply-rehearsal.mjs` ganha um quinto elo de controle sem novo passo em `validate:integration`; `MAIN_RULES` e `PROMPT_TEMPLATE_VERSION` mudam de `v5` para `v6`; FINAL_AUDIT §11 reconta o veredito: 0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP` (era 10) e 6 `LIMITE-DECLARADO` (era 7), sem tocar A-03 a A-08, A-11 a A-17 ou A-19.

**Revisar se:** uma avaliação com o modelo real (fora do determinístico) vier a medir aderência real à regra 16 de `MAIN_RULES`; alguém propuser estender a recusa de grupo do despacho da IA para outro caminho de envio; ou tema escuro entrar em escopo de produto, o que exigiria decisão própria antes de tocar `frontend_has_no_dark_theme_css`.

## D-051 — Contrato público como artefato único versionado com o código, validação de resposta como gate e não escudo de runtime, e lista de rotas sem contrato computada, propostas no Goal035

**Status:** ACCEPTED no [review035](reviews/035-review.md) (rodada 2 de 2, 2026-09-20), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff035 (WU-01 a WU-19) sobre a baseline aceita `f1fb6203d11270053c8e702d155b98ff7915e7bc` (fechamento do Goal034), mais as correções da rodada 2; sem commit e sem deploy. Uma rodada de `CHANGES_REQUIRED` precedeu o aceite (4 blockers), e o núcleo arquitetural desta decisão — os três itens abaixo — não foi tocado por nenhuma correção: os blockers eram o caminho de instalação (o pacote não era construído em checkout limpo, porque `dist/` não é versionado e nada o construía no deploy — resolvido pelo `prepare` do pacote, verificado por reprodução própria do reviewer em fixture isolada), uma afirmação de FINAL_AUDIT §12 que negava os achados A-20 a A-23 que o próprio relatório declarava, a contagem da tabela escrita como 119 (ocorrências do texto `pathPattern:`) em vez de 116 (entradas reais), e os dois `package-lock.json` regenerados do zero, com churn transitivo que o Goal não autorizava — restaurados da baseline para `+10 −6` cada. Duas observações não bloqueantes ficaram registradas no review: rota registrada por template literal é invisível aos dois lados da regra de cobertura (hoje sem lacuna, as três dessa forma têm entrada e chamador), e `GET /v1/conversations/:id/messages/:messageId/media` é a única rota sem chamador que tem entrada, com `z.unknown()`, ignorada pelo hook por não ser payload de texto. Fecha **A-03** ([FINAL_AUDIT §12](FINAL_AUDIT.md#12-fechamento-de-a-03--goal035-2026-09-20)) — o achado que a auditoria do Goal030 tinha nomeado (G-32) e que nenhum Goal anterior tocava. Não fecha nem reabre nenhum outro achado, nenhuma decisão anterior — reusa e não altera D-018, D-042, D-046 a D-050. **Nenhuma migration, nenhuma rota e nenhum contrato público mudou de forma incompatível neste diff**; nenhum arquivo de `apps/scheduling-service/`, `apps/ai-orchestrator/`, `apps/evolution-go/` ou `apps/health-worker/` foi tocado, e nenhuma tela, componente, texto ou CSS do frontend mudou.

**Contexto:** o corpo que o BFF devolve era palpite do consumidor. O frontend declarava 106 formatos de resposta em `apps/frontend/src/data/mappers/publicApiSchemas.ts`, ninguém fora de `apps/frontend` lia essas declarações, `packages/` tinha só `legal-contract` desde que `packages/contracts` saiu vazio no diff026 (D-042), e nenhuma das 115 rotas do BFF validava a própria resposta. A fronteira oposta já era guardada — o BFF valida com Zod o que recebe do ai-orchestrator. Era a fronteira pública, a que o usuário vê, que estava sem guarda: uma divergência entre o que o BFF passasse a devolver e o que a tela esperasse só apareceria como tela quebrada, nunca como teste vermelho.

**Decisão:**

1. **O contrato é um artefato único, versionado com o código, nunca schema paralelo.** `packages/public-api-contract` nasce no padrão de dependência `file:` de `packages/legal-contract`, mas com build próprio (`tsc`) emitindo `dist/*.js` e `dist/*.d.ts`, porque 1377 linhas de Zod não cabem no padrão sem build daquele pacote. Os 106 schemas foram **movidos**, não reescritos — conferidos contra `git show HEAD:apps/frontend/src/data/mappers/publicApiSchemas.ts` — e o arquivo antigo do frontend virou reexport de uma linha. Zod entra como `peerDependency`, nunca como dependência própria do pacote: duas cópias de Zod na árvore seria o mesmo defeito de fronteira mole que este Goal fecha, só que dentro do gerenciador de pacotes em vez de na resposta HTTP.
2. **A validação de resposta é gate de drift, nunca escudo de runtime.** `apps/bff/src/lib/response-contract.ts` registra um hook único de `onSend` que compara o `data` já serializado contra a entrada da rota e derruba o processo com um erro nomeado quando os dois lados discordam. Ela liga fora de `NODE_ENV=production` e fica desligada onde o produto responde de verdade. A alternativa — deixá-la ligada sempre — transformaria toda divergência de contrato em `500` para quem está comprando: trocaria um bug descoberto cedo, em teste, por uma indisponibilidade descoberta tarde, em produção. Isso inverteria o objetivo do achado, que é mover a descoberta de "tela quebrada para o usuário" para "suíte vermelha para quem desenvolve" — não trocar um jeito de quebrar por outro.
3. **A lista de rotas sem contrato é computada, nunca mantida à mão.** `public_api_route_coverage`, novo em `audit:static`, lê as rotas `/v1` que o BFF registra, os chamadores que os `Bff*Service.ts` declaram e a tabela do pacote, e imprime no próprio `details` o conjunto de rotas sem chamador — hoje uma só, `GET /v1/conversations/:id/messages/:messageId/media`. Uma lista escrita à mão envelheceria em silêncio, exatamente como o Goal declarava proibido: a próxima rota sem chamador que ganhar um em `apps/frontend` só precisa aparecer numa tabela nova; nada precisa lembrar de atualizar uma exceção em texto.

**Alternativas:** manter o schema no frontend e o BFF confiando nele por convenção — rejeitada: é o estado que produziu o achado, sem nada que fique vermelho quando o BFF mudar de resposta; publicar o pacote com Zod como dependência própria — rejeitada: duas cópias de Zod resolvidas por dois apps é o tipo de fronteira mole que este Goal existe para fechar; ligar a verificação de resposta em produção para "ter certeza de verdade" — rejeitada, e o próprio Goal a proíbe: trocaria bug de contrato por indisponibilidade real; manter uma lista de rotas sem contrato escrita à mão, atualizada por revisão humana — rejeitada: é o mesmo padrão de dívida silenciosa que o Goal034 recusou para o descarte de grupo (D-050), só que aplicado a rota em vez de configuração.

**Motivo:** a fronteira pública — a que o usuário realmente vê quando algo quebra — era a única sem guarda simétrica à fronteira já guardada do lado do ai-orchestrator. Fechar isso exigia um artefato que os dois lados lessem, não um schema a mais para mais um lado confiar.

**Consequências:** `packages/public-api-contract/` novo, dependência `file:` de `apps/bff/package.json` e `apps/frontend/package.json`, refletida nos dois `package-lock.json`. Os dois apps declaram `install-links=true` (`apps/bff/.npmrc`, `apps/frontend/.npmrc`): o npm copia o pacote para `node_modules` em vez de criar symlink, que é o que mantém uma só cópia de Zod por app — um symlink resolveria `zod` a partir de `packages/public-api-contract/node_modules`. Como `dist/` não é versionado, quem o constrói na instalação é o `prepare` do pacote (`npm ci --ignore-scripts && npm run build`), executado pelo npm ao copiar o diretório: `npm ci && npm run build`, o `buildCommand` de `render.yaml`, funciona em checkout limpo sem passo novo de deploy. `validate:core` ganha `build:public-api-contract` (`node scripts/build-public-api-contract.mjs`, que constrói o pacote e atualiza a cópia congelada em `apps/*/node_modules`, antes de `build:bff` e `build:frontend`) e `repro:a03-contract-drift` (depois de `audit:static`). `audit:static` ganha `public_api_route_coverage` e `public_api_response_schema_single_source`. `apps/bff/tests/goal030-a03-contract-drift.repro.mjs` sai `exit 0` na árvore final. FINAL_AUDIT §12 reconta o veredito: 0 `BLOQUEADOR-MVP`, 11 `PENDENCIA-POS-MVP` (era 8: menos A-03, mais os achados novos A-20 a A-23, quatro divergências reais entre o que o BFF devolve e o que a tela declarava, nenhuma corrigível sem mudar contrato público ou afrouxar schema movido) e 6 `LIMITE-DECLARADO` (inalterado), sem tocar A-04 a A-19.

**Revisar se:** alguma rota `/v1` nova ganhar chamador no frontend sem passar pela tabela do pacote (o gate estático já cobre, mas a revisão humana continua relevante na origem); a verificação de resposta vier a ser cogitada para produção — o que exigiria decisão própria sobre o custo de trocar drift silencioso por indisponibilidade; ou `packages/public-api-contract` vier a precisar de um segundo consumidor além de BFF e frontend, o que poderia mudar o formato de build ou de export.

## D-052 — Rigidez do contrato mora no produtor, campo declarado é opcional quando o produtor pode omiti-lo, e rota `/v1` exige path literal, propostas no Goal036

**Status:** proposta, no diff036 (WU-01 a WU-06) sobre a baseline aceita `3202cb0b30f2e59c9d69e7a86b4940853c97d922` (fechamento do Goal035); sem commit e sem deploy. Fecha **A-20 a A-23** ([FINAL_AUDIT §13](FINAL_AUDIT.md#13-fechamento-de-a-20-a-a-23--goal036-2026-09-20)) — as quatro divergências reais entre o que o BFF devolvia e o que o contrato declarava, que a verificação de resposta do Goal035 tinha encontrado ([FINAL_AUDIT §12](FINAL_AUDIT.md#12-fechamento-de-a-03--goal035-2026-09-20)) e nenhum Goal anterior corrigia. Não fecha nem reabre nenhum outro achado, nenhuma decisão anterior — reusa e não altera D-018, D-046 a D-051.

**Contexto:** o Goal035 tinha fechado a fronteira pública num só sentido: campo faltando, tipo errado e valor fora do vocabulário derrubavam a suíte; campo a mais, não — `z.object` remove chave não declarada em vez de recusá-la, e o controle negativo daquela rodada com um campo extra passou verde. Ligar essa verificação estrita expôs quatro casos reais em que o BFF devolvia algo que o produto sempre quis devolver e o contrato, mais atrasado, ainda não declarava (`ai.reconciled`, `businessProfile.modalities`/`address`, sete campos de serviço no onboarding) e um caso em que a exclusão idempotente devolvia um corpo (`{ deleted: false }`) que o schema movido nunca tinha admitido. Separado disso, a mesma rodada de gate estrito também expôs que três rotas registradas num `for` sobre uma lista de nomes de ação, com path construído por template literal, eram invisíveis para `public_api_route_coverage` — a rota existia e funcionava, mas nem o check de cobertura nem uma leitura futura do texto-fonte a enxergariam se o contrato dela sumisse da tabela.

**Decisão:**

1. **A rigidez do contrato mora no produtor, nunca no consumidor.** Quando a verificação de resposta acusa campo a mais, a correção-padrão é declarar o campo no contrato, não fazer o BFF parar de emiti-lo — o produtor já está certo em relação ao produto, e é o contrato, artefato compartilhado, que está atrasado. A exceção é quando o campo é ruído genuíno (nenhum caso deste diff foi essa exceção): os quatro achados fechados aqui são todos contrato desatualizado, nunca produtor com defeito.
2. **Campo declarado é opcional quando o produtor pode legitimamente omiti-lo.** `businessProfileSchema.modalities`/`address` e os sete campos de serviço em `onboardingStateSchema` entraram como `.optional()` (ou `.nullish().optional()`), nunca obrigatórios: uma resposta anterior a este Goal, ou uma chamada legítima que não populou o campo, continua decodificando sem quebrar. Tornar obrigatório um campo que o produtor pode não enviar trocaria o defeito que este Goal fecha (campo real reprovado por ausência no contrato) por outro do mesmo tipo, só que na direção contrária.
3. **Rota `/v1` exige path literal, do lado do BFF.** `bff_v1_routes_use_literal_paths`, novo em `audit:static`, falha se `app.<verbo>` for chamado com um path `/v1/...` entre crases. `apps/bff/src/modules/conversations/routes.ts` desenrolou o `for` de três ações em três registros literais para satisfazer a regra, sem mudar path, verbo, `preHandler` nem resposta de nenhuma delas. A alternativa — ensinar a extração a entender template literal — foi rejeitada: interpretar `${action}` exigiria resolver o valor de uma variável em tempo de leitura estática, o que generaliza mal para o próximo caso e ainda erraria silenciosamente se a lista de ações mudasse; proibir a forma que escapa da extração é regra que não erra.
4. **A exclusão idempotente ganha o próprio schema, não um afrouxamento do existente.** `deletedIdempotentSchema` (`z.object({ deleted: z.boolean() })`) substitui `deletedSchema` só na entrada `DELETE /v1/customers/:id/primary-guardian`; `deletedSchema` (`z.literal(true)`) continua em toda outra rota de exclusão. Afrouxar `deletedSchema` globalmente esconderia, nas outras rotas, o bug real que `{ deleted: false }` representa nelas.

**Alternativas:** afrouxar a verificação de resposta para tolerar campo a mais — rejeitada, é exatamente o afrouxamento que fecharia o achado sem corrigir a causa e reabriria a mesma cegueira que o Goal035 já tinha declarado como limite conhecido; fazer os handlers do BFF pararem de emitir os quatro campos em vez de declará-los no contrato — rejeitada nos quatro casos, porque o produto já depende de cada um deles em algum lugar (a tela de status distingue reconciliação, `/v1/onboarding` e `/v1/settings` já declaram `modalities`/`address`, o onboarding precisa de `needsReview` para o mesmo aviso que a tela de Serviços já mostra); tornar `modalities`/`address`/os sete campos de serviço obrigatórios no contrato em vez de opcionais — rejeitada, quebraria decodificação de resposta legítima que ainda não os popula; ensinar a extração estática a resolver template literal — rejeitada no item 3, acima.

**Motivo:** o Goal035 tinha fechado a fronteira pública num só sentido; o outro sentido (campo a mais) e um caso de extração cega (rota em laço) continuavam podendo esconder drift real sem nenhum teste ficar vermelho. Fechar isso exigia decidir, para cada achado real que a verificação estrita revelasse, se o produtor ou o contrato estava errado — nunca afrouxar a verificação para fazer o achado desaparecer.

**Consequências:** `apps/bff/src/lib/response-contract.ts` compara agora as duas direções (o que falta e o que sobra), com o mesmo erro nomeado, teto e mensagem de antes — nenhum canal de saída novo. `packages/public-api-contract/src/schemas.ts` ganha `aiReconciledValueSchema`, `deletedIdempotentSchema`, `modalities`/`address` em `businessProfileSchema` e sete campos no `service` inline de `onboardingStateSchema`; `packages/public-api-contract/src/routes.ts` troca `deletedSchema` por `deletedIdempotentSchema` só na entrada afetada. `apps/frontend/src/data/services/BffCustomerService.ts` tipa o resultado da chamada com o novo schema. `apps/bff/src/modules/conversations/routes.ts` registra três rotas literais em vez de um `for`. `audit:static` ganha `bff_v1_routes_use_literal_paths`. A tabela do pacote permanece com 116 entradas. FINAL_AUDIT §13 reconta o veredito: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` (era 11: menos A-20 a A-23) e 6 `LIMITE-DECLARADO` (inalterado), sem tocar A-04 a A-19 nem reabrir A-01, A-02, A-03, A-09, A-10 e A-18. Fica registrado, sem virar achado, que o check novo só cobre o lado do BFF: o lado do frontend (`FRONTEND_ROUTE_SCHEMA_CALL_PATTERN`) também exige path literal, e as mesmas três rotas passaram a aparecer como "sem chamador" no `details` de `public_api_route_coverage` mesmo tendo chamador de fato — hoje sem lacuna real, porque a tabela já tinha as três entradas.

**Revisar se:** uma rota `/v1` nova precisar de path dinâmico por razão legítima — a regra hoje proíbe a forma sem exceção, e um caso real exigiria decisão própria sobre como estendê-la sem reabrir a cegueira; a extração de chamador do lado do frontend vier a ser estendida para reconhecer template literal, o que fecharia o limite declarado acima; ou a verificação de resposta vier a ser cogitada para produção — decisão que D-051 já deixou como própria, inalterada por este Goal.

## D-053 — Regra de path literal `/v1` vale nos dois lados do contrato, conjunto de textos de cliente do produto é um só em vez de um por módulo, e retentativa do gate é declarada, não reprovada, propostas no Goal037

**Status:** proposta, no diff037 (WU-01 a WU-07) sobre a baseline aceita `5829cc4db0bcac995678bc6b1092f1e9dbf14c5a` (fechamento do Goal036); sem commit e sem deploy. Fecha o limite declarado que [FINAL_AUDIT §13](FINAL_AUDIT.md#13-fechamento-de-a-20-a-a-23--goal036-2026-09-20) e [D-052](DECISIONS.md#d-052--rigidez-do-contrato-mora-no-produtor-campo-declarado-é-opcional-quando-o-produtor-pode-omiti-lo-e-rota-v1-exige-path-literal-propostas-no-goal036) tinham registrado sem virar achado — nenhum achado foi fechado, corrigido ou reaberto por este diff. Não altera nenhuma decisão anterior — reusa e não altera D-018, D-046 a D-052.

**Contexto:** o Goal036 tinha corrigido a rota `/v1` registrada em laço só do lado do BFF; o mesmo padrão — path montado por template literal em vez de literal entre aspas — continuava do lado do frontend em `BffConversationService.ts`, e `FINAL_AUDIT §13` já tinha registrado isso como o mesmo tipo de limite de ferramenta que a rota de mídia sem chamador (§12): sem lacuna real hoje, porque a tabela já tinha as três entradas e o chamador de fato existia, mas invisível a uma leitura estática futura. Separado disso, o teste que fecha o conjunto de textos que o produto emite por conta própria (D-050) cobria só `assistant.service.ts` — uma observação não bloqueante do review034 já avisava que um texto de cliente emitido por outro módulo escaparia em silêncio, e `message-graph.ts` emitia seis desses textos sem nenhum teste de fechamento os enxergar. E o gate autenticado (Goal033) já tinha registrado um `flaky` — atribuído a `/agenda`, `desktop-1440` por leitura manual do relatório, já que nenhum extrator existia ainda para nomear rota e projeto — classificado como "timing de execução" sem investigação da causa, com a retentativa em si invisível dentro do `exit 0` do processo.

**Decisão:**

1. **A exigência de path `/v1` literal vale nas duas pontas do contrato, pela mesma razão.** `frontend_v1_route_schema_calls_use_literal_patterns`, novo em `audit:static`, falha se `routeSchema<T>("MÉTODO", ...)` de `apps/frontend/src/data/services` declarar um padrão `/v1/...` entre crases — o mesmo tipo de regra que `bff_v1_routes_use_literal_paths` (Goal036) já aplicava do lado do BFF, pela mesma razão: extração estática que resolve variável em tempo de leitura generaliza mal e erra em silêncio se a lista de ações mudar. `BffConversationService.ts` troca o `mutateState` que montava o path por três chamadas `routeSchema` com path literal, uma por ação, sem mudar verbo, path nem schema de resposta de nenhuma delas.
2. **O conjunto de textos que o produto emite por conta própria é um só, não um por módulo.** `PRODUCT_OWN_TEXTS` passa a somar os textos de `assistant.service.ts` aos seis que `message-graph.ts` despacha por `text:` sem passar pelo modelo, e o teste de fechamento ganha um segundo extrator para a forma de despacho desse módulo — sem substituir o extrator existente. A alternativa — um conjunto fechado por arquivo, cada um com seu próprio teste — foi rejeitada: multiplicaria o mesmo teste por módulo emissor, e um texto de cliente novo, em um terceiro módulo, continuaria precisando de decisão própria sobre onde entrar; um conjunto e um teste, ampliados por extrator, é a mesma garantia que D-050 já tinha decidido, extensível sem reescrever a garantia em si.
3. **Retentativa é declarada, nunca reprovada, e identifica a rota de verdade.** `extractRetriedTests` lê o relatório JSON que o Playwright já escreve e nomeia todo teste `flaky` no log do ensaio — sempre, inclusive zero. As 35 medidas de `authenticated-matrix.spec.ts` compartilham o mesmo título de teste (`"measured, logged in"`, um por `test.describe(route.name, ...)`); `extractRetriedTests` inclui a cadeia de `suites` ancestrais no título retornado, então duas retentativas do mesmo título em rotas diferentes continuam distinguíveis, em vez de colapsarem no mesmo registro. O processo continua saindo `0` quando toda retentativa passa na segunda tentativa: tornar flaky visível não é o mesmo que fazer flaky reprovar, e fazer flaky reprovar trocaria o problema que este item resolve (retentativa invisível) por outro — gate instável por um throttle que o próprio produto define, não por defeito do que o gate mede.
4. **A causa do `flaky` conhecido é medida, não presumida — e não é atribuída à rota.** A investigação correlaciona o `flaky` já registrado (§10, Goal033, atribuído lá a `/agenda`/`desktop-1440` por leitura manual, não pelo extrator desta rodada) ao teto de `@fastify/rate-limit` do BFF (`max: 300` por minuto, por IP): as 35 medidas do gate autenticado chegam a 95%–98% desse orçamento, e cruzá-lo produz `429` em vez de `401`/dado esperado, que a interface trata como erro de sessão ou de tela. Qual das 35 medidas cruza o teto depende de quando ela cai na janela de 60s, não da rota que mede — por isso o gate passa a ler o orçamento restante do próprio cabeçalho de resposta (`x-ratelimit-remaining`/`x-ratelimit-reset`) e espera a janela virar antes de **qualquer** teste que começaria perto do teto, não só de `/agenda` — sem afrouxar asserção, sem pular medida e sem tocar o limite do produto.

**Alternativas:** ensinar a extração estática a resolver template literal, dos dois lados — rejeitada, pela mesma razão que D-052 já tinha rejeitado do lado do BFF: generaliza mal e erra em silêncio; manter um conjunto de textos fechado por módulo emissor — rejeitada no item 2, acima; fazer o gate reprovar quando algum teste retenta — rejeitada: transformaria um throttle real do produto, sob carga que o próprio gate produz, em falha do gate, sem que o produto tenha regredido; relaxar o teto de `@fastify/rate-limit` para o gate nunca cruzá-lo — rejeitada: o teto é regra de produto, e o gate mede o produto como ele é, não uma versão facilitada dele; aumentar o tempo limite de espera do nome do cliente em vez de investigar a causa — rejeitada: teria escondido o sintoma sem entender por que ele aparecia, e não preveniria o mesmo throttle se o gate crescer.

**Motivo:** os três pontos eram a mesma classe de lacuna que Goals anteriores já tinham fechado do outro lado — regra estática de um lado só, garantia de código com escopo estreito demais, sinal real descartado como ruído sem medição —, e fechar cada um seguiu o critério que os Goals 034 a 036 já usavam: não inventar prova que não existe, e não afrouxar verificação para fazer o sintoma desaparecer.

**Consequências:** `audit:static` ganha `frontend_v1_route_schema_calls_use_literal_patterns`; as três rotas de `conversations` deixam de aparecer como "sem chamador no frontend" no `details` de `public_api_route_coverage`. `PRODUCT_OWN_TEXTS` ganha seis textos, exportados por `message-graph.ts`; `VOCABULARIO_DE_ESPERA` vira definição única em `apps/ai-orchestrator/tests/support/vocabulario-de-espera.ts`. `scripts/goal033-authenticated-ui-rehearsal.mjs` ganha `readGateReport`/`extractRetriedTests` e a leitura de orçamento de rate limit em `authenticated-matrix.spec.ts`; nenhum teto de `retries` do Playwright mudou. FINAL_AUDIT §14 recontado: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado em relação a §13, sem tocar A-04 a A-19 nem reabrir A-01, A-02, A-03, A-09, A-10, A-18 ou A-20 a A-23. Este diff não fecha **M4**, não afirma fidelidade visual à referência aprovada e não liga a verificação de resposta em produção.

**Revisar se:** um texto de cliente novo passar a ser emitido por um terceiro módulo, fora de `assistant.service.ts` e `message-graph.ts`, numa forma de despacho que o extrator atual não reconhece — o que reabriria o mesmo limite que o review034 já tinha avisado; o teto de `@fastify/rate-limit` mudar de valor — o que exigiria reconferir a margem de 30 requisições que `RATE_LIMIT_TEST_BUDGET` assume; ou o gate autenticado ganhar testes suficientes para que esperar a janela de rate limit passe a dominar o tempo total do ensaio, o que exigiria decisão própria sobre paralelizar por IP em vez de esperar.

## D-054 — Reconhecimento por forma exige resíduo declarado, categoria de descarte é enumerada em vez de inferida, e relatório de outra execução reprova enquanto `flaky` não reprova, propostas no Goal038

**Status:** proposta, no diff038 (WU-01 a WU-06, com os seis controles negativos revertidos, mais FIX-001 das rodadas 2 e 3 — a última mudança de árvore é o suporte ao handler de rota passado por referência) sobre a baseline aceita `e90200403467e2860da3db22705d49df6e3822d9` (fechamento do Goal037); sem commit e sem deploy. Não fecha nem reabre nenhum achado — A-04 a A-08, A-11 a A-17 e A-19 não são tocados, e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) é reaberto. Não altera nenhuma decisão anterior — reusa e não altera D-018, D-046 a D-053.

**Contexto:** o [review037](reviews/037-review.md) e a conferência desta rodada sobre a baseline aceita mostraram que os três lugares que o diff037 tinha fechado eram instâncias de uma classe só, e que a classe continuava aberta: todo extrator deste repositório reconhece por forma textual, e nenhum declarava o que deixava de reconhecer. Quatro fatos confirmados sobre a baseline: `extractMessagesArrayLiterals` devolvia **zero** literais sobre `assistant.service.ts` real, porque os seis sítios `messages: [...]` do arquivo usam `PRODUCT_OWN_FIXED_TEXTS.<chave>` e `buildStyleGreeting(...)`, não literal entre aspas — o teste de fechamento ficava verde por não ver nada, sem o piso `toBeGreaterThan(0)` que o teste irmão já tinha; `FRONTEND_ROUTE_SCHEMA_CALL_PATTERN`/`FRONTEND_V1_ROUTE_SCHEMA_NON_LITERAL_PATTERN` exigiam genérico `<T>` e `BFF_V1_ROUTE_REGISTRATION_PATTERN`/`BFF_V1_NON_LITERAL_ROUTE_REGISTRATION_PATTERN` exigiam receptor `app` — nenhum dos dois é o que define se a chamada/registro `/v1` existe, e uma chamada/registro na forma alternativa escaparia dos dois lados ao mesmo tempo, o mesmo escape duplo que o diff037 já tinha fechado para a crase; `extractDispatchedModuleConstantTexts` descartava 13 dos 16 sítios `text:` de `message-graph.ts` sem contar, nomear nem distinguir entre eles — 10 expressão dinâmica do turno (descarte correto) e 3 anotação de tipo, mas um literal inline seria descartado do mesmo jeito; e `readGateReport` não conferia frescor do `results.json`, enquanto o gate público (`validate:ui`) não tinha leitor nenhum.

**Decisão:**

1. **Resíduo reprova; não é aviso.** Cada extrator de forma textual — os dois fechamentos de texto de cliente e as duas regras de rota `/v1` — passa a enumerar, em código, as categorias de reconhecimento que aceita. Toda ocorrência candidata cai em exatamente uma categoria, ou é resíduo, e resíduo não vazio derruba o teste ou check de `audit:static` que vigia aquele arquivo, nomeando arquivo e linha da ocorrência. Um resíduo que só imprime é a mesma cegueira com mais texto — a decisão de planejamento do Goal explicitamente proibia essa saída.
2. **A categoria de descarte é enumerada, não inferida.** `classifyDispatchedTextSites` (`message-graph.ts`) nomeia `dynamic_turn_expression` (`state.*`/`message.*`) e `type_annotation` (`text: string`) como categorias próprias, cada uma reconhecida por forma explícita — não como "o que sobrou depois de reconhecer constante de módulo". A alternativa — continuar descartando por exclusão, sem nomear a forma descartada — foi rejeitada: é exatamente o comportamento que produzia a cegueira, só que com um extrator mais versátil.
3. **`assistant.service.ts` ganha piso, não um extrator mais esperto sem prova de que enxerga.** `countMessagesArraySites` conta os sítios `messages: [...]` do arquivo; o fechamento reprova se `extractMessagesArrayLiterals` devolver menos textos do que sítios. Resolver `PRODUCT_OWN_FIXED_TEXTS.<chave>` (com fallback `\|\|`) e `buildStyleGreeting(...)` (um texto por estilo de `AI_CONVERSATION_STYLES`) faz o extrator enxergar os sítios reais; o piso é o que impede a próxima forma não reconhecida de voltar a passar em silêncio, como o controle 1 prova nos dois sentidos.
4. **O nome do receptor e o genérico do TypeScript nunca definiram se a rota existe.** Os quatro padrões antigos (dois por lado, um para a forma literal e outro para a não-literal) dão lugar a um único padrão de sítio por lado, que `classifyBffRouteRegistrationSites` e `classifyFrontendRouteSchemaCallSites` classificam por categoria: `BFF_ROUTE_CALL_SITE_PATTERN` usa `RECEIVER_PATTERN`, que não exige mais o receptor `app`; `FRONTEND_ROUTE_SCHEMA_CALL_SITE_PATTERN` (`routeSchema(?:<[\s\S]*?>)?\(`) torna o genérico opcional. Isso amplia o que os checks de literalidade (`bff_v1_routes_use_literal_paths`, `frontend_v1_route_schema_calls_use_literal_patterns`) e a extração de `public_api_route_coverage` reconhecem como chamador/registro legítimo, sem introduzir allowlist. O padrão de sítio só enumera os candidatos; quem decide categoria são dois critérios computados sobre o texto já lido, nenhum deles forma do handler: **aridade** (registro de rota recebe path e handler, `args.length >= 2`) e **posição** (`callValueIsConsumed` — registro de rota é statement, enquanto leitura de Map, leitura de header e chamada de cliente HTTP têm o valor atribuído, aguardado ou passado adiante). É por isso que `app.get(PATH, handleThing)`, com o handler passado por referência, é registro reconhecido, e `mapa.get(chave)` não é candidato.
5. **Relatório de outra execução reprova; `flaky` continua não reprovando.** `scripts/lib/playwright-report.mjs` concentra o leitor único: os dois gates renderizados apagam o `results.json` anterior antes de subir o Playwright e conferem o `mtime` do relatório contra o instante em que a execução começou (`notBeforeMs`). Relatório mais antigo que esse instante é um erro nomeado dizendo que é de execução anterior — provado nos dois gates pelo controle 6. O processo continua saindo `0` quando toda retentativa passou na segunda tentativa: declarar retentativa continua sendo diagnóstico, nunca critério de aceite, e `retries: 1` não mudou em nenhum `playwright.*.config.ts` — a mesma linha que D-053 já tinha traçado, agora estendida ao gate público que antes não tinha leitor nenhum.

**Alternativas:** manter o descarte por exclusão em `message-graph.ts`, só ampliando o vocabulário reconhecido — rejeitada no item 2, é a mesma cegueira com escopo maior; exigir que toda chamada `routeSchema` do repositório declare genérico, e todo registro de rota use `app` — rejeitada: reescrever chamada/registro existente para satisfazer a forma que o extrator exige é inverter a direção certa da correção (D-052 já tinha decidido que a rigidez mora no produtor do reconhecimento, não no produto reconhecido); reprovar o gate quando o relatório está ausente, mas continuar aceitando qualquer `results.json` presente sem checar frescor — rejeitada: é exatamente o comportamento que deixava `readGateReport` ler o relatório errado sem saber; fazer retentativa reprovar o gate — rejeitada, mesmo motivo do item 3 de D-053: transformaria throttle real do produto em falha do gate.

**Motivo:** o risco próprio deste Goal — trocar cegueira por ruído — só se evita enumerando o que cada extrator reconhece, nunca reprovando por resíduo sem nomear a categoria que ele não preencheu. Resíduo declarado é o que torna a regra auditável: quem lê o código vê exatamente o que cada extrator aceita, e quem lê o relatório vê exatamente o que sobrou.

**Consequências:** `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha `countMessagesArraySites`, `extractProductOwnFixedTextsMap`, `classifyMessageExpression`/`classifyMessageExpressionSites`, `classifyDispatchedTextSites` e `extractTextSiteExpression`, ao lado dos extratores existentes — nenhum substitui o outro. `scripts/final-production-audit.mjs` troca os quatro padrões de rota por enumeração: `classifyBffRouteRegistrationSites` e `classifyFrontendRouteSchemaCallSites` classificam cada ocorrência candidata em categoria nomeada, com `blankComments`, `extractCallArguments` e `countByCategory` como apoio, e os dois `find*` existentes continuam exportados, agora devolvendo o resíduo com arquivo e linha. `scripts/lib/playwright-report.mjs` é novo, importado por `scripts/goal033-authenticated-ui-rehearsal.mjs` e por `scripts/validate-ui.mjs` (novo); `package.json` troca `"validate:ui": "cd apps/frontend && npm run test:ui"` por `"validate:ui": "node scripts/validate-ui.mjs"`, que continua rodando `npm run test:ui` por baixo, com o mesmo exit code do Playwright quando ele sai não-zero. `PRODUCT_OWN_TEXTS` não ganha nem perde entrada — os extratores passam a ver texto que já existia, não a produzir texto novo. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; FINAL_AUDIT §15 recontado: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado em relação a §14, sem achado novo a partir de A-24. Este diff não fecha **M4**, não afirma fidelidade visual à referência aprovada e não liga a verificação de resposta em produção.

**Revisar se:** um extrator de forma textual novo entrar no repositório sem enumerar categoria — o padrão que este Goal fixou é que reconhecimento por forma sempre declara o que reconhece; um quinto módulo emissor de texto de cliente aparecer fora de `assistant.service.ts` e `message-graph.ts` — reabriria o mesmo limite que D-053 já tinha registrado, agora também sobre categoria de descarte; ou uma rota `/v1` legítima precisar de path dinâmico — a regra de literalidade continua proibindo a forma sem exceção, decisão que D-052 já tinha tomado e este Goal não revisita.

## D-055 — O escopo de um guard é computado como o conteúdo dele já é, texto que não vai à cliente do negócio é categoria declarada, e o conjunto verificado novo mora no teste, propostas no Goal039

**Status:** ACCEPTED no [review039](reviews/039-review.md) (rodada 1 de 1, 2026-09-21, zero blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff039 (WU-01 a WU-04, com os cinco controles negativos obrigatórios executados e revertidos pela WU-04) sobre a baseline aceita `9ba6b751cac2b1af958fac47e5c83c0e1ddc7d6c` (fechamento do Goal038); sem commit e sem deploy. Quatro observações não bloqueantes ficaram registradas no review, todas sobre a precisão dos descobridores novos e nenhuma sobre invariante afrouxada: `hasComposeNotificationTextAssignmentBefore` é de escopo de arquivo e não de bloco; a chamada só é reconhecida na forma `sendText({ ... })` com objeto literal, de modo que um payload passado por variável vira resíduo; o canal continua reconhecido por token textual, não por referência de tipo; e a checagem de definição de `routeSchema` copia o prefixo do arquivo por sítio, custo quadrático latente no escopo que cresceu de 17 para 194 arquivos. Não fecha nem reabre nenhum achado — A-04 a A-08, A-11 a A-17 e A-19 não são tocados, e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) é reaberto. Não altera nenhuma decisão anterior — reusa e não altera D-018, D-050, D-052, D-053 e D-054.

**Contexto:** o [review038](reviews/038-review.md) registrou, como observação não bloqueante, que "resíduo zero não é cobertura universal". A conferência desta rodada sobre a baseline confirmou o que essa frase deixava em aberto: o Goal038 tinha fechado a **forma** dentro de cada extrator, mas o **escopo** de arquivos que cada um lia continuava sendo lista escrita à mão — a mesma allowlist que o Goal038 proibiu dentro das regras, um nível acima delas. Três fatos confirmados sobre a baseline: `apps/ai-orchestrator/src` tem sete sítios de `sendText`/porta/adapter, e o fechamento de texto de cliente do Goal038 vigiava só dois arquivos nomeados dentro do próprio teste — os outros cinco caminhos não eram resíduo, eram invisíveis; `notification-message.ts` compõe, sem chamada de modelo, o texto que o lembrete e o aviso de alteração entregam à cliente, e nenhuma dessas frases estava em `PRODUCT_OWN_TEXTS` nem passava por `VOCABULARIO_DE_ESPERA`; e `classifyFrontendRouteSchemaCallSites` só lia `apps/frontend/src/data/services`, então uma chamada de `routeSchema` em qualquer outra pasta sumia da cobertura e da regra de literalidade ao mesmo tempo — o terceiro escape duplo desta série, agora pela pasta. Um quarto fato, adjacente: `ActivationTestService.ts` emite, pelo mesmo canal de `sendText`, um aviso ao dono do negócio e três falas de cliente simulado que não são texto do produto para a cliente — e isso não estava declarado em lugar nenhum, só esquecido. Hoje não há violação real em nenhum dos quatro: é fechamento de classe, não conserto.

**Decisão:**

1. **O escopo de leitura de um guard é computado, não uma lista de arquivos nomeados no teste.** `discoverSendTextSites` lê `apps/ai-orchestrator/src` inteiro e `classifyFrontendRouteSchemaCallSites` lê `apps/frontend/src` inteiro; nenhum dos dois nomeia arquivo, módulo ou pasta como allowlist — só o diretório de partida. A alternativa — continuar nomeando `assistant.service.ts`/`message-graph.ts` e `data/services` dentro do código do guard, só que revisada uma vez — foi rejeitada: resolveria os quatro fatos de hoje e deixaria o próximo módulo emissor, ou a próxima pasta do frontend, de novo invisível em vez de resíduo.
2. **Sítio sem categoria é resíduo que derruba o teste; não há allowlist por arquivo, módulo ou linha.** `discoverSendTextSites` classifica cada ocorrência de `sendText(` em `port_declaration`, `adapter_implementation`, `product_own_text_to_customer`, `text_in_transit_named_origin` (origem nomeada) ou `person_typed_text`; fora dessas cinco, lança erro com arquivo e linha. Mesmo padrão de D-054: resíduo que só imprime é a mesma cegueira com mais texto.
3. **Texto que não vai à cliente do negócio é categoria declarada, não é tratado pelo mesmo guardrail nem descartado em silêncio.** `ACTIVATION_TEST_NOTICE` e as três falas de cliente simulado de `ActivationTestService.ts` caem em `activation_test_channel`, com o motivo escrito junto — o aviso é dirigido a quem observa o teste, as falas são o script que o teste envia como se fosse a cliente, nenhum dos dois é o produto respondendo a uma pessoa real —, e um teste confirma que nenhum dos quatro está em `VERIFIED_CLIENT_TEXTS`. A alternativa — aplicar `VOCABULARIO_DE_ESPERA` a esses quatro textos também, por serem emitidos pelo mesmo `sendText` — foi rejeitada: o guardrail existe para proteger a experiência da cliente do negócio, e um roteiro de teste teria vocabulário de teste, não vocabulário de produto.
4. **O conjunto verificado de texto de cliente mora na camada de teste, nunca em `apps/ai-orchestrator/src/`.** `NOTIFICATION_MESSAGE_TEXTS` é obtido **executando** `composeNotificationText`/`notificationFactualLines` — exports que já existiam — sobre fatos declarados no próprio teste, e entra em `VERIFIED_CLIENT_TEXTS` ao lado de `PRODUCT_OWN_TEXTS`, sem que nenhum dos dois módulos de produção seja editado. A alternativa — importar o texto de lembrete dentro de `assistant.service.ts`, para que `PRODUCT_OWN_TEXTS` o incluísse diretamente — foi rejeitada: criaria acoplamento de produção para servir a um teste, pior do que o problema que resolve, e o Goal a proibia explicitamente.
5. **A definição de uma função de contrato não é candidata a chamada nem a resíduo, mesmo dentro do escopo agora lido.** Ampliar `classifyFrontendRouteSchemaCallSites` para `apps/frontend/src` inteiro passaria a ler `function routeSchema<T>(` em `data/http/BffHttpClient.ts` — a própria declaração —, que cai na categoria `definition`, distinta de `literal_pattern`/`template_other_pattern` (chamada) e nunca conta como chamador nem como resíduo. Sem essa categoria, ampliar o escopo teria introduzido um resíduo falso positivo no primeiro arquivo lido.

**Alternativas:** manter os dois descobridores de texto de cliente restritos a `assistant.service.ts` e `message-graph.ts`, e apenas documentar o limite — rejeitada: é a mesma lacuna que o review038 já tinha nomeado, sem fechá-la; tratar `ACTIVATION_TEST_NOTICE` e as falas de cliente simulado como texto de produto e aplicar `VOCABULARIO_DE_ESPERA` a eles — rejeitada no item 3: confundiria script de teste com fala do produto e poderia forçar reescrita de roteiro de teste por um guardrail que não existe para isso; mover `composeNotificationText`/`notificationFactualLines` para dentro de `assistant.service.ts` só para alimentar `PRODUCT_OWN_TEXTS` — rejeitada no item 4: acoplaria produção a teste; continuar limitando `classifyFrontendRouteSchemaCallSites` a `data/services`, aceitando que um chamador em outra pasta não seja coberto — rejeitada: é o mesmo escape duplo que 037 e 038 já tinham fechado por outras formas, agora pela pasta; tratar a definição de `routeSchema` como chamada comum, sem categoria própria — rejeitada no item 5: introduziria resíduo falso positivo assim que o escopo ampliasse.

**Motivo:** o risco próprio deste Goal — descobrir demais e transformar log, erro técnico ou chamada de teste em resíduo — só se evita enumerando o que cada descobridor reconhece e computando **onde** ele procura, nunca escrevendo a lista de arquivos à mão. Um guard cujo conteúdo é auditável mas cujo escopo é lista fixa continua cego fora dela; este Goal fecha o mesmo padrão do D-054 um nível acima.

**Consequências:** `apps/ai-orchestrator/tests/support/send-text-sites.ts` (novo) exporta `discoverSendTextSites`/`classifySendTextSites`; `apps/ai-orchestrator/tests/support/notification-message-sites.ts` (novo) exporta `classifyNotificationTextSites`; `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha `NOTIFICATION_MESSAGE_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `ACTIVATION_TEST_CHANNEL_TEXTS`, ao lado dos conjuntos existentes — `PRODUCT_OWN_TEXTS` não muda. `scripts/final-production-audit.mjs` troca o argumento de `classifyFrontendRouteSchemaCallSites`/`findNonLiteralFrontendV1RouteSchemaCalls`/`findUncoveredPublicApiRoutes` de `sourceFiles("apps/frontend/src/data/services")` para `sourceFiles("apps/frontend/src")`, e a categoria `definition` entra na enumeração. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; FINAL_AUDIT §16 recontado: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado em relação a §15, sem achado novo a partir de A-24. Este diff não fecha **M4**, não afirma fidelidade visual à referência aprovada e não liga a verificação de resposta em produção.

**Revisar se:** um sexto canal de saída de texto aparecer em `apps/ai-orchestrator/src` fora de `sendText` sobre `WhatsAppProvider` — exigiria um descobridor próprio, no mesmo padrão computado, não extensão do atual; `notification-message.ts` ganhar um estilo ou uma forma factual nova — o descobridor de sítios a classificaria ou reprovaria por resíduo, e `NOTIFICATION_MESSAGE_TEXTS` precisaria do cenário novo declarado no teste para cobri-la; ou um chamador de `routeSchema` legítimo precisar viver fora de `apps/frontend/src` — o escopo de leitura deste Goal não cobre esse caso e exigiria decisão própria.

Ao mudar decisão: registrar evidência/commit, marcar anterior SUPERSEDED quando aplicável, indicar substituta e impactos em DATA_MIGRATION/MASTER_PLAN/status. Não reutilizar ID de Goal cancelado para outro trabalho. Nenhuma proposta se torna ACCEPTED só porque o Developer a mencionou no relatório; o Tech Lead inspeciona diff/testes reais.

## D-056 — O conjunto de métodos portadores de texto é derivado da porta, a categoria de texto próprio liga-se ao conjunto verificado, e a cadeia de trânsito é seguida até o chamador, propostas no Goal040

**Status:** ACCEPTED no [review040](reviews/040-review.md) (rodada 3 de 3, 2026-09-21, zero blockers; as rodadas 1 e 2 tiveram 2 blockers cada, todos sobre reconhecimento mais estreito do que a regra declarava — membro de porta em forma genérica ou de propriedade-arrow e chamada de identificador solto, que sumiam do conjunto e da reprovação ao mesmo tempo), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff040 (WU-01 a WU-05, com os cinco controles negativos obrigatórios executados e revertidos pela WU-05, mais as correções das rodadas 2 e 3 — a última mudança de árvore são os seis controles negativos permanentes de forma de reconhecimento) sobre a baseline aceita `502a70c46be73cb50cab734fa76046a54d5af6be` (fechamento do Goal039); sem commit e sem deploy. Cinco observações não bloqueantes ficaram registradas no review, nenhuma sobre invariante afrouxada: a forma arrow-property de método de porta está correta por execução, mas sem teste permanente; a cadeia de trânsito para em um elo; a resolução do tipo do parâmetro exige interface declarada no mesmo arquivo da porta; a mensagem de resíduo de `classifySendTextSites` escreve `sendText` fixo mesmo para outro portador; e `text: string | undefined` e `interface X extends Base { text }` são classificados como não portadores com motivo escrito, limite ausente dos documentos de migração. Não fecha nem reabre nenhum achado — A-04 a A-08, A-11 a A-17 e A-19 não são tocados, e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) é reaberto. Não altera nenhuma decisão anterior — reusa e não altera D-018, D-050 e D-055.

**Contexto:** o Goal039 tinha computado **onde** `discoverSendTextSites` procura (`apps/ai-orchestrator/src` inteiro), fechando o escopo de leitura como lacuna. Ficaram de fora dois pontos adjacentes, confirmados sobre a baseline: primeiro, o **token** que decide quais métodos da porta `WhatsAppProvider` carregam texto ao destinatário do canal continuava sendo um literal escrito à mão (`/\bsendText\s*\(/g`) — um método novo da porta, com nome diferente de `sendText`, que também carregasse texto ao destinatário não seria descoberto: nem resíduo, nem candidato, simplesmente invisível, a mesma classe de escape que D-055 já tinha fechado um nível acima (escopo de arquivo), agora um nível abaixo (nome de método). Segundo, a categoria `product_own_text_to_customer` misturava, sem distinção, o `text:` composto pelo **código** de forma testável (`composeNotificationText`, cujo produto entra em `VERIFIED_CLIENT_TEXTS` desde o Goal039) com o `text:` que o **modelo** decide (`state.response.text`) — e nenhum teste ligava explicitamente o primeiro ao conjunto verificado nem declarava o segundo como categoria à parte, sujeita à fronteira que D-050 já tinha traçado entre o que o código garante e o que o prompt apenas orienta. Terceiro, um sítio `text_in_transit_named_origin` nomeia a origem no parâmetro do chamador, mas nada seguia até esse chamador para ver o que ele de fato fornece — a cadeia parava no primeiro elo.

**Decisão:**

1. **O conjunto de métodos portadores de texto é lido da declaração da porta, não escrito como token.** `parseWhatsAppProviderMethods` enumera todo método de `WhatsAppProvider`, resolve o tipo do primeiro parâmetro no mesmo arquivo e classifica o método como portador se esse tipo declarar, no nível superior, `text: string`. `resolveSendTextCarrierMethodNames()` devolve os nomes portadores computados (`["sendText"]` sobre a declaração real), e `buildSendTextTokenPattern()` monta o padrão de busca a partir deles. A alternativa — manter o token fixo e só ampliá-lo manualmente se um método novo aparecesse — foi rejeitada: é o mesmo padrão de lista escrita à mão que D-055 já tinha fechado para escopo de arquivo, agora reaberto para nome de método.
2. **Método sem forma reconhecível é resíduo que derruba a leitura, nomeando arquivo e linha.** Um método cujo parâmetro não resolve a uma interface declarada no mesmo arquivo, ou cuja forma de parâmetro não é reconhecida, lança erro nomeado — nunca fica fora da lista em silêncio. Mesmo padrão de D-054: resíduo que só imprime é a mesma cegueira com mais texto.
3. **A categoria de texto próprio do produto separa o que o código compõe do que o modelo decide, e liga o primeiro ao conjunto verificado.** `SendTextSiteCategory` troca `product_own_text_to_customer` por `` `composed_by_${compositor}` `` (variável local atribuída de `const <nome> = <compositor>(` no mesmo bloco de função do sítio — nomeia o compositor) e `assistant_decision_text` (`state.response.text`). Um teste confirma o elo que faltava: o único sítio `composed_by_*` da árvore real é `composed_by_composeNotificationText`, e todo texto de `NOTIFICATION_MESSAGE_TEXTS` está em `VERIFIED_CLIENT_TEXTS`. A alternativa — manter uma única categoria e verificar o elo só implicitamente, por já existir `NOTIFICATION_MESSAGE_TEXTS` desde o Goal039 — foi rejeitada: não distinguia, no código nem no relatório, o que é composto de forma testável do que é decisão do modelo, e não declarava o teste que prova a ligação.
4. **Texto emitido pelo modelo permanece categoria própria, fora do conjunto verificado por execução — fronteira de D-050, não revisitada.** `assistant_decision_text` não entra em `VERIFIED_CLIENT_TEXTS`: a fala do modelo não é demonstrável por um dublê roteirizado. A alternativa — unificar as duas categorias sob um mesmo guardrail, já que ambas emitem pelo mesmo `sendText` — foi rejeitada: confundiria garantia de código com orientação de prompt, a mesma distinção que D-050 (item 2) já tinha traçado.
5. **A cadeia de trânsito é seguida um elo: do sítio até o chamador real da função que o contém, dentro de `apps/ai-orchestrator/src`.** `discoverSendTextTransitChains` resolve o nome da função que contém cada sítio `text_in_transit_named_origin` e procura, em toda a árvore lida, cada chamada real desse nome, classificando o texto que o chamador fornece pelo mesmo vocabulário dos sítios (`assistant_decision_text`, `person_typed_text`, `composed_by_*` com compositor verificado, ou `text_in_transit_named_origin` de novo, se o chamador também repassa). Toda ocorrência do nome que não é chamada real — assinatura da porta, implementação que contém o próprio sítio, anotação de tipo — sai nomeada em `excludedOccurrences`, nunca resíduo; chamador sem categoria reconhecida, ou que compõe com compositor não verificado, é resíduo nomeado. Sobre a árvore real: 2 cadeias, cada uma com exatamente 1 chamador, resíduo zero. A alternativa — seguir a cadeia recursivamente até não haver mais `text_in_transit_named_origin` — foi rejeitada por este Goal: os dois chamadores encontrados são, eles próprios, `text_in_transit_named_origin`, e segui-los exigiria decidir até onde recursar e como evitar ciclo, decisão que este Goal não toma; a cadeia para em um elo, e isso fica declarado como limite, não escondido.

**Alternativas:** manter o token literal `sendText` e revisá-lo manualmente a cada método novo da porta — rejeitada no item 1: é a mesma lista escrita à mão que este Goal existe para fechar; deixar `product_own_text_to_customer` como categoria única, confiando que `NOTIFICATION_MESSAGE_TEXTS` já cobre o caso — rejeitada no item 3: não distingue nem prova o elo no código; aplicar `VOCABULARIO_DE_ESPERA`/`VERIFIED_CLIENT_TEXTS` também a `assistant_decision_text` — rejeitada no item 4: confundiria garantia de código com orientação de prompt; seguir a cadeia de trânsito recursivamente até a origem definitiva — rejeitada no item 5: exigiria decisão de corte e proteção contra ciclo que este Goal não avalia; a cadeia declarada de um elo é o que a evidência desta rodada sustenta.

**Motivo:** o risco próprio deste Goal — descobrir demais ou continuar cego por um nível abaixo do que o Goal039 já tinha fechado — só se evita computando o token a partir da própria declaração da porta, nomeando a categoria que liga texto composto ao conjunto verificado, e sendo explícito sobre onde a cadeia de trânsito para de seguir.

**Consequências:** `apps/ai-orchestrator/tests/support/send-text-sites.ts` ganha `WhatsAppProviderPortMethod`, `parseWhatsAppProviderMethods`, `resolveSendTextCarrierMethodNames`, `buildSendTextTokenPattern` (substitui o token literal anterior), `SendTextCallerCategory`, `ClassifiedSendTextCaller`, `TransitOccurrenceExclusionReason`, `ExcludedTransitOccurrence`, `SendTextTransitChain`, `classifyTransitCallersInSource` e `discoverSendTextTransitChains`; `SendTextSiteCategory` troca `product_own_text_to_customer` por `` `composed_by_${string}` `` e `assistant_decision_text`. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha os testes que provam cada um dos cinco pontos, com 12 casos novos ao lado dos 37 já existentes, mais os 6 controles negativos acrescentados na correção da rodada 3 — chamada de identificador solto como sítio e como chamador, e método de porta em forma genérica como resíduo nomeado (55 no total). Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; `PRODUCT_OWN_TEXTS` e `VERIFIED_CLIENT_TEXTS` continuam com o mesmo conjunto de entradas da baseline. FINAL_AUDIT §17 recontado: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado em relação a §16, sem achado novo a partir de A-24. Este diff não fecha **M4**, não afirma fidelidade visual à referência aprovada e não liga a verificação de resposta em produção.

**Revisar se:** um método novo aparecer na porta `WhatsAppProvider` com parâmetro cujo tipo não é uma interface declarada no mesmo arquivo — o descobridor reprovaria por resíduo, e resolver isso exigiria estender a resolução de tipo, não ampliar o token; um compositor novo entrar em uso fora de `composeNotificationText` sem que seu texto produzido esteja coberto por `VERIFIED_CLIENT_TEXTS` — o sítio viraria resíduo até o teste declarar o cenário; ou a cadeia de trânsito precisar seguir além de um elo — este Goal deliberadamente não decide corte nem proteção contra ciclo para esse caso, e exigiria decisão própria.

## D-057 — O egresso de texto é computado por sítio de rede, não presumido pela porta, o egresso genérico é fail-closed pelos chamadores, e a cadeia de trânsito para em raiz classificada, propostas no Goal041

**Status:** ACCEPTED no [review041](reviews/041-review.md) (rodada 5 de 5, 2026-09-21, zero blockers; as rodadas 1 a 4 tiveram 5, 2, 1 e 1 blocker — o da rodada 1 sobre reconhecimento decidido por nome de arquivo no descobridor de egresso, e os das rodadas 2 a 4 sobre documentação afirmando um conjunto de arquivos que não era o da árvore, em laço com a reversão do harness), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff041 (WU-01 a WU-06 da rodada 1, mais a correção dos blockers das rodadas 2, 3 e 4, com os cinco controles negativos obrigatórios executados e revertidos — os controles 1 a 3 com as duas saídas, baseline e árvore final; a última mudança de árvore é a documentação da rodada 5) sobre a baseline aceita `9709b1ac2f2de7d338344845a0b4b78d6a3aea93` (fechamento do Goal040); sem commit e sem deploy. Quatro observações não bloqueantes ficaram registradas no review, nenhuma sobre invariante afrouxada: `scopeRelativePattern` só existe na worktree, então o gate `targeted-tests` reprova em toda rodada futura até ser integrada; `git-diff-check` é `git diff --check` e nunca poderia decidir conjunto de arquivos, apesar do objetivo declarado; o descobridor reconhece apenas `fetch(`, sem cliente HTTP de biblioteca — hoje nenhum existe nas duas árvores; e as três observações opcionais do review040 (tipo de parâmetro importado, `text: string | undefined`, `interface X extends Base`) continuam abertas, todas errando na direção de resíduo nomeado. Não fecha nem reabre nenhum achado — A-04 a A-08, A-11 a A-17 e A-19 não são tocados, e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) é reaberto. Não altera nenhuma decisão anterior — reusa e não altera D-018, D-050, D-055 e D-056.

**Contexto:** o Goal040 tinha computado **quais métodos** da porta `WhatsAppProvider` carregam texto, mas a **porta em si** continuava sendo premissa: nada provava que todo texto que sai do produto para o número da cliente passa por ela. Conferido sobre a baseline, `apps/ai-orchestrator/src` tem quatro sítios de `fetch(` e `apps/bff/src` tem quatro; um deles, e só um, leva prosa do produto ao número da cliente (o do adapter Evolution), e `fetchJson` (`lib/http.ts`), a porta de saída genérica, tem zero chamadores — um chamador novo dela apontando para o path de envio de texto entregaria prosa à cliente sem tocar `WhatsAppProvider`, e o descobridor do Goal040 não veria nem reprovaria. Segundo, `discoverSendTextTransitChains` seguia a cadeia de trânsito só até o primeiro chamador — os dois chamadores encontrados eram, eles próprios, trânsito, e quem os chama não era olhado; o segundo elo tem cinco chamadores reais na árvore, hoje todos com texto de categoria já declarada, mas um sexto chamador compondo prosa própria entregaria texto à cliente sem o guardrail ver nada. Terceiro, dois resíduos ficaram declarados no review040: a forma propriedade-arrow de membro de porta não tinha teste permanente, e a mensagem de resíduo de `classifySendTextSites` escrevia `sendText` fixo mesmo quando o portador descoberto tivesse outro nome.

**Decisão:**

1. **Todo sítio de egresso HTTP das duas árvores é enumerado e classificado, nunca presumido por uma porta específica.** `discoverHttpEgressSites` (`apps/ai-orchestrator/tests/support/http-egress-sites.ts`, módulo novo) lê `apps/ai-orchestrator/src` e `apps/bff/src` inteiros e classifica cada `fetch(` pelo que o código usa para resolver a URL — `env.<NOME>` direto ou por variável local, campo `this.baseUrl` vindo de parâmetro de construtor, ou parâmetro em trânsito resolvido nos chamadores — nunca por nome de arquivo ou pasta. Uma categoria à parte, `product_prose_to_client_number`, exige que o corpo da requisição declare, na mesma função construtora, uma propriedade `text:` e uma de destinatário, ambas do mesmo parâmetro. Sobre a árvore real: 9 sítios, resíduo zero, exatamente 1 nessa categoria (`EvolutionProvider.ts:73`). Nenhum arquivo é pulado: o `fetch` do próprio primitivo genérico (`lib/http.ts:32`) é classificado como qualquer outro, na categoria `generic_egress_destination_decided_by_caller_fetchJson`, cujo nome sai da declaração que o contém. A lista de fatos de baseline do Goal041 dizia oito sítios; ela omitia `EvolutionProvider.ts:172` e contava `lib/http.ts:32` como sítio a não classificar — vale o número computado da árvore, e a divergência está declarada em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). Sítio sem categoria reconhecida deriva a leitura, nomeando arquivo e linha. A alternativa — continuar assumindo que `WhatsAppProvider` é o único canal de saída e vigiar só os métodos dela — foi rejeitada: é a mesma premissa não verificada que o review040 apontou, agora pela forma do egresso em vez do método da porta.
2. **O egresso genérico é fail-closed pelos seus chamadores, não pela contagem afirmada em comentário nem por uma allowlist de arquivo.** O primitivo genérico é reconhecido pela forma — a URL do `fetch` é um parâmetro da função que o contém e nenhum chamador do próprio arquivo a resolve —, e seu nome (`fetchJson`, hoje) é computado dali. `genericEgressCallers` é computado a cada execução, lendo toda chamada real desse primitivo nas duas árvores e classificando-a pela mesma resolução de destino; chamador que apenas repassa a URL recebida vira primitivo ele próprio, e a varredura segue até ponto fixo com conjunto de nomes visitados. Hoje, zero chamadores — fato lido, não suposto. Um chamador cujo destino não resolve deriva a leitura inteira, nomeando arquivo e linha; a categoria nunca aceita chamador silencioso. A alternativa — proibir `fetchJson` por lint ou marcá-lo `@deprecated` — foi rejeitada: o primitivo é legítimo, o risco é um chamador futuro sem vigilância, não a existência do primitivo.
3. **A cadeia de trânsito é seguida transitivamente até ponto fixo, com a raiz nomeada.** `discoverSendTextTransitChains` (`apps/ai-orchestrator/tests/support/send-text-sites.ts`) deixa de parar no primeiro chamador: cada elo é seguido enquanto o texto continuar em trânsito (`text_in_transit_named_origin`), e o ramo termina quando alcança uma raiz de `SendTextChainRootKind` — `http_route` (handler de rota registrada), `worker_or_job` (método de `*Worker`/`*Job`, ou callback de `setInterval`/`setTimeout`), `activation_test_entry` (método de classe do canal de teste de ativação), `text_composed_at_link`/`assistant_decision_text`/`person_typed_text`/`literal_text_at_link` (o elo já fornece texto de categoria classificada), ou `cycle`, quando o percurso revisitaria um elo já visitado — o ciclo é reportado, nunca percorrido duas vezes nem silenciado. Sobre a árvore real: as 2 cadeias do Goal040 terminam com resíduo zero, cada uma com um segundo elo — os 5 chamadores do review040 (`ActivationTestAiDriver.ts:203`, raiz `assistant_decision_text`; `ActivationTestService.ts:604`, `:608`, `:653`, `:679`, raiz `literal_text_at_link` cada um). A alternativa — seguir a cadeia sem conjunto de visitados, seguindo cegamente todo chamador novo — foi rejeitada: sem detecção de ciclo, um par de funções que se chamam mutuamente faria o percurso não terminar.
4. **Os dois resíduos declarados do review040 fecham.** A forma propriedade-arrow de membro de porta ganha teste permanente, provando o comportamento que já estava correto por execução. A mensagem de resíduo de `classifySendTextSites` nomeia o portador descoberto: `carrierName` é lido do próprio casamento do padrão de busca (computado por `resolveSendTextCarrierMethodNames()`), não mais um literal `sendText` escrito à mão — provado por teste com porta sintética que declara um portador de outro nome.
5. **`apps/evolution-go/` fica declaradamente fora do descobridor.** O serviço Go recebe o corpo que `EvolutionProvider` monta, mas nada aqui — nem em nenhum Goal anterior — prova que ele não compõe texto próprio antes de repassar ao WhatsApp real. A alternativa — instrumentar o serviço Go para provar isso — foi rejeitada por escopo: este Goal é a camada de teste do `ai-orchestrator`, e vigiar um serviço em outra linguagem exigiria descobridor próprio, decisão que este Goal não toma.

**Alternativas:** continuar vigiando só os métodos da porta `WhatsAppProvider`, sem olhar o egresso HTTP cru — rejeitada no item 1: não prova canal único, só prova que a porta conhecida está correta; contar `fetchJson` como zero chamadores para sempre, sem recomputar — rejeitada no item 2: o fato vale para a árvore de hoje, não é invariante do código; seguir a cadeia de trânsito recursivamente sem raiz nomeada nem detecção de ciclo — rejeitada no item 3: um ciclo faria o percurso não terminar, e sem raiz nomeada não haveria como saber quando parar; fechar `apps/evolution-go/` neste Goal — rejeitada no item 5: exigiria descobridor em Go, fora do escopo declarado.

**Motivo:** o risco próprio deste Goal — descobrir demais transformando saúde, transcrição e chamada interna em resíduo, ou seguir a cadeia de trânsito sem parar — só se evita computando o egresso pela forma real do código, exigindo fail-closed do primitivo genérico, e nomeando raiz e ciclo em vez de profundidade fixa.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts` é um módulo novo, com `discoverHttpEgressSites`, `HttpEgressSiteCategory`, `ClassifiedHttpEgressSite`, `HttpEgressExclusionReason` e `HttpEgressDiscovery`. `apps/ai-orchestrator/tests/support/send-text-sites.ts` ganha `SendTextChainRootKind`, `SendTextChainRoot`, `SendTextChainLink`, `SendTextChainCycle` e a extensão de `discoverSendTextTransitChains` para percurso multi-elo; a mensagem de resíduo de `classifySendTextSites` passa a nomear o portador descoberto em vez de `sendText` fixo. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha 11 casos novos ao lado dos 55 já existentes (66 no total): 2 fecham os resíduos do review040 (forma propriedade-arrow permanente, mensagem de resíduo com portador nomeado) e 9 provam a enumeração de egresso HTTP, o fail-closed do egresso genérico (inclusive primitivo de outro nome em outro arquivo e repasse em cadeia) e a cadeia estendida com os 5 chamadores de segundo elo nomeados. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; `PRODUCT_OWN_TEXTS` e `VERIFIED_CLIENT_TEXTS` continuam com o mesmo conjunto de entradas da baseline. FINAL_AUDIT §17 recontado em §18: 0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado, sem achado novo a partir de A-24. O limite do serviço Go (`apps/evolution-go/`) fica declarado aqui e em [VALIDATION_GATE](VALIDATION_GATE.md#egresso-http-computado-egresso-genérico-fail-closed-e-cadeia-de-trânsito-até-raiz-classificada-do-goal041). Este diff não fecha **M4**, não afirma fidelidade visual à referência aprovada e não liga a verificação de resposta em produção. **Desvio declarado ao §5 do Goal041, dispensado no review041 (D-018, precedente [D-048](#d-048--fronteira-do-openai-configurável-por-ambiente-e-prova-de-composição-da-resposta-automática-sem-substituto-interno-propostas-no-goal032) do review033):** `tools/ia-loop/lib/deterministic-executor.mjs` e `tools/ia-loop/tests/deterministic-executor.test.mjs` seguem modificados por `scopeRelativePattern` (`deterministic-executor.mjs:56`, usada em `runDeterministicAction:84`), que tira o prefixo de escopo duplicado de `unit.pattern` sob `ACTION_CWD.SCOPE` — sem ela o gate `targeted-tests` (WU-09) reprova com `No test files found, exiting with code 1`, e a reversão tentada nas rodadas 2, 3 e 4 não se sustentou nas três vezes. É mudança de harness, sem efeito em produto nem em gate de produto, coberta por `node --test tools/ia-loop/tests/deterministic-executor.test.mjs` (12 casos, 12 pass).

**Revisar se:** um sítio de egresso HTTP novo não resolver a `env.<NOME>`, a `this.<campo>` nem a parâmetro resolvível nos chamadores — a leitura reprovaria por resíduo, e resolver isso exigiria estender `resolveDestination`, não allowlist; um chamador de `fetchJson` aparecer sem destino resolvível — mesma reprovação por resíduo, mesma extensão exigida; a cadeia de trânsito precisar reconhecer uma raiz nova, fora das sete nomeadas — exigiria decisão própria sobre o que conta como raiz; ou o serviço `apps/evolution-go/` precisar ser provado sem texto próprio — este Goal deliberadamente não decide isso, e permanece limite declarado até haver Goal que o feche.


## D-058 — O guard atravessa a fronteira de serviço em vez de continuar declarando limite, o campo portador é derivado das declarações de proto, e a fronteira é atravessada por valor com cada lado lido na sua língua, propostas no Goal042

**Status:** ACCEPTED no [review042](reviews/042-review.md) (rodada 2 de
2, 2026-09-21, zero blockers; a rodada 1 teve 9 blockers — árvore
vermelha, §3 ausente dos dois lados, controles negativos e documentação
inexistentes, e a escalação da WU-03, resolvida por ruling do Tech Lead
que substituiu o hard-fail de `requireNoProseReachingTransport` por
conjunto asserido elemento a elemento, sem editar o fork), pelo Tech
Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff042
(correção dos nove blockers registrados na revisão da rodada 1, com os
cinco controles negativos obrigatórios executados e revertidos — os
controles 1 a 3 com as duas saídas, baseline e árvore final) sobre a
baseline aceita `da0f06d9431bdd73e33c4eb301e5edefd7df986a` (fechamento
do Goal041); sem commit e sem deploy. Fecha o limite que **D-057 item
5** declarava. Seis observações não bloqueantes ficaram registradas no
review, nenhuma sobre invariante afrouxada: o conjunto derivado de
campos portadores é mais largo do que "texto que uma pessoa lê" (`URL`,
`DirectPath`, `Mimetype`, `Vcard`), então os conjuntos de 88 e de 27
membros se mexem a cada mudança de transporte; a alcançabilidade é
sobre-aproximada de propósito, errando na direção fail-closed; a cadeia
segue o valor ligado pelo handler e não veria texto atravessando por
canal, closure guardada em campo ou reflexão; A-24 fica aberto, não
corrigido; o defeito de harness do Goal041 não mordeu nesta série e
nenhum arquivo de `tools/ia-loop/` foi tocado; e as três observações
opcionais do review040 continuam abertas.
**Acrescenta** um achado novo, **A-24** (`PENDENCIA-POS-MVP`), registrado
em [FINAL_AUDIT §19](FINAL_AUDIT.md) — não corrige nem reclassifica
nenhum achado anterior: A-04 a A-08, A-11 a A-17 e A-19 não são tocados,
e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) é
reaberto. Não altera nenhuma decisão anterior — reusa e não altera D-018,
D-050, D-054, D-055, D-056 e D-057.

**Contexto:** o produto não entrega texto ao WhatsApp. Entrega ao serviço
Go, e o serviço Go entrega ao WhatsApp. Os Goals 034 a 041 provaram
propriedades do lado de cá da fronteira — qual texto o produto compõe,
por qual porta ele sai, por qual egresso HTTP ele parte, e que só existe
um. Do lado de lá, `apps/evolution-go/` tem 53 arquivos `.go` de produção
em `pkg` e `cmd`, e nenhum guard do repositório lia essa árvore. A
afirmação "o serviço Go é um relé" era prosa em documento, registrada
pelo aceite do Goal041 como limite declarado, não como fato provado — e o
`AGENTS.md` de `apps/evolution-go/` já proibia lógica de produto nesse
fork sem que nada verificasse a proibição.

**Decisão:**

1. **O guard atravessa a fronteira de serviço, em pacote Go novo e só de
   teste.** `apps/evolution-go/pkg/transportguard/` (16 arquivos: 10
   fontes e 6 de teste) lê `apps/evolution-go/pkg` e `cmd` inteiros por
   AST com `go/parser` e `go/ast` da biblioteca padrão — nenhuma
   dependência nova, `go.mod` e `go.sum` intocados, nenhum arquivo Go de
   produção alterado, pacote não importado por `cmd/evolution-go`. Sobre
   a árvore real: 82 sítios de escrita em campo portador, 19 chamadas de
   transporte, resíduo zero. Todo sítio cai em exatamente uma categoria
   nomeada com o motivo escrito junto, e forma não reconhecida vira erro
   com `arquivo:linha`. A alternativa — continuar declarando o serviço Go
   como limite e vigiar só o lado TypeScript — foi rejeitada: é a mesma
   premissa não verificada que o review041 apontou, agora uma fronteira
   de linguagem em vez de uma porta.
2. **O campo portador de texto é derivado das declarações de proto, nunca
   digitado.** `DeriveCarrierFields` lê
   `whatsmeow-lib/proto/waE2E/WAWebProtobufsE2E.pb.go` e devolve todo
   campo `*string` declarado em struct que traz `protoimpl.MessageState`
   — 325 campos hoje. O caminho do pacote de proto e o da biblioteca de
   transporte saem do `replace` do `go.mod`, não de literal no guard. O
   conjunto derivado é mais largo do que "texto que uma pessoa lê":
   inclui `URL`, `DirectPath`, `Mimetype` e `Vcard`. A alternativa —
   estreitá-lo por significado — foi rejeitada: exigiria lista escrita à
   mão, que é a família de blocker dos Goals 036 a 041.
3. **A origem de cada valor é classificada em categoria nomeada, e duas
   categorias novas entram.** Além das cinco que o Goal pede — corpo da
   rota, configuração de instância, literal em Go, placeholder vazio e
   valor resolvido no chamador — e de `value_computed_by_library_call`,
   entram `value_composed_by_concatenation` (a concatenação é seu próprio
   valor, com cada operando classificado recursivamente e guardado, de
   modo que `ButtonParamsJSON` mostra suas partes em vez de ser reportado
   por um operando só) e `value_bound_differently_per_branch` (um local
   ligado em vários ramos tem **todos** os ramos classificados). A
   segunda nasceu de um defeito real: a rodada 1 lia só a primeira
   ligação de um local, e por isso quatro dos cinco discriminadores de
   botão de `send_service.go:1740-1753` não eram vistos. A alternativa —
   reportar a concatenação pela categoria de um operando — foi rejeitada:
   um envelope JSON colado em volta de um campo do corpo recebido não é o
   campo do corpo recebido, e chamá-lo assim esconderia o envelope.
4. **Os dois conjuntos são asseridos elemento a elemento, no teste, nunca
   dentro da regra.** O conjunto de escritas cuja origem não é o relé tem
   88 membros, cada um com arquivo, linha, tipo de mensagem, campo e
   categoria, e exatamente um é configuração de instância
   (`pkg/whatsmeow/service/whatsmeow.go:1806`). O conjunto de literais
   não vazios que alcançam campo portador tem 27 membros, cada um com
   arquivo, linha, conteúdo e campos alcançados. Só
   `value_is_empty_placeholder` fica isento do primeiro conjunto, por ser
   a ausência de valor; `value_computed_by_library_call` **não** fica, e
   essa isenção de categoria inteira, que a rodada 1 fazia, foi removida.
   A alternativa — reprovar a enumeração dentro do guard ao ver um
   literal — foi rejeitada: manter a árvore verde exigiria então uma
   allowlist de arquivo e linha **dentro da regra**, que o critério 4
   proíbe. A asserção mora no teste, como o Goal manda para o conjunto
   fora do relé.
5. **A fronteira é atravessada por valor, e cada lado é lido na sua
   língua.** No Go, o caminho completo de cada uma das 94 rotas
   registradas é computado por AST — prefixo do grupo mais caminho do
   registro —, `EVOLUTION_SEND_TEXT_PATH` é lido de
   `apps/ai-orchestrator/.env.example` como `CHAVE=VALOR`, e o
   encadeamento segue **o valor que o handler liga do corpo recebido**,
   do registro ao handler e ao serviço, terminando em sítio de saída com
   origem relé. No TypeScript, o default de `src/config/env.ts` é
   computado pela forma da declaração e comparado ao `.env.example`.
   Chave ausente, arquivo ausente, caminho que não é rota registrada e
   divergência entre os dois lados reprovam — nunca pulam. A alternativa
   — o guard Go parsear TypeScript, ou o teste TypeScript parsear Go —
   foi rejeitada: duplicaria dois parsers para provar uma igualdade de
   string.
6. **A divergência com o Goal é declarada, e vira achado, não correção.**
   O Goal042 afirmava achado zero. O AST enumera 27 literais não vazios
   alcançando campo portador. Vinte e seis são discriminadores de
   protocolo, MIME types, envelopes JSON e marcas de formatação. O
   vigésimo sétimo, `"Ver Menu"`
   (`pkg/sendMessage/service/send_service.go:1960`), é prosa de produto
   composta dentro do fork de transporte e entregue ao número da cliente
   quando o chamador manda `ButtonText` vazio. Ele virou **A-24**,
   `PENDENCIA-POS-MVP` — rebaixado de bloqueador pela regra de §6, por
   não haver reprodução executável: a rota que o alcança é
   `POST /send/list`, e nenhum arquivo de `apps/ai-orchestrator/src` ou
   de `apps/bff/src` a chama. A alternativa — editar o fork e trocar o
   literal — é proibida pelo §5 do Goal e foi rejeitada.

**Alternativas:** continuar declarando `apps/evolution-go/` como limite —
rejeitada no item 1; lista de campos portadores escrita à mão —
rejeitada no item 2; reportar uma concatenação pela categoria de um
operando, e um local pela sua primeira ligação — rejeitadas no item 3,
a segunda por defeito observado; allowlist de arquivo e linha dentro da
regra para manter a árvore verde — rejeitada no item 4; um lado parsear
a língua do outro — rejeitada no item 5; corrigir `"Ver Menu"` no fork —
rejeitada no item 6.

**Motivo:** o risco próprio deste Goal — descobrir demais, transformando
recibo, presença, histórico, mídia, enquete e reação em resíduo, ou
provar o lado errado, afirmando runtime a partir de leitura de código —
só se evita computando o conjunto pela forma real do código, derivando o
campo portador das declarações de proto, e escrevendo em todo lugar que o
que se prova é o que a árvore diz.

**Consequências:** `apps/evolution-go/pkg/transportguard/` é um pacote
novo com `Enumerate`, `DeriveCarrierFields`,
`DeriveTransportPackagePaths`, `DiscoverProductionGoFiles`,
`SourceCategory`, `SiteCategory`, `OffRelaySources`,
`GoProseLiteralsReachingTransport`, `RegisteredRoute`, `RouteChain`,
`RouteWithPath`, `ChainFrom` e `ReadEnvFileValue`.
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` ganha
`readEnvSchemaDefault`, `readEnvFileValue`,
`computeBoundaryValueCrossing`, `BoundaryValueReading` e
`BoundaryValueCrossing`; nada do que o Goal041 deixou ali foi alterado.
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha 4
casos ao lado dos 66 já existentes (70 no total). Nenhum arquivo de
`apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/`
mudou, nenhum arquivo Go de produção mudou, `go.mod` e `go.sum` estão
intocados, nenhum arquivo de `tools/ia-loop/` foi editado em rodada
nenhuma, e `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e
`VOCABULARIO_DE_ESPERA` continuam idênticos aos da baseline. `go test
./...` em `apps/evolution-go`: 152 testes, 0 falhas (baseline 133).
`npm run validate:core`: `PASSED`, com `audit:static` mantendo os 34
checks. `npm run test:gate`: 226 testes, 0 falhas. FINAL_AUDIT §18
recontado em §19: 0 `BLOQUEADOR-MVP`, **8** `PENDENCIA-POS-MVP` e 6
`LIMITE-DECLARADO` — a diferença é A-24. Este diff não fecha **M4**, não
afirma fidelidade visual à referência aprovada, não liga a verificação de
resposta em produção e **não afirma comportamento de runtime do serviço
Go**. `validate:integration` recusou por pré-condição de banco ausente
(`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado como ausente.
**Defeito conhecido do harness, declarado e não consertado aqui:** a
correção de `scopeRelativePattern` em
`tools/ia-loop/lib/deterministic-executor.mjs` existe só na worktree do
Goal041; enquanto não for integrada, o gate `targeted-tests` reprova com
`No test files found, exiting with code 1`. Nenhum arquivo de
`tools/ia-loop/` foi tocado nesta rodada, e a execução manual equivalente
está no relatório.

**Revisar se:** o transporte passar a compor mensagem por um caminho que
o encadeamento por valor não segue — canal, closure guardada em campo,
reflexão —, o que exigiria estender `ChainFrom`, não allowlist; um campo
portador passar a ser alimentado por uma forma nova, que hoje viraria
resíduo nomeado; `whatsmeow-lib/` deixar de ser vendorizada, o que mudaria
a derivação do caminho do pacote de proto; ou o produto passar a usar
`POST /send/list`, que é a condição que transformaria **A-24** em defeito
observável por uma cliente.

## D-059 — A rota de transporte que o produto alcança é enumerada por forma da expressão de caminho, o alcance de literal de prosa por rota é computado por AST, e a condição do `Revisar se` de D-058 passa de prosa a invariante vigiada, propostas no Goal043

**Status:** ACCEPTED no [review043](reviews/043-review.md) (rodada 3 de 3,
2026-09-21, zero blockers; as rodadas 1 e 2 tiveram 4 e 2 blockers), pelo
Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018) — registro corrigido
no fechamento do Goal044, que o fechamento do Goal043 tinha deixado como
`proposta`. Cobre o diff043 (WU-01 a WU-06) sobre a baseline aceita
`f48bf9b5ed38937a763cc1796220778fc60dae3c` (fechamento do Goal042); sem
commit e sem deploy. Não fecha nem reabre nenhum achado — **A-24
continua `PENDENCIA-POS-MVP`, não corrigido**; A-04 a A-08, A-11 a A-17
e A-19 não são tocados, e nenhum achado fechado (A-01 a A-03, A-09,
A-10, A-18, A-20 a A-23) é reaberto. Registrado em [FINAL_AUDIT
§20](FINAL_AUDIT.md), que **não reescreve** §19 nem a entrada de A-24
ali. Não altera nenhuma decisão anterior — reusa e não altera D-018,
D-050, D-057 e D-058.

**Contexto:** o `Revisar se` de D-058 tinha deixado uma condição em
prosa: "o produto passar a usar `POST /send/list`, que é a condição que
transformaria A-24 em defeito observável por uma cliente". A frase que
justificava o rebaixamento de A-24 em §19 — "a rota que alcança esse
literal é `POST /send/list`, e nenhum arquivo de
`apps/ai-orchestrator/src` ou de `apps/bff/src` a chama" — era uma
leitura manual do código na baseline do Goal042, sem guard que a
recomputasse a cada mudança de árvore. O transportguard do Goal042 tinha
duas metades que ainda não se cruzavam: enumerava rota registrada
(`discoverRegisteredRoutes`) e enumerava literal alcançando campo
portador (`GoProseLiteralsReachingTransport`), mas nada ligava um
literal à rota que o alcança, e nada do lado TypeScript enumerava qual
rota o produto de fato chama.

**Decisão:**

1. **A rota que o produto alcança no serviço Go é um arquivo de valores,
   lido pelos dois lados, nunca digitado dentro de um teste.**
   `apps/ai-orchestrator/tests/support/product-transport-routes.txt`
   nomeia 10 rotas (`MÉTODO CAMINHO`, com `{}` marcando segmento
   interpolado). `discoverGoServiceHttpRequests`
   (`http-egress-sites.ts`) computa o mesmo conjunto lendo
   `apps/ai-orchestrator/src` e `apps/bff/src` inteiros — reaproveitando
   a classificação de sítio de `discoverHttpEgressSites` (Goal041) para
   o `fetch` cru, e acrescentando reconhecimento de cliente HTTP interno
   por forma de classe (URL base de campo ligado no construtor, caminho
   do argumento do método, nunca nome de arquivo, pasta ou classe) — e
   os dois conjuntos são comparados nas duas direções. A leitura é
   fail-closed sítio a sítio: destino que não está escrito na expressão
   da URL é resolvido pela categoria que o Goal041 já computava —
   parâmetro em trânsito resolvido nos chamadores (é assim que
   `GET /health`, de `apps/bff/src/routes/health.ts`, entra no conjunto),
   campo de construtor tratado pela varredura de cliente, egresso
   genérico sem chamador — e o que fica de fora é devolvido em
   `notGoBound` com o motivo escrito, nunca descartado por um `continue`
   silencioso. Categoria não prevista derruba a leitura. Por isso o
   conjunto tem 10 rotas, e não as 9 que o §1 do Goal nomeia: a décima é
   `GET /health`, cujo destino chega por parâmetro. A alternativa —
   digitar a lista de rotas dentro do teste TypeScript e do teste Go,
   cada um com a sua — foi rejeitada: são exatamente as duas cópias
   divergentes que a fronteira de linguagem convida a criar, e o arquivo
   de valores existe para que nenhum dos dois lados a digite.
2. **O casamento contra rota registrada é segmento por segmento, com
   `{}` batendo só contra parâmetro de rota.** `MatchProductTransportRoutes`
   (`product_routes.go`, pacote novo) casa as 10 entradas contra as 94
   rotas que `discoverRegisteredRoutes` já enumerava; `routePathSegmentsMatch`
   recusa `{}` contra segmento literal e recusa comparação de string
   inteira — as duas formas que deixariam uma rota de grupo escapar sem
   ninguém notar. As 10 entradas casam, cada uma, com exatamente uma
   rota; as outras 84 ficam contadas em `Unreached`, não reprovadas — o
   produto não chamar uma rota que este serviço expõe não é travessia de
   fronteira a provar. A alternativa — comparar caminho como string
   inteira — foi rejeitada: falharia toda rota registrada dentro de
   grupo, cujo prefixo é montado, não escrito no sítio de registro.
3. **O alcance de literal por rota é computado por AST, sobre-
   aproximando a partir do handler — a mesma direção fail-closed que
   [D-058 item 3](#d-058--o-guard-atravessa-a-fronteira-de-serviço-em-vez-de-continuar-declarando-limite-o-campo-portador-é-derivado-das-declarações-de-proto-e-a-fronteira-é-atravessada-por-valor-com-cada-lado-lido-na-sua-língua-propostas-no-goal042)
   já tinha escolhido.** `ProseReachFrom` (`route_reach.go`, pacote
   novo) segue toda declaração de produção que o handler de uma rota
   alcança e reporta todo literal não vazio que algum sítio dessa reach
   escreve em campo portador. Das 10 rotas do produto, 9 têm handler para
   seguir e 1 é recusada com o motivo escrito — `GET /health`, cujo
   handler registrado é um closure local (`pkg/routes/routes.go:82`), não
   declaração de método desta árvore. `ProseReachOfRoutes` passou a
   contar essa recusa como `ProseReachOfEveryRegisteredRoute` já
   contava, em vez de falhar: rota sem código de produção a percorrer não
   tem nada a provar, e continuar falhando ali obrigaria a estreitar o
   conjunto alcançado, que é a direção errada. Das 9 percorridas, só
   `POST /send/text` escreve em campo portador e alcança zero
   literais. Das 94
   rotas registradas, 84 têm handler para seguir (10 recusadas com
   motivo escrito) e 5 delas alcançam, juntas, os mesmos 27 literais que
   o Goal042 já tinha asserido — resíduo zero nos dois sentidos entre a
   reach e o conjunto do Goal042. A alternativa — seguir só o valor que
   o handler liga do corpo recebido (a leitura estreita que `ChainFrom`
   já fazia) — foi rejeitada como leitura única: a reach larga é mantida
   ao lado da estreita, nunca no lugar dela, e um teste prova que a
   larga contém tudo que a estreita alcança.
4. **A condição do `Revisar se` de D-058 é computada e vigiada, não
   apenas nomeada de novo.** O conjunto de literais alcançáveis a partir
   das 10 rotas do produto é asserido vazio
   (`TestProseLiteralsReachedFromAProductRouteAreAssertedElementByElement`).
   `TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct`
   deriva a posição do literal de A-24 do próprio conjunto que o guard
   computa — nunca digitada —, deriva as rotas que o alcançam, deriva as
   rotas que o produto chama, e prova que os dois conjuntos são
   disjuntos. Se o produto passasse a chamar `POST /send/list`, o
   conjunto vazio deixaria de o ser e o teste reprovaria nomeando
   arquivo, linha, conteúdo e rota. A alternativa — deixar a condição
   como nota em `Revisar se`, sem teste que a vigie — é a mesma lacuna
   que este item fecha.
5. **A-24 não é corrigido, e não pode ser.** O §5 do Goal042 proibia
   editar o fork de transporte, e este Goal não revisita essa proibição.
   A entrada de A-24 em FINAL_AUDIT §19 não é reescrita; §20 registra
   apenas que o motivo do rebaixamento mudou de natureza — de prosa lida
   à mão para invariante computada a cada execução —, não que o achado
   fechou.

**Alternativas:** rota do produto digitada dentro de cada teste, sem
arquivo de valores compartilhado — rejeitada no item 1; casamento de
caminho por string inteira — rejeitada no item 2; ler só o valor que o
handler liga do corpo recebido, sem a reach larga — rejeitada no item 3;
deixar a condição de A-24 como prosa em `Revisar se`, sem teste — é a
lacuna que o item 4 fecha; editar o fork para corrigir `"Ver Menu"` —
proibida pelo §5 do Goal042, rejeitada no item 5.

**Motivo:** o risco próprio deste Goal — declarar de novo, em prosa, uma
condição que já tinha sido declarada em prosa por D-058 — só se evita
computando os dois lados do cruzamento (rota que o produto chama, rota
que um literal alcança) e deixando um teste, não um documento, vigiar a
condição que os separa.

**Consequências:**
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` é
arquivo de valores novo, com 10 rotas.
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` ganha
`discoverGoServiceHttpRequests`, `GoBoundHttpRequest`,
`AssembledUrlForDelivery`, `GoServiceHttpRequestDiscovery`,
`ProductTransportRoute`, `NonGoBoundEgressSite` e
`readProductTransportRoutesFile`; nada do que os Goals 041 e 042 deixaram
ali foi alterado.
`apps/evolution-go/pkg/transportguard/product_routes.go` (novo) exporta
`ProductRouteEntry`, `ReadProductTransportRoutesFile`,
`ProductRouteMatch`, `ProductRouteMatchReport` e
`MatchProductTransportRoutes`.
`apps/evolution-go/pkg/transportguard/route_reach.go` (novo) exporta
`ReachedProseLiteral`, `RouteProseReach`, `RouteReachRefusal`,
`ProseReachReport`, `ProseReachFrom`, `ProseReachOfRoutes` e
`ProseReachOfEveryRegisteredRoute` — as duas últimas devolvem
`ProseReachReport`, com recusa contada e motivo escrito, e a segunda é a
primeira aplicada a `e.Routes`. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
ganha 15 casos ao lado dos 70 já existentes (85 no total): 7 provam o
casamento do conjunto de rotas nos dois sentidos (WU-02), 4 são controles
negativos deste critério (WU-05), e 4 provam que nenhum sítio de egresso
é descartado em silêncio e que o destino que só existe no chamador entra
no conjunto. `apps/evolution-go/pkg/transportguard/negative_controls_test.go`
ganha os controles negativos 2, 3 e 4 deste critério, cada um sobre
árvore sintética em diretório temporário, sem resíduo. Nenhum arquivo de
`apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/`
mudou, nenhum arquivo Go de produção mudou, `go.mod` e `go.sum` estão
intocados, e `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e o conjunto de
88/27 membros que o Goal042 asseria continuam idênticos aos da baseline.
`go test ./...` em `apps/evolution-go`: PASS em todos os pacotes, 0
falhas. `npx vitest run tests/assistant/assistant.service.test.ts`: 85
testes, 0 falhas (baseline 70). `npx vitest run` completo de
`apps/ai-orchestrator`: 809 passando, 88 pulados (baseline 794
passando). `npm run validate:core`: `PASSED`, 15 passos verdes e 2
pulados declarados, com `audit:static` mantendo os 34 checks. `npm run
test:gate`: 226 testes, 0 falhas — mesma contagem da baseline. FINAL_AUDIT
§19 recontado em §20: 0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP` e 6
`LIMITE-DECLARADO` — inalterado em relação a §19, sem achado novo e sem
achado corrigido. Este diff não fecha **M4**, não afirma fidelidade
visual à referência aprovada, não liga a verificação de resposta em
produção, **não afirma comportamento de runtime do serviço Go** e **não
corrige A-24**. `validate:integration` recusou por pré-condição de banco
ausente (`exit 2`, `BFF_TEST_DATABASE_URL is not set`), declarado como
ausente — nenhum valor real de variável de ambiente é lido por nada
neste diff.

**Revisar se:** um literal novo passar a alcançar uma das 10 rotas do
produto — o teste que assere esse conjunto vazio reprovaria, nomeando
arquivo e linha, e a condição deste D-059 estaria satisfeita; o produto
passar a chamar uma rota nova do serviço Go — exigiria linha nova em
`product-transport-routes.txt`, e o casamento reprovaria até ela
existir; o serviço Go ganhar uma rota registrada por forma que
`discoverRegisteredRoutes` não reconhece — este Goal não estende esse
descobridor, herdado do Goal042; ou `apps/evolution-go/` deixar de ser o
único ponto de fronteira de serviço do transporte — decisão que nenhum
Goal desta série toma.

## D-060 — O chamador seguido por ligação importada atravessa arquivo, e a superfície do cliente HTTP interno é derivada por alcançabilidade em vez de três nomes fixos, propostas no Goal044

**Status:** ACCEPTED no [review044](reviews/044-review.md) (rodada 4 de 4,
2026-09-21, zero blockers; as rodadas 1, 2 e 3 tiveram 5, 3 e 1 blocker,
todos da mesma família — mecanismo que se desligava em silêncio por não
reconhecer a forma, ou documento afirmando que um controle exercitava o
que ele não exercitava), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md),
D-018). Cobre o diff044 (WU-01 a WU-05 da rodada 1, mais FIX-001 das
rodadas 2, 3 e 4 — a última mudança de árvore é a indexação da varredura
de egresso genérico por declaração, e não por nome de primitivo) sobre a
baseline aceita `3ea06738a8833a3b28801258f4626632c5888983` (fechamento do
Goal043); sem commit e sem deploy. Uma observação não bloqueante ficou
registrada no review: `discoverGoBoundInternalClientRequests` ainda
deduplica classe de cliente por **nome** (`classSurfaces.has(classSpan.name)`),
herdado do Goal043 — duas classes homônimas em arquivos diferentes fariam
a segunda ser avaliada contra a superfície da primeira. É a mesma família
do blocker fechado na rodada 4, um nível acima, e não morde na árvore real,
que tem uma classe só. Não fecha nem reabre nenhum achado — **A-24 continua
`PENDENCIA-POS-MVP`, não corrigido**; A-04 a A-08, A-11 a A-17 e A-19 não
são tocados, e nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a
A-23) é reaberto. Registrado em [FINAL_AUDIT §21](FINAL_AUDIT.md), que
**não reescreve** §4 a §20. Não altera nenhuma decisão anterior — reusa e
não altera D-018, D-057, D-058 e D-059.

**Contexto:** o [review043](reviews/043-review.md) registrou, como
observação não bloqueante, duas bordas em que a completude do conjunto de
10 rotas do Goal043 não era fail-closed. Primeira: `discoverGoServiceHttpRequests`
só seguia chamador de `caller_resolved_base_url_via_*` no mesmo arquivo do
sítio — um helper exportado com chamador em outro arquivo cairia em
`notGoBound` com motivo factualmente errado, em vez de derrubar a leitura.
Segunda: a superfície pública do cliente HTTP interno era reconhecida por
três nomes de método fixos (`request`, `requestWithStatus`,
`requestBinary`) — um método público novo que delegasse a um membro
`private` que chamasse `fetch` não acrescentaria sítio algum, e por isso
não seria pego pelo resíduo de egresso cru herdado do Goal041. Nas duas, a
rota nova sairia do conjunto sem registro.

**Decisão:**

1. **O chamador é seguido por ligação importada, nunca por nome igual solto
   entre arquivos.** `findCrossFileCallerBindings`
   (`apps/ai-orchestrator/tests/support/http-egress-sites.ts`) lê toda
   declaração `import ... from` das duas árvores, resolve especificador
   relativo a caminho de arquivo (`resolveModuleSpecifierToFilePath`) e liga
   o alias local de cada import ao nome exportado pelo sítio
   (`resolveModuleExportBindings`). Um mesmo nome pode sair do módulo por
   mais de uma ligação — a declaração exportada e uma lista
   `export { nome as outro };`, por exemplo —, e **todas** são seguidas:
   reconhecer a primeira não silencia as demais, e construção `export`
   posterior em forma não convertível derruba a leitura do mesmo jeito.
   `discoverCallerResolvedGoBoundRequests` varre
   os chamadores reais do arquivo do sítio mais os de todo arquivo ligado
   dessa forma. Forma que a resolução não converte em arquivo conhecido —
   reexportação (nomeada ou `export *`), import dinâmico, especificador não
   relativo, ou referência importada e reexportada adiante — derruba a
   leitura com `arquivo:linha`, nunca é tratada como ausência de chamador. A
   alternativa — casar chamador por nome de função igual em qualquer
   arquivo, sem olhar o import — foi rejeitada: casaria funções homônimas
   sem relação alguma, que é exatamente o motivo pelo qual a fronteira de
   arquivo existia.
2. **A superfície do cliente HTTP interno é computada da declaração da
   classe, nunca de uma lista de nomes.** `computeInternalClientMemberSurface`
   varre todo membro de topo da classe e marca como alcançando `fetch` o que
   chama `fetch` no próprio corpo, ou que delega — via `this.<membro>(...)` —
   a outro membro que alcança, seguindo a cadeia de delegação até o fim (um
   ciclo derruba a leitura, nomeando o membro). Membro `private`/`protected`
   que alcança `fetch` é excluído da superfície com o motivo escrito: não é
   chamável como `this.<campo>.<membro>(...)` de fora da classe. O método
   HTTP default de um membro da superfície é o do único `fetch` do próprio
   corpo, quando estático — nunca mais um `requestBinary` como caso
   especial hardcoded. A alternativa — acrescentar nomes de método
   reconhecidos um a um, conforme aparecerem — foi rejeitada: é a mesma
   allowlist escrita à mão que a segunda borda do review043 apontava.
3. **As duas bordas foram exercitadas antes de fechar, não só depois.** Os
   quatro controles negativos deste critério provam, cada um sobre árvore
   sintética em diretório temporário: a chamada por outro arquivo, ligada
   por import com alias, não era reconhecida antes de `findCrossFileCallerBindings`
   e passa a ser depois (controle 1); um método público **sem `fetch`
   próprio** só vira rota quando passa a delegar ao membro `private` que
   tem o `fetch` — antes da delegação, a chamada a ele é contada fora com
   o motivo derivado da declaração; depois, a mesma chamada entra no
   conjunto, e o caso-limite em que o membro público ainda não existe na
   classe derruba a leitura com `arquivo:linha` (controle 2);
   reexportação e import dinâmico derrubam a leitura em vez de afirmar que
   os chamadores lidos não passam chave de base (controle 3); e mover e
   renomear helper, classe, arquivos e pastas das duas mecânicas não muda a
   classificação computada (controle 4). Os quatro removem a própria árvore
   sintética ao fim, sem nunca tocar a árvore real.
4. **Forma que a leitura não reconhece derruba, e o que ela reconhece sai
   enumerado.** A forma de exportação é computada das construções `export`
   do arquivo — `export function`, `export default function`,
   `export const/let/var`, lista `export { nome }`, lista com alias (e o
   import resolvido pelo **nome exportado**) e `export default nome;`; o
   veredito `not_exported` só é dado depois de conferir que o nome está
   declarado e que nenhuma construção `export` o menciona, e menção em
   forma não convertível em ligação importável derruba com `arquivo:linha`.
   O nome de um membro de classe é derivado da declaração, inclusive na
   forma de propriedade-arrow, e validado — forma sem nome derivável
   derruba. Toda chamada `this.<campo>.<membro>(` sobre um cliente apontado
   ao serviço Go é classificada: rota, contagem fora com motivo
   (`nonTransportMemberCalls`), ou recusa quando o membro não está na
   declaração da classe. E a enumeração exigida sai do descobridor —
   `internalClientSurfaces`, `nonTransportMemberCalls` e
   `callerResolutions` —, conferida por afirmação permanente sobre a
   árvore real. Desligar um mecanismo em silêncio por não reconhecer a
   forma é a falha que este item fecha.
5. **Nenhum motivo devolvido para fora do conjunto afirma algo sobre um
   chamador que não foi lido.** Todo sítio `caller_resolved_base_url_via_*`
   contado em `notGoBound` relata quantos chamadores foram lidos e em
   quantos arquivos (`"N chamador(es) lido(s) em M arquivo(s)"`) — antes do
   WU-01, o motivo nomeava só a ausência de chave de base, sem dizer que só
   um arquivo tinha sido varrido. Sete afirmações permanentes (WU-03) sobre
   a árvore real consomem os dois mecanismos ao lado das que o Goal043 já
   deixava, sem relaxar, pular ou remover nenhuma delas.

**Alternativas:** casar chamador por nome de função igual, sem olhar
import — rejeitada no item 1; lista de nomes de método reconhecidos escrita
à mão — rejeitada no item 2; fechar as duas bordas sem controle negativo
que prove o estado anterior aberto — é a lacuna que o item 3 fecha; motivo
de `notGoBound` que não nomeia quantos chamadores foram lidos — é a lacuna
que o item 5 fecha; desligar a varredura entre arquivos, ou pular uma
chamada a membro, por não reconhecer a forma — é a lacuna que o item 4
fecha.

**Motivo:** o risco próprio deste Goal — declarar as duas bordas fechadas
sem prova de que estavam abertas antes, ou fechar uma trocando uma
allowlist por outra — só se evita computando a ligação entre arquivos pela
forma real do import, derivando a superfície do cliente da alcançabilidade
real da classe, e provando com controle negativo, sobre árvore sintética,
que cada borda mordia antes do mecanismo existir.

**Consequências:**
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` ganha
`NamedImportBinding`, `ParsedImportDeclaration`, `parseBindingListItem`,
`findImportDeclarations`, `findDynamicImportSpecifiers`,
`findReexportDeclarations`, `findForwardedExportLine`,
`resolveModuleSpecifierToFilePath`, `resolveModuleExportBindings`,
`describeExportBindings`, `CallerFileBinding`, `dedupeCallerFileBindings`,
`findCrossFileCallerBindings`,
`findLocalExportListBindings`, `exportConstructText`,
`findExportConstructs`, `ModuleExportBinding`, `wordSpanEndingAt`,
`NOT_A_CLASS_MEMBER_NAME`, `CallerResolutionReport`,
`InternalClientSurfaceReport`, `NonTransportMemberCall`,
`NonReachingClassMember`, `InternalClientMemberSurface`,
`staticFetchMethodOfMember`, `computeInternalClientMemberSurface` e
`isNonPublicClassMember`; nada do que os Goals 041 a 043 deixaram ali foi
removido, e `discoverCallerResolvedGoBoundRequests` e
`discoverGoBoundInternalClientRequests` passam a devolver, respectivamente,
a contagem de chamadores/arquivos lidos e a superfície computada, em vez do
que liam antes. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
ganha 28 casos ao lado dos 85 já existentes (113 no total): 7 são
afirmações permanentes que consomem os dois mecanismos sobre a árvore real
e conferem a enumeração devolvida pelo descobridor (WU-03), 9 são
controles sintéticos de fail-closed das formas (exportação — inclusive o
mesmo nome saindo por duas ligações —, nome de membro e chamada a membro
fora da superfície), 4 provam o egresso genérico varrido também pelo nome
local do import com alias, e 8 são os quatro controles
negativos deste critério, dois deles com par antes/depois (WU-04). Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`
(fora do teste de apoio) ou `apps/ai-orchestrator/src/` mudou, nenhum
arquivo Go mudou, `go.mod` e `go.sum` estão intocados, e o conjunto de 10
rotas e de 27 literais que os Goals 042 e 043 asseriam continua idêntico ao
da baseline. `npx vitest run tests/assistant/assistant.service.test.ts`:
113 testes, 0 falhas (baseline 85). `npx vitest run` completo de
`apps/ai-orchestrator`: 837 passando, 88 pulados (baseline 809 passando,
88 pulados). `go test ./...` em `apps/evolution-go`: PASS em todos os
pacotes com teste, 0 falhas — nenhum pacote Go foi tocado por este diff.
`npm run lint` e `npm run typecheck` em `apps/ai-orchestrator`: sem erro.
`npm run validate:core`: `PASSED`, 15 passos verdes e 2 pulados declarados
(`test:bff`, `test:health-worker`), com `audit:static` mantendo os 34
checks. `npm run test:gate`: 226 testes, 0 falhas — mesma contagem da
baseline. FINAL_AUDIT §20 recontado em §21: 0 `BLOQUEADOR-MVP`, 8
`PENDENCIA-POS-MVP` e 6 `LIMITE-DECLARADO` — inalterado, sem achado novo e
sem achado corrigido. Este diff não fecha **M4**, não afirma fidelidade
visual à referência aprovada, não prova comportamento de runtime do
serviço Go e **não corrige A-24**. `validate:integration` recusou por
pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarado como ausente — nenhum valor
real de variável de ambiente é lido por nada neste diff.

**Revisar se:** um chamador alcançar o sítio por uma forma que
`findCrossFileCallerBindings` ainda não resolve — alias de caminho não
relativo, reflexão, ou reexportação seguida de reimportação em cadeia —,
o que hoje derruba a leitura em vez de resolver; um cliente HTTP interno
ganhar um membro público que só delega por forma não reconhecida por
`computeInternalClientMemberSurface` (por exemplo, `this["campo"][membro]`
por acesso computado); ou o serviço Go ganhar um sítio de egresso por uma
forma de cliente inteiramente nova, que nem a leitura de `fetch` cru nem a
de classe reconhecem — nenhum dos dois mecanismos deste Goal estende o
reconhecimento de forma além do que já cobriam.

## D-061 — A identidade da classe de cliente é a declaração, a instanciação é reconhecida por ligação, e destino de instanciação não resolvido recusa enquanto destino fora do transporte é enumerado, propostas no Goal045

**Status:** ACCEPTED no [review045](reviews/045-review.md) (rodada 3 de 3,
2026-09-21, zero blockers; as rodadas 1 e 2 tiveram 3 e 1 blocker — o de
maior peso na rodada 1 foi a isenção por construção `export` apagando a
categoria `class_binding_reference_forwarded_as_value`, e os demais da
família já conhecida de varredura ou contagem afirmada além do que a
leitura exerceu), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md),
D-018). Cobre o diff045 (WU-01 a WU-05 da rodada 1 — a chave por
declaração, o reconhecimento de instanciação por ligação, a dupla saída de
destino, as afirmações permanentes e a não-vacuidade, e os quatro
controles negativos com árvore sintética montada e revertida — mais
FIX-001 das rodadas 2 e 3: `exportConstructBindingRange`,
`scannedFilePathsForInstantiation` acumulado pela varredura, e a descrição
das cinco categorias de recusa corrigida para o que o código faz; a última
mudança de árvore é essa correção de documentação) sobre a baseline aceita
`d9b2416193194e6fd8eef58e18988a5585c40628` (fechamento do Goal044); sem
commit e sem deploy. Quatro observações não bloqueantes ficaram
registradas no review, nenhuma sobre invariante afrouxada:
`findTopLevelAssignmentIndex` conta `<`/`>` por heurística textual; esta
decisão não nomeia dois casos marginais de recusa (declaração fora das
duas árvores e arquivo ligado com texto fora do conjunto lido), sendo
incompleta e não falsa; a isenção por construção `export` é recortada por
forma textual, de modo que uma forma de declaração exportada fora de
`type`/`interface`/`class`/`const`/`let`/`var` isenta a construção
inteira; e as observações opcionais dos reviews 040 e 041 continuam
abertas.
Fecha as três bordas que a observação não bloqueante do
[review044](reviews/044-review.md) e a conferência deste Goal registraram
sobre `discoverGoBoundInternalClientRequests`. Não fecha nem reabre
achado nenhum — **A-24 continua `PENDENCIA-POS-MVP`, não corrigido**;
A-04 a A-08, A-11 a A-17 e A-19 não são tocados, e nenhum achado fechado é
reaberto. Registrado em [FINAL_AUDIT §22](FINAL_AUDIT.md), que **não
reescreve** §4 a §21. Não altera nenhuma decisão anterior — reusa e não
altera D-057 a D-060.

**Contexto:** a observação não bloqueante do review044 registrou que
`discoverGoBoundInternalClientRequests` ainda deduplicava classe de
cliente por **nome** (`classSurfaces.has(classSpan.name)`,
`http-egress-sites.ts:2558` na baseline). A conferência deste Goal achou
mais duas bordas na mesma família, no mesmo descobridor:
`findClassInstantiations` achava instanciação por `RegExp` sobre o nome
da classe aplicada a todo arquivo das duas árvores, sem resolver a
ligação local — errando para mais (classe homônima não relacionada) e
para menos (instanciação sob alias de import, que o padrão textual não
casa); e `resolveDestination` recebia o primeiro argumento do construtor
com `parameterNames` vazio, de modo que uma instanciação cujo destino
viesse indireto (parâmetro do próprio construtor da classe dona, por
exemplo) era descartada por um `continue` mudo, sem virar requisição, sem
virar resíduo e sem derrubar a leitura.

**Decisão:**

1. **A identidade da classe de cliente é o sítio de declaração, nunca o
   nome.** `classSurfaces` é indexado por `classDeclarationKey`
   (`${filePath}:${classSpan.line}`, formato já usado por
   `scannedPrimitiveDeclarations`), não por `classSpan.name`. Duas
   classes homônimas declaradas em arquivos diferentes produzem duas
   entradas em `internalClientSurfaces`, cada uma com sua própria
   superfície computada por `computeInternalClientMemberSurface` e sua
   própria varredura de instanciação; nenhum casamento posterior usa
   `className` isolado como chave — o campo continua no relatório só
   para leitura humana, ao lado de `filePath` e `classLine`.
2. **A instanciação só conta quando a ligação local resolve até aquela
   declaração.** `findInstantiationsOfClassDeclaration` chama
   `resolveClassInstantiationBindings`, que reusa a máquina de ligação do
   Goal044 (`findImportDeclarations`, `resolveModuleSpecifierToFilePath`,
   `resolveModuleExportBindings`) para achar, em cada arquivo candidato
   das duas árvores, a forma pela qual o identificador usado em
   `new <Id>(` chega até a declaração: `local_declaration`,
   `named_import`, `aliased_named_import` ou `default_import`
   (`ClassBindingForm`). Só então `findClassInstantiations` varre aquele
   arquivo, e só pelo nome local que a ligação resolveu — nunca pelo nome
   da declaração solto. Nome igual sem ligação resolvida não é varrido;
   alias resolvido (`import { C as Alias }` / `new Alias(`) é varrido e
   entra. `refuseClassReferencesOutsideInstantiation` derruba quando o
   identificador ligado aparece em posição de valor fora de `new <Id>(`
   — referência repassada adiante que esta leitura não percorre. **A
   isenção por construção `export` é do lado de LIGAÇÃO, nunca do lado de
   valor** (`exportConstructBindingRange`, correção da rodada 2): estar
   dentro do texto de um `export` não isenta o lado direito de
   `export const X = <Classe>;` nem o que vem depois de `extends` em
   `export class Sub extends <Classe> {`, que recusam como qualquer outro
   repasse; `export type` e `export interface` seguem isentos inteiros,
   por serem posição de tipo. A alternativa — isentar a construção
   inteira, como a rodada 1 fazia — foi rejeitada porque apagava em
   silêncio exatamente a categoria
   `class_binding_reference_forwarded_as_value` nas duas formas em que
   uma classe de transporte mais plausivelmente escapa.
   **`scannedFilePathsForInstantiation` é acumulado pela varredura, nunca
   afirmado de antemão** (correção da rodada 2): quem registra o arquivo
   é `findCrossFileCallerBindings`, no momento em que o abre. Preencher o
   campo com `allSources` reportava a árvore inteira mesmo quando nenhuma
   ligação exportada existia e o laço da varredura não chegava a executar
   — varredura não exercida afirmada como exercida.
3. **Forma de ligação que a resolução não alcança derruba a leitura, com
   `arquivo:linha`, em categoria nomeada — nunca um `continue` mudo.**
   `ClassBindingRefusalCategory` nomeia cinco categorias: duas declarações
   homônimas sem ligação que as distinga
   (`class_binding_homonymous_declarations`), forma de exportação não
   convertível em ligação importável — inclui `export =`
   (`class_binding_export_form_not_resolved`), `module.exports` /
   `exports.<nome>` (`class_binding_commonjs_export`), ligação que
   atravessa arquivo por forma não seguida — reexportação em cadeia,
   import dinâmico, alias de caminho não relativo, import de namespace, ou
   referência importada e reexportada adiante
   (`class_binding_cross_file_form_not_resolved`) — e referência
   repassada como valor (`class_binding_reference_forwarded_as_value`).
   Cada uma derruba com uma mensagem que nomeia o identificador, o
   arquivo e a linha — nenhuma vira ausência de instanciação tratada em
   silêncio.
4. **Destino de instanciação não resolvido recusa; destino fora do
   transporte é enumerado — as duas saídas são distintas e nenhuma é
   muda.** O `continue` que descartava a instanciação sem registro
   (`http-egress-sites.ts:2576-2577` na baseline) não existe mais nesta
   forma. Quando `resolveDestination(candidateSource, callIndex,
   destinationArgText, [])` não resolve o primeiro argumento a chave de
   ambiente alguma, a leitura derruba com `arquivo:linha`, nomeando a
   expressão que não converteu. Quando resolve a uma chave que não é do
   serviço Go, a instanciação entra em `nonGoBoundInstantiations` — fora
   do conjunto alcançado, mas com motivo computado (arquivo, linha, nome
   local, `bindingForm`, chave de ambiente resolvida) — e nunca é
   silenciada.
5. **O motivo escrito só afirma o que a leitura fez.** Toda mensagem de
   recusa e toda entrada de `nonGoBoundInstantiations` cita o
   `bindingForm` resolvido e a `classDeclarationKey` alcançada; nenhuma
   afirma varredura ou ligação que a leitura não exerceu. Duas afirmações
   permanentes (WU-04) provam, sobre a árvore real, que
   `internalClientSurfaces` tem uma entrada por declaração distinta, que
   toda superfície tem ao menos uma ligação de instanciação resolvida e
   registrada, e que toda entrada de `nonGoBoundInstantiations` tem
   motivo escrito e aponta a uma superfície computada — as duas
   invariantes não são vácuas: a árvore real tem `internalClientSurfaces`
   e `nonGoBoundInstantiations` ambos não vazios.

**Alternativas:** continuar deduplicando por `className` — é a borda que
este Goal fecha; achar instanciação por `RegExp` sobre o nome, sem
resolver ligação — é a mesma falha da rodada 3 do Goal044 um nível
abaixo, rejeitada pelo mesmo motivo; manter o `continue` mudo de destino
não resolvido, ou tratá-lo como resíduo genérico sem categoria própria —
rejeitadas: a primeira repete o silêncio que este Goal fecha, a segunda
perderia o `arquivo:linha` e o `bindingForm` que tornam o motivo
conferível.

**Motivo:** com as três bordas abertas havia três formas de acrescentar
uma chamada ao transporte sem que nada no repositório notasse, nenhuma
delas exigindo um `fetch` novo — a mesma classe de risco que motivou
D-060 um nível acima. A-24 continua dependendo da completude do conjunto
de 10 rotas; fechar as três bordas por reuso da máquina de ligação do
Goal044, sem mecanismo paralelo, mantém essa completude propriedade do
mecanismo em vez de acidente da árvore.

**Consequências:**
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` ganha
`findInstantiationsOfClassDeclaration`, `resolveClassInstantiationBindings`,
`ClassBindingForm`, `ClassInstantiationBindingReport`,
`ClassInstantiationBindingResolution`, `ClassBindingRefusalCategory`,
`classBindingRefusal`, `categorizedBindingRefusal`,
`refuseClassReferencesOutsideInstantiation`, `NonGoBoundClassInstantiation`
e `classDeclarationKey`; `classSurfaces` passa a ser `Map<string,
InternalClientMemberSurface>` indexado pela declaração, e
`discoverGoBoundInternalClientRequests` passa a devolver também
`nonGoBoundInstantiations` ao lado de `requests`, `assembledUrls`,
`surfaces` e `nonTransportMemberCalls`. Nada do que os Goals 041 a 044
deixaram ali foi removido ou reescrito em paralelo.
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha 17
casos ao lado dos 113 já existentes (130 no total): 2 são as afirmações
permanentes de não-vacuidade (WU-04), 8 são os quatro controles
negativos obrigatórios (WU-05: classe homônima em outro arquivo,
instanciação sob alias, destino indireto e nome-não-decide), os
controles 1 a 3 com as duas saídas — antes e depois —, e 7 são os
controles permanentes das duas correções da rodada 2 (FIX-001): 5 sobre
a isenção por construção `export` e 2 sobre a enumeração da
varredura. Nenhum arquivo de
`apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/` ou
Go mudou; `go.mod` e `go.sum` estão intocados; o arquivo de valores
`apps/ai-orchestrator/tests/support/product-transport-routes.txt` não
mudou; e o conjunto de 10 rotas e de 27 literais que os Goals 042 e 043
asseriam continua idêntico ao da baseline. `npx vitest run
tests/assistant/assistant.service.test.ts`: 130 testes, 0 falhas
(baseline 113). `npx vitest run` completo de `apps/ai-orchestrator`: 854
passando, 88 pulados (baseline 837 passando, 88 pulados). `go test ./...`
em `apps/evolution-go`: PASS em todos os pacotes com teste, 0 falhas —
nenhum pacote Go foi tocado por este diff. `npx tsc -p tsconfig.json
--noEmit` e `npm run lint` em `apps/ai-orchestrator`: sem erro. `npm run
validate:core`: `PASSED`, 15 passos verdes e 2 pulados declarados
(`test:bff`, `test:health-worker`), com `audit:static` mantendo os 34
checks (33 passados, `production_health` pulado por não solicitado). `npm
run test:gate`: 226 testes, 0 falhas — mesma contagem da baseline.
`npm run validate:integration` recusou por pré-condição de banco ausente
(`exit 2`, `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not
set`), declarado como ausente — nenhum valor real de variável de ambiente
foi lido por nada neste diff. Este diff não fecha **M4**, não afirma
fidelidade visual à referência aprovada, não prova comportamento de
runtime do serviço Go e **não corrige A-24**.

**Revisar se:** um chamador de instanciação alcançar a classe por forma
que `resolveClassInstantiationBindings` ainda não resolve — alias de
caminho não relativo, `export =`/`module.exports`, ou identificador
repassado adiante por atribuição a outro valor que não seja `new <Id>(`
diretamente —, o que hoje derruba a leitura em vez de resolver; ou uma
instanciação real passar a ter destino indireto por uma forma que
`resolveDestination` ainda não converte (hoje: base recebida por
parâmetro do construtor da classe dona), caso em que a leitura derruba
com `arquivo:linha` em vez de classificar às cegas.

## D-062 — A isenção de `export` é allowlist fechada, atribuição não localizada recusa em vez de isentar, e as categorias de recusa existem em runtime, propostas no Goal046

**Status:** ACCEPTED no [review046](reviews/046-review.md) (rodada 2 de 2,
2026-09-21, zero blockers; a rodada 1 teve 2 blockers — o de maior peso
foi a ordem de consulta dentro de
`refuseClassReferencesOutsideInstantiation`, que deixava o caso canônico
do Goal, `export default { Client: <Classe> };`, sair pela isenção de
posição de tipo antes de chegar à faixa `export` não reconhecida, com o
teste entregue afirmando a ausência de recusa; o outro foi a família já
conhecida de número afirmado em documento permanente que a árvore
desmente, 182 onde a suíte prova 205), pelo Tech Lead Agent
([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff046 (WU-01 inverte o
default de `exportConstructBindingRange` para allowlist fechada; WU-02
aplica a mesma inversão à busca do `=` de topo no ramo
`const`/`let`/`var`, reusando a categoria nova de WU-01; WU-03 deriva
`ClassBindingRefusalCategory` de um array `as const` em runtime; WU-04
acrescenta os cinco controles negativos obrigatórios, a afirmação sobre
o array de categorias e as afirmações de não-vacuidade; WU-05 é a
documentação de fechamento — mais as duas correções da rodada 2: a
reordenação fail-closed, que passa a consultar a faixa `export` não
reconhecida **antes** da isenção de posição de tipo, sem alterar o
conteúdo de `TYPE_POSITION_PRECEDING_CHARS`/`TYPE_POSITION_PRECEDING_WORDS`,
com o teste do controle 1 asserindo `toThrow` da categoria nova e do
`arquivo:linha`; e a correção de 182 para 205 nos três documentos
permanentes, com o breakdown 118 + 87; a última mudança de árvore é essa
correção de documentação) sobre a baseline aceita
`42ba1e975591ce03cf36f553f8f7faba085f1fd0`
(fechamento do Goal045); sem commit e sem deploy. Não fecha nem reabre
nenhum achado — A-04 a A-08, A-11 a A-17, A-19 e A-24 não são tocados, e
nenhum achado fechado é reaberto. Não altera nenhuma decisão anterior —
reusa e não altera D-054 a D-061. Quatro observações não bloqueantes
ficaram registradas no review, nenhuma sobre invariante afrouxada: o
critério da recusa escopada à ocorrência é verdadeiro por leitura do
código, sem controle permanente próprio; a asserção permanente de 205
depende do client do Prisma gerado existir nas duas árvores, o que
`validate:core` garante ao rodar os dois builds antes;
`validate:integration` continua recusando por pré-condição de banco
ausente; e as observações opcionais dos reviews 040 e 041 continuam
abertas.

**Contexto:** a observação não bloqueante 3 do [review045](reviews/045-review.md)
registrou que `exportConstructBindingRange` terminava em `return whole`:
toda construção `export` de forma não reconhecida isentava por inteiro,
fail-open por default, na função cujo propósito é decidir o que pode ser
isentado. A mesma observação registrou o caso vizinho no ramo
`const`/`let`/`var`: `findTopLevelAssignmentIndex` devolvendo
`undefined` também isentava por inteiro, sem distinguir "não atribui
valor algum" de "atribui, mas a busca de profundidade não achou o `=`
de topo". A observação não bloqueante 2 do mesmo review registrou que
`class_binding_export_form_not_resolved` e
`class_binding_cross_file_form_not_resolved` tinham descrição
incompleta: a primeira também dispara quando a declaração está em
arquivo fora das duas árvores varridas, e a segunda também quando o
arquivo ligado tem texto fora do conjunto lido — nos dois casos a
descrição nomeava só o caso dominante.

**Decisão:**

1. **A isenção de `export` é allowlist fechada; forma não reconhecida
   recusa, nunca isenta.** `exportConstructBindingRange` classifica cada
   construção `export` contra um conjunto fechado de formas — `type`/
   `interface` (com `declare`), `class`/`default class`/`abstract class`
   (com `declare`, isenta até o `extends`), `function`/`async function`/
   `default function` (com `declare`), `default <identificador>`,
   `{ ... }`/`* from ...` (com `declare`) e `const`/`let`/`var` (com
   `declare`, isenta até o `=` de atribuição) — e devolve, para cada
   forma reconhecida, `{ recognized: true, start, end }` com o range de
   **lado de ligação**. Para toda construção que não casa com nenhuma
   dessas formas — `export =`, `export namespace`, `export default` de
   expressão, literal ou chamada — devolve `{ recognized: false, start,
   end }`, nunca mais um `whole` silencioso.
   `refuseClassReferencesOutsideInstantiation` separa as duas listas
   (`exportRanges` reconhecidas, que isentam, e
   `unrecognizedExportRanges`, que não isentam) e recusa a ocorrência do
   nome ligado que caia dentro de uma faixa não reconhecida, sob a
   categoria nova `class_binding_export_construct_form_unrecognized`. A
   recusa é **escopada à ocorrência**: uma construção `export` de forma
   exótica que não mencione a classe não derruba nada.
2. **Atribuição não localizada é forma não resolvida, não isenção.**
   `findTopLevelAssignmentIndex` devolve `TopLevelAssignmentSearch` —
   `{ found: true, index }` quando acha o `=` de topo; `{ found: false,
   resolved: true }` quando a profundidade de bracket volta a zero sem
   achar `=` (a construção de fato não atribui valor algum: `export
   const enum X { ... }`, `declare const` ambiente); `{ found: false,
   resolved: false }` quando a profundidade nunca fecha — sinal de que um
   `<`/`>` foi contado como bracket sem ser um, e o `=` de topo pode
   estar escondido atrás dessa contagem errada. Só o primeiro caso de
   "não achou" (`resolved: true`) isenta a construção inteira; o segundo
   (`resolved: false`) devolve `{ recognized: false }` de
   `exportConstructBindingRange` e recusa pela mesma categoria nova do
   item 1 — é a mesma família de falha, não uma categoria à parte.
3. **As seis categorias de recusa existem em runtime, num array
   exportado.** `CLASS_BINDING_REFUSAL_CATEGORIES` é um array `as const`
   exportado por `http-egress-sites.ts`, e `ClassBindingRefusalCategory`
   passa a ser `(typeof CLASS_BINDING_REFUSAL_CATEGORIES)[number]` —
   união derivada do array, não mais escrita solta. Nenhum identificador
   de categoria existente mudou de nome, e nenhuma recusa existente mudou
   de categoria; a suíte confere o array por igualdade
   (`toEqual`/`toContain`), em vez de reconstruir a união à mão. As seis
   categorias, na ordem do array, e a descrição de cada uma contra o
   código que a implementa:
   - `class_binding_homonymous_declarations` — duas declarações do mesmo
     nome no arquivo da classe: o nome exportado não identifica qual
     delas é instanciada.
   - `class_binding_export_form_not_resolved` — a classe sai do módulo
     por uma forma que a resolução não converte em ligação importável
     (`export =`, cláusula nova) **ou a declaração está em arquivo fora
     das duas árvores varridas** (`apps/ai-orchestrator/src` e
     `apps/bff/src`) — o segundo caso fecha a observação não bloqueante 2
     do review045, que a descrição de D-061 nomeava só pelo primeiro.
   - `class_binding_commonjs_export` — a classe sai do módulo por
     CommonJS (`module.exports` / `exports.<nome>`), que esta resolução
     não segue.
   - `class_binding_cross_file_form_not_resolved` — a ligação atravessa o
     arquivo por forma não seguida (reexportação em cadeia, import
     dinâmico, alias de caminho não relativo, import de namespace) **ou o
     arquivo ligado tem texto fora do conjunto lido** — o segundo caso
     fecha a outra metade da observação não bloqueante 2 do review045,
     que a descrição de D-061 nomeava só pelo caso dominante.
   - `class_binding_reference_forwarded_as_value` — o nome ligado à
     declaração aparece num arquivo candidato fora de `new <Id>(`: a
     classe é passada adiante como valor.
   - `class_binding_export_construct_form_unrecognized` (**nova neste
     Goal**) — o nome ligado aparece dentro de uma construção `export`
     cuja forma não está na allowlist de `exportConstructBindingRange`
     (item 1) **ou** dentro de uma construção `const`/`let`/`var` que
     atribui valor mas cujo `=` de topo a busca de profundidade não
     localizou (item 2): nos dois casos, sem forma reconhecida, a
     ocorrência não pode ser confirmada como ligação exportada.
4. **A isenção de posição de tipo não foi afrouxada, mas deixou de
   decidir primeiro dentro de forma não reconhecida.**
   `TYPE_POSITION_PRECEDING_CHARS` e `TYPE_POSITION_PRECEDING_WORDS`
   mantêm o conteúdo da baseline, caractere a caractere e palavra a
   palavra; `export type` e `export interface X extends Base` continuam
   sem produzir recusa e sem perder rota, porque essas duas formas estão
   na allowlist e a heurística de posição de tipo continua valendo
   inteira dentro delas e em todo texto fora de construção `export`. O
   que mudou é só a **ordem**: a ocorrência que cai dentro de uma
   construção `export` de forma **não reconhecida** recusa antes de a
   heurística ser consultada. Dentro de uma forma que a leitura não sabe
   recortar, os caracteres em que a heurística se apoia não são
   confiáveis — o `:` de `export default { C: <Classe> };` separa chave
   de valor num literal de objeto, posição de VALOR, e consultá-lo
   primeiro isentaria exatamente o repasse que a categoria nova existe
   para recusar. Sem essa ordem, o caso canônico do item 1 do escopo
   continuaria fail-open.
5. **As cinco formas exigidas pela allowlist e os cinco controles
   negativos provam a inversão nos dois sentidos.** Controle 1
   (`export default { Client: <Classe> };` no candidato) prova que a
   forma fora da allowlist recusa pela categoria nova, com
   `arquivo:linha` da ocorrência, e que a conferência de forma não
   reconhecida vem antes da heurística de posição de tipo. Controle 2 (`export namespace N { export const
   C = <Classe>; }`) prova que `export namespace` recusa, por não estar
   na allowlist. Controle 3 (`export = <Classe>` no candidato) prova que
   a mesma forma no arquivo da **declaração** continua recusando por
   `resolveModuleExportBindings`, sob a categoria antiga
   `class_binding_export_form_not_resolved` — as duas recusas nunca se
   confundem. Controle 4 (`export const Weird: Array<Foo = [<Classe>];`)
   prova o item 2: o `<` de `Array<Foo` nunca fecha, a busca termina com
   profundidade 1 e `resolved: false`. Controle 5 prova que `export
   function`, `export async function`, `export interface ... extends`,
   `export type`, `export class ... extends <Classe>`, `export const =
   <Classe>` e `export { <Classe> };` continuam classificando
   exatamente como na baseline do Goal045 — a allowlist fechada não
   estreitou o que já funcionava.

**Alternativas:** continuar isentando por padrão e listar exceção por
exceção — rejeitada: é o mesmo fail-open que este Goal existe para
fechar, só que com uma lista de exceções maior; tratar `resolved: false`
como isenção, já que a heurística de profundidade é textual e pode errar
por motivo alheio à construção — rejeitada: inverteria a direção do
erro de volta para "isenta quando não sabe", exatamente o defeito que a
observação 1 do review045 registrou; unificar as duas categorias novas
propostas (uma para `export` não reconhecido, outra para atribuição não
localizada) em vez de uma só — rejeitada: as duas são o mesmo fato —
"forma dentro de uma construção `export` que a leitura não conseguiu
recortar como lado de ligação" —, e uma categoria a mais sem distinção
de causa não ajudaria quem lê o motivo a agir diferente.

**Motivo:** o mecanismo que resolve identidade, instanciação e destino
(D-061) só é fail-closed de ponta a ponta se a isenção que o alimenta
também for. Uma isenção por catch-all é o mesmo risco que motivou D-060
e D-061 um nível abaixo: uma rota sai do conjunto de 10 sem acrescentar
sítio de `fetch` algum, e a completude de A-24 depende dessa
propriedade ser do mecanismo, não da árvore de hoje não ter ainda uma
forma exótica de `export`.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
ganha `CLASS_BINDING_REFUSAL_CATEGORIES` (array `as const` exportado,
seis categorias), `TopLevelAssignmentSearch`, e
`exportConstructBindingRange` passa a devolver `{ recognized, start,
end }` em vez de `{ start, end }` sozinho; `findTopLevelAssignmentIndex`
passa a devolver `TopLevelAssignmentSearch` em vez de `number |
undefined`. `ClassBindingRefusalCategory` continua sendo o tipo
consumido pelo resto do módulo, agora derivado do array. Nenhuma cópia
paralela de `computeQuoteMask`, `findExportConstructs`,
`exportConstructText`, `findImportDeclarations`,
`findCrossFileCallerBindings`, `resolveModuleExportBindings` ou
`resolveModuleSpecifierToFilePath` foi criada.
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha
23 casos ao lado dos 130 já existentes (153 no total): os cinco
controles negativos obrigatórios (17 casos, com par antes/depois em
cada um — o controle 1 tem duas saídas "depois", a categoria e o
`arquivo:linha`, o controle 3 tem duas saídas "depois", candidato e
declaração, e o controle 5 tem sete saídas "depois"), 1 caso que confere
`CLASS_BINDING_REFUSAL_CATEGORIES` por igualdade e 5 casos que provam,
sobre a árvore real, os mesmos números da baseline do Goal045 mais as
duas invariantes de não-vacuidade novas. Reexecutado na rodada 2:
`npx vitest run tests/assistant/assistant.service.test.ts` em
`apps/ai-orchestrator` → **153** testes, 0 falhas (baseline do Goal:
130). `npx vitest run` completo de `apps/ai-orchestrator` → **877**
passando, 88 pulados (baseline: 854 passando, 88 pulados) — mesma
contagem de pulados, nenhuma suíte encolheu. Sobre a árvore real: **1**
superfície, **4** ligações resolvidas, **10** rotas, **2** instanciações
fora do transporte, **0** chamadas de membro fora da superfície —
idênticos à baseline do Goal045; `scannedFilePathsForInstantiation`
soma **205** arquivos `.ts` varridos (**118** em
`apps/ai-orchestrator/src`, **87** em `apps/bff/src`), o mesmo número
que a baseline deste Goal documentava — conferido por computação do
próprio descobridor sobre a árvore real, não copiado do documento, e
asserido pela suíte permanente (WU-04). Não há divergência a declarar
neste número. `git status
--porcelain=v1` lista exatamente seis arquivos, dois de código de teste
e quatro de documentação desta migração:
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts`,
`docs/migration/CURRENT_STATE.md`, `docs/migration/DECISIONS.md`,
`docs/migration/FINAL_AUDIT.md` e
`docs/migration/VALIDATION_GATE.md` — nenhum
arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/scheduling-service/`,
`apps/health-worker/`, `packages/`, nenhum arquivo Go e nenhum arquivo
de `tools/ia-loop/` foi tocado; `go.mod`/`go.sum` intocados.
`product-transport-routes.txt` não mudou. Esta seção (D-062) e a
documentação de fechamento em FINAL_AUDIT §23, CURRENT_STATE e
VALIDATION_GATE foram escritas depois da última mudança de árvore.
`validate:core`, `test:gate`, `validate:integration` e `go test
./...` não foram reexecutados pela unidade de documentação; o
resultado deles é responsabilidade da verificação determinística
posterior do Goal. Este diff não fecha **M4**, não afirma fidelidade
visual à referência aprovada, não prova comportamento de runtime do
serviço Go e **não corrige A-24** — que continua `PENDENCIA-POS-MVP`.

**Revisar se:** uma forma de `export` real aparecer nas duas árvores
fora da allowlist enumerada no item 1 — a decisão é que ela recusa, não
que a lista está fechada para sempre; a heurística de `<`/`>` de
`findTopLevelAssignmentIndex` continuar sendo textual, não parser —
`resolved: false` é o sinal de que ela não fechou, nunca uma correção da
heurística em si; ou uma sétima categoria de recusa precisar existir —
o array `CLASS_BINDING_REFUSAL_CATEGORIES` é o lugar único que a suíte e
a documentação permanente devem conferir, para não repetir a divergência
de contagem das rodadas do Goal045.

## D-063 — O uso do campo cliente é fail-closed: toda ocorrência de `this.<campo>` é enumerada, e forma não reconhecida recusa em vez de somar rota alguma, propostas no Goal047

**Status:** ACCEPTED no [review047](reviews/047-review.md) (rodada 3 de
3, 2026-09-22, zero blockers; a rodada 1 teve 2 blockers — o de maior
peso foi o fail-open que sobrevivia dentro do próprio mecanismo novo: a
enumeração ainda procurava o texto literal `this.<campo>`, de modo que
`this?.http`, `this["http"]` e `(this as T).http` perdiam a rota em
silêncio, enquanto os quatro documentos permanentes já afirmavam
exaustividade; o outro foi a ausência dos controles com as duas saídas
que o critério 2 exige. A rodada 2 teve 2 blockers — contagem obsoleta
de rodada 1 sobrevivendo em FINAL_AUDIT §24 ("sete categorias" para um
array de doze) e a regressão de `unmaskTemplateInterpolations`, que
desmarcava `${...}` de qualquer região mascarada e fazia ocorrência
dentro de string comum recusar, contrariando o critério 3), pelo Tech
Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Cobre o diff047
(WU-01 enumera toda ocorrência de `this.<campo>` no corpo de método de
topo da classe dona e recusa forma não reconhecida sob categoria nova;
WU-02 prova o alvo da atribuição da instanciação e recusa forma não
provada como campo; WU-03 unifica as duas saídas de `sourcesByPath`
ausente entre o ramo da superfície e o da instanciação; WU-04
acrescenta as afirmações permanentes — classificação exaustiva, alvo de
atribuição, simetria de `sourcesByPath`, o controle próprio do critério
3 do Goal046, o array de categorias por igualdade e os números da
árvore real; WU-05 acrescenta os controles negativos restantes do
escopo §7 e o controle de renomeação; WU-06 é a documentação de
fechamento) sobre a baseline aceita `3074a6d96c190b3e221b4f5aa96c46158bc1dd1b`
(fechamento do Goal046); sem commit e sem deploy. Não fecha nem reabre
nenhum achado — A-04 a A-08, A-11 a A-17, A-19 e A-24 não são tocados, e
nenhum achado fechado é reaberto. Não altera nenhuma decisão anterior —
reusa e não altera D-054 a D-062.

**Contexto:** a observação não bloqueante 3 do [review045](reviews/045-review.md),
já fechada do lado da isenção de `export` por D-062, tinha um par do
lado do **uso** do campo: `discoverGoBoundInternalClientRequests`
reconhecia a chamada de transporte só pela forma literal
`this.<campo>.<membro>(`, por `RegExp`, e `findAssignedFieldName`
devolvia o identificador antes de um `=` dentro de uma janela textual de
200 caracteres, sem provar que esse identificador é campo da classe
dona. Nas duas pontas, forma que não casasse o padrão não produzia
requisição nem recusa — apenas desaparecia, e uma rota podia sair do
conjunto de 10 sem acrescentar sítio de `fetch` algum. A observação 1 do
[review046](reviews/046-review.md) registrou ainda que a recusa escopada
à ocorrência do Goal046 era verdadeira por leitura da estrutura, sem
controle permanente que a exercitasse isoladamente.

**Decisão:**

1. **Toda ocorrência do campo cliente é enumerada pelo receptor, e
   forma não reconhecida recusa.** `enumerateClientFieldMemberCalls`
   (`http-egress-sites.ts`) para de procurar o texto
   `this.<campo>.<membro>(` e passa a enumerar o token `this` dentro do
   corpo da classe dona, sobre o texto sem comentários
   (`blankComments`) e sobre a máscara de aspas já existente, com as
   faixas `${...}` de template literal desmarcadas por
   `unmaskTemplateInterpolations` — o que está dentro delas é código,
   não texto. Procurar o texto `this.<campo>` seria fail-open de novo:
   o campo é alcançado sem ele aparecer, por `this?.<campo>`,
   `this["<campo>"]`, `const { <campo> } = this` ou `const alias =
   this`. A ordem de decisão é **forma do receptor, localização, forma
   do uso**. A forma do receptor decide se a ocorrência alcança este
   campo: ocorrência que prova alcançar **outro** campo
   (`this.<outro>`) não conta e não recusa, e a atribuição que guarda a
   própria instância (`this.<campo> = new ...`) é isenta por ser a
   instanciação já provada. Toda ocorrência restante cai em exatamente
   uma saída: chamada de transporte, chamada de membro fora da
   superfície, ou recusa com `arquivo:linha`, o trecho de contexto e
   uma categoria nomeada nova — inclusive quando a ocorrência está fora
   de todo corpo de método de topo, usa encadeamento opcional, acesso
   computado, desestruturação, não tem nome de membro derivável, não é
   invocada, ou aparece em posição de valor (alias, repasse, `as`/`!`).
2. **O alvo da atribuição só vira campo provado nas duas formas que
   provam campo da classe dona.** `findAssignedFieldName` para de casar
   `<nome> = new` numa janela textual solta e passa a distinguir:
   **campo provado** — `this.<campo> = new ...` em qualquer profundidade
   dentro do corpo da classe, ou declaração de propriedade de classe com
   inicializador (`<campo> = new ...`, fora de todo método); **forma não
   resolvida** — variável local, desestruturação, atribuição a
   propriedade de outro objeto, elemento de array, `return new ...`
   direto, ou qualquer outra forma — que recusa com `arquivo:linha` e
   categoria nomeada nova, em vez de devolver um nome de campo que nunca
   será encontrado.
3. **As duas saídas de `sourcesByPath` ausente são a mesma.** O `continue`
   silencioso do ramo `constructor_base_url_*` foi substituído pela
   mesma recusa nomeada com `arquivo:linha` que o ramo da instanciação já
   fazia; nenhum dos dois ramos pula sítio ou instanciação em silêncio.
4. **O critério 3 do Goal046 ganhou controle próprio.** Árvore sintética
   com construção `export` de forma não reconhecida que **não** menciona
   a classe ligada, ao lado da instanciação normal alcançando o
   transporte, prova que a classificação é idêntica à da mesma árvore
   sem aquela construção — fechando a observação 1 do
   [review046](reviews/046-review.md) sem alterar mecanismo algum do
   Goal046.
5. **As categorias de recusa dos dois caminhos novos existem em runtime,
   em dois arrays separados.** `CLIENT_FIELD_USE_REFUSAL_CATEGORIES`
   (doze categorias, para o uso do campo) e
   `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` (seis categorias, para
   o alvo da atribuição) são arrays `as const` exportados por
   `http-egress-sites.ts`, com `ClientFieldUseRefusalCategory` e
   `InstanceFieldAssignmentRefusalCategory` derivados deles. A suíte
   confere os dois arrays por igualdade (`toEqual`), nunca reconstruindo
   a união à mão. Nas ordens declaradas:
   - `CLIENT_FIELD_USE_REFUSAL_CATEGORIES`: `client_field_use_outside_top_level_method_body`
     (ocorrência fora de todo corpo de método de topo — inicializador de
     campo, bloco estático); `client_field_use_optional_chaining`
     (`this.<campo>?.<membro>(`); `client_field_use_computed_member_access`
     (`this.<campo>["<membro>"]` e demais acessos computados);
     `client_field_use_destructured` (`const { <membro> } = this.<campo>`);
     `client_field_use_member_not_invoked` (`this.<campo>.<membro>` sem
     `(` imediato); `client_field_use_member_name_not_derivable` (depois
     do `.` não há identificador de membro derivável); e
     `client_field_use_field_forwarded_as_value` (a ocorrência não é
     acesso a membro: alias em variável local, argumento repassado,
     `as`/`!` sobre o campo). As cinco últimas são da forma do
     **receptor**, e existem porque o campo é alcançado sem o texto
     `this.<campo>` aparecer: `client_field_use_receiver_optional_chaining`
     (`this?.<campo>`); `client_field_use_receiver_computed_member_access`
     (`this["<campo>"]` e demais acessos computados sobre `this`);
     `client_field_use_receiver_destructured` (`const { <campo> } =
     this`); `client_field_use_receiver_forwarded_as_value` (`const
     alias = this`, `this` em posição de valor, a instância inteira
     escapando); e `client_field_use_receiver_field_name_not_derivable`
     (depois do `.` sobre `this` não há identificador de campo
     derivável, e a leitura não decide se o receptor alcança o campo
     cliente).
   - `INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES`: `instance_field_assignment_local_variable`
     (instância guardada em variável local); `instance_field_assignment_destructured`
     (padrão de desestruturação como alvo); `instance_field_assignment_foreign_object_property`
     (atribuição a propriedade de outro objeto, `<id>.<campo> = new ...`);
     `instance_field_assignment_array_element` (atribuição a elemento de
     array); `instance_field_assignment_returned_directly` (`return new
     ...` direto, sem atribuição a campo algum); e
     `instance_field_assignment_form_not_recognized` (nenhuma das formas
     acima casa, e a instanciação também não está em `this.<campo> = new
     ...` nem em declaração de propriedade de classe).
6. **Os sete controles negativos do escopo §7 provam a inversão.**
   Encadeamento opcional (`this.http?.request(...)`) recusa pela
   categoria nova; acesso computado (`this.http["request"](...)`)
   recusa; alias em variável local (`const client = this.http;
   client.request(...)`) recusa por `client_field_use_field_forwarded_as_value`,
   porque a ocorrência `this.http` não está na forma de chamada;
   instância guardada em variável local do construtor, nunca em
   `this.<campo>`, recusa por `instance_field_assignment_local_variable`;
   ocorrência fora de corpo de método de topo (inicializador de campo
   que menciona `this.http`) recusa; as três formas reais (chamada de
   transporte, chamada de membro fora da superfície, montagem de URL sem
   chamar o cliente) continuam classificando exatamente como antes; e o
   controle do item 4 acima prova que o escopo do Goal046 continua
   mordendo. Ao lado deles, cada forma que ainda não tinha controle
   próprio passou a ter um: desestruturação do campo (`const { <membro>
   } = this.<campo>`), membro repassado como valor (`const send =
   this.<campo>.<membro>;`), nome de membro não derivável
   (`this.<campo>.#<membro>(`), as cinco formas de receptor
   (`this?.<campo>`, `this["<campo>"]`, `const { <campo> } = this`,
   `const alias = this`, `this.#<outro>`) e a ocorrência dentro de
   interpolação de template — cada um com as duas saídas, e as de
   receptor com a saída "antes" registrada como **nenhuma requisição e
   nenhuma recusa**, que é exatamente o fail-open que este Goal fecha.

**Alternativas:** continuar reconhecendo só `this.<campo>.<membro>(` por
expressão regular e tratar toda outra forma como zero requisição e zero
recusa — rejeitada: é o mesmo fail-open que este Goal existe para
fechar, na última etapa da cadeia que os Goals 044 a 046 já fecharam
mais acima; unificar `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` e
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` num único array —
rejeitada: são dois mecanismos distintos (o uso do campo já provado
contra o alvo da atribuição que prova o campo em primeiro lugar), cada
um com seu próprio ponto de recusa no código, e uma união maior sem
separar a causa não ajudaria quem lê o motivo a agir diferente — a mesma
razão que motivou D-062 a não unificar suas duas categorias novas.

**Motivo:** o mecanismo que resolve identidade, instanciação, destino
(D-061) e isenção de `export` (D-062) só é fail-closed de ponta a ponta
se o último elo — o uso do campo em que a instância foi guardada —
também for. Uma leitura que reconhece só uma forma literal e ignora todo
o resto em silêncio é o mesmo risco que motivou D-060 a D-062 um nível
acima: uma rota sai do conjunto de 10 sem acrescentar sítio de `fetch`
algum, e a completude de A-24 depende dessa propriedade ser do
mecanismo, não da árvore de hoje não ter ainda uma forma exótica de uso
do campo.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
ganha `CLIENT_FIELD_USE_REFUSAL_CATEGORIES`,
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES`,
`enumerateClientFieldMemberCalls` reescrita para enumeração fail-closed
pelo receptor, `unmaskTemplateInterpolations`, e `findAssignedFieldName`/o
alvo da atribuição reescritos para as duas formas provadas, mais
`computeQuoteOpenerMask` (rodada 3), que guarda o delimitador de
abertura e de onde `computeQuoteMask` passou a derivar com semântica
idêntica à da baseline, de modo que só a crase abre interpolação — 522
linhas inseridas, 25 removidas (3364 → 3861 linhas). Nenhuma cópia paralela de `computeQuoteMask`, `blankComments`,
`findMatchingDelimiterEnd`, `splitTopLevelItems`,
`findObjectPropertyExpression`, `findEnclosingClassSpan`,
`findTopLevelMethodBodies` ou `methodNameAtBrace` foi criada.
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` ganha
888 linhas (5563 → 6451), com 37 casos novos ao lado dos 153 já
existentes (190 no total): os testes de classificação exaustiva e alvo
da atribuição (§1 e §2), a prova de simetria de `sourcesByPath` (§3), o
controle do critério 3 do Goal046 (§4), a conferência dos dois arrays de
categorias por igualdade (§5), os números da árvore real e a
não-vacuidade (§6), e os controles negativos restantes do escopo §7 mais
o controle de renomeação (WU-05), mais os controles da rodada 2 para as
formas de receptor, para a desestruturação do campo, para o membro
repassado como valor, para o nome de membro não derivável e para a
ocorrência interpolada em template, e os dois da rodada 3 para
ocorrência do campo dentro de string comum contendo `${...}` e para
string comum escrita dentro de uma interpolação. `npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator` →
**190** testes, 0 falhas (baseline do Goal: 153). `npx vitest run`
completo de `apps/ai-orchestrator` → **914** passando, 88 pulados
(baseline: 877 passando, 88 pulados) — mesma contagem de pulados,
nenhuma suíte encolheu. Sobre a árvore real: **1** superfície, **4**
ligações resolvidas, **205** arquivos varridos (**118** em
`apps/ai-orchestrator/src`, **87** em `apps/bff/src`), **10** rotas,
**2** instanciações fora do transporte, **0** chamadas de membro fora da
superfície — idênticos à baseline do Goal046; as **41** ocorrências de
`this.http.` em `apps/bff/src/clients/` continuam, todas, na forma
direta `this.http.<membro>(`, e a leitura completa sobre a árvore real
não lança recusa alguma — conferido por computação do próprio
descobridor sobre a árvore real, não copiado do documento, e asserido
pela suíte permanente (WU-04). Não há divergência a declarar nestes
números. `git status --porcelain=v1` lista exatamente seis arquivos,
dois de código de teste e quatro de documentação desta migração:
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
`apps/ai-orchestrator/tests/support/http-egress-sites.ts`,
`docs/migration/CURRENT_STATE.md`, `docs/migration/DECISIONS.md`,
`docs/migration/FINAL_AUDIT.md` e `docs/migration/VALIDATION_GATE.md` —
nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/scheduling-service/`,
`apps/health-worker/`, `packages/`, nenhum arquivo Go e nenhum arquivo
de `tools/ia-loop/` foi tocado; `go.mod`/`go.sum` intocados.
`product-transport-routes.txt` não mudou. Esta seção (D-063) e a
documentação de fechamento em FINAL_AUDIT §24, CURRENT_STATE e
VALIDATION_GATE foram escritas depois da última mudança de árvore.
Sobre a árvore final: `validate:core` exit 0 (17 passos, 15
passados, 2 pulados — `test:bff` e `test:health-worker`, pelos motivos
que o próprio gate imprime), `npm run test:gate` com **226** testes e 0
falhas, `go test ./...` em `apps/evolution-go` ok em todos os pacotes
com teste, e `validate:integration` recusando com `exit 2` e
`BFF_TEST_DATABASE_URL is not set` — pré-condição de banco declarada
ausente, nunca verde. Cada uma das doze categorias de
`CLIENT_FIELD_USE_REFUSAL_CATEGORIES` tem, além da igualdade do array
(§5), controle permanente que a exercita; os sete controles
obrigatórios do escopo §7, que o critério de aceite nomeia, existem e
mordem todos. Este diff não fecha **M4**,
não afirma fidelidade visual à referência aprovada, não prova
comportamento de runtime do serviço Go e **não corrige A-24** — que
continua `PENDENCIA-POS-MVP`.

**Revisar se:** uma forma de uso do campo cliente real aparecer nas duas
árvores fora das doze categorias enumeradas no item 5 — a decisão é que
ela recusa, não que a lista está fechada para sempre; uma forma de
guarda de instância real aparecer fora das seis categorias do item 2,
mesmo critério; ou uma categoria a mais precisar existir em qualquer dos
dois arrays — `CLIENT_FIELD_USE_REFUSAL_CATEGORIES` e
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES` são os lugares únicos que
a suíte e a documentação permanente devem conferir, para não repetir a
divergência de contagem das rodadas do Goal045.

## D-064 — A cobertura de recusa passa a ser computada a partir dos três arrays em runtime, e categoria sem controle reprova a suíte, propostas no Goal048

**Status:** ACCEPTED no [review048](reviews/048-review.md) (rodada 2 de
2, 2026-09-22, zero blockers; a rodada 1 teve 2 blockers, ambos de
fechamento documental e nenhum de mecanismo — os quatro documentos
permanentes descreviam uma execução que a árvore final não produzia
mais, com suíte vermelha por design, "199 passando e 1 falhando",
`validate:core` FAILED e linhas citadas erradas, depois de a WU-06 ter
acrescentado `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`; e os mesmos
documentos afirmavam `tools/ia-loop/` intocado contra um diff que toca
dois arquivos ali), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md),
D-018). O mecanismo, aplicado sem exceção às 24 categorias, desconta as
duas categorias inalcançáveis do vocabulário de atribuição por registro
nomeado e conferido — `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`
(`assistant.service.test.ts:6860`–`6869`) —, e a suíte fecha verde. A
revisão aceitou esse registro como a forma de resíduo do item 4: ele é
nomeado, tem motivo computado e é auto-conferido nos dois sentidos —
a categoria tem de continuar no array e tem de continuar nunca
observada —, que é exatamente a propriedade que a igualdade de array
não tinha. A edição dos dois arquivos de `tools/ia-loop/` recebeu
**dispensa escrita e restrita ao Goal048**, concedida na rodada 1 e
condicionada à declaração da exceção nos documentos permanentes;
a correção fica **neste** diff, não em unidade própria. Cobre
o diff048 (WU-01 constrói o mecanismo de cobertura
computada — `observedRefusalCategories`, o helper `expectRefusal` e o
teste que itera os três arrays em runtime — e rewire os controles já
existentes dos Goals 045 a 047 para alimentá-lo; WU-02 acrescenta
controle a três das cinco categorias de atribuição sem controle e prova
que as outras duas são inalcançáveis; WU-03 acrescenta controle às três
categorias de ligação de classe sem controle; WU-04 acrescenta o
controle do sub-caso "comentário" da observação 1 do review047 e
generaliza a asserção do escopo §3 do Goal047 para não depender de nome
de variável; WU-05 exercita os cinco controles negativos do escopo §6
do próprio mecanismo de cobertura, todos revertidos, e reconfirma os
números da árvore real; WU-06 é a documentação de fechamento) sobre a
baseline aceita `11f576acc2f4eb667821a50ad16dc13aec6cabbc` (fechamento
do Goal047); sem commit e sem deploy. Não corrige achado algum e não
reabre nenhum — A-01 a A-24 não são tocados. Não altera nenhuma decisão
anterior — reusa e não altera D-054 a D-063.

**Contexto:** a baseline aceita tinha 24 categorias de recusa nomeadas
em três arrays `as const` exportados (`CLIENT_FIELD_USE_REFUSAL_CATEGORIES`,
12; `CLASS_BINDING_REFUSAL_CATEGORIES`, 6;
`INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES`, 6), mas só a conferia
por igualdade (`toEqual`) contra uma lista literal escrita à mão — o que
prova ordem e conteúdo do array, não que algum controle a exercite. Por
contagem na baseline, 8 das 24 só apareciam dentro dessa lista literal,
sem controle que as fizesse acontecer: 5 do vocabulário de atribuição
(`instance_field_assignment_destructured`,
`instance_field_assignment_foreign_object_property`,
`instance_field_assignment_array_element`,
`instance_field_assignment_returned_directly`,
`instance_field_assignment_form_not_recognized`) e 3 do de ligação de
classe (`class_binding_homonymous_declarations`,
`class_binding_commonjs_export`,
`class_binding_cross_file_form_not_resolved`). O título do teste de
igualdade de `CLASS_BINDING_REFUSAL_CATEGORIES` ainda afirmava que o
array "é exatamente o conjunto que os controles negativos... exercitam",
o que era falso para três das seis categorias — a mesma classe de
defeito (afirmação escrita que a execução não exerce) que reprovou
rodadas nos Goals 044 a 047.

**Decisão:**

1. **A cobertura é computada, nunca mais afirmada em prosa.** Um `Set`
   de módulo, `observedRefusalCategories`
   (`assistant.service.test.ts:48`), acumula toda categoria
   efetivamente observada em runtime. O helper `expectRefusal`
   (`:50`–`64`) substitui `expect(() => ...).toThrow(regex)` em todo
   controle negativo do arquivo: ele invoca a ação, afirma que lançou
   `Error` casando o `regex` esperado, extrai `[categoria: <nome>]` da
   mensagem por expressão regular e, se casar, registra a categoria no
   `Set`. Todo controle negativo pré-existente dos Goals 045 a 047 foi
   convertido de `toThrow` para `expectRefusal` — não porque a asserção
   mudasse, mas porque só assim o controle passa a alimentar o
   mecanismo de cobertura.
2. **Um teste final fecha o mecanismo.** `describe("Goal048 / WU-01...")`
   (`:6871`–`6896`) monta `allRefusalCategories` concatenando os três
   arrays em runtime — nunca uma lista reescrita — e afirma que
   `allRefusalCategories.filter((c) => !observedRefusalCategories.has(c) && !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(c))`
   é vazio. A fonte da iteração é o array de produção: categoria
   acrescentada a qualquer um dos três sem controle correspondente
   reprova este teste, nomeando exatamente qual ficou descoberta, sem
   exigir que alguém lembre de atualizar lista alguma. As duas
   categorias do item 4 são descontadas só por
   `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` (`:6860`–`6869`), um `Map`
   nomeado que o próprio teste confere: entrada que deixe de existir
   nos três arrays, ou categoria nele declarada que volte a ser
   observada em runtime, reprova.
3. **Três das oito categorias sem controle da atribuição ganharam
   controle permanente**, cada uma sobre árvore sintética em diretório
   temporário, removida ao fim, com `arquivo:linha` e a categoria casada:
   `instance_field_assignment_destructured` (padrão de desestruturação
   como alvo, `({ campo } = new ...)`);
   `instance_field_assignment_foreign_object_property` (atribuição a
   propriedade de outro objeto, `<id>.<campo> = new ...`); e
   `instance_field_assignment_form_not_recognized` (instanciação passada
   como argumento de função, `configureClient(new ...)`).
4. **Duas categorias da atribuição são inalcançáveis por árvore
   sintética alguma, por construção do código de
   `resolveProvenClassFieldAssignment` (`http-egress-sites.ts`) — não por
   lacuna de teste.** `instance_field_assignment_array_element`: seu
   regex (`\b<id>\[[^\]]*\]\s*=\s*new\s*$`) é subconjunto estrito do
   regex de `instance_field_assignment_destructured`
   (`[}\]]\s*=\s*new\s*$`), testado antes na cadeia de `if`; todo
   `<id>[i] = new ...` termina em `]` logo antes de `= new`, então o
   `if` de destructured sempre casa primeiro, e o de `array_element` é
   código morto. `instance_field_assignment_returned_directly`: seu
   regex (`\breturn\s*$`) exige que a janela termine em "return", mas
   `findClassInstantiations` só reconhece um sítio de instanciação
   quando a palavra imediatamente anterior ao nome da classe é "new"; a
   janela passada à resolução do alvo termina, portanto, sempre em
   "new", nunca em "return", e todo `return new X(...)` cai no
   `form_not_recognized` final. Dois controles permanentes provam essa
   inalcançabilidade construindo exatamente a forma nomeada por cada
   categoria e afirmando que a recusa observada sai sob a **outra**
   categoria, nunca sob a nomeada.
5. **As três categorias de ligação de classe sem controle ganharam
   controle permanente**, cada uma sobre árvore sintética própria:
   `class_binding_homonymous_declarations` (duas declarações `class
   InternalHttpClient` no arquivo da declaração); `class_binding_commonjs_export`
   (`exports.Alt = InternalHttpClient;` no arquivo da declaração); e
   `class_binding_cross_file_form_not_resolved` (import de namespace,
   `import * as NS`, num terceiro arquivo, para o módulo da declaração).
6. **O sub-caso "comentário" da observação 1 do review047 ganhou
   controle permanente.** `this.http?.request(...)` escrito dentro de
   comentário de linha é apagado por `blankComments` antes da varredura:
   um controle prova que a classificação de uma árvore com esse
   comentário é idêntica à da mesma árvore sem ele, e a rota real
   continua saindo.
7. **A asserção do escopo §3 do Goal047 deixa de depender de nome de
   variável.** Em vez de checar a ausência literal de `if (source ===
   undefined) continue` e `if (candidateSource === undefined) continue`,
   a suíte agora afirma a ausência genérica de qualquer ocorrência da
   forma `.get(...); if (<qualquer identificador> === undefined)
   continue` — um `continue` mudo novo, com outro nome, reprova.
8. **O título do teste de igualdade de `CLASS_BINDING_REFUSAL_CATEGORIES`
   deixou de afirmar cobertura que não existia.** Passa a dizer que o
   array traz a categoria na ordem declarada, e que a cobertura por
   controle é conferida à parte, no bloco do mecanismo novo.

**Alternativas:** excluir as duas categorias inalcançáveis do array e
reescrever a lista para 22 membros — rejeitada: removeria categoria já
aceita em D-063, e o próprio Goal proíbe renomear ou remover categoria
existente; deixar a suíte vermelha pelas duas categorias, sem resíduo
nomeado algum — rejeitada depois de revisão: a forma sugerida pelo
Goal ("registro categoria → controle... com a ausência de entrada
sendo falha nomeada") cobre exatamente este caso, então a categoria
inalcançável por construção ganhou registro nomeado e conferido
(`PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`) em vez de reprovar a suíte
inteira por um limite que os próprios controles da decisão 4 já provam.

**Motivo:** o vocabulário de recusa cresceu mais rápido que os
controles que o exercitam nos Goals 044 a 047, e a única prova de oito
categorias era o array continuar contendo a string — o mesmo tipo de
afirmação não exercida que motivou D-054, D-060 e D-063. Computar a
cobertura a partir do array em runtime, com falta nomeada, remove esse
acidente de vez: uma categoria só conta como coberta se algum controle
realmente a fizer acontecer. Aplicado sem exceção, o mecanismo também
descobre — de primeira ordem, não como desculpa — que duas categorias
são residuais por construção, e as nomeia em vez de as declarar
cobertas pela igualdade do array, que é exatamente a afirmação que este
Goal existe para remover.

**Consequências:** `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
ganha o `Set` `observedRefusalCategories`, o helper `expectRefusal`, o
`Map` `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, dez casos novos e a
conversão de todo controle negativo pré-existente de `toThrow` para
`expectRefusal`, com 200 testes no arquivo (baseline: 190).
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` não muda
(igual à baseline): a cobertura não exigiu expor nada novo. `npx
vitest run tests/assistant/assistant.service.test.ts` em
`apps/ai-orchestrator` → **200** testes, **200** passando, **0**
falhando: as duas categorias residuais do item 4 são descontadas pelo
registro nomeado, e o teste final de cobertura fecha verde. `npx
vitest run` completo de `apps/ai-orchestrator` → **1012** testes:
**924** passando, **88** pulados (mesma contagem de pulados da
baseline, nenhuma suíte encolheu), **0** falhando. `npx tsc -p
tsconfig.json --noEmit` em `apps/ai-orchestrator`: exit 0. `npm run
validate:core`: **PASSED** nesta árvore — dos 17 passos, **15**
passaram (inclusive `test:ai-orchestrator`) e **2** pulados por design
(`test:bff`, `test:health-worker`, cobertos só em
`validate:integration`); nenhum falhou. `npm run test:gate` (raiz,
suíte independente sobre `scripts/`) permanece em **226** testes e 0
falhas, inalterado: não exercita `assistant.service.test.ts`. Sobre a
árvore real, reconfirmado sem mudança (WU-05): **1** superfície, **4**
ligações resolvidas, **205** arquivos varridos, **10** rotas, **2**
instanciações fora do transporte, **0** chamadas de membro fora da
superfície, e as **41** ocorrências de `this.http.` em
`apps/bff/src/clients/` classificadas sem recusa;
`product-transport-routes.txt` intocado. `git status --porcelain=v1
-uall` lista, ao final desta rodada, `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`,
os quatro documentos desta migração e dois arquivos de `tools/ia-loop/`
(`lib/deterministic-executor.mjs`, `tests/deterministic-executor.test.mjs`),
tocados por correção do próprio harness — o executor determinístico
dobrava o prefixo `scope/` de `unit.pattern` quando `cwd` já estava
dentro do `scope`, e o filtro do vitest não casava arquivo algum;
nenhum diretório temporário de controle sobrou, e nenhum arquivo de
`apps/frontend/src/`, `apps/bff/src/`, `apps/ai-orchestrator/src/`,
`apps/evolution-go/` ou `packages/` foi tocado. Este diff não fecha
**M4**, não afirma fidelidade visual, não prova runtime do serviço Go
e não corrige **A-24**, que continua `PENDENCIA-POS-MVP`.

**Revisar se:** o registro nomeado de categorias inalcançáveis
(`PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`) é a forma de resíduo que a
revisão aceita para o item 4, ou se exige outra forma equivalente,
contanto que o resíduo continue nomeado e nunca vire "coberto pela
igualdade do array". Revisar também se alguma categoria nova, em
qualquer um dos três arrays, aparecer sem controle: é exatamente o caso
que o mecanismo deste Goal existe para reprovar; e se a correção de
`tools/ia-loop/lib/deterministic-executor.mjs`, fora do escopo de
produto do Goal mas necessária para o harness rodar
`targeted-tests` corretamente sobre `apps/ai-orchestrator`, deve ficar
neste diff ou seguir para unidade própria.

## D-065 — A categoria creditada é a declarada pelo controle, não a lida da mensagem, e o descarte silencioso é enumerado por forma idiomática em vez de casado por `RegExp` ancorada em `.get(`, propostas no Goal049

**Status:** ACCEPTED no [review049](reviews/049-review.md) (rodada 1 de
1, 2026-09-22, zero blockers — a primeira da série 041–049 a fechar sem
`CHANGES_REQUIRED`), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md),
D-018). A revisão reconferiu por execução própria a contagem de **32**
sítios de `expectRefusal` (1 declaração + 32 chamadas, 33 ocorrências),
as **5** entradas de `DOCUMENTED_SILENT_DISCARDS`, a suíte alvo em
204/204, a suíte completa em 1016 com 928 passando e 88 pulados, e
`npm run test:gate` em 226/0; e conferiu o limite do escopo §3 contra a
árvore, em vez de aceitá-lo escrito — os dois `continue` em bloco de
`http-egress-sites.ts` (`:658`, `:2033`) têm instrução antes e
registram em `unresolvedParams`/`pathExpression`, logo não são descarte
mudo escapando da varredura. Três observações não bloqueantes ficaram
registradas para Goal futuro: `DOCUMENTED_SILENT_DISCARDS` não afirma
motivo não vazio, ao contrário de `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`;
o registro é chaveado por número de linha, e qualquer deslocamento no
módulo reprova em massa; e `NO_REFUSAL_CATEGORY` existe sem sítio de uso
e sem controle que exerça o seu ramo. Cobre o diff049 (WU-01 a WU-11: WU-01 amarra a
declaração de categoria ao helper `expectRefusal`; WU-02 migra os
sítios de chamada pré-existentes para declarar categoria; WU-03
acrescenta os três controles negativos permanentes da amarra nova;
WU-04 troca a asserção de saída silenciosa de `assistant.service.ts:5770`
por enumeração de descarte guardado por valor ausente sobre
`http-egress-sites.ts`, com registro nomeado; WU-05 exercita os
controles negativos do mecanismo de descarte, revertidos; WU-06
reconfirma as invariantes da árvore real e que a cobertura do Goal048
continua mordendo; WU-07 a WU-11 são os gates — typecheck, lint,
targeted-tests, suíte completa e validation gate — sem tocar árvore de
produto) sobre a baseline aceita `f294e0e252c6ef69f85c46eeb6dcd7cc9e85de20`
(fechamento do Goal048); sem commit e sem deploy. Não fecha nem reabre
nenhum achado — A-01 a A-24 não são tocados, e **A-24 continua
`PENDENCIA-POS-MVP`**. Não altera nenhuma decisão anterior — reusa e
não altera D-054 a D-064.

**Contexto:** o [review048](reviews/048-review.md) aceitou o mecanismo
de cobertura computada de D-064 e registrou duas observações não
bloqueantes. A observação 2: `expectRefusal(action, matcher)` afirmava
a `RegExp` contra a mensagem lançada e, à parte, extraía a categoria de
`[categoria: X]` da mesma mensagem para marcá-la observada — os dois
lados nunca eram confrontados. Um controle cuja `RegExp` casasse a
categoria A e cuja recusa trouxesse a categoria B creditava B: a
execução ficava verde, e A continuava descoberta enquanto a suíte
afirmava que não estava. Uma recusa sem o marcador não creditava nada e
não reprovava — o `if (category)` de então engolia o caso em silêncio.
A observação 1, par da mesma família: a asserção de ausência de saída
silenciosa (`assistant.service.test.ts:5770` na baseline) era uma
`RegExp` ancorada no acessor `.get(`
(`/\.get\([^)]*\);\s*\n\s*if \(\w+ === undefined\) continue/u`); um
descarte mudo escrito `if (!x) continue`, ou sobre valor de outra
origem, passava sem ser visto — confirmado na baseline em
`http-egress-sites.ts:726` (`if (!argExpression) continue;`).

**Decisão:**

1. **A cobertura só é creditada quando a categoria declarada pelo
   controle e a observada na mensagem coincidem.** `expectRefusal`
   (`assistant.service.test.ts:67`–`101`) passou a receber um terceiro
   parâmetro obrigatório, `category: DeclaredRefusalCategory | typeof
   NO_REFUSAL_CATEGORY`, entre a ação e o `matcher`. Três saídas
   reprovam em vez de passar em silêncio: mensagem sem marcador
   `[categoria: ...]` reprova nomeando a categoria declarada e a
   mensagem lançada; marcador presente com categoria diferente da
   declarada reprova nomeando as duas; categoria declarada fora dos
   três arrays (`ALL_REFUSAL_CATEGORIES`, união computada em runtime,
   `:58`–`62`) reprova antes mesmo de olhar a mensagem. Só quando as
   três checagens passam a categoria observada entra em
   `observedRefusalCategories`.
2. **O caso legítimo sem categoria é declarado, não mudo.** O símbolo
   `NO_REFUSAL_CATEGORY` (`:65`) é o valor que um controle passa quando
   a recusa exercida nasce fora das quatro fábricas que emitem o
   marcador; `expectRefusal` devolve sem tentar crédito algum. Nenhum
   sítio do arquivo usa esse símbolo hoje: as recusas exercidas pelos
   controles existentes nascem todas nas quatro fábricas.
3. **Os sítios de chamada pré-existentes migraram para declarar
   categoria**, e a contagem real, na árvore final, é **32** chamadas
   de `expectRefusal` (fora a declaração), não as 29 estimadas na
   baseline: 29 são os controles de categoria real já existentes,
   migrados para o terceiro parâmetro; 3 são os controles novos do
   item 4 abaixo, que exercitam as três saídas do guard sobre o próprio
   mecanismo, não sobre uma categoria de recusa do produto. Nenhuma
   divergência entre categoria declarada e observada apareceu nos 29
   sítios migrados — a migração é 1:1 com a categoria que cada `matcher`
   já provava.
4. **As três saídas do guard novo têm controle permanente.**
   `describe("Goal049 / WU-03...")` (`:114`–`151`+) prova, cada uma
   sobre um `expect(() => expectRefusal(...)).toThrow(...)`: categoria
   declarada diferente da observada reprova nomeando as duas; recusa
   sem marcador reprova; categoria declarada fora dos três arrays
   reprova. Confirmado por controle temporário, rodado e desfeito nesta
   Work Unit: com o guard revertido para a forma anterior (sem comparar
   `category` ao marcador observado), as três reprovam por falta de
   `toThrow` — nenhuma é vácua.
5. **O descarte silencioso é enumerado por forma idiomática, não casado
   por uma `RegExp` ancorada em `.get(`.** `findSilentDiscardLines`
   (`:5909`–`5920`) varre `http-egress-sites.ts` por toda linha na
   forma `if (<condição sobre valor ausente>) continue;`, com a
   condição em `=== undefined`, `=== null` ou `!<identificador>`,
   combinável por `||`, qualquer identificador, qualquer origem — não
   mais só depois de `.get(`. Cada ocorrência encontrada tem de estar
   em `DOCUMENTED_SILENT_DISCARDS` (`:5885`–`5906`), um `Map` nomeado
   de `linha → motivo de ser inócua`; o mecanismo é fail-closed nos dois
   sentidos, como `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` de D-064:
   ocorrência não registrada reprova nomeando `arquivo:linha` e o
   trecho, e entrada registrada que a varredura não encontra mais
   reprova como obsoleta (`:5938`–`5957`). As duas asserções de frase
   literal (`:5931` e `:5934`, "não está entre os arquivos lidos") não
   mudaram.
6. **A varredura real, na árvore final, encontrou 5 sítios — não os 2
   nomeados na baseline —, e a diferença é descoberta, não ajuste.**
   Confirmado por `git diff` contra a baseline: `http-egress-sites.ts`
   tem diff **zero**; os 3 sítios adicionais (`:1141`, `:1916`, `:2029`)
   já existiam no texto da baseline e não foram vistos porque o
   documento do Goal só nomeava os 2 que a asserção antiga alcançava
   (`:726`, `:1143`). Nenhum dos 5 é candidato descartado: `:726` é
   ausência de argumento numa chamada real específica que genuinamente
   não o passa; `:1141` e `:1143` são linhas do laço de
   `readEnvSchemaDefault` cujo regex de declaração, ou de aspas, não
   casou naquela iteração; `:1916` é `import { X }` sem alias local para
   o nome exportado rastreado por aquela declaração específica; `:2029`
   é um chamador cujo parâmetro não resolve a env var de base do
   serviço Go. Nenhuma regra de classificação, categoria, ordem de
   consulta ou isenção mudou para produzir essa contagem — só a
   varredura enxerga mais forma idiomática do que a `RegExp` antiga.

**Alternativas:** manter a `RegExp` de mensagem como única prova e
tratar a categoria extraída como diagnóstico, não como amarra — rejeitada:
é exatamente a lacuna da observação 2, onde a categoria errada passa
silenciosamente creditada; exigir que toda recusa sem categoria seja
tratada como erro do controle, sem `NO_REFUSAL_CATEGORY` — rejeitada:
recusa legítima nascida fora das quatro fábricas existe por desenho
(D-054) e não deve forçar um controle a inventar categoria; continuar
ancorando a enumeração de descarte em `.get(` e ampliar só a lista de
acessores reconhecidos — rejeitada: é a mesma forma escrita à mão que a
observação 1 aponta, só que com mais um acessor; declarar a
enumeração de descarte como prova de conservação de candidatos —
rejeitada, é o limite que o próprio escopo §3 do Goal declara: cobre
descarte guardado por valor ausente, não todo `continue;` do módulo e
não é prova de conservação.

**Motivo:** o Goal048 computou a cobertura a partir dos três arrays,
mas confiava que a categoria extraída da mensagem observada era a
mesma que o controle pretendia provar, sem nunca comparar as duas — a
mesma classe de defeito (afirmação que a execução não exerce, agora um
nível abaixo, dentro do próprio mecanismo de prova) que motivou D-054,
D-060, D-063 e D-064. Amarrar a categoria declarada à observada, e
enumerar o descarte mudo por forma idiomática em vez de por acessor
escrito à mão, fecha as duas aberturas que o review048 registrou sem
ampliar alcance, sem mudar critério de conjunto e sem corrigir achado
algum.

**Consequências:** `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
ganha o terceiro parâmetro de `expectRefusal`, `NO_REFUSAL_CATEGORY`,
`ALL_REFUSAL_CATEGORIES`, os três controles permanentes do guard
(`describe("Goal049 / WU-03...")`), `findSilentDiscardLines` e
`DOCUMENTED_SILENT_DISCARDS` no lugar da `RegExp` ancorada, com **7100**
linhas (baseline: 6896) e **204** testes (baseline: **200**), **204**
passando, **0** falhando (`npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator`).
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` tem diff
**zero** contra a baseline — a enumeração não exigiu expor nada novo,
como o Goal previa. `apps/ai-orchestrator/tests/support/product-transport-routes.txt`
está intocado. `npx vitest run` completo de `apps/ai-orchestrator` →
**1016** testes: **928** passando (baseline: 924), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit` em `apps/ai-orchestrator`: "TypeScript: No
errors found", exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm
run validate:core`: **PASSED** — dos 17 passos, **15** passaram
(inclusive `test:ai-orchestrator`) e **2** pulados por design
(`test:bff`, `test:health-worker`); nenhum falhou. `npm run test:gate`
(raiz): **226** testes, **226** passando, **0** falhando, inalterado —
não exercita `assistant.service.test.ts`. `validate:integration`
continua recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarada como ausente — não
reexecutada por esta unidade de documentação (WU-12). Sobre a árvore
real, reconfirmado sem mudança (WU-06): **1** superfície, **4**
ligações resolvidas, **205** arquivos varridos, **10** rotas, **2**
instanciações fora do transporte, **0** chamadas de membro fora da
superfície, e as **41** ocorrências de `this.http.` em
`apps/bff/src/clients/` classificadas sem recusa;
`product-transport-routes.txt` intocado. `git status --porcelain=v1
-uall`, ao final desta rodada, lista **só**
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` e os
quatro documentos desta migração: nenhum arquivo de `tools/ia-loop/`
foi tocado nesta rodada — a dispensa do review048 era restrita ao
Goal048 e não se estendeu, e não houve necessidade dela aqui —, e
nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/evolution-go/` ou `packages/` foi
tocado. Nenhum diretório temporário de controle negativo sobrou. Este
diff não fecha **M4**, não afirma fidelidade visual, não prova runtime
do serviço Go e não corrige **A-24**, que continua
`PENDENCIA-POS-MVP`.

**Limite declarado, escopo §3:** a enumeração de `findSilentDiscardLines`
cobre **descarte guardado por valor ausente** — condição sobre valor
ausente seguida de `continue;`, na forma idiomática reconhecida —, não
todo `continue;` do módulo (que tem majoritariamente varredura lexical
de caractere, sem relação com descarte de candidato) e não é prova de
**conservação de candidatos**: um `continue` sem guarda de valor
ausente, ou dentro de um bloco com outra instrução antes dele, não é
capturado por este mecanismo. Provar que todo candidato lido termina em
requisição, recusa ou balde declarado é trabalho de Goal futuro e não
foi autorizado aqui.

**Revisar se:** a migração dos 29 sítios revelar, em rodada futura,
algum caso em que a categoria declarada e a observada genuinamente
divirjam — não apareceu nesta rodada, mas o guard novo existe para
nomear esse caso quando ele aparecer; se os 3 sítios adicionais de
descarte silencioso (`:1141`, `:1916`, `:2029`) exigem motivo mais
detalhado do que o registrado; e se o limite declarado do escopo §3 —
cobre descarte guardado por valor ausente, não conservação de
candidatos — deve virar Goal próprio de prova de conservação.

## D-066 — A conservação do conjunto de egresso passa a ser partição computada por campo estrutural, e balde sem sítio de origem reprova, propostas no Goal050

**Status:** ACCEPTED no [review050](reviews/050-review.md) (rodada 3 de
3, 2026-09-22; rodadas 1 e 2 fecharam `CHANGES_REQUIRED`, com 3 e 2
blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018).
As três rodadas erraram todas na mesma direção — afirmação escrita mais
forte do que a execução. Na rodada 1: a exceção de roteamento de
`egressPartitionBucketsForCategory` para `constructor_base_url_*` não
aparecia em documento nenhum; os controles negativos 1 a 4 e 7
exercitavam uma segunda implementação da conta, não a asserção
publicada; e o controle 7 era tautologia. Na rodada 2: a exceção já
estava declarada nos quatro documentos, mas nenhuma asserção a
exercia, e a contagem de linhas de `assistant.service.test.ts` estava
defasada em dois documentos. O aceite da rodada 3 reconferiu por
execução própria o teste permanente de `:3137` (que reprova se a
exceção deixar de existir na árvore real), as **10** entradas fora do
subconjunto roteado por sondagem `tsx` independente, `wc -l` em
**7864** e **3886**, a suíte alvo em 215/215 e a completa em 1027 com
**939** passando e **88** pulados. Uma observação não bloqueante ficou
registrada para Goal futuro: a partição não reprova entrada que apareça
fora do subconjunto roteável da categoria do seu `originSite` — limite
declarado neste documento e em VALIDATION_GATE, não afirmação falsa.

**Contexto:** o [review049](reviews/049-review.md) aceitou D-065 sem
blockers e registrou três observações não bloqueantes:
`DOCUMENTED_SILENT_DISCARDS` não exigia motivo não vazio;
o registro de descarte era chaveado por número de linha, frágil a
deslocamento; e `NO_REFUSAL_CATEGORY` existia sem sítio de uso e sem
controle. A um nível acima dessas três, a asserção de conservação de
`assistant.service.test.ts:2953`–`2975` (baseline, escrita no Goal043)
decidia que um sítio de egresso "virou requisição" por uma disjunção
cujo segundo ramo era `request.reason.includes(position)` — substring
de prosa livre, a mesma família de defeito que D-065 removeu um nível
abaixo. O ramo era portante, não decorativo: a requisição resolvida no
chamador (`:2062`) só carregava a origem dentro do texto do motivo, e o
cliente HTTP interno (`:3728`) empurrava requisição sem origem alguma,
nem campo nem prosa. A asserção também provava só conservação de mão
única — sítio perdido reprovava, mas balde que inventasse entrada sem
origem, ou sítio em dois baldes ao mesmo tempo, não reprovava — e
corria só sobre `discovery.sites`, ignorando `excluded`,
`genericEgressCallers` e `genericEgressPrimitives` sem dizer por quê.

**Decisão:**

1. **A origem do sítio de egresso é campo estrutural, não frase.**
   `http-egress-sites.ts` ganhou `HttpEgressSiteOrigin` (`Pick<ClassifiedHttpEgressSite,
   "filePath" | "line">`, `:1249`–`1251` na árvore final) e o campo
   `originSite` em toda interface de saída que nasce de sítio
   classificado — `GoBoundHttpRequest`, `NonGoBoundEgressSite`
   (`notGoBound`), `AssembledUrlForDelivery`, `NonTransportMemberCall` e
   `NonGoBoundClassInstantiation`. Os oito sítios de `push` do arquivo
   passam a preencher `originSite`, inclusive os dois que a baseline
   apontava como abertura: a requisição resolvida no chamador
   (`originSite` explícito, além da prosa que continua existindo para
   quem lê) e o cliente HTTP interno, que na baseline empurrava
   requisição sem origem alguma e agora carrega `originSite` igual ao
   próprio sítio que a instancia. Onde a entrada é o próprio sítio
   (`fetch` cru, `notGoBound`), `originSite` repete o mesmo
   `filePath`/`line`, escrito, não subentendido. Nenhuma regra de
   classificação, categoria, ordem de consulta ou isenção mudou para
   produzir esse campo — é acréscimo de dado, não de comportamento.
2. **A conservação virou partição computada, nos dois sentidos, e o
   ramo de prosa foi removido.** A asserção de `:2953`–`2975` foi
   substituída por uma que lê `discovery.sites` inteiro e, para cada
   sítio, encaminha por categoria (`egressPartitionBucketsForCategory`)
   para um dos cinco baldes nomeados (`requests`, `notGoBound`,
   `assembledUrls`, `nonTransportMemberCalls`,
   `nonGoBoundInstantiations`). Categoria que a função não sabe
   encaminhar devolve `null` e reprova — nunca um `else` mudo. Quatro
   saídas reprovam em vez de passar em silêncio: sítio sem balde algum;
   sítio em mais de um balde; entrada de balde cuja `originSite` não
   corresponde a sítio lido algum; e a própria categoria não
   roteável. A ligação entre sítio e balde é sempre por
   `egressPositionKey(entry.originSite) === egressPositionKey(site)`,
   nunca por `reason.includes(...)` — o ramo de prosa livre não existe
   mais no arquivo. **Exceção declarada, implementada por
   `egressPartitionBucketsForCategory`:** "um dos cinco baldes" é por
   categoria, não pelos cinco em conjunto — a função devolve, por
   categoria, o subconjunto de baldes em que a *checagem* roda, e é
   dentro desse subconjunto que "exatamente um" é exigido. Categorias
   de `fetch` cru (`env_var_*`, `env_vars_*`,
   `caller_resolved_base_url_via_*`, `generic_egress_destination_decided_by_caller_*`,
   `product_prose_to_client_number`) resolvem destino no próprio sítio,
   e o subconjunto é `[requests, notGoBound]`. Já
   `constructor_base_url_*` não resolve destino sozinho — a URL vem de
   parâmetro de construtor —, e o subconjunto é só `[notGoBound]`: a
   saída do sítio ali é o registro de adiamento, e as entradas que a
   varredura de instanciação produz para cada instanciação do cliente
   (em `requests`, `assembledUrls`, `nonGoBoundInstantiations` ou
   `nonTransportMemberCalls`, presas ao sítio pelo mesmo `originSite`)
   são saídas de cada *instanciação*, não segundas saídas do sítio, e
   ficam fora do subconjunto verificado para essa categoria. Um sítio
   `constructor_base_url_*` com uma ou mais instanciações legitimamente
   tem `originSite` em `notGoBound` **e** num dos quatro baldes de
   instanciação ao mesmo tempo, sem que "sítio em mais de um balde"
   reprove — a checagem de duplicidade não olha fora do subconjunto da
   categoria. A partição prova "exatamente um balde dentre os
   roteáveis pela categoria do sítio", não "exatamente um balde dentre
   os cinco", para todo sítio. **A exceção não é vácua:** teste
   permanente novo (`assistant.service.test.ts:3137`) lê a árvore real
   e prova que ao menos um sítio `constructor_base_url_*` de fato tem
   `originSite` em `notGoBound` e num balde de instanciação ao mesmo
   tempo, e que a mesma conta de `:3099` não o reprova — sem este
   sítio real, a exceção seria afirmação nunca confrontada com dado, a
   classe de defeito que este Goal fecha.
3. **O universo de candidatos é declarado, fail-closed.**
   `EGRESS_CANDIDATE_UNIVERSE` nomeia as cinco coleções de
   `HttpEgressDiscovery` — `sites` e `genericEgressPrimitives` entram na
   partição (a segunda via `sites`, porque a declaração de cada
   primitivo genérico é ela própria um sítio classificado);
   `excluded`, `genericEgressCallers` e
   `genericEgressCallersByPrimitive` ficam de fora, cada uma com motivo
   escrito. Um teste confere `EGRESS_CANDIDATE_UNIVERSE.map(...).sort()`
   contra `Object.keys(egress).sort()`: coleção nova que o descobridor
   produza e que esta declaração não nomeie reprova, em vez de ficar de
   fora em silêncio. `excluded` é conferido para não encobrir sítio
   nenhum; `genericEgressCallers` está vazio na árvore atual e o
   controle é fail-closed sobre essa vacuidade; `genericEgressCallersByPrimitive`
   é conferido como reagrupamento sem elemento novo.
4. **Motivo vazio não passa em balde nenhum, nem no registro de
   descarte**, no precedente de `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`
   de D-064. Os cinco baldes da partição e `DOCUMENTED_SILENT_DISCARDS`
   passaram a exigir `reason`/`entry.reason` não vazio; antes só
   `notGoBound` era conferido.
5. **O registro de descarte deixou de ser chaveado por número de
   linha.** A chave agora é o trecho normalizado (`if (...) continue;`
   com espaços colapsados) mais a função de nível superior que o
   envolve (`resolveEnclosingTopLevelFunctionName`), ou
   `<module-level>` quando nenhuma. O mecanismo continua fail-closed
   nos dois sentidos — ocorrência não registrada reprova nomeando
   `arquivo:linha` e o trecho; entrada registrada que a varredura não
   encontra mais reprova como obsoleta — e ganhou uma terceira saída:
   duas ocorrências que normalizam para a mesma chave reprovam por
   ambiguidade, em vez de uma engolir a outra no `Map`
   (`buildSilentDiscardRegistry` já lança nessa condição na construção
   do próprio registro). As **5** entradas de
   `DOCUMENTED_SILENT_DISCARDS` continuam as mesmas cinco da baseline —
   `resolveViaCallers`, as duas de `readEnvSchemaDefault`,
   `findCrossFileCallerBindings` e
   `discoverCallerResolvedGoBoundRequests` —, porque nenhuma edição
   deste Goal tocou o texto-fonte de `http-egress-sites.ts` que
   `findSilentDiscardLines` varre. O alcance declarado do Goal049 não
   foi ampliado: continua sendo descarte guardado por valor ausente na
   forma idiomática reconhecida, não todo `continue;` do módulo.
6. **`NO_REFUSAL_CATEGORY` ganhou controle, em vez de ser removido.**
   `describe("Goal050 / WU-03...")` (`:179`–`210`+) exercita o ramo de
   `expectRefusal` (`:81`–`83`) sobre uma recusa legitimamente sem
   categoria — sítio de `fetch` cujo destino não resolve por env, campo
   de instância nem parâmetro de chamador —, confirmando que o símbolo
   tem, agora, sítio de uso e controle.
7. **Oito controles negativos permanentes provam as oito amarras**, em
   `describe("Goal050 / WU-05 (§8)...")` (`:7444`–`7625`+), cada um com
   as duas saídas conferidas na árvore: crédito por prosa deixa de
   contar e campo de origem esvaziado reprova nomeando o sítio; sítio
   perdido reprova; sítio em dois baldes reprova; balde sem origem
   reprova; deslocamento de linha em `http-egress-sites.ts` não reprova
   em massa; descarte mudo novo continua reprovando; motivo vazio
   reprova em balde e no registro; e a cobertura e a amarra de
   categoria de D-064/D-065 continuam mordendo.
8. **A árvore real produz os mesmos números.** `product-transport-routes.txt`
   tem diff **zero**. Sobre a árvore real: **1** superfície, **4**
   ligações resolvidas, **205** arquivos varridos, **10** rotas, **2**
   instanciações fora do transporte, **0** chamadas de membro fora da
   superfície, **41** ocorrências de `this.http.` classificadas sem
   recusa — inalterados, confirmados pelo controle do escopo §6 do
   Goal047, ainda verde.

**Alternativas:** manter a disjunção com o ramo de prosa e só
reescrever a frase de forma mais rígida (âncora, formato fixo) —
rejeitada: continua sendo crédito por texto, não por dado, e qualquer
reformatação de mensagem inocente voltaria a apagar a conservação sem
quebrar teste algum; provar conservação de candidatos dentro das
funções de varredura (todo `continue;` do módulo), não só entre o
descobridor e os baldes de saída — rejeitada, é ampliação de alcance
que o próprio escopo §9 do Goal proíbe; substituir a leitura textual
por um parser de TypeScript para derivar a origem — rejeitada, acrescenta
dependência nas duas línguas e cria módulo paralelo, sem necessidade:
o campo estrutural resolve a abertura sem trocar o mecanismo de
varredura.

**Motivo:** a conservação do conjunto de egresso era provada por uma
asserção cuja metade decisiva — o segundo ramo da disjunção — era
substring de prosa livre, a mesma classe de defeito (afirmação que a
execução não confronta com o dado) que motivou D-054, D-060, D-063,
D-064 e D-065, agora um nível acima do sítio individual: não mais "a
categoria creditada é a declarada", mas "o balde creditado tem a
origem que diz ter". Trocar a prosa por campo, a cobertura de mão
única por partição nos dois sentidos, e o universo implícito por
universo declarado fecha essa abertura sem tocar nenhuma regra de
classificação.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
ganha `HttpEgressSiteOrigin` e o campo `originSite` em cinco
interfaces de saída e oito sítios de `push`, com **26** inserções e
**1** deleção de linha contra a baseline (**3886** linhas; baseline:
**3861**) — a primeira vez desde o Goal047 que este arquivo tem diff
não-zero. `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o resto: a partição computada, o universo de candidatos
declarado, os cinco baldes e o registro de descarte exigindo motivo
não vazio, a rechave por trecho normalizado mais âncora, o controle de
`NO_REFUSAL_CATEGORY` e os oito controles negativos do escopo §8, com
**7864** linhas (baseline: **7100**) e **215** testes (baseline:
**204**), **215** passando, **0** falhando (`npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator`).
O teste a mais, sobre a rodada anterior, prova a não-vacuidade da
exceção de `egressPartitionBucketsForCategory`: ao menos um sítio
`constructor_base_url_*` real tem `originSite` em `notGoBound` **e**
num balde de instanciação ao mesmo tempo, sem reprovar.
`apps/ai-orchestrator/tests/support/product-transport-routes.txt`
está intocado. `npx vitest run` completo de `apps/ai-orchestrator` →
**1027** testes: **939** passando (baseline: 928), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit` em `apps/ai-orchestrator`: "TypeScript: No
errors found", exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm
run validate:core`: **PASSED** — dos 17 passos, **15** passaram
(inclusive `test:ai-orchestrator`) e **2** pulados por design
(`test:bff`, `test:health-worker`); nenhum falhou. `npm run test:gate`
(raiz): **226** testes, **226** passando, **0** falhando, inalterado —
não exercita `assistant.service.test.ts`. `validate:integration`
continua recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarada como ausente — não
reexecutada por esta unidade de documentação (WU-06). `git status
--porcelain=v1 -uall` lista, ao final desta rodada, só os dois
arquivos de teste citados acima; nenhum diretório temporário de
controle negativo sobrou, e nenhum arquivo de `apps/frontend/src/`,
`apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/evolution-go/`,
`packages/` ou `tools/ia-loop/` foi tocado. Este diff não fecha
**M4**, não afirma fidelidade visual, não prova runtime do serviço Go
e não corrige **A-24**, que continua `PENDENCIA-POS-MVP`.

**Limite declarado, escopo §4 (herdado de D-065, não afrouxado):** a
enumeração de `findSilentDiscardLines` continua cobrindo só descarte
guardado por valor ausente seguido de `continue;` na forma idiomática
reconhecida, não todo `continue;` do módulo, e não é prova de
conservação de candidatos dentro das funções de varredura — a
partição deste Goal prova conservação **entre o descobridor e os
baldes de saída**, não dentro delas.

**Revisar se:** o primeiro chamador real de um primitivo genérico
aparecer e exigir que `genericEgressCallers` deixe de estar
declaradamente vazio; se a prova de conservação de candidatos dentro
das funções de varredura (o `continue;` que este Goal declara fora de
alcance) deve virar Goal próprio; e se o campo `originSite` deve, em
Goal futuro, substituir a frase do `reason` também como texto para
quem lê, não só como dado de prova.

## D-067 — A partição de egresso passa a conferir as duas mãos, e o universo de saída de `discoverGoServiceHttpRequests` é declarado fail-closed, propostas no Goal051

**Status:** ACCEPTED no [review051](reviews/051-review.md) (rodada 5 de
5, 2026-09-22; rodadas 1 a 4 fecharam `CHANGES_REQUIRED`, com 2, 2, 2 e
1 blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018).
O mecanismo das rodadas 2 a 5 é o mesmo: o único blocker de mecanismo
foi o da rodada 1 — a asserção de correspondência entre o `reason` e o
campo `originSite` não podia falhar por construção, e faltava o
controle negativo que o escopo §5 exige. As quatro rodadas seguintes
foram gastas em texto de documento permanente: contagens defasadas em
relação à execução final, prova atribuída a um controle que não a
exerce, descrição errada do que o controle 7 faz e um ponteiro
`arquivo:linha` que apontava para o controle negativo vizinho. Nenhuma
delas afrouxou invariante; todas corrigiram documento a favor do que a
execução mostra.

**Contexto:** o [review050](reviews/050-review.md) aceitou D-066 sem
blockers e registrou duas observações não bloqueantes. A observação 1:
`findEgressPartitionFindings` conferia só o lado do sítio — para cada
sítio, perguntava a `egressPartitionBucketsForCategory` quais baldes
sua categoria roteia e checava presença só nesses; do lado da entrada,
o único requisito era que a origem declarada fosse um sítio de fato
lido e que o motivo não fosse vazio. Sondagem independente sobre a
baseline achou **10** das **19** entradas dos cinco baldes num balde
que a categoria da própria origem não roteia — nenhuma asserção as
olhava; uma entrada inventada em balde errado passaria verde. A
observação 2: o `reason` da requisição resolvida no chamador
(`http-egress-sites.ts:2080` na baseline) repetia `arquivo:linha` da origem como
prosa, sem nada que impedisse a frase e o campo `originSite` de
divergir. A um nível acima dessas duas, achado desta passada de
planejamento: o universo de **saída** de `discoverGoServiceHttpRequests`
não tinha o `EGRESS_CANDIDATE_UNIVERSE` do lado de entrada — o
descobridor devolve 7 chaves em runtime, `EGRESS_PARTITION_BUCKETS`
nomeava 5, e `internalClientSurfaces`/`callerResolutions` ficavam fora
sem declaração, sem motivo escrito e sem nada que reprovasse chave
nova.

**Decisão:**

1. **O encaminhamento por categoria passa a declarar saída própria e
   saída derivada, separadamente.** `egressPartitionBucketsForCategory`
   deixou de devolver um array só e passou a devolver
   `EgressPartitionCategoryRouting { ownOutput, derivedOutput }`.
   Para as categorias de `fetch` cru (`env_var_*`, `env_vars_*`,
   `product_prose_to_client_number`, `caller_resolved_base_url_via_*`,
   `generic_egress_destination_decided_by_caller_*`) os dois conjuntos
   coincidem: `[requests, notGoBound]`. Para `constructor_base_url_*`
   a saída própria é só `[notGoBound]` — o registro de adiamento — e a
   saída derivada é `[requests, assembledUrls, nonGoBoundInstantiations,
   nonTransportMemberCalls]`, os baldes que a varredura de instanciação
   povoa a partir daquele sítio. Categoria que a função não sabe
   encaminhar continua devolvendo `null` e reprovando — nenhum ramo
   `else` mudo foi introduzido.
2. **A partição confere agora as duas mãos.** Toda entrada dos cinco
   baldes é conferida contra o conjunto que a categoria da sua origem
   declarada permite: saída própria quando a entrada ocupa a posição do
   sítio, saída derivada quando não. `findEgressPartitionFindings`
   ganhou a saída `entriesInBucketNotAllowedByOriginCategory`, e as
   quatro saídas do Goal050 (`unroutable`, `withoutBucket`,
   `inMoreThanOneBucket`, `entriesWithoutReadOrigin`) continuam
   existindo, com `inMoreThanOneBucket` agora avaliado só sobre a saída
   própria — que é onde "exatamente um" sempre valeu. Sobre a árvore
   real, depois da correção, as **10** entradas que a observação 1
   apontou já não aparecem em `entriesInBucketNotAllowedByOriginCategory`
   nenhuma: a mesma conta que reprovava zero antes (porque não olhava)
   continua reprovando zero agora, mas desta vez porque de fato
   confere as **19** entradas dos cinco baldes contra a categoria da
   sua origem. O controle negativo 1 do escopo §8 prova a mordida:
   mover uma entrada real para um balde que a categoria da sua origem
   não permite reprova, nomeando balde, entrada, origem e categoria.
3. **O universo de saída de `discoverGoServiceHttpRequests` é
   declarado, fail-closed, no precedente exato de
   `EGRESS_CANDIDATE_UNIVERSE`.** `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`
   nomeia as **7** chaves que o descobridor devolve em runtime:
   `requests`, `notGoBound`, `assembledUrls`, `nonTransportMemberCalls`
   e `nonGoBoundInstantiations` entram na partição — o conjunto exato
   de `EGRESS_PARTITION_BUCKETS`; `internalClientSurfaces` e
   `callerResolutions` ficam fora, cada uma com motivo escrito: são
   relatórios do que a resolução leu — a superfície de cada cliente e o
   que a resolução de chamadores encontrou —, não coleções de entradas
   com `originSite` próprio. Um teste confere
   `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE.map(...).sort()` contra
   `Object.keys(discovery).sort()` da execução real, e que a lista das
   chaves declaradas dentro da partição coincide exatamente com
   `EGRESS_PARTITION_BUCKETS`: chave nova que o descobridor devolva e a
   declaração não nomeie reprova; chave declarada aqui que o
   descobridor deixe de devolver reprova como declaração obsoleta. Os
   controles negativos 3 e 4 do escopo §8 provam as duas direções sobre
   um conjunto de chaves corrompido.
4. **Vacuidade por balde é declarada ou exercida, balde a balde.**
   Sobre a árvore real: `requests` (**10**), `notGoBound` (**6**),
   `assembledUrls` (**1**) e `nonGoBoundInstantiations` (**2**) têm
   não-vacuidade asserida diretamente. `nonTransportMemberCalls` é
   **0** na árvore real. O controle negativo 2 do Goal044 (`:4314`,
   cenário "antes") já prova, sobre árvore sintética de arquivos, que o
   balde recebe entrada quando a derivação acha um membro que não
   alcança fetch nem delega — mas não exercita a checagem de categoria
   de origem, porque a árvore real nunca popula o balde. O controle
   negativo 7 do escopo §8 (`assistant.service.test.ts:8551`) fecha essa
   lacuna com estado de partição sintético próprio, dedicado a este
   propósito: povoa `nonTransportMemberCalls` com uma entrada de origem
   `constructor_base_url_*` (permitida) e confere saída verde; depois,
   com a mesma entrada movida para origem `env_var_*` (não permitida
   para este balde), confere que a mesma conta do controle negativo 1
   reprova, nomeando balde, entrada, origem e categoria — o sentido
   inverso que a vacuidade da árvore real deixaria sem exercício.
5. **O trecho do `reason` que cita a posição da origem passa a ser
   computado do campo `originSite`, não mais recalculado à parte.**
   `http-egress-sites.ts` mudou a montagem do motivo da requisição
   resolvida no chamador (`:2080` na baseline do Goal050) — o `reason`
   já interpolava `${site.filePath}:${site.line}`, mas essa expressão
   era escrita de novo, separada da montagem do campo `originSite`
   (`:2079` na mesma baseline), e as duas podiam divergir por edição
   independente. A mudança introduz uma constante local `originSite`
   (`http-egress-sites.ts:2073`) e faz o campo e a citação no `reason`
   lerem dela — os dois não podem mais divergir por construção. Um
   teste permanente confere, sobre a árvore real, que
   toda entrada de `requests` cujo motivo contém "o fetch está em"
   contém também `o fetch está em ${originSite.filePath}:${originSite.line}`
   (`assistant.service.test.ts:3519`–`3521`, `toContain`, não
   igualdade nem sufixo: o `reason` continua com prosa depois da
   posição); na árvore real há **1** entrada nessa condição (a requisição de
   `health.ts:22`, motivo montado a partir de `health.ts:46`), e um
   controle negativo dedicado (WU-03, `assistant.service.test.ts`, logo
   após o teste permanente) prova que motivo divergente do campo
   reprova: a mesma conta que o teste permanente chama, aplicada a uma
   entrada real com `originSite` deslocado uma linha, acusa a entrada
   nomeando `arquivo:linha` da requisição e `arquivo:linha` da origem
   divergente.
6. **Nenhum mecanismo de classificação foi alterado.** As 9 categorias
   vistas na árvore, os três vocabulários de recusa, os quatro grupos
   de categorias de recusa e `DOCUMENTED_SILENT_DISCARDS` (**5**
   entradas) mantêm o conteúdo e o comportamento da baseline. Os
   controles negativos 5 e 8 do escopo §8 confirmam que a exceção de
   `constructor_base_url_*` continua não vácua na forma nova e que a
   cobertura de categoria e a enumeração de descarte do Goal049/050
   continuam mordendo.
7. **A árvore real produz os mesmos números.** `product-transport-routes.txt`
   tem diff zero. Sobre a árvore real, por sondagem própria: **9**
   sítios, cinco baldes com **19** entradas no total (`requests` 10,
   `notGoBound` 6, `assembledUrls` 1, `nonGoBoundInstantiations` 2,
   `nonTransportMemberCalls` 0), **7** chaves em
   `discoverGoServiceHttpRequests` (`internalClientSurfaces` 1,
   `callerResolutions` 1, fora da partição), **1** superfície, **4**
   ligações resolvidas, **205** arquivos varridos, **10** rotas, **2**
   instanciações fora do transporte, **0** chamadas de membro fora da
   superfície e as **41** ocorrências de `this.http.` em
   `apps/bff/src/clients/` classificadas sem recusa — todas
   reconfirmadas pela suíte permanente, ainda verde.

**Alternativas:** conferir a mordida do lado da entrada só por
amostragem ou só sobre as categorias que hoje têm entrada derivada —
rejeitada, deixaria a mesma classe de lacuna para a próxima categoria
que ganhar saída derivada; declarar `internalClientSurfaces` e
`callerResolutions` como baldes de partição a mais, em vez de
relatórios fora com motivo — rejeitada, o escopo §9 do Goal proíbe
transformá-los em baldes de destino de sítio, e eles não carregam
`originSite` próprio; substituir a frase inteira do `reason` por um
texto genérico sem posição alguma — rejeitada, o Goal permitia as duas
saídas (computar do campo ou remover a posição do motivo) e computar
do campo preserva o texto útil para quem lê sem abrir a divergência.

**Motivo:** a partição do Goal050 mordia de uma mão só — media
generosamente do lado do sítio e cobrava pouco do lado da entrada — e
o universo de saída da leitura de requisições não tinha o mesmo
tratamento fail-closed que o universo de entrada já tinha desde
D-066. As duas aberturas são a mesma classe de defeito, um nível
diferente: mecanismo que prova parte do que afirma prova o resto por
omissão, não por verificação.

**Consequências:**
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` ganha **3**
inserções e **2** deleções contra a baseline do Goal050 (**3887**
linhas; baseline: **3886**) — só a montagem do motivo da requisição
resolvida no chamador, sem tocar regra de classificação, categoria,
ordem de consulta ou isenção alguma.
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o resto — o encaminhamento de duas mãos, a conferência do
lado da entrada, o universo de saída declarado, a vacuidade por balde
e os oito controles negativos do escopo §8 — com **909** inserções e
**55** deleções contra a mesma baseline (**8718** linhas; baseline:
**7864**) e **227** testes (baseline: **215**), **227** passando, **0**
falhando (`npx vitest run tests/assistant/assistant.service.test.ts`
em `apps/ai-orchestrator`). Os **12** testes a mais provam,
respectivamente, o universo de saída declarado, a vacuidade dos cinco
baldes, a correspondência frase/campo e os oito controles negativos.
`apps/ai-orchestrator/tests/support/product-transport-routes.txt`
está intocado. `npx vitest run` completo de `apps/ai-orchestrator` →
**1039** testes: **951** passando (baseline: 939), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit` em `apps/ai-orchestrator`: "TypeScript: No
errors found", exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm
run validate:core`: **PASSED** — dos 17 passos, **15** passaram
(inclusive `test:ai-orchestrator`) e **2** pulados por design
(`test:bff`, `test:health-worker`); nenhum falhou. `npm run test:gate`
(raiz): **226** testes, **226** passando, **0** falhando, inalterado —
não exercita `assistant.service.test.ts`. `validate:integration`
continua recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarada como ausente. `git
status --porcelain=v1 -uall` lista, ao final desta rodada, **6**
arquivos: os dois de teste citados acima e os quatro documentos
permanentes de migração que este fechamento atualiza
(`docs/migration/CURRENT_STATE.md`, `docs/migration/DECISIONS.md`,
`docs/migration/FINAL_AUDIT.md`, `docs/migration/VALIDATION_GATE.md`);
nenhum diretório temporário de controle negativo sobrou, e nenhum
arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/` ou
`tools/ia-loop/` foi tocado. Este diff não fecha **M4**,
não afirma fidelidade visual, não prova runtime do serviço Go e não
corrige **A-24**, que continua `PENDENCIA-POS-MVP`.

**Limite declarado, herdado de D-066 e do escopo §9 do Goal051, não
afrouxado:** a partição continua provando conservação **entre o
descobridor e os baldes de saída**, não dentro das funções de
varredura — o `continue;` sem guarda de valor ausente, ou em bloco com
outra instrução antes, continua fora de alcance de qualquer mecanismo
desta rodada. `internalClientSurfaces` e `callerResolutions` ganharam
motivo declarado para estarem fora da partição, não pertencimento
novo. A enumeração de `findSilentDiscardLines` continua cobrindo só
descarte guardado por valor ausente na forma idiomática reconhecida.

**Revisar se:** uma sexta categoria de sítio aparecer e exigir saída
própria e derivada que não coincidam com nenhum dos dois padrões
atuais; se `nonTransportMemberCalls` deixar de ser vazio na árvore real
e a asserção de não-vacuidade direta precisar substituir a dependência
do controle negativo do Goal044; e se a prova de conservação de
candidatos dentro das funções de varredura, declarada fora de alcance
desde D-065, deve virar Goal próprio.

## D-068 — O descarte é enumerado por inteiro: toda ocorrência de `continue;` é classificada pela forma do laço, e a chave da classe portadora de candidato sobrevive à forma nua por multiplicidade declarada, propostas no Goal052

**Status:** ACCEPTED no [review052](reviews/052-review.md) (rodada 2 de
2, 2026-09-22; a rodada 1 fechou `CHANGES_REQUIRED`, com 2 blockers),
pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). O blocker
de mecanismo da rodada 1 foi a classe `while-condition`, que isentava
em bloco as 6 ocorrências de `continue;` dentro de `while` sem critério
computado — inclusive `http-egress-sites.ts:1028`, que é descarte de
candidato numa fila de trabalho. A rodada 2 fechou-o partindo `while`
em três classes com critério textual próprio, sem ramo de sobra, e o
item 3 abaixo descreve o comportamento vigente.

**Contexto:** o [review051](reviews/051-review.md) aceitou D-067 sem
blockers de mecanismo, na rodada 5 de 5. Um nível abaixo de toda a
família Goal049–051 ficava o último fail-open conhecido desta série:
`findSilentDiscardLines` (baseline: `assistant.service.test.ts:6513`)
reconhecia uma única forma de descarte — `if (<condição sobre valor
ausente>) continue;` —, e o comentário de `:6442` declarava em prosa,
à mão, que o módulo tinha **120** ocorrências de `continue;` no total,
das quais **52** na forma de guarda e **68** nuas, sem nenhuma
asserção conferindo esse número. Sondagem própria achou vários
`continue;` nus ou guardados por condição fora da regex, já presentes
na árvore (`http-egress-sites.ts:1900`, `:3766`, `:2684`, `:1052`,
`:3601`), que entravam no módulo, passavam verde e não deixavam
documento algum falso — porque nenhum documento afirmava nada sobre
eles.

**Decisão:**

1. **A enumeração passa a achar toda ocorrência de `continue;`, com a
   contagem total computada em runtime.** `enumerateContinueOccurrences`
   (`assistant.service.test.ts:7488`) varre o texto do módulo,
   classifica cada posição num contexto léxico fechado
   (`CONTINUE_LEXICAL_CONTEXTS`: `code`, `comment`, `string-literal`,
   `template-literal`, `regex-literal`) e resolve o laço mais interno
   que contém cada `continue;` por casamento de parênteses e chaves
   sobre o texto com o não-código mascarado — nunca por recuo de
   indentação, a técnica em que a sondagem do próprio Goal falhou em
   **5** pontos da árvore real (`:1761`, `:1765`, `:1769`, `:1773`,
   `:1796`), hoje todos classificados. O comentário de `:6442` não
   carrega mais número escrito à mão; o total é
   `findContinueEnumerationFindings(...).total`, provado igual à
   contagem textual independente de `continue;` sobre o mesmo texto.
   Sobre a árvore real: **120** ocorrências, todas em contexto `code`
   — o ramo não-`code` é vazio hoje e exercido por fonte sintética.
2. **Cada ocorrência cai numa classe computada do vocabulário fechado
   `CONTINUE_LOOP_FORMS`** (`for-of`, `for-in`, `for-indexed`,
   `while-exec-match`, `while-queue-drain`, `while-positional-read`,
   `do-while`), e ocorrência cujo laço contenedor a classificação não
   resolve, ou cuja classe cai fora do vocabulário, reprova nomeando
   `arquivo:linha` — provado pelo controle 3 do escopo §9. **`while`
   é partido em três classes, cada uma com critério textual próprio em
   `classifyContinueLoopForm`, e nenhuma delas é o ramo de sobra das
   outras:** cabeçalho que atribui o resultado de um `.exec(` é
   `while-exec-match`; cabeçalho que testa a não-vaziez da própria
   coleção (`<coleção>.length > 0`, `.size !== 0` e formas irmãs) é
   `while-queue-drain`, porque cada volta consome um elemento da
   coleção e portanto é um candidato; cabeçalho que compara um cursor
   escalar com um limite (`i < body.length`, `i < bodyEnd`) é
   `while-positional-read`; e cabeçalho de `while` que não casa
   nenhum dos três **reprova**, como já acontecia com `for`. Sobre a
   árvore real o resíduo é **zero**: **41** `for-of`, **55**
   `for-indexed`, **18** `while-exec-match`, **5**
   `while-positional-read` (`:1458`, `:1484`, `:2989`, `:2996`,
   `:2999`) e **1** `while-queue-drain` (`:1028`); `for-in` e
   `do-while` são vazios na árvore real e exercidos por fonte
   sintética — as sete classes têm prova, nenhuma só em prosa.
3. **A classe iteração sobre candidatos (`for-of`, `while-exec-match`,
   `while-queue-drain` — `CONTINUE_CANDIDATE_LOOP_FORMS`, `:7880`)
   exige registro nomeado com motivo não vazio; a classe leitura
   posicional (`for-indexed`, `while-positional-read`) é isenta pelo
   critério computado do item 2, sem registro por ocorrência.**
   `DOCUMENTED_SILENT_DISCARDS` (`:6517`) cresceu de **5** para **43**
   entradas, absorvendo as 5 da baseline sem duplicação (2 delas, de
   `readEnvSchemaDefault`, são na verdade leitura posicional —
   continuam registradas, mas deixaram de ser exigidas) e cobrindo as
   **60** ocorrências reais da classe candidata. A 60ª é
   `http-egress-sites.ts:1028`
   (`while (pendingPrimitives.length > 0)` com
   `pendingPrimitives.shift()` na primeira linha do corpo): descarte de
   candidato dentro de um `while`, que a rodada 1 deste Goal isentava
   em bloco por classificá-lo num `while-condition` sem critério.
   `findSilentDiscardFindings` — a mesma conta que o teste
   permanente e os controles chamam, nunca uma segunda implementação —
   roda sobre a árvore real com as quatro saídas vazias:
   `ambiguousKeys`, `unregistered`, `obsolete` e `emptyReason`.
4. **A chave sobrevive à forma nua por multiplicidade declarada.**
   `continue;` nu normaliza sempre para a mesma string
   `<função>::continue;`, e a sondagem achou a colisão de fato — até
   **7** ocorrências nuas na mesma função
   (`resolveModuleExportBindings`). `SilentDiscardEntry.multiplicity`
   declara quantas ocorrências legítimas compartilham a chave (ausente
   = 1), e `findSilentDiscardFindings` reprova por ambiguidade quando a
   contagem real diverge da declarada, nos dois sentidos — sem ler
   número de linha, discriminador que o Goal050 já havia proibido. O
   controle 6 do escopo §9 prova que deslocar linhas continua não
   reprovando em massa.
5. **Vacuidade não é aceita como prova.** As duas classes vazias na
   árvore real (`for-in`, `do-while`) e o contexto léxico não-`code`
   (vazio hoje) são exercidos por fonte sintética dedicada; as
   **cinco** classes presentes (`for-of`, `for-indexed`,
   `while-exec-match`, `while-queue-drain`, `while-positional-read`)
   têm contagem maior que zero asserida diretamente. O cabeçalho de
   `while` fora dos três critérios não existe na árvore real e é
   exercido por fonte sintética no controle 3.
6. **O ponteiro de prosa de `:3483` é corrigido.** O `it` passou a
   citar `:4314` — o cenário "antes" real do controle negativo 2 do
   Goal044 — em vez de `:4199`. Correção de uma linha; nenhuma
   asserção do teste mudou.
7. **Nenhum mecanismo de classificação de egresso foi alterado.** As 9
   categorias vistas na árvore, os três vocabulários de recusa,
   `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES` (**2** entradas),
   `EGRESS_PARTITION_BUCKETS`, `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`,
   `EGRESS_CANDIDATE_UNIVERSE` e `egressPartitionBucketsForCategory`
   mantêm conteúdo e comportamento da baseline.
8. **Os oito controles negativos do escopo §9 mordem**, cada um
   chamando a mesma conta que o teste permanente chama
   (`assistant.service.test.ts:10202` a `:10552`): descarte novo em
   laço de candidatos reprova; `continue;` nu não registrado reprova;
   laço de forma não reconhecida reprova; entrada obsoleta reprova;
   motivo vazio reprova e chave duplicada continua lançando dentro do
   registro; deslocamento de linha continua não reprovando em massa;
   mover um `continue;` entre classes muda a exigência de registro nos
   dois sentidos; e a partição do Goal050/051 e a cobertura do Goal049
   continuam mordendo.

**Alternativas:** resolver o laço contenedor por recuo de indentação —
rejeitada, é a técnica que a sondagem do próprio Goal provou falhar em
5 pontos da árvore real; chavear o registro por número de linha para
resolver a colisão da forma nua — rejeitada, proibida desde o Goal050,
e o controle de deslocamento de linha existe exatamente para provar
que isso não é necessário; tratar toda repetição de `continue;` nu
como ambígua por padrão — rejeitada, o caso predominante na árvore
real é repetição legítima dentro do mesmo laço, e marcar tudo como
ambíguo derrubaria o registro inteiro sem sinalizar nada de útil.

**Motivo:** os Goals 049 a 051 fecharam, um nível de cada vez, a mesma
família de defeito um nível acima deste: prova creditada por prosa em
vez de por estrutura computada. A isenção do descarte de candidato era
a última instância dessa classe — "varredura lexical de caractere" e
"dentro de bloco com outra instrução antes" eram adjetivos de
comentário, não critério computado, e o próprio número total de
`continue;` do módulo vivia escrito à mão exatamente dentro do
mecanismo que deveria prová-lo.

**Consequências:**
`apps/ai-orchestrator/tests/support/http-egress-sites.ts` está
intocado (diff zero contra a baseline; **3887** linhas, mesma contagem
da baseline). `apps/ai-orchestrator/tests/support/product-transport-routes.txt`
também está intocado (diff zero).
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o diff inteiro: **1948** inserções e **113** deleções
contra a baseline (**10553** linhas; baseline: 8718) e **249** testes
(baseline: 227), **249** passando, **0** falhando (`npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator`).
Os **22** testes a mais se dividem em **9** no bloco da enumeração e
classificação (WU-01), **5** no bloco do registro unificado por
multiplicidade (WU-02) e **8** nos controles negativos do escopo §9
(WU-04). `npx vitest run` completo de `apps/ai-orchestrator` →
**1061** testes: **973** passando (baseline: 951), **88** pulados
(mesma contagem da baseline), **0** falhando. `npx tsc -p
tsconfig.json --noEmit` em `apps/ai-orchestrator`: "TypeScript: No
errors found", exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm
run validate:core`: **PASSED** — dos 17 passos, **15** passaram
(inclusive `test:ai-orchestrator`) e **2** pulados por design
(`test:bff`, `test:health-worker`); nenhum falhou. `npm run test:gate`
(raiz): **226** testes, **226** passando, **0** falhando, inalterado —
não exercita `assistant.service.test.ts`. `validate:integration`
continua recusando por pré-condição de banco ausente (`exit 2`,
`BFF_TEST_DATABASE_URL is not set`), declarada como ausente. `git
status --porcelain=v1 -uall` lista, ao final desta rodada, **5**
arquivos: o arquivo de teste citado acima e os quatro documentos
permanentes de migração que este fechamento atualiza
(`docs/migration/CURRENT_STATE.md`, `docs/migration/DECISIONS.md`,
`docs/migration/FINAL_AUDIT.md`, `docs/migration/VALIDATION_GATE.md`);
nenhum diretório temporário de controle negativo sobrou, e nenhum
arquivo de `apps/frontend/src/`, `apps/bff/src/`,
`apps/ai-orchestrator/src/`, `apps/evolution-go/`, `packages/` ou
`tools/ia-loop/` foi tocado. Este diff não fecha **M4**, não afirma
fidelidade visual, não prova runtime do serviço Go e não corrige
**A-24**, que continua `PENDENCIA-POS-MVP`.

**Limite declarado, herdado de D-065/D-066/D-067, não afrouxado:**
registrar um descarte com motivo escrito diz que ele está nomeado e
justificado, não que o candidato descartado não importava — a
conservação de candidatos **dentro** das funções de varredura de
`http-egress-sites.ts` continua fora de alcance de qualquer mecanismo
desta rodada. A enumeração não se estende a `return`, `break` ou saída
antecipada de função: o alcance é `continue;`, e o que fica fora
continua declarado como fora, agora com o número computado em vez de
estimado.

**Revisar se:** o vocabulário `CONTINUE_LOOP_FORMS` precisar de uma
oitava forma que a árvore real ainda não contém; o critério textual
que separa `while-queue-drain` de `while-positional-read` (não-vaziez
da própria coleção contra cursor escalar comparado a um limite) deixar
de bastar para alguma forma nova de `while` que a árvore venha a ter —
hoje essa forma nova **reprova** em vez de ser isentada, que é o
comportamento desejado, mas a reprovação pede classe nova com
critério próprio, não um ramo de sobra; e se a prova de conservação de
candidatos dentro das funções de varredura, declarada fora de alcance
desde D-065 e reafirmada aqui, deve virar Goal próprio.

A condição que a rodada 1 deste Goal escreveu aqui como futura —
"se a árvore real vier a ter `continue;` de descarte de candidato
dentro de um `while` de condição" — **já valia na baseline**:
`http-egress-sites.ts:1028` é exatamente esse caso, e a rodada 2
fechou-o partindo `while` em três classes com critério computado.
Não é mais condição de revisão; está no item 3 acima como
comportamento vigente.

## D-069 — O critério da isenção é o domínio percorrido: leitura posicional só isenta quando o cursor indexa sequência de caracteres ou máscara paralela, e coleção de elementos exige registro mesmo em `for-indexed`, propostas no Goal053

**Status:** ACCEPTED no [review053](reviews/053-review.md) (rodada 3 de 3,
2026-09-22; as rodadas 1 e 2 fecharam `CHANGES_REQUIRED`, com 3 e 2
blockers), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018),
sobre a baseline `2adb7cabf2cc09707287e1d440d6041b51d6cfe9` (fechamento
do Goal052). Os cinco blockers das rodadas 1 e 2 foram todos de prosa
permanente afirmando critério que o código não implementa: `.split(…)`
listado como evidência de `character-sequence` quando é evidência de
`element-collection`; a evidência "citando `arquivo:linha`" declarada
sem a ressalva das **60** ocorrências `no-domain`, que nomeiam a forma
do laço e não uma ligação; a prova (b) de `parallel-mask` ampliando a
isenção sem estar declarada em documento algum; `literal` listado como
evidência de `character-sequence` quando `resolveIndexedBaseShape` não
tem esse ramo e um literal sem anotação cai em `unresolved`; e a
afirmação de que as duas provas de `parallel-mask` eram exercidas por
fonte sintética, quando só a prova (a) é. O mecanismo passou nas três
rodadas sem blocker.

**Contexto:** D-068 (Goal052) classificava cada `continue;` numa classe
computada do cabeçalho do laço (`CONTINUE_LOOP_FORMS`) e isentava de
registro toda a leitura posicional (`for-indexed`, `while-positional-read`)
só por essa forma, sem olhar o que o cursor de fato percorre. A observação 1
do [review052](reviews/052-review.md) apontou o risco; a sondagem própria do
Goal053 confirmou fail-open real, não hipotético: `http-egress-sites.ts` tem
**6** ocorrências de `continue;` (`:1141`, `:1143`, `:1157`, `:1159`,
`:1160`, `:3872`) dentro de `for (let index = 0; index < lines.length; …)`
com `lines` vindo de `source.split(…)` — cada volta é uma linha candidata,
descartada como um `for…of` descartaria — classificadas como `for-indexed` e
isentas em bloco pelo critério do Goal052.

**Decisão:**

1. **Cada ocorrência em contexto `code` ganha um domínio percorrido,
   computado do texto do módulo, em vocabulário fechado
   `CONTINUE_CURSOR_DOMAINS`** (`character-sequence`, `parallel-mask`,
   `element-collection`, `no-domain`), resolvido por
   `resolveContinueCursorDomain` dentro do caminho já existente
   (`enumerateContinueOccurrences` → `enumerateSilentDiscardOccurrences` →
   `findSilentDiscardFindings`), nunca por segunda varredura. Para
   `character-sequence`, `parallel-mask` e `element-collection`, a
   evidência que concedeu o domínio é registrada por ocorrência
   (`cursorDomainEvidence`), citando `arquivo:linha` da ligação que provou o
   valor indexado (`.split(…)`, parâmetro anotado `: string`,
   `new Array<…>(uptoIndex)` e afins) — nunca lista de nomes de variável,
   indentação ou nome de função. As **60** ocorrências `no-domain` não
   citam ligação alguma: sua evidência nomeia a forma do laço e o
   cabeçalho (`laço \`<forma>\` não avança por cursor escalar indexado:
   consome o que percorre diretamente`), porque o laço já consome
   candidato diretamente, sem cursor a resolver. `parallel-mask` tem
   **duas** provas, nenhuma citando nome de variável escrito à mão:
   (a) o comprimento do arranjo vem do comprimento de uma sequência de
   caracteres, na forma `<string>.length`; (b) o
   mesmo cursor indexa o arranjo **e** uma sequência de caracteres no
   mesmo corpo do laço, mesmo quando a forma do arranjo não amarra seu
   comprimento a `.length` de coisa alguma — cada posição do arranjo é
   uma posição de caractere pela coincidência de cursor. A prova (b)
   amplia a isenção: sem ela, um arranjo cuja forma não prova a relação
   de comprimento reprovaria como resíduo; com ela, a ocorrência fica
   isenta. A máscara real da árvore (`quoteMask`, de `computeQuoteMask`
   / `new Array<…>(uptoIndex)`) cai na prova **(b)**, não na (a): o
   argumento de comprimento é `uptoIndex`, que não casa
   `<string>.length`. Sobre a árvore real:
   **60** `no-domain`
   (as três classes já portadoras de candidato, que não indexam cursor
   algum), **54** `character-sequence`, **6** `element-collection`, **0**
   `parallel-mask` — soma **120**, igual ao total de ocorrências em
   `code` (`nonCode` é vazio). `parallel-mask` computa **0** porque na
   árvore real a única máscara paralela (prova (b)) compartilha cursor
   com uma sequência de caracteres, e a precedência de aperto dá o
   domínio final à sequência, não à máscara; prova (b) é exercida pela
   árvore real (mascarada pela precedência), só prova (a) precisa de
   fonte sintética.
2. **A isenção de registro passa a depender do domínio, não mais só da
   classe do cabeçalho.** Para leitura posicional (`for-indexed`,
   `while-positional-read`): domínio `character-sequence` ou
   `parallel-mask` continua isento; domínio `element-collection` passa a
   exigir registro, mesmo com cabeçalho `for-indexed`; domínio que a
   resolução não prova, ou que cai fora do vocabulário, **reprova**
   nomeando `arquivo:linha` e o motivo — nenhum ramo `else` mudo.
3. **As 6 ocorrências sobre `lines` passam a exigir registro.**
   `DOCUMENTED_SILENT_DISCARDS` cresceu de **43** para **47** entradas: as
   2 entradas herdadas de `readEnvSchemaDefault` (baseline, com
   `requiresRegistration` computado `false`) são **reaproveitadas**, não
   duplicadas, e passam a ser conferidas de verdade — removê-las produz
   `unregistered`; as **4** entradas novas cobrem `readEnvFileValue`
   (3 ocorrências) e `readProductTransportRoutesFile` (1 ocorrência), cada
   uma com motivo escrito substantivo. Multiplicidade e a proibição de
   chave por linha (Goal050) não mudam.
4. **`while` posicional continua isento pelo mesmo critério, não mais pela
   forma do cabeçalho.** As **5** ocorrências reais (`:1458`, `:1484`,
   `:2989`, `:2996`, `:2999`) continuam isentas porque o domínio que
   indexam é `character-sequence`; a prova de que um `while` posicional
   sobre `element-collection` passaria a exigir registro é por fonte
   sintética, fechando a observação 2 do review052.
5. **Nada do Goal052 foi afrouxado.** `for-of` (**41**),
   `while-exec-match` (**18**) e `while-queue-drain` (**1**) continuam
   exigindo registro independentemente do domínio — nenhuma delas indexa
   cursor algum, então todas caem em `no-domain`, e `no-domain` não isenta.
6. **Nenhum mecanismo de classificação de egresso foi alterado**: as 9
   categorias vistas na árvore, os três vocabulários de recusa,
   `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, `EGRESS_PARTITION_BUCKETS`,
   `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`, `EGRESS_CANDIDATE_UNIVERSE`
   e `egressPartitionBucketsForCategory` mantêm conteúdo e comportamento da
   baseline.
7. **Os oito controles negativos do escopo §9 do Goal053 mordem**, cada um
   chamando a mesma conta que o teste permanente chama: `continue;` sobre
   coleção de elementos não registrado reprova; `for-indexed` sobre
   sequência de caracteres continua isento e a mesma guarda sobre coleção
   exige registro (as duas saídas, por fonte sintética); `while`
   posicional sobre coleção reprova e sobre string continua isento (as
   duas saídas); domínio não resolvido ou fora do vocabulário reprova;
   entrada que perde a ocorrência reprova como obsoleta e motivo vazio
   reprova; deslocamento de linha continua não reprovando em massa; nenhuma
   ocorrência que já exigia registro por classe deixou de exigir; e a
   partição do Goal050/051 e a cobertura do Goal049 continuam mordendo.

**Alternativas:** resolver o domínio por allowlist de nomes de variável
(`source`, `text`, `content`, `lines`) — rejeitada, é a mesma prosa do
antipadrão que os Goals 048 a 052 já removeram, só que com outro rótulo;
resolver por indentação ou por nome de função — rejeitada, técnica que a
sondagem do Goal052 já provou falhar em 5 pontos da árvore real; isentar
`element-collection` também quando o cabeçalho é `for-indexed` — rejeitada,
é exatamente o fail-open que a observação 1 do review052 apontou.

**Motivo:** classe computada do cabeçalho mede a forma sintática do laço,
não o que o cursor percorre. Um `for (let i = 0; i < lines.length; …)` e um
`for (let i = 0; i < source.length; …)` têm a mesma forma e domínios opostos
— um descarta candidato, o outro avança leitura. Medir só a forma e chamar
isso de critério de isenção é a mesma família de defeito que os Goals 048 a
052 fecharam, um nível acima.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
está intocado (diff zero contra a baseline; **3887** linhas, mesma contagem
da baseline). `apps/ai-orchestrator/tests/support/product-transport-routes.txt`
também está intocado (diff zero).
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` concentra o
diff inteiro: **1115** inserções e **37** deleções contra a baseline
(**11631** linhas; baseline: **10553**) e **255** testes (baseline: **249**),
**255** passando, **0** falhando (`npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator`).
`npx vitest run` completo de `apps/ai-orchestrator` → **1067** testes:
**979** passando (baseline: **973**), **88** pulados (mesma contagem da
baseline), **0** falhando. `npx tsc -p tsconfig.json --noEmit` em
`apps/ai-orchestrator`: sem saída, exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm run
test:gate` (raiz): **226** testes, **226** passando, **0** falhando,
inalterado — não exercita `assistant.service.test.ts`. `validate:integration`
não foi reexecutado nesta rodada; nada neste diff toca banco, infraestrutura
ou pré-condição, então o comportamento herdado da baseline (recusa por
`BFF_TEST_DATABASE_URL` ausente) não muda por este fechamento. `git status
--porcelain=v1 -uall` lista, ao final desta Work Unit, **5** arquivos: o
arquivo de teste citado acima e os quatro documentos permanentes de migração
que este fechamento atualiza (`docs/migration/CURRENT_STATE.md`,
`docs/migration/DECISIONS.md`, `docs/migration/FINAL_AUDIT.md`,
`docs/migration/VALIDATION_GATE.md`); nenhum diretório temporário de
controle negativo sobrou, e nenhum arquivo de `apps/frontend/src/`,
`apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/evolution-go/`,
`packages/` ou `tools/ia-loop/` foi tocado. Este diff não corrige **A-24**,
que continua `PENDENCIA-POS-MVP`, não fecha **M4** e não prova runtime do
serviço Go.

**Limite declarado, herdado de D-065/D-066/D-067/D-068, não afrouxado:**
registrar um descarte com motivo escrito diz que ele está nomeado e
justificado, não que o candidato descartado não importava — a conservação
de candidatos **dentro** das funções de varredura de `http-egress-sites.ts`
continua fora de alcance de qualquer mecanismo desta rodada. O domínio
resolve **o que o cursor indexa**, não **se o descarte perde candidato que
importe**; essas são perguntas diferentes, e só a primeira está provada
aqui.

**Revisar se:** `CONTINUE_CURSOR_DOMAINS` precisar de um quinto domínio que
a árvore real ainda não contém; uma forma de laço nova indexar um valor que
nenhuma das ligações reconhecidas (`.split(…)`, parâmetro `: string`,
`new Array<…>(uptoIndex)`, `.slice(`, `.join(`) prova, exigindo ligação
nova com evidência própria; ou se a prova de conservação de candidatos
dentro das funções de varredura, declarada fora de alcance desde D-065 e
reafirmada aqui, devir Goal próprio.

## D-070 — O alfabeto do descarte é completo: `break`, saída antecipada de função e as formas vazias (`switch-break`, rótulo) entram na mesma enumeração, propostas no Goal054

**Status:** ACCEPTED no [review054](reviews/054-review.md) (rodada 1 de
1, 2026-09-23; zero blockers), pelo Tech Lead Agent
([AGENT_ROLES](AGENT_ROLES.md), D-018), sobre a baseline
`d3e76645d3042e66eb9559f33fef9dda40904809` (fechamento do Goal053,
ACCEPTED no [review053](reviews/053-review.md)). Primeira aceitação em
rodada única desta série desde o Goal044: a regra do escopo §12 — cada
afirmação de alcance, isenção ou evidência escrita em documento
permanente nomeia a saída da execução ou o ramo do código que a sustenta
— é a diferença direta em relação aos cinco blockers de prosa do
Goal053.

**Contexto:** D-069 (Goal053) resolveu o **critério** de isenção — domínio
percorrido, não forma do cabeçalho —, mas a máquina inteira
(`enumerateContinueOccurrences`, `classifyContinueLoopForm`,
`resolveContinueCursorDomain`, `requiresSilentDiscardRegistration`,
`DOCUMENTED_SILENT_DISCARDS`) só conhecia uma **forma** de descarte:
`continue;`. Um laço largava candidato de outras duas maneiras, nenhuma
enumerada: `break;`, que abandona **todo o resto** do domínio percorrido, e
`return` dentro do laço, que abandona a **função de varredura inteira**
quando a função mais próxima que o contém é a mesma que contém o
cabeçalho do laço. A observação 1 do [review053](reviews/053-review.md)
também apontou que a lista de evidências de `character-sequence` em
[CURRENT_STATE](CURRENT_STATE.md) era ilustrativa e incompleta, omitindo
`readFileSync(…, "utf8")` e retorno declarado `: string` de função do
módulo — os dois ramos que `resolveIndexedBaseShape` de fato tem e o
texto não nomeava.

**Decisão:**

1. **A enumeração passa a percorrer um vocabulário fechado de cinco
   formas** (`DISCARD_FORMS`, `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:8056`):
   `continue`, `break`, `function-early-exit` (saída antecipada da função
   que contém o cabeçalho do laço), `nested-function-return` (`return` de
   função aninhada no corpo do laço — não abandona candidato algum, porque
   a volta seguinte do laço acontece do mesmo jeito) e `switch-break`
   (`break` cujo bloco de controle mais próximo é um `switch`, não um
   laço). Forma fora do vocabulário **reprova**, nomeando `arquivo:linha`;
   nenhum ramo `else` mudo. `break`/`continue` rotulado (`break outer;`,
   `continue outer;`) usa as mesmas formas `break`/`continue` — o rótulo
   muda qual laço a ocorrência abandona, resolvido ao laço que o declara
   (`DiscardFormPattern.labeled`) ou reprovado como resíduo nomeado; não é
   forma nova.
2. **A fronteira de função é computada, nunca presumida**, pelo mesmo
   casamento de delimitadores sobre texto mascarado que já resolve laço e
   `switch` — nunca por indentação, nome de função ou lista escrita à
   mão. Só as formas de `DISCARD_FUNCTION_BOUNDARY_FORMS`
   (`function-early-exit`, `nested-function-return`) têm fronteira; para
   elas, fronteira não resolvida **reprova**, nomeando `arquivo:linha` e o
   motivo.
3. **A exigência de motivo (`requiresSilentDiscardRegistration`) combina
   forma, classe de laço e domínio percorrido, sem afrouxar o que já
   valia:** domínio `character-sequence` e `parallel-mask` continuam
   isentos em qualquer forma; domínio `element-collection` exige registro
   em qualquer forma; as classes já portadoras de candidato do Goal052
   (`for-of`, `while-exec-match`, `while-queue-drain`) continuam exigindo
   registro independentemente do domínio, em qualquer forma; `switch-break`
   e `nested-function-return` **nunca** exigem registro, porque não
   abandonam laço algum, e essa isenção é computada com evidência própria
   por ocorrência (`formExemptionEvidence` para `switch-break`,
   `functionBoundaryEvidence` para `nested-function-return`) — nunca
   silêncio.
4. **As ocorrências reais que passam a exigir registro ganham motivo
   escrito.** Sobre a árvore real (`http-egress-sites.ts`), conferido por
   execução: **6** ocorrências novas exigem registro — **3** de `break`
   (`:591` em `while-exec-match`, `:2037` em `for-of`, `:2316` em
   `while-exec-match`, as três por classe de laço portadora de candidato,
   independentemente do domínio) e **3** de `function-early-exit` (`:576`
   em `for-of`/classe portadora; `:1144` e `:1161` em `for-indexed` sobre
   domínio `element-collection`). `DOCUMENTED_SILENT_DISCARDS` cresceu de
   **47** para **53** entradas — as **47** existentes são reaproveitadas
   sem duplicação, e a chave distingue forma: uma entrada de `break` e uma
   de `continue` no mesmo ponto âncora não colidem.
5. **A conta é uma só.** As formas novas entram dentro do caminho já
   existente (`enumerateDiscardOccurrences` → `enumerateSilentDiscardOccurrences`
   → `findSilentDiscardFindings`), nunca como segunda varredura. Nada do
   que os Goals 052 e 053 provaram foi afrouxado: o total de **120**
   ocorrências de `continue;`, a soma por classe de laço e por domínio, e
   os oito controles negativos do Goal053 continuam passando, adaptados ao
   alfabeto novo — nenhum caso de teste foi removido.
6. **Vacuidade não é aceita como prova.** Sobre a árvore real: **143**
   ocorrências em contexto `code` — `continue` **120**, `break` **6**,
   `function-early-exit` **17**; `nested-function-return` e `switch-break`
   computam **0** (ausentes na árvore real) e são exercidas por fonte
   sintética. `unresolved` e `outsideVocabulary` seguem vazias.
   `byCursorDomain` reconstrói o total: `no-domain` **64** (**60** de
   `continue` + **3** de `break` + **1** de `function-early-exit`),
   `character-sequence` **71** (**54** + **3** + **14**),
   `element-collection` **8** (**6** + **0** + **2**), `parallel-mask`
   **0** — soma **143**.
7. **`throw` fica fora do alcance, declarado, não como resíduo.** `throw`
   aborta a execução inteira e é ruidoso por construção: não é descarte
   silencioso de candidato. Não foi enumerado.
8. **A observação 1 do [review053](reviews/053-review.md) é fechada.** A
   lista de evidências de `character-sequence` em
   [CURRENT_STATE](CURRENT_STATE.md) passa a nomear os cinco ramos que
   `resolveIndexedBaseShape` de fato tem, cada um com o `arquivo:linha` do
   ramo que o sustenta em `assistant.service.test.ts`.
9. **Nenhum mecanismo de classificação de egresso foi alterado**: as 9
   categorias vistas na árvore, os três vocabulários de recusa,
   `PROVEN_UNREACHABLE_REFUSAL_CATEGORIES`, `EGRESS_PARTITION_BUCKETS`,
   `GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE`, `EGRESS_CANDIDATE_UNIVERSE`
   e `egressPartitionBucketsForCategory` mantêm conteúdo e comportamento da
   baseline.

**Alternativas:** enumerar `break` e `return` numa segunda varredura
paralela — rejeitada, é a mesma família de defeito que o blocker 2 da
rodada 1 do Goal050 já corrigiu (uma conta só); resolver a fronteira de
função por nome de função ou por indentação — rejeitada, técnica que a
sondagem do Goal052 já provou falhar; contar `return` de função aninhada
como saída antecipada — rejeitada, ele não abandona candidato algum,
porque a volta do laço acontece do mesmo jeito; ampliar o alfabeto para
`throw` — rejeitada, `throw` aborta a execução inteira e não é descarte
silencioso.

**Motivo:** o Goal053 fechou o critério de isenção para a única forma que
a máquina conhecia; a máquina em si só via `continue;`. `break` e saída
antecipada de função são **piores** que `continue;`, porque não descartam
um elemento: descartam todo o resto do domínio ou a varredura inteira. Um
alfabeto de descarte que reconhece só uma de três formas mede parte do
fenômeno e chama isso de completo — a mesma família de defeito que os
Goals 048 a 053 fecharam, um nível acima.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
está intocado (diff zero contra a baseline; **3887** linhas, mesma
contagem da baseline). `apps/ai-orchestrator/tests/support/product-transport-routes.txt`
também está intocado (diff zero).
`apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` concentra
o diff inteiro: **2820** inserções e **215** deleções contra a baseline
(**14236** linhas; baseline: **11631**) e **283** testes (baseline:
**255**), **283** passando, **0** falhando (`npx vitest run
tests/assistant/assistant.service.test.ts` em `apps/ai-orchestrator`).
`npx vitest run` completo de `apps/ai-orchestrator` → **1095** testes:
**1007** passando (baseline: **979**), **88** pulados (mesma contagem da
baseline), **0** falhando. `npx tsc -p tsconfig.json --noEmit` em
`apps/ai-orchestrator`: sem saída, exit 0. `npm run lint` (`eslint src
--max-warnings=0`) em `apps/ai-orchestrator`: exit 0, sem saída. `npm run
test:gate` (raiz): **226** testes, **226** passando, **0** falhando,
inalterado — não exercita `assistant.service.test.ts`. `validate:integration`
não foi reexecutado nesta rodada; nada neste diff toca banco,
infraestrutura ou pré-condição, então o comportamento herdado da baseline
(recusa por `BFF_TEST_DATABASE_URL` ausente) não muda por este fechamento.
`git status --porcelain=v1 -uall` lista, ao final desta Work Unit, o
arquivo de teste citado acima e os documentos permanentes de migração que
esta unidade atualiza (`docs/migration/CURRENT_STATE.md`,
`docs/migration/DECISIONS.md`, `docs/migration/FINAL_AUDIT.md`,
`docs/migration/VALIDATION_GATE.md`); nenhum diretório temporário de
controle negativo sobrou, e nenhum arquivo de `apps/frontend/src/`,
`apps/bff/src/`, `apps/ai-orchestrator/src/`, `apps/evolution-go/`,
`packages/` ou `tools/ia-loop/` foi tocado. Este diff não corrige **A-24**,
que continua `PENDENCIA-POS-MVP`, não fecha **M4** e não prova runtime do
serviço Go, e não prova conservação de candidatos dentro das funções de
varredura.

**Limite declarado, herdado de D-065/D-066/D-067/D-068/D-069, não
afrouxado:** registrar um `break` ou uma saída antecipada com motivo
escrito diz que o abandono está nomeado e justificado, não que o candidato
abandonado não importava — essa prova continua fora de alcance de
qualquer mecanismo desta série. `throw` continua fora do alfabeto, por não
ser descarte silencioso.

**Revisar se:** uma forma de descarte nova aparecer na árvore real
(`do-while` com `break`/`return`, por exemplo) sem estar coberta pelo
vocabulário fechado atual; a prova de conservação de candidatos dentro das
funções de varredura, declarada fora de alcance desde D-065 e reafirmada
aqui, devir Goal próprio; ou se `throw` precisar de tratamento por decisão
de produto, fora do escopo deste guardrail de descarte silencioso.

## D-071 — A isenção é provada pelo que o descarte abandona: a região abandonada, o vocabulário de produção, o fecho sobre as funções de módulo e um quinto eixo que só retira isenção, propostos no Goal055

**Status:** ACCEPTED no [review055](reviews/055-review.md) (rodada 2 de
2, 2026-09-26; rodada 1 `CHANGES_REQUIRED` com 9 blockers, rodada 2 com
zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018), sobre
a baseline `0851b3362ced899954a5f19600e2a06944e6a913` (fechamento do
Goal054, ACCEPTED no [review054](reviews/054-review.md)). Proposta pelo
Developer Agent na rodada 2.

**Contexto:** D-069 e D-070 fizeram do **antecedente** da isenção um
cômputo — qual domínio o cursor percorre, em qual forma de descarte —, mas
o **consequente** que a justificava ("cada volta avança leitura, nunca
descarta candidato") ficou escrito em comentário e não era conferido por
asserção alguma. `resolveSilentDiscardRequirement` isentava por
`character-sequence`/`parallel-mask` e por `no-domain` em classe não
portadora sem olhar o que a ocorrência abandona. A observação 1 do
[review054](reviews/054-review.md) apontou o custo: `function-early-exit`
é a forma com mais ocorrências isentas e menos prova por ocorrência.

**Decisão:**

1. **A região abandonada é computada por ocorrência**
   (`resolveDiscardAbandonedRegion`,
   `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts:8251`),
   por casamento de delimitadores sobre o mesmo texto mascarado que já
   resolve laço, domínio e fronteira de função. Regra por forma:
   `continue` e `break` — do fim da instrução ao fim do corpo do laço
   contenedor (o laço que o rótulo declara, quando há rótulo); que `break`
   também abandone as voltas seguintes é verdade do runtime **declarada**
   em comentário, não computada — a região provada é a da volta corrente;
   `function-early-exit` — do fim da instrução `return` (a expressão do
   próprio `return` executa e não é abandonada) ao fim do corpo da função
   que a fronteira do Goal054 resolveu; `switch-break` e
   `nested-function-return` — **sem região**, isentos pela forma como no
   Goal054. Região não resolvida reprova no mesmo resíduo de classe,
   domínio e fronteira (`findDiscardEnumerationFindings`, `:9815`–`:9834`).
2. **A produção do módulo é vocabulário fechado, com resíduo.**
   `DISCARD_PRODUCING_OPERATIONS = ["push", "add", "set"] as const`
   (`:8323`), com tipo derivado, no padrão de `DISCARD_FORMS`. A varredura
   reconhece um alfabeto deliberadamente maior
   (`DISCARD_RECOGNIZED_INSERTION_METHODS`, `:8343`: o vocabulário mais
   `unshift`, `splice`, `append`), e operação reconhecida fora do
   vocabulário reprova nomeando `arquivo:linha` em
   `findDiscardProductionFindings` (`:8813`) — e, na região, conta como
   produção (fail-closed).
3. **A função produtora é resolvida por fecho transitivo**
   (`buildDiscardModuleProduction`, `:8647`; uma volta em
   `expandDiscardProducersOnce`, `:8620`): função de módulo declarada em
   coluna zero cujo corpo contém operação reconhecida, ou que chama função
   de módulo produtora. O fecho é computado **uma vez** por arquivo, dentro
   de `enumerateDiscardAnalysis` (`:9433`), e reaproveitado por toda
   ocorrência (`findDiscardRegionProduction`, `:8765`). O caminho do fecho
   até a produtora direta é nomeado por `discardProducerPath` (`:8720`).
4. **Limite declarado — chamada cujo destino não é função de módulo não é
   produção.** Método de `string`, de `Array`, de `RegExp`, construtor,
   função importada: a única via de uma chamada dessas alcançar a saída do
   módulo é o valor que ela devolve, e atribuir valor não é produzir. Ramo
   que implementa: `if (!site.calleeIsModuleFunction)` em
   `buildDiscardModuleProduction` (`:8675`), que só conta a chamada em
   `nonModuleCallCounts`, e o filtro de `findDiscardRegionProduction`
   (`:8785`). Chamada de membro (`a.b(...)`) não chega a ser candidata; a
   produção dela, quando existe, é o próprio sítio do vocabulário.
5. **A exigência ganha um quinto eixo, que só retira isenção.** Os quatro
   eixos do Goal054 continuam intocados em
   `resolveSilentDiscardRequirementByFourAxes` (`:10945`);
   `resolveSilentDiscardRequirement` (`:11077`) os chama e, só quando
   concluíram pela isenção de forma que abandona laço, aplica o eixo 5
   (`:11084`): região com produção **exige** registro, com
   `retiredExemptionReason` nomeando `arquivo:linha` da ocorrência e da
   produção; região não resolvida **exige** registro e vai para o resíduo;
   região livre isenta com as **duas** evidências — a dos eixos 1 a 4 e a
   ausência de produção com a extensão da região em `arquivo:linha`.
6. **As ocorrências reais que mudaram de lado ganham motivo.** Execução
   final: **8** ocorrências (a sondagem previa **6**) —
   `splitTopLevelItems` `:225`, `:228`, `:232`, `:236`, `:240`
   (`continue;`, produção `items.push` em `:243`), `splitTemplateLiteralParts`
   `:1458` (`continue;`) e `:1479` (saída antecipada), com `parts.push` em
   `:1480`/`:1482`, e `findTopLevelMethodBodies` `:2989` (`continue;`,
   `methods.push` em `:2994`). As **8** entram por operação produtora
   **direta** na região; **0** por chamada a função produtora.
   `DOCUMENTED_SILENT_DISCARDS` cresceu de **53** para **57** entradas (4
   novas em `:6918`–`:6957`, `splitTopLevelItems` com multiplicidade 5),
   sem duplicar, remover ou reescrever entrada anterior.
7. **Uma conta só.** Região, produção e eixo entram no caminho existente —
   `enumerateDiscardAnalysis` (de que `enumerateDiscardOccurrences` é
   projeção) → `enumerateSilentDiscardOccurrences` →
   `findSilentDiscardFindings` —, sem segunda varredura da fonte.

**Divergência declarada entre sondagem e execução (o computado vence):**
a sondagem do Goal contou **70** funções de módulo, **16** produtoras
diretas e **20** pelo fecho; a execução computa **89**, **23** e **28**
(`grep -cE "^(export )?(async )?function"` sobre `http-egress-sites.ts`
confirma **89** declarações em coluna zero). A sondagem previa **6**
ocorrências desisentadas; a execução acha **8** — as duas a mais
(`:1458`, `:1479`, `splitTemplateLiteralParts`) não entraram na sondagem,
que só varreu `continue;`/`break;` e não contou a saída antecipada de
`:1479`. As operações `push`/`add`/`set` batem com a sondagem (**51**,
**14**, **5**).

**Alternativas:** amostragem dirigida das ocorrências isentas, como a
observação 1 do review054 sugeria — rejeitada, o cômputo é mais barato e
mais forte, e a escolha está registrada na v76 do MASTER_PLAN; tratar
chamada a função fora do módulo como produção — rejeitada, o valor
devolvido não é saída do módulo até ser gravado por operação do
vocabulário, que o sítio dela já mostra; contar a produção da expressão
do próprio `return` como abandonada — rejeitada, ela executa.

**Motivo:** um critério de isenção cuja parte decisiva é adjetivo é a
mesma família de defeito que os Goals 046, 052, 053 e 054 removeram um
nível acima de cada vez. A isenção por um eixo só era fail-open **medido**
sobre as **8** ocorrências acima: uma regressão que fizesse um desses
laços pular a produção seria invisível à máquina inteira dos Goals 048 a
054.

**Consequências:** `apps/ai-orchestrator/tests/support/http-egress-sites.ts`
e `apps/ai-orchestrator/tests/support/product-transport-routes.txt` estão
intocados (diff zero). `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts`
concentra o diff de código: **1810** inserções e **12** deleções contra a
baseline (`git diff --histogram --numstat`; **16034** linhas, baseline
**14236**) e **299** testes (baseline **283**), **299** passando, **0**
falhando. Três testes anteriores foram **adaptados, não removidos**: os
que liam a isenção pelo domínio passam a ler os quatro eixos
(`resolveSilentDiscardRequirementByFourAxes`), e o que asseria as 5
`while-positional-read` isentas passa a asserir `:1458` e `:2989`
desisentadas pelo eixo 5 e as outras 3 isentas. Suíte completa de
`apps/ai-orchestrator`: **1111** testes, **1023** passando (baseline
**1007**), **88** pulados (mesma contagem), **0** falhando. Nenhum
mecanismo de classificação de egresso foi alterado.

**Limite declarado, herdado de D-065 a D-070, não afrouxado:** o eixo 5
prova que a região abandonada de uma ocorrência isenta não contém
produção; não prova conservação de candidatos dentro das funções de
varredura na forma geral. Registrar as 8 ocorrências com motivo diz que o
abandono está nomeado e justificado, não que a produção pulada não
importava. Chamada a função fora do módulo não é produção (decisão 4).

**Revisar se:** a árvore real ganhar operação de inserção fora do
vocabulário (reprova até o vocabulário decidir); surgir função de módulo
declarada fora de coluna zero ou como `const f = (...) => {}` no nível do
módulo — hoje ausente em `http-egress-sites.ts` e fora do fecho; ou a
prova de conservação de candidatos virar Goal próprio.

**Nota de fechamento ([review055](reviews/055-review.md)):** a decisão 4
está sub-declarada. O ramo `calleeIsModuleFunction === false` também
cobre chamada a closure local que grava em coleção capturada
(`addBinding`, `countOut`, `enqueuePrimitive`, `reachesFetch` em
`http-egress-sites.ts`). Para essas, "a única via é o valor devolvido" é
falso. Na árvore real elas só aparecem em laço `element-collection`, que
os quatro eixos já exigem, ou em região que já tem `push` direto; não há
fail-open vigente, mas o limite vale para closure local, não só para
arrow no nível do módulo. Também não computado: `function-early-exit`
dentro de laço abandona as voltas seguintes, como `break`; a região
provada é só a da volta corrente.

## D-072 — A prosa sai do fork de transporte: o serviço Go recusa `ButtonText` vazio em vez de compor `"Ver Menu"`, propostas no Goal056

**Status:** ACCEPTED no [review056](reviews/056-review.md) (rodada 5 de
5, 2026-09-26; rodadas 1 a 4 `CHANGES_REQUIRED` com 4, 4, 3 e 1
blocker, rodada 5 com zero), pelo Tech Lead Agent
([AGENT_ROLES](AGENT_ROLES.md), D-018), sobre a baseline
`5f33339d57375ed2ea3dbc6074b94c3d9625b15c` (fechamento do Goal055,
ACCEPTED no [review055](reviews/055-review.md)). Proposta pelo Developer
Agent.

**Contexto:** [FINAL_AUDIT §19](FINAL_AUDIT.md) registrou **A-24** no
Goal042: `pkg/sendMessage/service/send_service.go:1960` substituía
`ButtonText` vazio por `"Ver Menu"` e entregava esse rótulo em português
ao número da cliente — prosa de produto composta dentro do fork de
transporte, o que o `AGENTS.md` de `apps/evolution-go/` proíbe. Os Goals
043 a 055 mantiveram o achado `PENDENCIA-POS-MVP`, provando por execução
que nenhuma rota do produto alcançava o literal
(`route_reach_test.go`), sem corrigir o fork. Dos oito achados
`PENDENCIA-POS-MVP` vigentes, A-24 é o único cuja reprodução está na
árvore de código, sem depender de deploy real, credencial da origem Minha
Agenda, número WhatsApp real, provider de e-mail ou conhecimento de
operação.

**Decisão:**

1. **O serviço recusa em vez de preencher.** Em `SendList`
   (`send_service.go:1953`–`:1955`), `ButtonText` vazio devolve
   `fmt.Errorf("button text is required")` antes de qualquer uso de
   cliente, instância ou rede; valor não vazio segue sem transformação
   até `ListMessage.ButtonText` (`:1990`, categoria computada
   `SourceRouteBody`/`value_from_route_body_parameter`,
   `proto.String(data.ButtonText)`). `sectionsToString` (`:1878`) não
   ganha recusa nova — o Goal só manda retirar a fallback que ela
   compunha, e o valor recebido segue sem transformação para
   `Title: data.ButtonText`; a função continua sem chamador
   (`grep -rn sectionsToString apps/evolution-go --include=*.go` só acha
   a declaração), e não foi apagada, por não ser escopo deste Goal.
2. **O contrato escrito passa a dizer o que o handler faz.** O comentário
   do campo (`send_service.go:256`), o `@Description` do handler
   (`send_handler.go:568`), `docs/docs.go` (`:2644`, `:4423`),
   `docs/swagger.json` (`:2636`, `:4415`), `docs/swagger.yaml` (`:629`,
   `:8373`) e a tabela de `docs/wiki/guias-api/api-interactive.md`
   passam a afirmar que `buttonText`, `title` e `footerText` são
   obrigatórios e que vazio devolve `400` — a mesma mensagem que o
   handler já devolvia (`send_handler.go:601`, `:611`, `:616`–`:618`) e
   que a tabela da wiki marcava como opcional para as três colunas.
3. **Os conjuntos do guard encolhem por execução.** Sobre a árvore final
   (`go test ./pkg/transportguard/...`, pacote inteiro `PASS`):
   `expectedGoProseLiterals` (`go_prose_test.go`) e
   `expectedProseLiteralsReachedFromRegisteredRoutes`
   (`route_reach_test.go`) perdem a entrada `"Ver Menu"` e passam de
   **27** para **26** entradas cada, as **5** rotas continuam as mesmas
   (`POST /send/media`, `POST /send/button`, `POST /send/list`, `POST
   /send/carousel`, `POST /send/status/media`); as demais entradas de
   `send_service.go` depois do trecho alterado mudam só de linha, mesmo
   conteúdo, campo e rota.
   `TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct`
   é substituído por `TestGoal056RemovesTheProductProseLiteralFromTheTree`,
   que prova, sobre os dois conjuntos que `GoProseLiteralsReachingTransport()`
   e `ProseReachOfEveryRegisteredRoute()` computam — não sobre "a árvore"
   inteira, que inclui `whatsmeow-lib/` e `_test.go`, fora do alcance do
   guard —, que nenhum literal Go não vazio escreve no campo `ButtonText`,
   por campo e não só por conteúdo: uma fallback reintroduzida sob outro
   rótulo (`"Abrir"`) reprova pelo mesmo teste, nomeando o campo, como o
   controle negativo do item 6 abaixo mostra ao lado do rótulo original
   `"Ver Menu"`. A checagem por conteúdo de `"Ver Menu"` continua, como a
   instância que o Goal042 nomeou, e `expectedGoProseLiterals` /
   `expectedProseLiteralsReachedFromRegisteredRoutes` são conferidos do
   mesmo jeito.
   `TestEveryReachedLiteralIsAMemberOfTheGoal042Set` confirma **26**
   literais alcançando o transporte, todos de rota registrada.
   `expectedProseLiteralsReachedFromProductRoutes` continua vazio e o
   arquivo de **10** rotas do produto
   (`apps/ai-orchestrator/tests/support/product-transport-routes.txt`)
   está com diff zero.
4. **A entrada de `ListMessage.ButtonText` sai do conjunto fora do relé,
   por não ser mais candidata a ele.** `expectedOffRelaySources`
   (`off_relay_test.go`) é, por definição do próprio arquivo, o conjunto
   de escritas em campo portador cuja origem **não** é o corpo relayed da
   requisição. A escrita em `:1990` agora tem categoria computada
   `SourceRouteBody` (`value_from_route_body_parameter`) — a mesma
   categoria que o relé de outras rotas já tem, e por isso não é mais
   membro; não foi recategorizada para outra `SourceCategory` fora do
   relé, foi removida do conjunto. A entrada anterior era
   `pkg/sendMessage/service/send_service.go:1996`,
   `ListMessage.ButtonText`, `SourceBranchDependent`. As outras entradas
   de `send_service.go` no arquivo mudam só de linha.
5. **O comportamento é provado por teste Go novo.**
   `apps/evolution-go/pkg/sendMessage/service/send_service_list_test.go`
   (arquivo `_test.go`, fora da enumeração de produção do guard):
   `TestSendList_EmptyButtonText_ReturnsErrorBeforeUsingClient` chama
   `SendList` com valor zero de `sendService` (sem cliente WhatsApp,
   porque o retorno vem antes de qualquer dependência) e `ButtonText`
   vazio, e prova erro `"button text is required"` com mensagem `nil`.
   `PASS` (`go test ./pkg/sendMessage/service/... -run TestSendList -v`).
   Um segundo caso, provando que `ButtonText` não vazio chega intacto ao
   ponto de montagem sem cliente WhatsApp, não é viável sem fabricar
   dependência: `SendList` monta `listMessage` como variável local
   (`send_service.go:1987`–`:1994`) e a passa, dentro de `msg`, direto para
   `s.SendMessage(instance, msg, "ListMessage", ...)` (`:2001`), que depende
   de `instance` e do cliente WhatsApp real. Não existe ponto de observação
   do `ListMessage` montado antes do envio — capturá-lo exigiria mudar a
   assinatura de `SendList` ou de `SendMessage` só para o teste, fora do
   escopo deste Goal. O arquivo é `_test.go` e por isso fica fora da enumeração de
   produção do guard (`pkg/transportguard/sources.go:60`,
   `hasTestSuffix`): rodando o próprio `DiscoverProductionGoFiles` sobre a
   árvore (`go test ./pkg/transportguard/... -run
   TestZZZCountProductionGoFiles -v` com um teste temporário que chama a
   função e loga `len(files)`, removido depois de conferir), a contagem de
   arquivos de produção é **65** tanto na baseline `4041db2` quanto na
   árvore final desta Work Unit — igual, como o item 4 do Goal pedia. O
   total de arquivos `.go` de `pkg/` e `cmd/` (produção mais teste,
   excluindo `whatsmeow-lib/`) sobe de **90** para **91**
   (`git ls-tree -r --name-only 4041db2 -- apps/evolution-go/pkg
   apps/evolution-go/cmd | grep -v /whatsmeow-lib/ | wc -l` contra `find
   pkg cmd -name '*.go' ! -path '*/whatsmeow-lib/*' | wc -l` dentro de
   `apps/evolution-go`), o **+1** exato do arquivo de teste novo — o que
   confirma que o aumento é só em teste, nunca em produção.
6. **Controle negativo.** Executado de forma independente nesta
   rodada de correção (FIX-001, rodada 4), sobre a árvore já corrigida
   (`send_service.go` em `8d37112`): o `if data.ButtonText == "" { return
   nil, fmt.Errorf(...) }` de `:1953`–`:1955` foi substituído por
   `buttonText := data.ButtonText; if buttonText == "" { buttonText = "Ver
   Menu" }`, e o campo `ButtonText: proto.String(data.ButtonText)` (`:1990`)
   voltou a ler a variável local, `proto.String(buttonText)` — as duas
   trocas juntas, não só a primeira, senão o pacote não compila (variável
   não usada). `go test ./pkg/transportguard/...` reprova em quatro testes:
   `TestGoProseLiteralsReachingTransportAreAssertedElementByElement`
   (`go_prose_test.go:93`), nomeando `send_service.go:1955` e o conteúdo
   `"Ver Menu"` escrito em `[ButtonText]`;
   `TestOffRelaySourceSetIsAssertedElementByElement`
   (`off_relay_test.go:180`), nomeando `send_service.go:1991` escrevendo
   `ListMessage.ButtonText` com origem `value_bound_differently_per_branch`;
   `TestProseLiteralsReachedFromEveryRegisteredRouteAreAssertedElementByElement`
   (`route_reach_test.go:251`), nomeando `POST /send/list` alcançando
   `send_service.go:1955`, que escreve `"Ver Menu"` em `ButtonText`; e
   `TestGoal056RemovesTheProductProseLiteralFromTheTree`
   (`route_reach_test.go:292`), nomeando o mesmo `send_service.go:1955` e o
   literal `"Ver Menu"` ali derivado. As entradas seguintes também reprovam
   só por deslocamento de uma linha, sem mudar de conteúdo, campo ou rota:
   as fallbacks `" "` de `Title` passam de `:1962`/`:1968` para
   `:1963`/`:1969`, e as escritas de `ListMessage_Row.Title`,
   `ListMessage_Row.RowID` e `ListMessage_Section.Title` passam de
   `:1975`/`:1977`/`:1981` para `:1976`/`:1978`/`:1982`. Um segundo
   controle, na mesma sessão, trocou o rótulo por `"Abrir"` e reprova pelos
   mesmos quatro testes, pelo campo `ButtonText`/`[ButtonText]` em vez do
   conteúdo — a checagem do item 3 acima morde os dois rótulos. Revertido
   cada um, `go test ./pkg/transportguard/... ./pkg/sendMessage/...`
   confirma `PASS`; `git diff --stat
   apps/evolution-go/pkg/sendMessage/service/send_service.go` confere com
   o diff real desta Work Unit, **+5/-11** (não **+9/-11**, número da
   rodada 1, defasado). Nenhum resto do controle ficou na árvore
   (`git status --porcelain` sobre `send_service.go` mostra só o diff já
   existente antes do controle).

**Divergência entre o esperado e a execução:** nenhuma — as contagens que
o Goal antecipava (27→26 nos dois conjuntos de prosa/alcance, veredito
0/7/6) batem com o que a execução dos testes de `transportguard`
confirma.

**Alternativas:** manter a fallback e só documentar a divergência, como
os Goals 042 a 055 fizeram — rejeitada, o achado é fechável sem deploy e
adiar de novo repetiria a mesma dívida por mais um Goal; mover a decisão
de rótulo padrão para o chamador (BFF/IA) — rejeitada, a rota não é usada
pelo produto hoje e nenhum Goal pediu um rótulo padrão de produto;
apagar `sectionsToString` junto — rejeitada, função morta não pertence a
este Goal.

**Motivo:** um serviço de transporte que compõe texto de produto é a
mesma família de defeito que o `AGENTS.md` de `apps/evolution-go/`
proíbe e que o guard de prosa do Goal042 existe para pegar; A-24 é o
único achado `PENDENCIA-POS-MVP` fechável dentro do repositório.

**Consequências:** diff sobre a baseline `5f33339d57375ed2ea3dbc6074b94c3d9625b15c`
— **9** arquivos rastreados alterados (**+123/-124** linhas,
`git diff 5f33339d57375ed2ea3dbc6074b94c3d9625b15c --stat -- apps/evolution-go`)
mais
`apps/evolution-go/pkg/sendMessage/service/send_service_list_test.go`
novo (**34** linhas, não rastreado antes desta execução):
`send_service.go`, `send_handler.go` (só comentário),
`go_prose_test.go`, `off_relay_test.go`, `route_reach_test.go`,
`docs.go`, `swagger.json`, `swagger.yaml`,
`docs/wiki/guias-api/api-interactive.md`. `apps/ai-orchestrator/` não foi
tocado. `go test ./pkg/transportguard/...` e
`go test ./pkg/sendMessage/...`: `PASS`. `npm run validate:core`: **15**
passos `passed`, **2** `skipped` (`test:bff`, `test:health-worker`, o
mesmo par que os Goals anteriores já reportavam pulado), **0**
`failed`, exit 0. `npm run test:gate`: **226** testes, **226** passando,
**0** falhando — mesma contagem da baseline.

**Limite declarado:** não prova comportamento em runtime do serviço Go
nem qual binário roda em produção — o que se prova é o que a árvore de
código diz. Não corrige nem reclassifica outro achado além de A-24.

**Revisar se:** a árvore real ganhar nova rota que alcance o serviço
`/send/list` a partir do produto (o teste de alcance reprovaria antes);
ou `sectionsToString` ganhar chamador, o que mudaria o guard de alcance
por rota.

**Nota de fechamento ([review056](reviews/056-review.md)):** o item 6
lista só os deslocamentos de +1 dentro de `SendList`. No controle
negativo, as entradas de `send_service.go` a partir de `:2541` também
deslocam +1, conferido pela reprodução independente do reviewer na
rodada 5. A lista do item 6 não é exaustiva; o que ela afirma continua
correto. `route_reach_test.go` mantém a checagem por conteúdo
`"Ver Menu"` ao lado da checagem por campo `ButtonText`; a primeira é
redundante com a segunda e não afrouxa nada.

## D-073 — A confirmação é da agenda: a resposta que afirma efeito não gravado vira texto fixo, e a métrica da Home conta agendamento, não reserva, proposta no Goal057

**Status:** ACCEPTED no [review057](reviews/057-review.md) (rodada 5 de 5, 2026-09-27; rodadas 1 a 4 `CHANGES_REQUIRED` com 4, 4, 2 e 2 blockers, rodada 5 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal057, rodada 1, sobre a baseline `1792e1234fff305d91487e8f249d9d1dce0ed807` (fechamento do Goal056, ACCEPTED no [review056](reviews/056-review.md)).

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA A-01**, com WhatsApp e modelo reais: um `create_appointment` `action=prepare` criou um hold, a cliente escreveu "Confirmo", nenhuma tool foi chamada nesse turno e a IA respondeu "Pronto, ficou confirmado…" — `Appointment` = 0, `Customer` = 0, hold vencido depois. A única barreira era uma frase de prompt. **QA H-09** registrou que `/internal/dashboard` contava todo `create_appointment` `SUCCEEDED` como agendamento, inclusive `prepare`, e mostrou **1** quando a IA não tinha criado nenhum. Esses dois achados usam o prefixo `QA`, não `A-`, porque o FINAL_AUDIT já usa A-01…A-24 com outro significado.

**Decisão:**

1. **Guard determinístico antes de compor a resposta.** Em `completeGraphTurn` (`assistant.service.ts:881`), depois de `applyDecision` e antes de `prisma.message.create`, `guardCommitmentClaim` (`:952`) decide se o texto do modelo pode sair. Violação é a conjunção: o texto normalizado afirma um efeito K (`findCommitmentClaims`, `:428`); existe `pendingAction` do tipo correspondente a K, não consumido, em `Conversation.state`; e nenhuma `AiToolCall` `SUCCEEDED` deste `AiRun` confirmou K (`loadTurnConfirmedEffects`, `:1584`, que lê `create_appointment`/`confirm_recurring_appointments`/`reschedule_appointment`/`cancel_appointment` do ledger, nunca o JSON da decisão). Afirmação sem nenhum rascunho pendente passa sem checagem — sem ler a agenda, o guard não distingue de fato verdadeiro.
2. **Vocabulário fechado, exportado e testado.** `COMMITMENT_CLAIM_VOCABULARY` (`assistant.service.ts:343`, congelado com `Object.freeze`) tem três chaves — `schedule`, `reschedule`, `cancel` — cada uma com a forma normalizada dos termos; `recurring` usa o vocabulário de `schedule`. Os termos genéricos de confirmação (`COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS`, `:330`: "confirmado"/"confirmei", "marcado"/"marquei" e flexões) entram nos três tipos, porque sozinhos não dizem qual operação foi feita — "Cancelamento confirmado!" e "Sua remarcação foi confirmada" afirmam efeito com essas mesmas palavras; o guard decide o tipo pelo `pendingAction`, não pelo texto. `normalizeCommitmentText` (`:419`) baixa para minúsculas, remove acento e colapsa letra repetida ("confirmadoo" continua reconhecido). `findCommitmentClaims` (`:428`) casa palavra inteira e aplica uma janela de negação curta e fixa, `COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS = 3` (`:390`), que não atravessa pontuação. "Reservado", "pré-agendado"/"pre agendado", "posso confirmar?", "quer que eu confirme?", "vou confirmar" e negação imediata não disparam o guard — cada um com teste em `tests/assistant/commitment-claim-guard.test.ts`.
3. **Texto fixo no lugar da afirmação, sem reinvocar o modelo.** Na violação, a mensagem persistida e enviada é `PRODUCT_OWN_FIXED_TEXTS.commitmentNotRecorded` (`assistant.service.ts:305`): `"Ainda nao ficou registrado na agenda. Posso confirmar agora pra voce?"`, sem acento (mesma grafia dos textos fixos existentes), sem travessão, fora de `VOCABULARIO_DE_ESPERA`, e entra em `PRODUCT_OWN_TEXTS`. Um log `warn` registra `requestId`, `tenantId`, `conversationId`, `aiRunId`, `claimType` e `pendingActionType` — nunca o texto da cliente nem o do modelo. `AiRun.outputText` continua com a saída original do modelo, para auditoria. O turno não vira handoff por causa do guard e não há segunda chamada ao modelo; reinvocar com instrução corretiva foi considerado e fica para "Revisar se" abaixo.
4. **Travessão normalizado antes do guard.** `normalizeModelDashes` (`assistant.service.ts:405`) troca U+2014 sempre por vírgula e U+2013 cercado de espaço por vírgula; faixa numérica sem espaço (`10–11`) não é tocada. Nenhum texto de `PRODUCT_OWN_TEXTS` contém U+2014. Os literais que chegam ao modelo (`prompts/system.ts:82`, regra 17 de `MAIN_RULES`; `prompts/summary.ts`) também deixam de usar travessão.
5. **Prompt da condução (U-06).** `prompts/scheduling.ts` ganha o bloco "CONFIRMACAO E ENCERRAMENTO (U-06)": não perguntar de novo para quem é quando a cliente já disse "pode marcar" e a pessoa já está clara (`scheduling.ts:20`); uma única pergunta de confirmação por operação; chamar `action=confirm` no mesmo turno em que a cliente confirma; e mensagem curta de encerramento depois de agendamento/remarcação/cancelamento confirmados. `MAIN_RULES` (`system.ts:82`) ganha a regra 17, proibindo travessão. `PROMPT_TEMPLATE_VERSION` sobe de `v6` para `v7` (`system.ts:116`); os hashes de `tests/prompts/system.test.ts` foram recalculados pela execução, e o teste passa a afirmar também a frase de não repetir a pergunta de para quem é.
6. **A métrica da Home conta agendamento, não reserva.** `aiAppointmentsToday` em `/internal/dashboard` (`routes.ts:1150`) passa a somar 1 por `create_appointment` `SUCCEEDED` com `arguments.action === "confirm"`, e o número de ocorrências confirmadas por `confirm_recurring_appointments` `SUCCEEDED`; `prepare`, falha, hold vencido, remarcação e cancelamento não contam. Nome, tipo e schema do campo não mudam.

**Alternativas:** reinvocar o modelo com instrução corretiva quando a violação é detectada — rejeitada por este Goal, que prefere o texto fixo determinístico e sem custo de uma segunda chamada; ela fica registrada abaixo, em "Revisar se". Ler a evidência de confirmação do JSON da decisão do modelo (`appointmentDraftPatch.status === "confirmed"`) em vez do ledger — rejeitada, é exatamente o defeito que QA A-01 expôs: o modelo pode escrever um status que ninguém gravou. Bloquear toda afirmação de efeito, mesmo sem rascunho pendente — rejeitada, geraria falso positivo sobre fato verdadeiro (agendamento antigo já confirmado em turno anterior) sem meio de o guard diferenciar sem consultar a agenda.

**Motivo:** o `AGENTS.md` proíbe a IA de confirmar uma ação antes de concluí-la e de inventar confirmação; QA A-01 mostrou esse defeito com WhatsApp e modelo reais, com dano direto à cliente do negócio. QA H-09 mostrou que a mesma ambiguidade (`prepare` vs. `confirm` sob a mesma tool) também distorcia a métrica que o dono do negócio vê na Home.

**Consequências:** toda resposta que afirma agendamento, remarcação ou cancelamento sem confirmação gravada no ledger do turno vira o texto fixo `commitmentNotRecorded`, nunca a prosa original do modelo. A Home deixa de contar reserva (`prepare`) como agendamento feito. Nenhuma tool, fluxo `prepare`/`confirm` ou schema de contrato foi alterado.

**Limites declarados:**

- **Afirmação sem rascunho pendente não é violação.** Uma frase como "seu horário de quinta está confirmado", sobre um agendamento antigo, passa sem checagem — o guard não tem como distingui-la de fato verdadeiro sem ler a agenda. O caso real de QA A-01 (hold recém-criado, ainda em `pendingAction`) cai dentro do guard.
- **Falso positivo é fail-closed.** Uma frase que o vocabulário reconheça como afirmação, mas que na prática não afirme efeito, também vira o texto fixo — o custo do erro cai sobre uma mensagem substituída, nunca sobre uma confirmação inventada.
- **Termo genérico de confirmação cruza tipo quando o rascunho é `cancel` ou `reschedule`.** `COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS` (`:330`) entra no vocabulário dos três tipos porque o guard decide o tipo pelo `pendingAction`, não pelo texto (item 2). Com `pendingAction` `cancel` ou `reschedule` pendente, uma frase que usa só o termo genérico sobre o agendamento original, sem afirmar o efeito do rascunho — por exemplo, "Seu horário continua confirmado, mesmo assim quer cancelar?" — casa como afirmação do tipo do rascunho e dispara o guard, mesmo sem afirmar cancelamento ou remarcação. É a mesma regra de fail-closed do item anterior; fica nomeada aqui porque é a forma concreta que sobra depois deste Goal — sem ler o texto para saber a que o termo genérico se refere, o guard não distingue.
- **Aderência do modelo real fora de prova, por D-050.** O eval de `tests/evals/commitment-claim.eval.test.ts` usa um dublê roteirizado: prova o que o runtime deixa acontecer quando o modelo escreve exatamente o texto do roteiro, não que o modelo real vá se comportar assim.

**Revisar se:** um caso real de falso positivo do vocabulário for observado em produção, o que entraria como ajuste de vocabulário, não mudança de guard; ou a reinvocação corretiva do modelo (item 3, alternativa rejeitada) for reconsiderada com orçamento de uma segunda chamada por turno.

**Nota de fechamento ([review057](reviews/057-review.md)):** a saída dos quatro controles negativos colada em [FINAL_AUDIT §34](FINAL_AUDIT.md) é da rodada 4. A rodada 5 mudou em `src/` só duas linhas de comentário (`D-072` → `D-073` em `assistant.service.ts:400` e `prompts/system.ts:111`), sem mudar comportamento, e os controles não foram rodados de novo depois dessa troca. O reviewer comparou os patches das rodadas 4 e 5 e aceitou o critério 10 em substância. Dois efeitos de `normalizeModelDashes` (item 4) ficam registrados aqui, sem mudar a decisão: quando há travessão no texto, a limpeza de vírgula duplicada e o `trim` agem no texto inteiro, não só no trecho trocado (efeito cosmético); e U+2013 cercado de espaço numa faixa numérica ("das 10 – 11h") vira vírgula ("das 10, 11h"), como a letra do Goal pede.

## D-074 — A casca é uma regra base comum a todo módulo, e o gate autenticado mede composição e alcance por clique real, propostas no Goal058

**Status:** ACCEPTED no [review058](reviews/058-review.md) (rodada 2 de 2, 2026-09-27; rodada 1 `CHANGES_REQUIRED` com 5 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal058, rodada 2, sobre a baseline aceita `b4c3f127fd5437848b28aec3ba59be8d3f3d401c` (fechamento do Goal057, ACCEPTED no [review057](reviews/057-review.md)).

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA CV-01** e **QA CV-02**: em Conversas, Clientes e Serviços a sidebar ocupava a largura inteira, o conteúdo começava abaixo dela e a `aside.sidebar` interceptava o clique. A causa era CSS: `AppShell` monta `${styleModule}-shell`, e só `dashboard`, `agenda` e `settings` tinham regra de casca; as de `conversations` e `directory` saíram nos Goals 016 (`8d94ace`) e 017 (`ea992ec`). O gate autenticado da D-049 foi aceito com o defeito presente, porque nenhuma das suas medidas (overflow, alvo de toque, contraste, foco, movimento) vê uma sidebar da largura da tela sobre o conteúdo. O mesmo QA registrou **QA SV-01** (duração com `min={1}` e `step={5}` recusa 40, 45 e 60), **QA SV-02** (preço novo nasce "R$ 0,00" e a digitação depende do cursor) e **QA NT-04** (a Central de notificações sem respiro). Esses IDs usam o prefixo `QA` porque o FINAL_AUDIT já usa A-01…A-24 com outro significado.

**Decisão:**

1. **A casca é uma regra base comum a todo módulo.** `AppShell` aplica `app-frame` ao lado de `${styleModule}-shell` em toda casca, e `apps/frontend/src/shared/styles/atendly.css` declara nela, uma vez, a grade de 248px, o trilho de 88px abaixo de 1100px e, abaixo de 768px, a sidebar escondida, o cabeçalho móvel `sticky` e a barra inferior `fixed`. As declarações por módulo de `dashboard`, `agenda` e `settings` que repetiam isso saíram; fica no módulo só o que diverge de propósito (em `settings`, o cabeçalho móvel com `z-index` 40 e respiro próprio, e a barra inferior centrada num cartão de até 520px). Cabeçalho móvel e barra inferior da base ficam dentro de `:where()`, com especificidade zero, para que a classe do módulo sempre vença, em qualquer ordem de arquivo. `SHELL_MODULES` (`navigation.ts`, reexportada por `AppShell`) lista os módulos em runtime, e o teste jsdom `tests/goal058-shell-base.test.tsx` deriva a lista dela. A Central de notificações reusa o respiro de `.settings-page` (`.notifications-page, .settings-page`), sem número novo.
2. **O gate autenticado mede composição.** `measureComposition` (`apps/frontend/e2e/measure.ts`), nas sete rotas e nas cinco larguras, por `expect.soft`: o `contentMarker` da rota começa na primeira tela; `elementFromPoint` no centro da parte visível dele devolve o próprio marcador ou um descendente, nunca um elemento dentro da navegação da casca (`aside.sidebar`, cabeçalho móvel, barra inferior, FAB); a sidebar, quando visível, não sobrepõe o `main` na horizontal; e o cabeçalho móvel e a barra inferior, quando visíveis, ficam inteiros dentro da viewport. A mensagem de falha nomeia rota, largura e o elemento encontrado.
3. **O gate autenticado mede alcance por clique real.** Em `/conversas`, `/clientes` e `/servicos`, a linha semeada abre o detalhe por `locator.click()` sem `force`, sem `dispatchEvent` e sem teclado; em `/servicos`, "Novo serviço" abre o formulário e "Criar serviço" recebe o clique (o envio vazio mostra o alerta "Informe o valor" e nada é criado), nas cinco larguras. Um serviço semeado só para isso é salvo com 45 minutos pelo formulário, com resposta 2xx e "45 min" na lista.
4. **A máscara de centavos acrescenta ao fim.** `CurrencyInput` deriva a edição do texto que o navegador montou, no `onChange`, comparando com o texto formatado anterior: sem seleção, o dígito novo entra à direita do valor qualquer que seja a posição do cursor; apagar um caractere tira o último dígito; substituir ou apagar uma seleção deixa o campo com os dígitos que ele passou a mostrar (seleção total seguida de dígito recomeça o valor); o que não é dígito é ignorado. A regra não depende de `keydown`, então vale para teclado virtual e IME (`key: "Unidentified"`), colar, ditado, preenchimento automático e texto arrastado. Serviço novo e serviço sem preço nascem com o campo vazio. A duração aceita qualquer inteiro a partir de 1 (`step={1}`, `min={1}`).

**Alternativas:** devolver as regras de `.conversations-shell` e `.directory-shell` que os Goals 016 e 017 removeram — rejeitada: repetiria a grade em cinco lugares, e o próximo CSS de módulo apagado deixaria outra tela sem casca; manter a base com seletores de filho (`.app-frame > nav`, especificidade 0,1,1) — rejeitada na rodada 1 deste Goal: ela vencia `.settings-bottom-nav` (0,1,0), e a barra inferior de Configurações ia para x=-195..195 em 390px; medir a casca só com overflow — rejeitada: a baseline passou em overflow nas três telas quebradas (ver Limites); tratar a máscara de centavos no `keydown` — rejeitada na rodada 1: teclado virtual e IME não entregam o dígito no `keydown`, e o campo ficava impossível de preencher no celular.

**Motivo:** CV-01 e CV-02 deixavam três das sete telas centrais inutilizáveis por clique, e todo Goal seguinte da série entrega interface nessa área. Sem uma regra base, a casca depende de cada módulo lembrar de declará-la; sem uma medida de composição e de clique, o gate aprova casca quebrada.

**Consequências:** o gate autenticado passa a ter **60** testes: as 7 rotas × 5 larguras de medida (35) e 5 testes de clique real × 5 larguras (25). Cada teste de medida ganha a composição e os anexos `composition-<rota>` e `overflow-<rota>`. A semente do ensaio (`scripts/goal033-authenticated-ui-rehearsal.mjs`) ganha um serviço próprio para o caso de 45 minutos. Nenhuma rota sai de `AUTHENTICATED_ROUTES`, nenhuma exceção entra em `KNOWN_SMALL_TARGETS` ou `KNOWN_CONTRAST_FAILURES`, e nenhum passo sai de `validate:integration`.

**O que acrescenta a D-030, D-031 e D-049, sem reescrevê-las:** a D-030 adotou o shell compartilhado; a D-074 diz onde a grade dele mora (uma regra base, não uma por módulo) e como um módulo diverge dela (classe do módulo, que vence a base por especificidade). A D-031 decompôs a UI por módulo; a D-074 tira do módulo a responsabilidade de declarar a casca. A D-049 levou o gate renderizado às telas autenticadas com a régua compartilhada; a D-074 acrescenta à régua a composição e o alcance por clique real, no mesmo passo de `validate:integration`.

**Limites declarados:**

- **Fidelidade visual ao protótipo continua sendo conferência humana.** Nenhuma medida decide se a casca, a lista ou o formulário estão como a referência aprovada; o screenshot anexado é evidência para pessoa.
- **O gate autenticado roda em `validate:integration`, não em `validate:ui`.** `validate:ui` segue com as rotas públicas e sem banco.
- **A composição usa o `contentMarker` de cada rota e não prova o resto da tela.** Um elemento coberto fora do marcador, ou abaixo da primeira tela, não é medido por ela.
- **Overflow recortado não reprova.** A medida de overflow compara `scrollWidth` com `clientWidth` do documento. Na baseline, em 390px, a prévia de mensagem de `/conversas` ia até x=409, mas um ancestral recortava e o documento não rolava (`scrollWidth` 390), e o mesmo elemento continua recortado na execução final com a casca corrigida; a medida lista esse elemento na mensagem, mas não reprova por ele.

**Revisar se:** um módulo precisar de uma casca realmente diferente da base (o que entra como regra do módulo, não como nova base); a composição precisar cobrir mais do que o `contentMarker`; ou a fidelidade visual entrar em escopo de prova automatizada.

**Nota de fechamento ([review058](reviews/058-review.md)):** o item 3 dizia que "Criar serviço" abre o formulário. O teste do gate (`authenticated-matrix.spec.ts`, "servicos: Criar serviço is reached by a real click") abre o formulário por "Novo serviço" e clica "Criar serviço", o botão de envio, provado pelo alerta "Informe o valor"; o item foi corrigido no fechamento, sem mudar a decisão. A mesma frase continua em `apps/frontend/AGENTS.md`, fora do escopo de escrita do fechamento. `SHELL_MODULES` é `readonly ShellModule[]` e não é conferida por tipo contra a união `ShellModule`; a garantia de que todo módulo tem casca vem de `AppShell` aplicar `app-frame` sem condição, não da lista.

## D-075 — O status do canal é o que o vínculo e a credencial abertos confirmam, o número público é dígitos, e a criação remota é desfeita quando a linha local não nasce, propostas no Goal059

**Status:** ACCEPTED no [review059](reviews/059-review.md) (rodada 3 de 3, 2026-09-27; rodadas 1 e 2 `CHANGES_REQUIRED` com 5 e 3 blockers, rodada 3 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal059, sobre a baseline aceita `5ff8e46caef207620a4ebc6022931fe315775573` (fechamento do Goal058, ACCEPTED no [review058](reviews/058-review.md)).

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA X-01** (ALTA): `GET /v1/whatsapp` dizia `CONNECTED` enquanto `GET /v1/status` e `GET /v1/dashboard`, que reaproveitam `whatsappSummary`, diziam `UNKNOWN`/`status: "error"` sob o mesmo vínculo. A causa era `whatsappSummary` (`apps/bff/src/modules/dashboard/routes.ts`) lendo `WhatsAppInstance` direto por `findUnique({ userId })` e passando `instance.evolutionInstanceToken` — o envelope cifrado — cru para a Evolution, em vez do vínculo resolvido por `findLinkedInstance` e da credencial aberta por `resolveInstanceCredential`, como `GET /v1/whatsapp` já fazia. **QA H-02** (ALTA) mostrou a mesma falha refletida na Home: o banner derivava de um segundo predicado sobre `dashboard.whatsapp`, que discordava da sidebar sob a mesma falha transitória da Evolution. **QA S-09**/**QA O-46** (MÉDIA) registraram `phoneNumber` saindo como JID cru (`55<número>:8@s.whatsapp.net`) em vez de dígitos, apesar de `PUBLIC_API_V1.md:356` já documentar dígitos. **QA O-47** (BAIXA) registrou instância órfã na Evolution quando `ensureInstance` criava a instância remota antes de conferir se a gravação local seria possível. **QA A-06** (BAIXA) registrou celular legado de 12 dígitos (sem o 9º dígito) exibido como fixo. Esses seis IDs usam o prefixo `QA`, não `A-`, porque o FINAL_AUDIT já usa `A-01`…`A-24` com outro significado.

**Decisão:**

1. **Toda leitura de estado do canal passa por `findLinkedInstance` e por `resolveInstanceCredential`.** `whatsappSummary`, reaproveitada por `GET /v1/status` e `GET /v1/dashboard`, resolve o vínculo pela mesma função que `GET /v1/whatsapp` usa (nunca uma segunda leitura direta de `WhatsAppInstance`) e só chama a Evolution com a credencial já aberta — nunca o envelope cifrado cru (`instance.evolutionInstanceToken`).
2. **Estado desconhecido nunca é exibido como desconexão.** Vínculo `pending` ou `divergent`, credencial que não abre e Evolution fora do ar viram `UNKNOWN` em `/v1/status` e `status: "error"` em `/v1/dashboard`, nunca `DISCONNECTED`; `settled` registra a falha com código e status HTTP, nunca com credencial, envelope, número ou corpo da resposta. A Home deriva o banner da mesma fonte que a sidebar e o checklist (`status.whatsappView`), não de um segundo predicado sobre `dashboard.whatsapp`.
3. **`phoneNumber` público é sempre dígitos**, sem servidor nem sufixo de aparelho, nas quatro saídas que o expõem (`GET /v1/whatsapp`, `GET /v1/status`, `GET /v1/dashboard` e o estado de onboarding), convertidos pelo que `lib/phone.ts` já tem (`phoneFromWhatsappJid`); linha antiga que ainda guarda JID sai convertida na resposta e é regravada na próxima leitura de `GET /v1/whatsapp`, sem migration. Exibição formatada (com o 9º dígito restaurado para celular legado) é separada do valor gravado e do valor público — vive só no frontend (`apps/frontend/src/shared/phone.ts`).
4. **Criação remota de instância é desfeita quando a linha local não chega a existir.** `ensureInstance` confere `WHATSAPP_CREDENTIAL_KEYS` antes de chamar `evolution.createInstance`, e remove a instância remota com `evolution.deleteInstance` quando a gravação local falhar entre a criação e o commit, relançando o erro original ao dono; falha da remoção é só registrada em log, sem credencial.

**Alternativas:** manter `whatsappSummary` como segunda leitura própria do vínculo, só trocando a credencial usada — rejeitada, porque preservaria a leitura fora da regra de posse (`findUnique({ userId })` em vez de `findLinkedInstance`) e o mesmo desacordo reapareceria em vínculo `pending`/`divergent`, que `findUnique({ userId })` não distingue; inferir "desconectado" como padrão seguro para qualquer erro de leitura — rejeitada, é exatamente o defeito que QA X-01 e QA H-02 expuseram; normalizar o JID dentro de `whatsappDto`/`onboardingState` com um parser próprio — rejeitada, `lib/phone.ts` já resolve isso e um segundo parser divergiria com o tempo.

**Motivo:** o produto promete que a Home, a sidebar, o checklist e a tela de WhatsApp dizem o estado real da conexão — nunca um estado inferido que diverge entre telas — e mostram um número de telefone, não um identificador técnico.

**Consequências:** `/v1/status` e `/v1/dashboard` passam a concordar com `/v1/whatsapp` sob o mesmo vínculo, inclusive sob falha transitória da Evolution (que agora vira `UNKNOWN`/`error` nos três, nunca `CONNECTED` num e `UNKNOWN` no outro); a Home deixa de afirmar desconexão ou pausa sob estado desconhecido; `WhatsAppInstance.phoneNumber` legado em formato JID é regravado em dígitos na próxima leitura de `GET /v1/whatsapp`; nenhum campo público, rota ou schema Prisma muda de forma. **A leitura de status não ganha escrita nova:** `whatsappSummary` só grava pelo que `resolveInstanceCredential` já fazia em `GET /v1/whatsapp` — decifração de credencial legada em texto puro (uma vez, a linha nasce selada) e rotação de `WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID` (uma vez por rotação); fora desses dois casos, nenhum tick da sidebar em `GET /v1/status` escreve no banco.

**O que acrescenta a D-004 e D-019, sem reescrevê-las:** a D-004 exigiu tenant canônico e credenciais restritas por chamador, com segredo cifrado e versionado. A D-019 item 3 aplicou isso à instância do WhatsApp — credencial cifrada, resolução preguiçosa, reprojeção idempotente em `GET /v1/whatsapp` como caminho de transição —, mas só nessa rota; a D-075 estende a mesma regra a toda leitura de status do canal (`/v1/status`, `/v1/dashboard`), fechando o caminho que ainda usava o envelope cru fora de `GET /v1/whatsapp`. A D-019 item 4 definiu os dois estados ambíguos do vínculo (pendente, descartável pelo dono; divergente, reservado à operação); a D-075 diz que esses estados, quando alcançados por uma leitura de status em vez de uma mutação, saem como `UNKNOWN`/`status: "error"`, nunca como `DISCONNECTED`.

**Limites declarados:**

- **A remoção compensatória é melhor esforço e não varre órfãs antigas.** `ensureInstance` só evita órfã nova entre a criação remota e a gravação local desta própria tentativa; instâncias órfãs que já existiam na Evolution antes deste Goal continuam fora do escopo — QA O-47 é sobre impedir órfã nova, não sobre limpar histórico.
- **A exibição com o 9º dígito é só exibição.** Nenhum identificador, chave de busca ou valor gravado muda por causa do formato visual do número; a normalização de busca por telefone com e sem o 9º dígito já existia em `whatsappPhoneCandidates` e não foi tocada por este Goal.

**Revisar se:** o produto precisar limpar instâncias órfãs anteriores a este Goal, ou a regra de exibição do 9º dígito precisar cobrir formato fora dos dois padrões brasileiros já tratados (`normalizeBrazilianPhoneDigits`).

**Nota de fechamento ([review059](reviews/059-review.md)):** a escrita disparada pela leitura de status acontece só na primeira leitura de um vínculo com credencial legada em claro ou na primeira leitura depois de uma rotação de `WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID` (`resolveInstanceCredential`/`persistSealed`, `instance-link.ts`): uma vez por instância e por rotação. Leituras concorrentes nesse primeiro acesso, como um tick da sidebar simultâneo a `GET /v1/dashboard`, podem regravar em paralelo o mesmo envelope, de forma idempotente. A gravação de `phoneNumber` já convertido em `GET /v1/whatsapp` é provada pela leitura da própria linha no banco, não só pela resposta HTTP. A decisão não mudou.

## D-076 — O evento de agenda na conversa é derivado só do ledger, pela ordem do rascunho único, e nunca do texto do modelo, proposta no Goal070

**Status:** ACCEPTED no [review070](reviews/070-review.md) (rodada 2 de 2, 2026-09-27; rodada 1 `CHANGES_REQUIRED` com 3 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal070, sobre a baseline aceita `c8beaeb3ccc4ce841f3cbd5efa0448abd3c48df5` (fechamento do Goal059, ACCEPTED no [review059](reviews/059-review.md)).

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA CV-03** (MÉDIA): o protótipo K1 mostra, entre as bolhas, "Horário reservado até 13:46 · sex 15:30" e "Agendamento criado · sex 19/09, 15:30 · Ver", com link para a Agenda; o produto mostrava só bolhas. Com essas linhas visíveis, o dono teria visto na hora que a confirmação do caso QA A-01 (D-073) não tinha criado nada. Este ID usa o prefixo `QA`, não `A-`, porque o FINAL_AUDIT já usa `A-` com outro significado.

**Decisão:**

1. **O evento vem só do ledger, nunca do texto.** `deriveConversationEvents` (`apps/ai-orchestrator/src/modules/conversations/conversation-events.ts`) lê só as `AiToolCall` de `create_appointment` dos `AiRun` da conversa, do mesmo tenant — nunca `AiRun.outputText`, `Message.body`, `Conversation.state` nem `arguments` além de `action`. Produz `HOLD_PLACED` (um `prepare` `SUCCEEDED`), `APPOINTMENT_CREATED` (um `confirm` `SUCCEEDED` com `appointment.id`) e `HOLD_EXPIRED` (um `HOLD_PLACED` vencido e não consumido, ou provado vencido por um `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED`). Chamada `FAILED`/`STARTED` e `result` fora da forma esperada não produzem evento; o descarte vai para `logger.warn` com `tenantId`, `conversationId`, `toolCallId` e o campo ausente, nunca `result`, `arguments`, telefone ou nome. O relógio é injetado (`now`), evitando a intermitência do relógio real que o [review059](reviews/059-review.md) (observação 4) registrou em `goal008-agenda`.
2. **A ligação é pela ordem do rascunho único, como `pendingAction`.** Um `confirm` `SUCCEEDED` consome o `prepare` `SUCCEEDED` mais recente ainda não consumido nem substituído; um `prepare` `SUCCEEDED` substitui o anterior ainda não consumido, **se esse anterior ainda não venceu**. **Reserva substituída antes de vencer não vence:** um `prepare` substituído por outro `prepare` `SUCCEEDED` antes do seu próprio vencimento não produz `HOLD_EXPIRED`, porque a reserva dele já foi liberada (`releasePendingHolds`) — afirmar "vencida" seria um fato falso. Se o `prepare` anterior já tiver vencido (pelo relógio ou por um `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED`) antes do próximo `prepare` chegar, ele continua produzindo `HOLD_EXPIRED` — a substituição não apaga um vencimento já ocorrido.
3. **Rota própria, não campo de mensagem.** `GET /internal/conversations/:id/events` (escopo `conversations:read`, `requireConversation` antes de ler o ledger) e `GET /v1/conversations/:id/events` (proxy fino, `packages/public-api-contract` com `conversationEventSchema`, união discriminada por `type`) entregam os eventos por rota própria. `GET /v1/conversations/:id/messages` e `messageSchema` não mudam.
4. **O evento segue a purga do conteúdo.** A derivação lê `AiToolCall`, que cai em cascata quando `content-purge-service` apaga o `AiRun` (Goal023); evento de período purgado some junto com o conteúdo, sem regra de retenção nova.
5. **A conversa mostra as três linhas entre as bolhas.** `MessageTimeline` intercala evento e mensagem por instante, com o evento antes da bolha em caso de empate; `HOLD_PLACED` mostra o vencimento no fuso do negócio (D-045); `APPOINTMENT_CREATED` tem "Ver" para `/agenda/agendamento?id=`; falha na consulta de eventos não esconde as mensagens nem afirma erro na conversa; conversa sem eventos fica igual a hoje.

**Alternativas:** ler o status do agendamento pelo JSON da decisão do modelo (`appointmentDraftPatch`) — rejeitada, é o mesmo defeito que a D-073 já corrigiu: o modelo pode escrever um status que ninguém gravou. Ligar `confirm` ao `prepare` por `holdId` — rejeitada, o `result` do `confirm` não traz `holdId`, e o slot único de `pendingAction` já resolve a ordem sem precisar dele. Mostrar remarcação, cancelamento e série recorrente nesta mesma passada — rejeitada, fora do que o protótipo K1 mostra e fora do escopo deste Goal; ver Limites.

**Motivo:** QA CV-03 mostrou que o dono não vê o que a IA fez de fato na agenda — só as bolhas de texto —, o que teria revelado na hora o defeito do caso QA A-01. O fato precisa vir do mesmo ledger que a D-073 já usa como fonte de verdade, nunca do texto do modelo.

**Consequências:** a conversa passa a mostrar, entre as bolhas, a reserva feita, a reserva vencida sem confirmação e o agendamento criado com link para a Agenda. Nenhuma tool, fluxo `prepare`/`confirm`, `messageSchema` ou a métrica da Home (`aiAppointmentsToday`, D-073) foi tocada.

**O que acrescenta a D-073, sem reescrevê-la:** a D-073 fez a resposta ao cliente honesta sobre o que foi de fato gravado no ledger, substituindo a afirmação do modelo por texto fixo quando falta prova. A D-076 faz a tela do dono honesta pela mesma fonte — o ledger `AiToolCall`, nunca o texto do modelo —, na mesma conversa. As duas decisões compartilham a regra "o fato vem do ledger", cada uma aplicada a uma superfície diferente: a D-073 à resposta que o cliente recebe, a D-076 à linha que o dono vê.

**Limites declarados:**

- **Remarcação, cancelamento e série recorrente não aparecem.** `reschedule_appointment`, `cancel_appointment`, `prepare_recurring_appointments` e `confirm_recurring_appointments` não são lidos por `deriveConversationEvents`. O protótipo K1 só mostra reserva e criação; este Goal não amplia o desenho.
- **O texto de `HOLD_EXPIRED` não tem referência no protótipo.** "Reserva de \<dia\> HH:MM venceu sem confirmação" é proposta deste Goal, sem equivalente em `Conversas-Desktop.dc.html`; a conferência de fidelidade visual ao protótipo é humana (Goal069).
- **Aderência do modelo real a `prepare`/`confirm` no momento certo continua fora de prova, por D-050.**
- **Agendamento criado pelo dono na Agenda, fora da conversa, não é evento desta conversa** — o evento é do que a IA fez nesta conversa, não da Agenda em geral.

**Revisar se:** o Goal069 (fidelidade visual) mudar o texto ou a posição das linhas de evento; ou um Goal futuro decidir mostrar remarcação, cancelamento ou série recorrente na conversa, o que exigiria estender `deriveConversationEvents` e revisar este limite declarado.

**Nota de fechamento ([review070](reviews/070-review.md)):** a rodada 1 reprovou a regra do item 2 como estava implementada. Um `prepare` já vencido, pelo relógio ou por `confirm` `FAILED` com `APPOINTMENT_HOLD_EXPIRED`, era marcado como substituído quando chegava o `prepare` seguinte, e o `HOLD_EXPIRED` sumia justamente no caminho real do caso QA A-01. A rodada 2 aceitou o texto atual do item 2: só a reserva substituída **antes de vencer** deixa de produzir `HOLD_EXPIRED`. Dois limites ficam registrados no review, sem mudar a decisão. Primeiro: quando o vencimento é provado só por `confirm` `FAILED`, o `HOLD_EXPIRED` usa `occurredAt = holdExpiresAt`, que pode estar no futuro e ordenar a linha depois do `prepare` seguinte. Segundo: a seção de Conversas de `apps/bff/PUBLIC_API_V1.md` ainda não diz que o evento some com a purga de conteúdo nem que remarcação, cancelamento e série recorrente não aparecem; o item 4 e os Limites desta decisão dizem. A decisão não mudou.

## D-077 — A conexão com a Minha Agenda pede só e-mail e senha, endereço e cliente OAuth vêm do sistema, o profissional é descoberto e a credencial não sobrevive à importação concluída, proposta no Goal060

**Status:** ACCEPTED no [review060](reviews/060-review.md) (rodada 4 de 4, 2026-09-27; rodadas 1, 2 e 3 `CHANGES_REQUIRED` com 4, 3 e 3 blockers, rodada 4 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal060, sobre a baseline aceita `61beaa5d907fd1cc4328a800140abc314b131bdc` (fechamento do Goal070, ACCEPTED no [review070](reviews/070-review.md)).

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA IM-01** (ALTA): o formulário pedia seis dados técnicos (usuário, senha, "Chave de acesso", "Endereço da sua conta", "Código do profissional" e "Forma de pagamento padrão"), e o dono, que conhece o sistema, errou o endereço. **QA IM-02** (MÉDIA): o erro dizia "Não foi possível conectar ao Minha Agenda agora. Tente novamente." para um erro que não se resolve tentando de novo, porque o BFF embrulha todo erro não-2xx de serviço interno como `UPSTREAM_ERROR` e a tela comparava `error.code` direto com `MINHA_AGENDA_*`, então nenhum caso casava. A pergunta **894** do vault (`docs/product-vault/04-Referencia/99-Perguntas-e-Respostas.md:1019`) diz que a senha do Minha Agenda não deve manter relação permanente.

**Decisão:**

1. **Endereço e cliente OAuth da origem são configuração do sistema, não do negócio.** `MINHA_AGENDA_API_BASE_URL` (`apps/scheduling-service/src/config/env.ts`, default `https://api.minhaagendaapp.com.br`) e `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` (opcional, sem default, `sync: false` em `render.yaml`) substituem `baseUrl`/`basicAuth` gravados por negócio. `parseMinhaAgendaConnection` (`config.ts`) sempre usa os dois valores do sistema; sem a credencial de ambiente, conectar recusa com `MINHA_AGENDA_NOT_CONFIGURED` (503) antes de qualquer chamada à origem ou escrita. Linha antiga com `baseUrl`/`basicAuth` gravados continua legível — os dois valores gravados são ignorados, nunca lidos de volta.
2. **A conexão pede só e-mail e senha, com schema estrito.** `POST /internal/calendar/integration/connect` e `POST /v1/calendar/integration/connect` aceitam só `{ email, password }` (`integrationConnectBodySchema` e `integrationSchema`, `.strict()`); qualquer campo a mais — inclusive o envelope antigo `credentials`/`configuration` — é recusado com `VALIDATION_ERROR`, sem chamada à origem e sem escrita.
3. **O profissional é descoberto, e a conta de mais de um é recusada.** Depois do login, `GET /employees/professionals?includeDeleted=false` (`MinhaAgendaClient.listProfessionals`) traz a lista; `resolveDiscoveredEmployeeId` (`config.ts`) grava o `id` de um profissional único, recusa com `MINHA_AGENDA_PROFESSIONAL_NOT_FOUND` (422) se não houver nenhum e com `MINHA_AGENDA_MULTIPLE_PROFESSIONALS` (422) se houver mais de um. Nenhum caso escolhe um profissional por conta própria; o MVP importa um profissional só.
4. **O status da origem nunca vira o status da resposta, e as classes de erro são fixas.** Credencial recusada (`/oauth/token` 400/401) sai `MINHA_AGENDA_AUTH_FAILED` 422; conta sem um profissional único sai 422 (item 3); origem indisponível (timeout, falha de rede, `/oauth/token` com outro não-2xx, chamada autenticada não-2xx após nova tentativa, resposta fora do schema) sai 502 ou 504; falha nossa (configuração ausente ou gravada ilegível) sai 503 ou 500. Nenhum código `MINHA_AGENDA_*` sai com status 401 ou 403 em nenhuma rota do scheduling-service; o status da origem só aparece em `details`. Nenhuma falha da conexão grava linha nova nem altera a existente. O BFF não traduz os códigos: eles chegam ao frontend como `code: "UPSTREAM_ERROR"`, `details.upstreamCode` e o status repassado.
5. **A credencial é apagada quando a importação termina (vault Q894).** Na mesma transação de `completeOnce` que grava `completedAt`, a linha `IntegrationConnection` `MINHA_AGENDA` do negócio é apagada, filtrada pelo `tenantId` do contexto; a referência de `ImportSession.connectionId` é desfeita antes, porque o FK é `Restrict`. Falha na transação mantém a linha; conclusão repetida não falha por ela já não existir; a conclusão de um negócio nunca toca a linha de outro. Depois da conclusão, `GET /v1/calendar` devolve `integration: null`. `DELETE /internal/calendar/integration` não muda.

**Alternativas:** manter os seis campos técnicos e só trocar a copy do erro — rejeitada, não resolve QA IM-01 (o dono continuaria digitando endereço e código do profissional) nem a causa raiz de QA IM-02 (o BFF continuaria embrulhando o código sem tradução alguma reconhecer). Deixar a escolha entre profissionais para uma tela nova — rejeitada, fora do MVP de um profissional só (§3 do Goal, decisão de produto). Manter a credencial após a conclusão para permitir reconexão futura sem novo login — rejeitada, contraria a pergunta 894 do vault diretamente.

**Motivo:** QA IM-01 e QA IM-02 mostraram que o formulário expunha detalhe técnico que não é do dono e que o erro genérico escondia causas que não se resolvem tentando de novo. A pergunta 894 do vault exige que a senha não sobreviva à importação.

**Consequências:** a tela de conexão tem só dois campos; a configuração do sistema fica em variável de ambiente, nunca em linha do negócio; a descoberta do profissional e as classes de erro dão ao dono um texto específico por causa; a credencial é apagada no momento da conclusão, mas volta a existir se o negócio reconectar depois, porque nada nas rotas de conexão recusa esse caso (ver Limites).

**Limites declarados:**

- **O caminho e a forma da resposta de `/employees/professionals` vêm do mapa histórico do portal (`apps/api/docs/MINHAAGENDA_ENDPOINTS.md`, commit `1e22dff`) e não foram conferidos contra a API real.** Se a conta real tiver mais de um profissional, ou se a resposta tiver outra forma, isso é evidência nova para o planejamento, não falha escondida.
- **A conferência humana do §8 do Goal — login e descoberta contra a conta de teste real da Minha Agenda (U-05) — não foi feita por este Goal.** Fica para depois do aceite, com a pilha local.
- **Escolha entre vários profissionais não existe e não é criada aqui.** O MVP é de um profissional só; mudar isso é decisão de produto fora deste Goal.
- **`POST /internal/calendar/integration/connect` e `POST /v1/calendar/integration/connect` aceitam conectar depois da conclusão e gravam a credencial de novo, sem restrição.** Quem recusa é `POST /v1/calendar/imports`, com `409 IMPORT_ALREADY_COMPLETED`, porque o direito único de importação já foi consumido — não a conexão. Isso significa que a credencial pode voltar a existir depois de apagada pela conclusão (item 5), sem que uma nova importação seja possível com ela. Impedir a reconexão pós-conclusão é decisão de produto fora deste Goal.

**Revisar se:** a conferência humana do §8 encontrar uma conta com mais de um profissional ou uma forma de resposta diferente da documentada; ou um Goal futuro decidir que múltiplos profissionais fazem parte do MVP.

**O que acrescenta a U-07, sem reescrevê-la:** U-07 já dizia que a conexão pede só e-mail e senha, com endereço e cliente OAuth fixos no sistema, e código do profissional e forma de pagamento descobertos ou configurados pelo sistema, nunca digitados. A D-077 precisa como isso é implementado: schema estrito nas duas rotas, descoberta por `/employees/professionals` com recusa de zero ou vários profissionais, as quatro classes de erro do item 4, e a remoção da credencial na conclusão pela pergunta 894.

**Nota de fechamento ([review060](reviews/060-review.md)):** o código dos itens 1 a 5 não gerou blocker em nenhuma rodada. As rodadas 1 a 3 reprovaram os textos de erro da tela, o rótulo da senha, a verificação dos termos proibidos no teste jsdom e o registro documental. O ponto de mais peso foi a reconexão depois da conclusão: `apps/bff/PUBLIC_API_V1.md` e as Consequências desta decisão diziam que ela era recusada ou que a credencial nunca mais existia, e as duas afirmações eram falsas. A rodada 4 aceitou o texto atual, com o resíduo declarado nos Limites. Um efeito colateral fica registrado no review, sem mudar a decisão: com o schema estrito do item 2, `enableWrites` a mais passa a ser `VALIDATION_ERROR` (400), e o código `409 INTEGRATION_WRITES_NOT_SUPPORTED` do Goal010 deixa de existir; a seção do Goal010 em `PUBLIC_API_V1.md` ainda o cita. A decisão não mudou.

## D-078 — A análise e a execução da importação começam numa requisição curta e terminam no processo do Scheduling, coordenadas só pelo lease do banco, proposta no Goal061

**Status:** ACCEPTED no [review061](reviews/061-review.md) (rodada 2 de 2, 2026-09-27; rodada 1 `CHANGES_REQUIRED` com 5 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal061, rodada 1, sobre a baseline aceita `355ff9282b8947c37f897dd9b987ccca444b5c07` (fechamento do Goal060, ACCEPTED no [review060](reviews/060-review.md)). Aplica D-008 à importação, sem reescrever D-008 nem D-026.

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA IM-03** (ALTA): a análise real (~27 s para 2.338 itens) nunca chegava à tela, porque o BFF corta a chamada interna em 10 s (`INTERNAL_HTTP_TIMEOUT_MS`), embora o Scheduling terminasse e gravasse `READY`. **QA IM-07** (ALTA): "Importar tudo" levou 31,4 s, o proxy do Next desistiu em ~30 s e a tela disse que não foi possível importar, com o botão ativo, depois de gravar 2.327 registros. **QA IM-04** (MÉDIA): cada visita à tela refazia a análise inteira, porque não existia rota que lesse o preview gravado. **QA IM-08** (MÉDIA): itens `FAILED` com `IMPORT_SERVICE_MAPPING_MISSING` sem motivo na tela. **QA IM-05** (BAIXA): a contagem de clientes sumia da revisão numa categoria com limitação declarada. Na baseline, as rotas `POST .../analyze` e `POST .../execute` esperavam a origem inteira; a execução já reivindicava o lease antes de ler a origem, e a análise não tinha lease nenhum: `ANALYZING` existia no enum, mas nenhum código o gravava.

**Decisão:**

1. **Iniciar é uma requisição curta; o trabalho termina no processo do Scheduling.** `POST /internal/calendar/imports/:sessionId/analyze` e `POST .../execute` conferem sessão, estado e conexão (e, na execução, `previewVersion` e as configurações do calendário), reivindicam a sessão com `acquireImportLease` gravando `ANALYZING` ou `EXECUTING` no mesmo `UPDATE`, disparam o trabalho no próprio processo e respondem **`202`** com `{ sessionId, status, previewVersion }`. A requisição nunca chama a origem, nem para o token. `withImportIdempotency` continua envolvendo o início: a mesma chave devolve a mesma resposta e não dispara segundo trabalho. O disparo é uma promessa registrada em `ImportBackgroundWork` (`apps/scheduling-service/src/modules/migrations/import-lease.ts`), um conjunto em memória que só existe para que `app.close()` (`app/build-app.ts`, `onClose`) e os testes esperem os trabalhos em curso. **Quem decide quem trabalha é o lease do banco**, não o conjunto em memória. Nenhum loop, timer periódico, fila, worker, processo, migration ou campo novo: `leaseOwner`, `leaseExpiresAt`, `leaseHeartbeatAt`, `errorCode` e `errorMessage` já existiam em `ImportSession`.
2. **A análise tem lease e exclui a execução pelo estado.** A análise reivindica a partir dos estados de `ANALYZABLE_STATUSES` (`DRAFT`, `ANALYZING` com lease vencido, `READY`, `PARTIAL`) e termina como a baseline terminava para o estado de partida: `PARTIAL` continua `PARTIAL`, os demais viram `READY`. Como `ANALYZING` apaga o estado de partida da linha, ele é recuperado sem migration por `analysisOrigin` (`import-preview-service.ts`): lido no início ou, na retomada de `ANALYZING` pendurado, derivado de `startedAt` (execução já começou: `PARTIAL`) e de `previewVersion` (maior que zero: `READY`; zero: `DRAFT`). Com a sessão em `ANALYZING`, iniciar a execução é recusado; com a sessão em `EXECUTING`, iniciar a análise é recusado. Novo início com lease vivo é recusado com `IMPORT_SESSION_LEASE_HELD` (409). Concluir continua exigindo `READY` ou `PARTIAL`.
3. **O trabalho só grava enquanto tem o lease (fencing).** O trabalho renova o lease durante a leitura da origem e durante o lote (`ImportLeaseHolder`), pelo relógio do banco. A transação final da análise só vale se a sessão ainda tem o mesmo `leaseOwner` e está em `ANALYZING`, e cada escrita da execução confere o dono e o estado, como a execução já fazia. Sessão substituída (`replace`), integração apagada ou lease tomado por outra instância fazem o trabalho parar sem escrever nada da sessão.
4. **A retomada depois de queda é pedida pelo dono, sem loop nem varredura.** Trabalho de uma instância que cai deixa a sessão em `ANALYZING` ou `EXECUTING` com lease vencido. Nada o retoma sozinho: a tela mostra a interrupção e oferece "Continuar", que inicia de novo e reivindica a sessão pendurada.
5. **`interrupted` é decidido pelo relógio do banco.** `GET /internal/calendar/imports/:sessionId/progress` e `session` de `GET /internal/calendar/imports` ganham, por acréscimo, `interrupted`: verdadeiro quando a sessão está em `ANALYZING` ou `EXECUTING` sem lease ou com lease vencido, comparado com a hora lida do banco (`isImportSessionInterrupted`, `import-lease.ts`). O frontend nunca compara relógio próprio.
6. **A falha do trabalho fica gravada com código de conjunto fechado, sem mensagem exposta.** Falha que não é de item grava `errorCode` de `IMPORT_WORK_ERROR_CODES` (`IMPORT_SOURCE_AUTH_REJECTED`, `IMPORT_SOURCE_UNAVAILABLE`, `IMPORT_SOURCE_INVALID_RESPONSE`, `IMPORT_PREVIEW_STALE`, `IMPORT_INTERNAL_ERROR`) e um `errorMessage` fixo por código, que nunca leva segredo, credencial, e-mail, senha, token nem corpo cru da origem, e libera o lease. A análise volta ao estado de partida. A execução fica em `EXECUTING` sem lease, retomável, como já ficava. Preview obsoleto descoberto pelo trabalho segue o contrato de antes: nada é importado e o código gravado é `IMPORT_PREVIEW_STALE`. As leituras expõem só `lastError: { code }` ou `null`; a mensagem não sai do Scheduling. Iniciar de novo limpa `errorCode` e `errorMessage` no mesmo `UPDATE` da reivindicação. `failedReasons` por categoria (`[{ reasonCode, count }]`) conta os itens `FAILED` que a rota de progresso já carrega.
7. **A tela lê o preview gravado e só relê a origem por pedido do dono.** Nascem `GET /internal/calendar/imports/:sessionId/preview` e `GET /v1/calendar/imports/:sessionId/preview`: só humano, sem efeito, sem `Idempotency-Key`, lendo `ImportSession` e `ImportSessionCategory` da versão vigente, sem ler a origem; sessão sem análise concluída (`previewVersion` 0) é recusada com `IMPORT_SESSION_PREVIEW_NOT_AVAILABLE` (409); `changesSincePreviousVersion` não é gravado e não é devolvido. A tela (`ImportPreviewScreen.tsx`) lê o preview gravado quando `previewVersion` é maior que zero, inicia a análise sozinha só em `DRAFT` sem preview, acompanha `ANALYZING` lendo o estado e só relê a origem pelo botão do dono. Falha de transporte (rede, timeout ou 5xx) no início da análise, em "Importar tudo" e na retomada não é tratada como falha: a tela relê o estado e só mostra o erro quando nada começou. Depois de "Tentar de novo" ou "Continuar" aceito, a tela mostra a análise em andamento, não a falha nem a interrupção anterior. "Importar tudo" sai da tela quando o início é aceito e não fica ativo com a sessão em `EXECUTING`. Cada código de motivo de item falho que a execução grava tem texto leigo próprio; código desconhecido cai num texto genérico.

**Alternativas:** aumentar `INTERNAL_HTTP_TIMEOUT_MS` e declarar `proxyTimeout` no Next — rejeitada, o defeito se resolve por não esperar, não por esperar mais, e a próxima conta maior cairia de novo. Fila externa, worker dedicado ou loop que varre sessões penduradas — rejeitada, contraria D-008 (jobs no banco do dono, sem fila externa nem serviço novo), e o Goal061 proíbe loop, timer, fila, worker e processo novos. Guardar o estado de partida num campo novo — rejeitada, o Goal061 proíbe migration, e o estado é derivável de `startedAt` e `previewVersion`. Decidir `interrupted` no frontend comparando `leaseExpiresAt` com o relógio do navegador — rejeitada, relógio de cliente não é fonte de verdade.

**Motivo:** QA IM-03 e QA IM-07 mostraram que a importação terminava no servidor e a tela dizia que tinha falhado, porque a requisição esperava a origem. QA IM-04 mostrou que reler a origem a cada visita custa ~27 s e pode mudar o preview que o dono aprovou. QA IM-08 e QA IM-05 mostraram que o dado já existia e não chegava à tela.

**Consequências:** o tempo da origem deixa de depender de timeout de transporte; análise e execução se excluem pelo banco; o dono vê andamento, interrupção, causa da falha e motivo de cada item falho; a retomada depende de alguém pedir. `POST /v1/calendar/imports/:sessionId/analyze` e `.../execute` respondem `202` com `importWorkStartSchema`, e `importExecutionSchema` sai do registro de rotas do contrato público.

**Limites declarados:**

- **Trabalho em curso numa instância que cai só é retomado quando alguém pede.** Não há loop nem varredura: a sessão fica em `ANALYZING` ou `EXECUTING` com lease vencido, aparece como `interrupted` e espera "Continuar".
- **`/importacao` segue fora do gate renderizado.** Largura, toque, contraste, foco e movimento das telas de importação não são medidos por `validate:ui` nem pelo gate autenticado.
- **A conferência humana do §9 do Goal061 não foi feita.** Ninguém conferiu, com a pilha local e a conta de teste de U-05, que a análise e a importação de uma conta real terminam e que a tela acompanha até o fim. Fica para depois do aceite.

**Revisar se:** a conferência humana encontrar uma origem cuja leitura ultrapasse o TTL do lease mesmo com renovação; ou o volume de sessões penduradas justificar retomada automática, o que exigiria decisão nova sobre loop no Scheduling.

**Nota de fechamento ([review061](reviews/061-review.md)):** os itens 1 a 6 não geraram blocker. A rodada 1 reprovou a tela e o registro: o início da análise e a retomada tratavam falha de transporte como falha; a fase derivada da sessão escondia o reinício pedido pelo dono; cinco códigos de motivo de item falho não tinham texto; houve uma edição fora de escopo em `apps/ai-orchestrator/`; e a documentação foi escrita antes da execução final. A rodada 2 corrigiu os cinco pontos, e o texto do item 7 descreve o comportamento aceito. Fica registrado no review, sem mudar a decisão, que o ramo `IMPORT_PREVIEW_STALE` do trabalho de execução é defesa sem caminho real hoje: o preview obsoleto é recusado no início, antes do `202`. A decisão não mudou.

## D-079 — A categoria de clientes lê a listagem da origem, a disponibilidade importada troca a vigente só por decisão de item, o telefone é gravado na forma canônica e preço zero é preço não informado, proposta no Goal062

**Status:** ACCEPTED no [review062](reviews/062-review.md) (rodada 2 de 2, 2026-09-27; rodada 1 `CHANGES_REQUIRED` com 6 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal062, sobre a baseline aceita `c86ca2ecdd38fbe9e0daa60206e6a038db4c8f3f` (fechamento do Goal061, ACCEPTED no [review061](reviews/061-review.md)). Aplica **U-08** e **D-005** e diz isso, sem reescrever nenhuma das duas.

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA IM-06** (ALTA): a tela dizia que a Minha Agenda não tem lista completa de clientes, e a importação perdia toda cliente sem agendamento ou bloqueio no período lido. **QA IM-09** (ALTA): depois de concluir, seg–sex tinham três regras ativas (09–18 do onboarding, 08–12 e 13–19 da origem), o almoço sumia, `/configuracoes/disponibilidade` mostrava só 08:00–12:00 e salvar apagaria a tarde. **QA IM-10** (MÉDIA): os clientes importados vinham como `55<DDD+número>`, sem o `55` do país, enquanto o contato do WhatsApp chega como `5555…`. **QA CL-04** (MÉDIA): o telefone do cadastro manual era gravado e mostrado como digitado. **QA IM-11** (BAIXA): serviço com preço zero era importado como "R$ 0,00". **QA CL-05** (BAIXA), só a parte de busca: a cliente com o mesmo número não era achada como candidata. Na baseline, `readCustomerCategory` juntava só os clientes embutidos em agendamentos e bloqueios, com `CUSTOMER_DIRECTORY_UNAVAILABLE`; `runAvailabilityGroup` criava as regras da origem sem ler as vigentes; `normalizePhone` do Scheduling só tirava o que não é dígito e a busca comparava por igualdade exata; `knownNumber(0)` devolvia `0` e o serviço nascia `FIXED` 0. U-08 já tinha respondido que a Minha Agenda tem lista completa de clientes.

**Decisão:**

1. **A categoria de clientes lê a listagem da origem e recua com limitação declarada quando a forma não bate (aplica U-08).** `MinhaAgendaClient.listCustomers()` (`apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts`) chama `GET /customers` pelo mesmo `request` autenticado e valida a resposta como lista de `minhaAgendaCustomerSchema` (que ganha `deleted`). A categoria `CUSTOMER` (`readCustomerCategory`, `import-source-reader.ts`) é a união da listagem com os clientes embutidos em agendamentos e bloqueios lidos que a listagem não trouxe, deduplicada pelo `id` da origem; registro da listagem com `deleted: true` fica fora, salvo quando um agendamento ou bloqueio lido o referencia. Com a listagem lida: `sourceSupported: true`, `readCount` igual ao tamanho da união, `sourceReportedCount` igual ao tamanho da listagem, sem limitação. Com `404` ou resposta fora da forma, a categoria volta à cobertura anterior (só clientes embutidos), com `sourceSupported: false` e o código novo `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`, gravado e mostrado com texto próprio; `CUSTOMER_DIRECTORY_UNAVAILABLE` continua só para sessão analisada antes deste Goal e para leitor sem o método. Login recusado, origem indisponível e erro de rede continuam falhando o trabalho inteiro. A execução relê a origem pelo mesmo leitor.
2. **A disponibilidade importada substitui a vigente só por decisão de item, nunca por decisão de sessão ou de categoria, e nunca é somada.** Com pelo menos uma `AvailabilityRule` ativa no negócio, a análise marca os itens de `AVAILABILITY` como `NEEDS_REVIEW` com `AVAILABILITY_REPLACES_CURRENT`; sem regra ativa, ficam `PENDING` como antes. A grade proposta (`migrationAvailabilityRules`) é validada pela regra de sobreposição que saiu de `routes.ts` para `apps/scheduling-service/src/modules/availability/availability-grid.ts` (`assertNonOverlappingRules`, `isValidAvailabilityGrid`), a mesma de `PATCH /internal/availability-settings`, cujo comportamento não muda; grade da origem que se sobrepõe a si mesma recebe `AVAILABILITY_SOURCE_OVERLAP` e nunca é gravada. A grade proposta já derivada (só `dayOfWeek`, `startTime`, `endTime`) fica em `ImportItem.proposedAvailability`, coluna JSONB anulável da única migration do Goal, `20260927120000_goal062_import_item_proposed_availability`, que só acrescenta a coluna. `INCLUDE` de item quer dizer "usar os horários da Minha Agenda no lugar dos atuais" e `EXCLUDE` quer dizer "manter meus horários"; a decisão vale para o grupo inteiro (`company` e `employee:<id>`), gravando uma `ImportDecision` de escopo `ITEM` por item do grupo na mesma transação, sem valor novo de `ImportDecisionKind`. Na execução, a troca só é confirmada por `INCLUDE` de escopo `ITEM` desta sessão num item do grupo; `IMPORT_ALL`, decisão de categoria e seleção de categoria nunca a confirmam. Uma transação só, aberta pelo fencing do lease (D-078), conta as regras ativas: com regra ativa e sem confirmação, nada de disponibilidade é gravado e os itens terminam `FAILED` com `AVAILABILITY_CHANGED_SINCE_ANALYSIS`, cujo texto na tela manda analisar de novo; com confirmação, apaga a grade vigente do negócio, grava a da origem e confirma os itens. A leitura dos itens de `AVAILABILITY` devolve, por acréscimo, `currentAvailability` e `proposedAvailability`. A tela de Disponibilidade mostra todas as regras ativas por dia e só envia uma grade que não cabe no formulário de intervalo único depois de confirmação explícita.
3. **O Scheduling grava o telefone na forma canônica brasileira e busca candidatos por equivalência de formas, sem vincular, fundir nem renomear (aplica D-005).** `normalizePhone` (`apps/scheduling-service/src/shared/phone/phone.ts`) devolve `55` + DDD + assinante para número brasileiro reconhecido (10 ou 11 dígitos nacionais com DDD válido; 12 ou 13 dígitos começando por `55` com DDD válido; prefixos `00` e `0` removidos), com o 9º dígito quando o assinante de 8 dígitos começa por 6–9; o resto continua como antes (dígitos, entre 6 e 15, ou `INVALID_PHONE`). `phone` é gravado como `+` seguido da forma canônica quando o número é reconhecido e como digitado, sem espaços nas pontas, quando não é, pelo mesmo caminho (`AtendlyCustomerService`) no cadastro manual, na edição, na criação na confirmação do agendamento e na importação. `list({ phone })` e `findCandidatesByPhone` comparam `normalizedPhone` com o conjunto de formas equivalentes (`phoneEquivalenceCandidates`): a canônica, a sem 9º dígito e as duas nacionais sem `55`, que existem só para achar linhas gravadas antes deste Goal. A classificação de cliente na análise usa a mesma equivalência. `BRAZILIAN_DDDS` do Scheduling é a lista de `apps/bff/src/lib/phone.ts`, e um teste compara as duas. O resultado continua sendo lista de candidatos: nada vincula, funde nem renomeia, e o vínculo da conversa continua nascendo só na confirmação (D-005). `apps/ai-orchestrator/` não muda. A exibição de cliente usa `formatBrazilianPhone` quando o número é brasileiro reconhecido.
4. **Preço zero da origem é preço não informado.** `resolvePrice` (`import-execution-service.ts`) trata preço `0` como ausente: o serviço nasce `NOT_INFORMED` com `price` nulo, no catálogo e nos serviços embutidos em agendamentos importados; o preço total do agendamento não muda. A análise marca o serviço com `SERVICE_PRICE_NOT_INFORMED`, informativo, sem mudar o status nem bloquear. Serviço cadastrado à mão não muda.

**Alternativas:** manter a cobertura parcial e só trocar o texto da tela — rejeitada, U-08 respondeu que a origem tem a lista. Somar a grade da origem à vigente, ou fundir intervalos — rejeitada, QA IM-09 mostra que a soma apaga o almoço e a tela de configuração perde metade da grade. Deixar "Importar tudo" (`IMPORT_ALL`) ou a decisão de categoria confirmarem a troca — rejeitada, apagaria a grade vigente sem escolha explícita do dono. Criar um valor novo de `ImportDecisionKind` para trocar e manter — rejeitada, o par `INCLUDE`/`EXCLUDE` de item já existe e a tabela é append-only. Reescrever `normalizedPhone` das linhas já gravadas por migration — rejeitada, o Goal proíbe migration de dado e a busca por equivalência acha as formas antigas. Vincular a conversa ao cliente pelo número — rejeitada, D-005 e o vault dizem que telefone não prova identidade. Tipo de preço "gratuito" — rejeitada, o vault não o prevê.

**Motivo:** QA IM-06 e IM-09 mostraram perda silenciosa de dado: clientes que nunca chegavam e uma grade somada que o dono não escolheu e que a tela de configuração apagaria ao salvar. QA IM-10, CL-04 e CL-05 mostraram que a mesma pessoa tem formas diferentes de número conforme a entrada, e a busca por igualdade exata não a acha. QA IM-11 mostrou um preço inventado.

**Consequências:** a revisão mostra a contagem da base inteira de clientes; o dono escolhe entre os horários da Minha Agenda e os atuais vendo as duas grades, e "Importar tudo" nunca apaga a grade vigente; a mudança da grade depois da análise pede nova análise em vez de somar; `phone` passa a ter uma forma única para número brasileiro reconhecido, e a busca por número acha a cliente com e sem código do país e com e sem 9º dígito; serviço de preço zero fica sem preço até o dono defini-lo.

**Limites declarados:**

- **A forma real de `GET /customers` não foi conferida por teste.** A rota vem do mapa histórico do portal (`apps/api/docs/MINHAAGENDA_ENDPOINTS.md`, commit `1e22dff`, seção `CustomerService`), que descreve a chamada, não a resposta; todo teste usa dublê local do client. Se a resposta real tiver outra forma, a categoria recua com `CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`, e isso é evidência nova, não falha escondida.
- **Linhas antigas não são reescritas.** `phone` e `normalizedPhone` gravados antes deste Goal ficam como estavam; a busca os acha pelas formas nacionais e sem 9º dígito do conjunto equivalente.
- **O editor de disponibilidade por dia fica no Goal067.** A tela de Disponibilidade só deixa de esconder a grade e de apagá-la em silêncio.
- **O vínculo da conversa não muda.** O painel de Conversas continua dizendo que o contato ainda não é cliente até a confirmação (D-005).
- **`/importacao` e `/configuracoes/disponibilidade` seguem fora do gate renderizado.** Largura, toque, contraste, foco e movimento dessas telas não são medidos.
- **A conferência humana do §9 do Goal062 não foi feita.** Ninguém conferiu, com a pilha local e a conta de teste de U-05, que `GET /customers` da conta real devolve a lista na forma validada, que a contagem de clientes da revisão bate com a da Minha Agenda, que a troca da grade funciona com a grade real nem que uma mensagem de um número importado encontra a cliente como candidata. Fica para depois do aceite.

**Revisar se:** a conferência humana encontrar `GET /customers` com outra forma, só paginado ou com contagem diferente da Minha Agenda; o Goal067 trocar o formulário de intervalo único; ou uma decisão de produto nova permitir vincular a conversa pelo número.

**Prova (rodada 2):** controles negativos com saída colada, vermelho da baseline e contagens da execução final em [FINAL_AUDIT §40](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

**Nota de fechamento ([review062](reviews/062-review.md)):** os itens 1 a 4 não geraram blocker de desenho. A rodada 1 reprovou a prova e o registro: `validate:integration` não tinha rodado na árvore final; os seis controles negativos do §8 não tinham rodado; a documentação do §10 faltava; `AVAILABILITY_CHANGED_SINCE_ANALYSIS`, `AVAILABILITY_SOURCE_OVERLAP` e `SERVICE_PRICE_NOT_INFORMED` não tinham texto leigo; o teste de DDDs usava uma cópia literal da lista em vez de ler a do BFF; e o §7.1 de telefone não passava por `GET /internal/customers?phone=` com cliente de DDD 55 criado pela importação. A rodada 2 corrigiu os seis pontos. Ficam registradas no review, sem mudar a decisão: `CREATE_NEW` num item de `AVAILABILITY`, fora da tela, grava o `reasonDetail` "Troca confirmada" sem confirmar a troca; a tela de conflito oferece "Usar os horários da Minha Agenda" também em item com `AVAILABILITY_SOURCE_OVERLAP`, e a execução falha o item sem gravar; um número estrangeiro de 11 dígitos cujos dois primeiros formam DDD válido é lido como brasileiro, como o §3 do Goal especifica. A decisão não mudou.

## D-080 — A IA passa de desligada a ligada só com prova do teste real, por qualquer caminho, pausar nunca é desfeito pela reconciliação e o teste é oferecido também em Configurações › IA enquanto a IA não está ativa, proposta no Goal063

**Status:** ACCEPTED no [review063](reviews/063-review.md) (rodada 2 de 2, 2026-09-27; rodada 1 `CHANGES_REQUIRED` com 10 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal063, sobre a baseline aceita `57012750d63631b09f6bd6ac3a6310b31a05b84c` (fechamento do Goal062, ACCEPTED no [review062](reviews/062-review.md)). Aplica **U-11** e diz isso, sem reescrever U-11. Revê **D-035** na parte "teste real só no onboarding" e responde ao "Revisar se" de D-035 sobre o teste oferecido fora do onboarding, sem reescrever D-035.

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou **QA O-49** (ALTA): "Pular esta etapa" nos contatos ignorados encerrava o onboarding, e o teste real, "Tudo pronto" e a conclusão ficavam inalcançáveis — na baseline, "Continuar" também: os dois botões chamavam `onboarding.complete()` antes de `ctx.go("teste-real")`, e `ProductRuntimeProvider` manda toda rota `/onboarding/*` para `/inicio` quando a sessão já tem `onboardingCompleted`. **QA S-02** (ALTA): o checkbox "Atendimento automático" mais "Salvar alterações" ligava a IA sem teste — `PATCH /v1/settings/ai` gravava `enabled: true` conferindo só a exclusão de conta e o serviço operacional, sem ler o teste e sem mexer em `activatedByRunId`. **QA H-03** (ALTA): os itens do checklist da Home eram `li` sem link nem botão. **QA H-04** (MÉDIA): o checklist sumia ao ligar o checkbox com o teste nunca feito. Na baseline, uma IA ligada à mão e depois pausada voltava a ligar na leitura seguinte de `GET /v1/status` se existisse execução bem-sucedida, porque a autoativação da reconciliação só reconhece como usada a execução gravada em `activatedByRunId`. A tela de sucesso do teste afirmava "Sua IA está ativa" só com a execução `SUCCEEDED`, sem ler o estado da IA.

**Decisão:**

1. **A passagem de desligada a ligada exige prova válida, por qualquer caminho.** Prova válida é a execução corrente do teste real em `SUCCEEDED` e não superada por troca de canal. A definição mora numa função só, `getValidActivationRun` (`apps/bff/src/lib/ai-activation.ts`), que `activationTestCompleted` (quarto item do checklist da Home) também usa; não há segunda definição no BFF. `PATCH /v1/settings/ai` com `enabled: true`, quando `AiSettings.enabled` gravado é falso ou não existe, sem prova válida, recusa com `409 AI_ACTIVATION_TEST_REQUIRED` e não grava nem projeta nada. Leitura da execução que falha também recusa com o mesmo código, sem gravar: dúvida nunca liga a IA. A ordem das checagens é exclusão de conta (Goal025, inalterada), prova, serviço operacional (inalterada); o código e a forma das duas recusas antigas não mudam. `enabled: true` com a IA já ligada não é passagem: não exige prova e não muda `activatedByRunId`, e salvar só o estilo nunca é recusado por falta de teste. A reconciliação continua sendo o outro caminho que liga, e já exigia a mesma prova.
2. **Ligar à mão grava a execução que autorizou, e pausar nunca é desfeito pela reconciliação.** Ligar com prova grava `activatedByRunId` com o `id` da execução, na mesma escrita de `enabled: true`; por isso a troca de canal desliga também a IA religada à mão (`DEACTIVATED_BY_CHANNEL_CHANGE`, regra que a reconciliação já tinha). Pausar (`enabled: false`) grava em `activatedByRunId` o `id` da execução válida corrente, se houver, para que a autoativação a reconheça como já usada; leitura que falha ao pausar não impede a pausa, só deixa de marcar. Um teste novo bem-sucedido depois da pausa continua ligando a IA pela reconciliação, como o vault manda ("Sucesso": ativar a IA).
3. **O teste real é oferecido no onboarding e em Configurações › IA, só enquanto a IA não está ativa (aplica U-11).** Configurações › IA deixa de ter interruptor: mostra o estado lido e só a ação que cabe nele — "Pausar atendimento" com a confirmação que já existia; "Retomar atendimento" com a IA pausada e prova válida; sem prova válida, o texto diz que a IA só liga depois do teste real e oferece o teste, ou, sem WhatsApp conectado, leva a `/configuracoes/whatsapp` sem oferecer o teste. A recusa `AI_ACTIVATION_TEST_REQUIRED` faz a tela reler o estado e mostrar o caso sem prova. Salvar o estilo envia o ligado lido, nunca um valor de formulário. O teste de Configurações é o mesmo do onboarding: introdução, progresso, pausa por interferência, falha, sucesso, marcos, limpeza e as ações que (re)começam a execução moram em `apps/frontend/src/features/activation-test/`, usado pelos dois. Isso convive com o vault ("não é uma ferramenta recorrente de testar IA dentro das configurações", `02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`) porque o teste só é oferecido enquanto a IA não está ativa e o BFF recusa o teste com a IA ativa (`ACTIVATION_TEST_AI_ALREADY_ACTIVE`, inalterada). As rotas do teste real não mudam.
4. **O onboarding só é concluído pela ação que sai dele.** Nenhuma tela que ainda pertence ao onboarding vem depois de `onboarding.complete()`. "Continuar" e "Pular esta etapa" em `contatos-ignorados` vão a `teste-real` sem concluir; a conclusão acontece no CTA de `teste-real-sucesso`, em "Fazer isso depois" das telas do teste e no CTA de `whatsapp-concluido`, que passa a ser mostrada antes da conclusão. A retomada com WhatsApp conectado leva à tela da execução corrente, ou a `contatos-ignorados` sem execução. A tela de sucesso só diz "Sua IA está ativa" depois de `GET /v1/status` confirmar a IA ativa.
5. **O checklist da Home leva a cada módulo.** Cada item é link para o módulo que o resolve — `/servicos`, `/configuracoes/disponibilidade`, `/configuracoes/whatsapp` (com "Conectar" na linha enquanto pendente) e o teste em Configurações › IA —, concluído ou não; com o WhatsApp pendente, o item do teste diz "depois do WhatsApp" em vez de oferecer o teste. A leitura de cada item não muda. Como a IA só liga com prova, o checklist só some com teste feito ou com IA ligada antes deste Goal.

D-080 responde ao "Revisar se" de D-035 sobre "o teste real passar a ser oferecido fora do onboarding, que reabre (10)": o item (10) de D-035 continua valendo sem mudança — o teste vale para a instância contra a qual rodou, e trocar o número volta a exigir prova —, porque oferecer o teste em Configurações só enquanto a IA não está ativa não o torna ferramenta recorrente.

**Alternativas:** manter o interruptor e só desabilitá-lo sem teste — rejeitada, U-11 diz que o checkbox deixa de existir, e um interruptor desabilitado não diz o que falta. Verificar a prova só na tela — rejeitada, `PATCH /v1/settings/ai` continuaria ligando a IA para qualquer cliente da API. Uma leitura de prova própria para a rota de configurações — rejeitada, criaria segunda definição de prova válida ao lado de `activationTestCompleted`. Responder `502` quando a leitura da execução falha — rejeitada nesta proposta: a recusa `409 AI_ACTIVATION_TEST_REQUIRED` diz ao cliente o que fazer (reler e testar), e nada é gravado nos dois casos. Pausar zerando `activatedByRunId` — rejeitada, a reconciliação religaria a IA com a mesma execução. Desligar por migration a IA ligada antes deste Goal sem teste — rejeitada, o Goal proíbe regra retroativa. Copiar as telas do teste para Configurações — rejeitada, duas cópias de marco, texto e regra de estado divergiriam.

**Motivo:** ligar a IA é a decisão de maior custo de erro do produto (D-035), e havia um caminho humano que a tomava sem prova nenhuma. O teste que dá a prova era inalcançável no onboarding pelos dois botões da etapa anterior e inexistente fora dele, e o checklist que devia levar a ele não levava a lugar nenhum.

**Consequências:** `PATCH /v1/settings/ai` ganha a recusa `409 AI_ACTIVATION_TEST_REQUIRED` e passa a ler `GET /internal/activation-test` ao ligar (desligada → ligada) e ao pausar; a contagem de chamadas `this.http.` em `apps/bff/src/clients/` segue **42**. `activatedByRunId` passa a ser gravado também por `PATCH`, e seu significado não muda: a execução usada para ligar, ou reconhecida como usada ao pausar. Configurações › IA deixa de ter interruptor e mostra o teste; a Home tem checklist com ações; `/configuracoes/ia` entra no gate autenticado (`AUTHENTICATED_ROUTES`), medida no estado sem prova válida. A seleção da sessão do gate passa a usar o `sessionMarker` da rota (`/configuracoes/ia` marca Configurações), sem mudar as outras rotas. Nenhuma migration.

**Limites declarados:**

- **IA ligada antes deste Goal sem teste continua ligada.** Não há regra retroativa nem migration; a regra nova vale para a passagem de desligada a ligada.
- **O envio real não tem prova.** O teste real depende do número oficial da Atendly, que não existe no ambiente de migração (D-035, gate operacional); todo teste usa a IA como dublê.
- **A conferência humana do §9 do Goal063 não foi feita.** Ninguém conferiu, na pilha local com número da plataforma configurado, que o onboarding chega ao teste pelos dois botões, que o teste em Configurações › IA roda, que a IA liga ao terminar bem e que pausar e ler de novo não religa. Fica para depois do aceite.
- **`/onboarding/*` segue fora do gate renderizado.** Largura, toque, contraste, foco e movimento do onboarding não são medidos.
- **A tela decide o que oferecer pela mesma regra de prova, lida da execução**, mas quem decide ligar é o BFF, que recusa sem prova.

**Revisar se:** o número oficial da Atendly existir em algum ambiente, o que transforma a conferência humana em prova; o produto passar a permitir testar a IA com ela ativa, o que reabre o item 3 e o convívio com o vault; ou uma decisão de produto mandar desligar a IA ligada sem teste antes deste Goal.

**Prova (rodada 2):** controles negativos com saída colada, vermelho da baseline e contagens da execução final em [FINAL_AUDIT §41](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

**Nota de fechamento ([review063](reviews/063-review.md)):** os itens 1 a 5 não geraram blocker de desenho. A rodada 1 reprovou a entrega incompleta e a prova: Configurações › IA ainda tinha o checkbox; a extração para `features/activation-test/` era parcial; o checklist continuava com `li` sem ação; `/configuracoes/ia` não estava em `AUTHENTICATED_ROUTES`; os testes `goal063` do BFF reprovavam contra PostgreSQL real (esperavam `AiSettings` ausente, mas o cadastro já cria a linha com `enabled: false`, e o caminho feliz recebia `502` por dublê incompleto); o vermelho da baseline do BFF não estava colado; `validate:integration` e `test:gate` não passavam; os seis controles negativos do §8 não tinham rodado; e a documentação do §10 faltava. A rodada 2 corrigiu os dez pontos. Aceitar D-080 aceita o desvio registrado em **Alternativas**: com a leitura da execução falhando, a rota recusa com `409 AI_ACTIVATION_TEST_REQUIRED`, não com o erro de upstream que o §1 do Goal pedia; o invariante "dúvida nunca liga a IA" vale nos dois casos. Ficam registradas no review, sem mudar a decisão: salvar só o estilo com a IA desligada envia `enabled: false` e, com prova válida existente, marca essa execução como usada, de modo que a autoativação deixa de agir sobre ela (recuperável por "Retomar atendimento"; candidato a restringir a marcação a quando o `enabled` gravado era `true`); o teste do caso "já ligada, salvar só o estilo" usa `activatedByRunId` preenchido, e não nulo como o §7.1 pedia, pelo mesmo ramo de código; o teste de exclusão usa execução nula em vez de prova válida; e "Conectar agora" em `whatsapp-concluido`, com o onboarding aberto, volta à etapa WhatsApp do onboarding. A decisão não mudou.

## D-081 — A conexão do WhatsApp exige consentimento a cada vinculação, pelo BFF, por qualquer caminho, o QR é relido pelo que está valendo e a renovação tem janela declarada na tela, proposta no Goal071

**Status:** ACCEPTED no [review071](reviews/071-review.md) (rodada 3 de 3, 2026-09-28; rodada 1 `CHANGES_REQUIRED` com 10 blockers, rodada 2 com 4, rodada 3 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal071, rodada 1, e revista nas rodadas 2 (correção dos dez blockers da rodada 1) e 3 (correção dos quatro blockers da rodada 2), sobre a baseline aceita `0cb49b40154050e220e53c9b937f7b2dc7f7852c` (fechamento do Goal063, ACCEPTED no [review063](reviews/063-review.md)). Fecha **QA O-40**, **QA O-45**, **QA O-48** e **QA O-44** do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT.

**Contexto:** o vault (`04-Referencia/99-Perguntas-e-Respostas.md`, perguntas 867 a 871) exige confirmação específica antes de conectar, por checkbox obrigatório, e perguntar se o número também é usado para conversas pessoais — mas `WhatsAppConnectionPanel` (usado pelo onboarding e por Configurações › WhatsApp) não mostrava nenhum dos dois, e `POST /v1/whatsapp/connect`/`reconnect` aceitavam só `mode` e `phone` (**QA O-40**). O painel lia o QR uma vez, na resposta de `connect`, e nunca mais; a Evolution gira o QR e, no quinto, o fork faz logout, limpa o QR e emite `QRTimeout` — a tela continuava mostrando o primeiro QR com "Conectando" depois que a sessão já tinha morrido (**QA O-45**). A visão de código era o código como texto solto, sem copiar, sem passos e sem estado de espera (**QA O-48**). A visão de QR tinha a instrução embaixo do cartão "Código", QR pequeno solto e dois CTAs primários concorrentes (**QA O-44**).

**Decisão:**

1. **`connect` e `reconnect` exigem consentimento antes de qualquer efeito (BFF).** `connectSchema` (`apps/bff/src/modules/whatsapp/routes.ts`) ganha `consentAccepted: z.literal(true)`, no padrão de `termsAccepted` do cadastro. Ausente ou diferente de `true`: `400 VALIDATION_ERROR`, antes de `ensureInstance`, de qualquer chamada à Evolution e de qualquer escrita. O aceite em si não é gravado, e o corpo não leva a resposta sobre número pessoal.
2. **O QR é relido pelo que está valendo, nunca com o número conectado (BFF).** Rota nova `GET /v1/whatsapp/qr`, sobre o vínculo do próprio negócio (`requireLinkedInstance`, mesma recusa `409 CONFLICT` de vínculo pendente ou divergente das demais rotas). A coluna `qrcode` de `WhatsAppInstance` passa a ser o marcador de vinculação por QR em curso, sem migration: `connect`/`reconnect` no modo QR a gravam, como já faziam; o modo código a limpa; qualquer leitura que observe o número conectado ou logado (`GET /v1/whatsapp` e a rota nova) a limpa. Sem marcador, a rota recusa com `409 WHATSAPP_QR_NOT_IN_PROGRESS` **antes de qualquer chamada à Evolution** — reler o QR nunca abre uma vinculação que um `connect` com consentimento não abriu. Com marcador, a rota lê o status (`getStatus`) **antes** de `getQr`: conectado ou logado responde o estado conectado, limpa o marcador e não chama `/instance/qr`, porque no fork ler o QR com o cliente já logado pode derrubar a sessão boa. Sem QR disponível agora, responde `200` com `qrcode: null`, não erro. A resposta nunca traz credencial, JID nem nome de instância. Nenhuma chamada `this.http.` nova em `apps/bff/src/clients/`; a contagem segue **42**.
3. **O consentimento mora no painel único, antes de conectar (frontend).** `WhatsAppConnectionPanel` — o mesmo componente para o onboarding e para Configurações › WhatsApp — mostra, com o número não conectado, um checkbox obrigatório desmarcado cujo rótulo é a própria frase exigida ("Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Atendly."), com "Saiba mais" para `/politica-de-privacidade`, e a pergunta "Você usa esse número também para conversas pessoais?", sem resposta pré-marcada. "Sim, também" revela o bloco "Tudo bem — você continua no controle"; "Não, só trabalho" não desliga nenhuma proteção. "Conectar WhatsApp"/"Reconectar WhatsApp" só habilita com checkbox marcado e resposta escolhida, e toda chamada a `connect`/`reconnect` — inclusive "Gerar novo QR Code" e "Gerar novo código" dentro da mesma vinculação — envia `consentAccepted: true`. O aceite vale só para a vinculação aberta na tela; sair e voltar pede de novo. Antes da primeira leitura de status, o painel não sabe se o número está conectado, então mostra só um carregamento (`aria-busy`), sem consentimento nem CTA; falha nessa leitura mostra erro com "Tentar novamente". Com o número conectado, o consentimento não aparece em nenhum momento.
4. **A renovação do QR tem relógio próprio e janela declarada (frontend).** Com vinculação por QR em curso, a tela relê `GET /v1/whatsapp/qr` a cada 15 s (`QR_POLL_INTERVAL_MS`, menor que o giro observado de ~20 s), por `setTimeout` encadeado e com uma leitura por vez: voltar a ficar visível com uma leitura em voo não abre uma segunda. Nenhum QR fica na tela com mais de um giro de idade (`QR_ROTATION_MS`, 20 s): `qrcode: null` ou falha de leitura que persistem além de um giro expiram a tela; com a aba oculta, o QR velho só sai da tela, e a leitura ao voltar decide. A renovação pausa com a aba oculta (`document.visibilityState`) e retoma ao voltar a ficar visível; para quando o número conecta, quando o componente desmonta ou ao fim de uma janela de **5 minutos** (`QR_WINDOW_MS`, constante nomeada, contada do início da vinculação nesta tela, não do lado do BFF). Fim da janela, QR ausente ou velho além de um giro, ou a recusa `WHATSAPP_QR_NOT_IN_PROGRESS`: a tela sai de "Aguardando conexão"/"Conectando" e mostra "O QR Code expirou", com "Gerar novo QR Code" chamando `reconnect` com consentimento. Uma leitura ainda em voo quando o efeito de QR é descartado (expiração, conexão, desmontagem ou vinculação nova) não age ao voltar: não expira, não rearma o relógio e não troca o QR da vinculação seguinte.
5. **A visão de código copia, numera passos e expira pelo `expiresAt` do BFF (frontend).** O campo "Seu número de WhatsApp com DDD" mostra erro inline que explica o formato quando o número é curto ou quando o BFF recusa com `VALIDATION_ERROR`. Depois de gerar: código grande e selecionável, "Copiar código" pela área de transferência com confirmação na tela ("Código copiado"; falha de cópia tem texto próprio, sem erro técnico), cinco passos numerados, "Aguardando conexão…" e "Abrir WhatsApp". Expirado, "Gerar novo código" chama `reconnect` com o mesmo número. Enquanto o código vale, a leitura de status continua a cada 3 s, como antes do Goal.
6. **O onboarding não compete com o painel, e "Conectar agora" leva à etapa certa (frontend).** Em `whatsapp-conectar`, o rodapé não mostra CTA primário concorrente com o do painel enquanto o número não conecta; conectado, "Continuar" segue para `contatos-ignorados`. Em `whatsapp-concluido`, "Conectar agora" leva a `/onboarding/whatsapp` (a própria etapa do onboarding), não mais a `/configuracoes/whatsapp` (observação 5 do review063).
7. **`/configuracoes/whatsapp` entra no gate autenticado.** `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`) ganha a rota, com `sessionMarker: "configuracoes"`, e passa a ter nove rotas; o tenant do ensaio (`scripts/goal033-authenticated-ui-rehearsal.mjs`) passa a enviar `consentAccepted: true` em `POST /v1/whatsapp/connect`. Como o h1 "WhatsApp" aparece em qualquer estado da tela, o gate exige o título "WhatsApp conectado" e nenhum checkbox antes de medir (`LOADED_STATE` em `e2e/authenticated-matrix.spec.ts`).

**Alternativas:** gravar o consentimento numa tabela nova — rejeitada, pediria migration e a revisão legal (LGPD, termos) segue nos temas adiados do vault (`04-Referencia/03-Temas-Adiados.md`); o aceite exigido a cada vinculação já fecha o QA sem essa gravação. O BFF guardar o início da vinculação para abrir a janela do próprio lado — rejeitada, pediria migration; a janela vive na tela, e o limite fica declarado, não escondido. Continuar lendo o QR só uma vez, como a baseline — rejeitada, é exatamente o defeito do QA O-45. Perguntar o consentimento uma vez só e lembrar entre vinculações — rejeitada, o vault pede confirmação específica antes de conectar "por qualquer caminho", não uma vez na vida da conta.

**Motivo:** a introdução do WhatsApp ia direto para a conexão sem consentimento e sem perguntar sobre número pessoal (QA O-40), a tela mentia "Conectando" com uma sessão já morta pelo fork (QA O-45), e a visão de código e a de QR não seguiam o protótipo aprovado (QA O-48, QA O-44).

**Consequências:** `POST /v1/whatsapp/connect` e `POST /v1/whatsapp/reconnect` passam a exigir `consentAccepted: true`; rota nova `GET /v1/whatsapp/qr`; `packages/public-api-contract/` e `apps/bff/PUBLIC_API_V1.md` descrevem os dois; `this.http.` em `apps/bff/src/clients/` segue **42**; `/configuracoes/whatsapp` entra em `AUTHENTICATED_ROUTES` (75 medidas esperadas no gate autenticado, ante 70 da baseline — as cinco novas são a rota nas cinco larguras). Nenhuma migration.

**Limites declarados:**

- **O consentimento não é gravado.** O BFF exige o aceite a cada vinculação, mas não persiste a marca nem a resposta sobre número pessoal; a revisão legal (LGPD, termos) segue em `04-Referencia/03-Temas-Adiados.md`.
- **A janela de renovação é da tela, não do BFF.** O BFF não guarda o início da vinculação; se a aba fechar e reabrir depois da janela, a tela começa uma janela nova sem saber da anterior.
- **O fork abre sessão nova depois do quinto QR.** `QRCODE_MAX_COUNT` (padrão 5) e o giro do QR não mudam; ler o QR depois do limite, ou com o cliente já logado (nil), inicia uma sessão nova no fork — o BFF e a tela não escondem isso, só evitam provocá-lo lendo o status antes.
- **A conferência humana do §11 do Goal não foi feita.** Que o QR renovado conecta depois de 60 s aberto, que "Gerar novo QR Code" depois da janela conecta, que o código copiado conecta pelo celular e que ler o QR com o número já conectado não derruba a sessão — ninguém conferiu isso na pilha local com WhatsApp e Evolution reais.

**Revisar se:** uma decisão de produto ou jurídica mandar gravar o consentimento e a resposta sobre número pessoal; o BFF passar a guardar o início da vinculação (o que move a janela para o lado do servidor); ou o fork mudar `QRCODE_MAX_COUNT` ou o comportamento de logout no limite.

**Prova (rodada 3):** o vermelho da baseline dos testes `goal071-` do frontend (**29** de **36**) e do BFF (**12** de **15**), rodado de novo na rodada 3; os seis controles negativos do §10 do Goal, os dois da rodada 2 e três novos para os blockers de código da rodada 3, com saída real colada; e as contagens da execução final da árvore corrigida em [FINAL_AUDIT §42](FINAL_AUDIT.md): `test:frontend` **85**/**829**, `test:bff-integration` **51**/**417**, `test:gate` **233**, gate autenticado `expected` **75**, `unexpected` **0**, `flaky` **0**, com `/configuracoes/whatsapp` medida só depois do estado conectado na tela. Resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

## D-082 — O cadastro exige Nome, uma única regra de senha vale para cadastro, redefinição e troca, e a recuperação de senha usa o fluxo real por link, proposta no Goal064

**Status:** ACCEPTED no [review064](reviews/064-review.md) (rodada 5 de 5, 2026-09-28; rodadas 1, 2, 3 e 4 `CHANGES_REQUIRED` com 6, 4, 4 e 6 blockers, rodada 5 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal064, rodada 1, e revista nas rodadas 2 a 5 (correção dos blockers da rodada anterior), sobre a baseline aceita `fbdb0ccbfc9b8457a11b06def3e856b12894e39b` (fechamento do Goal071, ACCEPTED no [review071](reviews/071-review.md)). Fecha **QA C-01**, **QA C-02**, **QA C-03**, **QA C-04**, **QA C-11**, **QA C-12**, **QA L-01**, **QA L-02**, **QA L-03**, **QA L-04**, **QA L-05** e **QA H-05** do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT. Revê D-030 na parte "recuperação somente visual" de G-34, sem reescrever D-030.

**Contexto:** o [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md) registrou, fora da enumeração A-01…A-24 do FINAL_AUDIT: **QA C-01** (ALTA, o cadastro não pede Nome, contra a pergunta 468 do vault e `03-UX-UI/04-Especificacao-das-Telas.md` §"Cadastro"); **QA C-02** e **QA C-03** (MÉDIA e BAIXA, "Repita a senha" e uma regra de senha só de tamanho, contra **U-10**); **QA C-04** (MÉDIA, dois mecanismos de aceite de termos ao mesmo tempo); **QA C-11** e **QA C-12** (MÉDIA e BAIXA, validação por balão nativo do navegador e "senhas divergentes" fora do padrão do design system); **QA L-01** (ALTA, `/recuperar-senha` terminava em "Senha redefinida" sem `POST /v1/auth/reset-password` ter sido chamado); **QA L-02** e **QA L-03** (o código de recuperação nascia preenchido com o e-mail e aceitava qualquer valor); **QA L-04** (BAIXA, nova senha sem regras ao vivo); **QA L-05** (BAIXA, "Manter acesso neste dispositivo" sem leitor); **QA H-05** (BAIXA, a Home cumprimentava pelo nome do negócio porque a pessoa não tinha nome). Na baseline (`fbdb0ccbfc9b8457a11b06def3e856b12894e39b`), `model User` só tinha `email` e `passwordHash`; `registerSchema` exigia `confirmPassword` e só `min(8)`, regra repetida mais duas vezes no BFF e uma quarta vez na tela; `/recuperar-senha` montava `RecoveryFlow` sobre `features/auth/recoveryMachine.ts`, redutor puro sem rede cujo último passo navegava para `/solicitacao-enviada` afirmando "Senha redefinida"; o backend real por link (`POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`, `/nova-senha`, `/link-expirado`) já existia sem nenhuma tela chamá-lo; `resetPasswordSchema` e o token inválido respondiam ambos `400 VALIDATION_ERROR`, e `AuthScreen` mandava todo `VALIDATION_ERROR` de `/nova-senha` para `/link-expirado`; `AuthScreen.submit` e `RecoveryFlow` validavam por `checkValidity()`/`reportValidity()`; e `DashboardScreen.tsx:340` cumprimentava por `dashboard.platform.tenantName`.

**Decisão:**

1. **O cadastro exige Nome (pergunta 468 do vault).** `User` ganha `name`, texto nulável, por migration aditiva sem `UPDATE` e sem backfill (`20260917000000_goal064_user_name`) — conta anterior a este Goal fica com nome nulo, que significa "não informado", nunca um nome inventado. `POST /v1/auth/register` exige `name` aparado, de 1 a 120 caracteres; ausente, vazio ou só espaço recusa `400 VALIDATION_ERROR` com o campo, antes de qualquer escrita. `userDto` devolve `name` (texto ou `null`) em `register`, `login` e `GET /v1/auth/session`. `confirmPassword` sai do schema de cadastro; corpo antigo que ainda o traga continua aceito, com o campo ignorado.
2. **A regra de senha de U-10 é escrita uma única vez**, em `packages/public-api-contract/src/password-policy.ts` (`passwordPolicySchema` e `PASSWORD_POLICY_RULES`), e usada pelo BFF e pelo frontend no cadastro, em `POST /v1/auth/reset-password`, em `PATCH /v1/auth/password` e na troca de senha de Configurações › Conta; login continua fora da regra, para que conta antiga com senha fora dela continue entrando. Nenhuma cópia literal da regra sobrevive em outro arquivo.
3. **A redefinição separa token inválido de senha recusada, e recusa a senha atual sem consumir o token.** `resetPasswordSchema` aceita só `token` e `newPassword` (`confirmPassword` antigo aceito e ignorado). Token ausente, já usado ou vencido responde com o código próprio `PASSWORD_RESET_TOKEN_INVALID`, distinto de `VALIDATION_ERROR`. Nova senha igual à atual é conferida contra o hash atual **antes** de consumir o token e responde `400 VALIDATION_ERROR` no campo `newPassword`, deixando o token utilizável em seguida com uma senha válida.
4. **A recuperação de senha usa o fluxo real por link que o BFF e `/nova-senha` já tinham — revendo a parte de G-34 que D-030 (Goal014) fechou como "somente visual", exatamente o "Revisar se" que D-030 previa ("o produto decidir recuperação de senha real, que reabre G-34").** `/recuperar-senha` passa a pedir só o e-mail e chamar `POST /v1/auth/forgot-password`: `200` navega para `/solicitacao-enviada`, sem o e-mail na URL; `503 CONFIGURATION_ERROR` mantém a pessoa na tela dizendo que a recuperação está indisponível no momento; `429` mostra o texto de muitas tentativas; falha de rede mostra erro genérico preservando o e-mail digitado. A tela de código e a nova senha dentro do fluxo deixam de existir — `recoveryMachine.ts` sai do repositório, e com ele QA L-02 e L-03. "Senha redefinida" só aparece dentro de `/nova-senha`, depois de `POST /v1/auth/reset-password` responder `200`; o código novo de token inválido navega para `/link-expirado`; `VALIDATION_ERROR` mostra erro no campo, sem navegar.
5. **Validação inline sem balão nativo em cadastro, login, recuperar senha e nova senha.** Os quatro formulários ganham `noValidate` e validação própria antes do envio: todos os erros do envio aparecem juntos, com borda de erro, texto ligado por `aria-describedby`, `aria-invalid` e foco no primeiro campo inválido. Erro devolvido pelo servidor cai no mesmo campo, com o mesmo texto de tela.
6. **Um aceite só no cadastro.** O parágrafo passivo "Ao criar sua conta, você concorda…" sai; sobra o checkbox "Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade", com os dois links.
7. **O login perde "Manter acesso neste dispositivo" (QA L-05).** O controle não era lido por nada.
8. **A Home cumprimenta pela pessoa, nunca pelo negócio.** Com nome de sessão: "Bom dia"/"Boa tarde"/"Boa noite" pelo horário do fuso do negócio, seguido do primeiro nome. Sem nome (conta anterior a este Goal): cumprimenta sem nome.

**Alternativas:** manter a recuperação como encenação e só corrigir o texto final — rejeitada, "Senha redefinida" sem `200` real é o que `AGENTS.md` proíbe ("nunca mostre sucesso antes de a operação ter sido realmente concluída"), e a pergunta 470 do vault permite recuperação que não funciona no MVP, não permite afirmar que funcionou. Trocar o fluxo real por link para o código de 6 dígitos que o protótipo e a pergunta 470 do vault descrevem — rejeitada nesta passada: pediria verificação de código no BFF com limite de tentativas, escopo próprio; fica registrada como divergência a confirmar (ver Limites declarados). Manter a regra de senha copiada em cada rota do BFF e na tela, como a baseline fazia — rejeitada, a manutenção de quatro cópias já havia divergido (a baseline tinha só `min(8)` numa delas).

**Motivo:** QA C-01 mostrou que o cadastro pede menos do que o vault e o protótipo descrevem; QA L-01 mostrou o produto afirmando uma troca de senha que nunca aconteceu, o oposto do guardrail central de `AGENTS.md`; os demais QAs desta leva são discrepâncias de validação e de copy fechadas pela mesma passada, com a mesma evidência.

**Consequências:** `apps/bff/PUBLIC_API_V1.md` e `packages/public-api-contract/` descrevem o corpo novo de `register` (com `name`, sem `confirmPassword`) e de `reset-password` (sem `confirmPassword`), a regra de senha e onde vale, `name` em `user`, e o código novo de token inválido. Migration aditiva única, `20260917000000_goal064_user_name`. Nenhuma mudança em login, sessão, CSRF, `logout`, `logout-all`, exclusão de conta ou purga — a purga continua apagando a linha de `User` com o nome junto.

**Limites declarados:**

- **Nenhum provider de e-mail (U-03).** A recuperação continua sem entregar nada de verdade; todo teste usa o dublê de entrega que grava `resetUrl`.
- **O vault e o protótipo descrevem um código de 6 dígitos; o produto usa link.** Trocar exige verificação de código no BFF com limite de tentativas — Goal próprio, se uma pessoa decidir. Esta decisão registra a divergência; não a resolve.
- **O Product Vault não foi editado.**
- **Conta anterior a este Goal fica com nome nulo** — nunca um nome inventado por backfill.
- **A fidelidade das telas ao protótipo aprovado segue como conferência humana (Goal068).**

**Revisar se:** uma pessoa confirmar que a recuperação por link, em vez do código de 6 dígitos do protótipo e da pergunta 470 do vault, é aceitável para o produto; o produto contratar provider de e-mail (U-03), o que torna possível a conferência humana do §11 do Goal; ou o Goal068 encontrar divergência de fidelidade visual que exija revisar alguma das telas tocadas aqui.

**Prova:** controles negativos com saída colada e contagens da execução final em [FINAL_AUDIT §43](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

## D-083 — O onboarding segue a sequência do vault, começa em Boas-vindas sem gravar nada, grava os quatro tipos de preço sem conversão, cria serviços adicionais por `POST /v1/services`, grava horário por dia e entra no gate autenticado, proposta no Goal065

**Status:** ACCEPTED no [review065](reviews/065-review.md) (rodada 2 de 2, 2026-09-28; rodada 1 `CHANGES_REQUIRED` com 11 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal065, rodada 1, e revista na rodada 2 (correção dos 11 blockers da revisão da rodada 1), sobre a baseline aceita `76293d0747d0c755c38f90ff71ded08c1247a987` (fechamento do Goal064, ACCEPTED no [review064](reviews/064-review.md)). Fecha **QA O-01**, **QA O-02**, **QA O-03**, **QA O-04**, **QA O-05**, **QA O-06**, **QA O-08**, **QA O-09**, **QA O-14**, **QA O-15** (só a sequência; a busca por CEP fica para o Goal072), **QA O-16**, **QA O-24**, **QA O-26**, **QA O-28**, **QA O-30**, **QA O-31**, **QA O-33**, **QA O-34**, **QA O-35**, **QA O-38**, **QA O-41**, **QA O-43** e **QA O-50** do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT.

**Contexto:** na baseline (`76293d0`), `onboardingFlow` começava em `dados-do-negocio` e `nextRequiredStep` devolvia essa etapa para conta nova, sem Boas-vindas; uma tela só juntava nome (antes do segmento), segmento, modalidade e endereço; o formulário validava por `checkValidity()`/`reportValidity()`, com o erro próprio num `role="alert"` de rodapé; `.onboarding-exit` não tinha estilo de botão e, no celular, voltava por `::after { content: "Sair" }`; os chips de segmento rolavam na horizontal, sem `aria-pressed`; `PATCH /v1/onboarding` aceitava `service.priceType` só em `FIXED` e `ON_REQUEST`, e `onboardingPriceType` trocava `STARTING_AT` por `FIXED` e `NOT_INFORMED` por `ON_REQUEST`, o que regravava um serviço "A partir de" como "Fixo"; o primeiro serviço ocupava três telas, sem "Adicionar outro serviço"; a semana começava no domingo, a tela mandava o mesmo intervalo para todos os dias e `draftFromState` lia só `activeRules[0]`; "Agenda pronta" vazava "O restante da ativação continua em uma próxima etapa do produto." e mostrava "Fonte oficial"; três textos chamavam a automação de "Atendly"; a introdução do WhatsApp espremia três botões numa linha e contatos ignorados respondia a número curto com "Tente novamente"; e nenhuma etapa do onboarding era medida com layout.

**Decisão:**

1. **Sequência do vault.** Boas-vindas → Segmento + nome → Modalidade → Endereço (só com "Local próprio") → o bloco "Sua agenda" como está hoje (`fonte-da-agenda`, `agenda-atendly-confirmar`, `agenda-atendly-metodo`; Goal066 o substitui) → Primeiro serviço (`servico-nome`) → Serviços adicionais (`servicos-adicionais`, opcional) → Dias de atendimento → Horários → Agenda pronta → Demonstração da IA → Estilo da IA → WhatsApp como está hoje (Goals 063 e 071). `servico-duracao` e `servico-preco` deixam de existir como etapa e redirecionam para `servico-nome`. Cada etapa grava ao continuar e só avança com `200`; `nextRequiredStep` retoma na primeira pendente.
2. **Boas-vindas não grava nada.** É a entrada da conta sem nenhuma seção gravada; depois da primeira gravação, a retomada nunca volta a ela. Texto do vault ("Configure sua Atendly em poucos passos.", "Começar", "Seu progresso fica salvo a cada etapa.") e composição estática de três elementos — mensagem do cliente, resposta da IA, horário na agenda —, sem carrossel e sem movimento. A composição animada do protótipo é do Goal072.
3. **Segmento primeiro, depois o nome.** Os oito chips (sete segmentos e "Outro") quebram linha, sempre visíveis, com `aria-pressed`; depois vem "Como seus clientes conhecem você?", com a ajuda "Pode ser seu nome ou o nome do seu negócio.". Título "Vamos começar pelo seu negócio", eyebrow "Seu negócio". Modalidade: "Onde você atende?", "Pode escolher mais de uma opção.", e "A domicílio · Você vai até o cliente". Endereço é etapa própria, campo único `address`, obrigatório só com "Local próprio".
4. **Validação inline em todas as etapas.** O formulário tem `noValidate`; nenhuma etapa chama `checkValidity` nem `reportValidity`. Campo obrigatório, numérico ou de horário inválido mostra o erro no próprio campo, com `aria-invalid`, texto ligado por `aria-describedby` (a ajuda do campo continua ligada) e foco no primeiro inválido; todos os erros do envio aparecem juntos. Escolha vazia (segmento, modalidade, dias) marca o grupo (`role="group"`). Horário final antes do inicial marca o campo final, no intervalo-base e em cada dia personalizado (QA O-33). Recusa de validação do servidor (`400 VALIDATION_ERROR` com `details.fieldErrors`, e `BUSINESS_ADDRESS_REQUIRED`) cai no campo correspondente da etapa, com o texto de tela; só o que não corresponde a campo nenhum vai para o aviso geral. O formulário aberto de "Adicionar outro serviço" valida só ao "Adicionar", e "Continuar" segue sem exigir adicional.
5. **Quatro tipos de preço, sem conversão.** `PATCH /v1/onboarding` aceita `service.priceType` em `FIXED`, `STARTING_AT`, `ON_REQUEST` e `NOT_INFORMED`, com a regra de `ServiceForm`: `price` numérico não negativo obrigatório para `FIXED` e `STARTING_AT`, `price` gravado nulo para `ON_REQUEST` e `NOT_INFORMED`; violação responde `400 VALIDATION_ERROR` antes de chamar o Scheduling. `onboardingPriceType` sai; o frontend grava e relê o tipo escolhido. A demonstração da IA fala pelo tipo: "custa R$ X", "custa a partir de R$ X", "é sob consulta" e "ainda não foi informado" — nunca "R$ 0,00" para um preço não informado.
6. **Serviços adicionais por `POST /v1/services`.** A etapa lista os serviços ativos e cria outros pela rota de Serviços; editar ou desativar continua em Serviços. O serviço do onboarding continua o mesmo, pelo `id`.
7. **Horário por dia.** Dias de segunda a domingo, sem mudar os valores de `dayOfWeek`. Um intervalo-base e "Personalizar dias diferentes", que mostra início e fim por dia; grava uma regra por dia com o intervalo daquele dia. Na retomada, o intervalo-base é o mais frequente entre as regras gravadas e só os dias que diferem dele contam como personalizados: mudar o intervalo-base muda todos os outros dias, e fechar a personalização volta todos ao intervalo-base. "Agenda pronta" mostra serviço, duração, preço pelo tipo, dias e horário, sem texto de desenvolvimento nem "Fonte oficial".
8. **Textos.** Nas etapas, a automação se chama "IA"; "Atendly" fica como nome da plataforma e do produto ("Configure sua Atendly…", "Agenda Atendly"). A introdução do WhatsApp diz "Só um número por negócio."; "Conectar meu WhatsApp" (principal) e "Fazer isso depois" ficam empilhados em largura total no celular. Em contatos ignorados, número recusado por validação mostra o formato esperado; rede ou `5xx` continua com a mensagem de tentar de novo.
9. **"Sair" é um botão do design system** (`.btn .btn-secondary`) em todas as larguras, com um único nome acessível "Sair" e o ícone `aria-hidden`; no celular, o texto fica oculto só visualmente, sem `::after`.
10. **O onboarding entra no gate autenticado.** `scripts/goal033-authenticated-ui-rehearsal.mjs` semeia uma segunda conta pelas rotas do produto, parada no meio do onboarding; `ONBOARDING_ROUTES` (`apps/frontend/e2e/routes.ts`) mede Boas-vindas, Segmento + nome, Modalidade, Endereço, Primeiro serviço, Serviços adicionais, Dias, Horários (com "Personalizar dias diferentes" aberto), Agenda pronta e a introdução do WhatsApp, nas cinco larguras e com a régua de `e2e/measure.ts`, mais os oito chips inteiros na largura e os dois botões da introdução do WhatsApp empilhados no celular. A conta principal, suas medidas e `AUTHENTICATED_ROUTES` não mudam; nenhuma exceção nova em `KNOWN_*`.

**Alternativas:** manter "Seu negócio" como uma tela, só reordenando os campos — rejeitada, o vault e o protótipo têm três etapas, e a tela única escondia os chips por rolagem. Converter o tipo de preço pelo par mais próximo, como a baseline fazia — rejeitada, é escrita com perda. Guardar em `dayHours` todos os dias gravados — rejeitada na rodada 2: a retomada com horário uniforme congelava o horário antigo, e mudar o intervalo-base gravava o valor velho. Buscar endereço por CEP — adiada ao Goal072, exige serviço externo novo.

**Motivo:** o onboarding é o primeiro contato da pessoa com o produto; a sequência, os textos e as regras do vault e do protótipo aprovado não estavam na tela, e o caminho de preço gravava dado diferente do escolhido.

**Consequências:** `apps/bff/PUBLIC_API_V1.md` descreve os quatro tipos em `PATCH /v1/onboarding` e a regra do valor. No BFF, só `modules/onboarding/routes.ts` muda; nenhuma migration, nenhum `this.http.` novo. `POST /v1/onboarding/complete`, as regras de conclusão, a ativação da IA e o Scheduling não mudam.

**Limites declarados:**

- **O bloco "Sua agenda" continua como está** (Goal066).
- **Endereço sem busca por CEP** (Goal072, se uma pessoa quiser).
- **Os estados de erro das etapas ficam só no jsdom**; o gate renderizado mede as etapas no estado inicial, não os estados de erro.
- **A fidelidade das etapas ao protótipo aprovado** (ícones, trilho de capítulos, stepper, máscara de moeda, demonstração animada) é do Goal072.
- **A conferência humana do §11 do Goal não foi feita.**
- **O Product Vault e o `QA_LOCAL_REVIEW.md` não foram editados.**

**Revisar se:** o Goal066 trocar o início do bloco "Sua agenda"; o Goal072 encontrar divergência de fidelidade que mude a ordem ou a composição das etapas; ou uma pessoa, ao percorrer o onboarding num aparelho real, encontrar etapa fora do vault.

**Prova:** vermelho da baseline, controles negativos com saída colada e contagens da execução final em [FINAL_AUDIT §44](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

## D-084 — A importação entra no onboarding: "Sistema atual" e "Quando importar" substituem as três telas do bloco "Sua agenda", `calendar.source` é gravado antes de qualquer importação, a mesma experiência de `/importacao` roda na moldura do onboarding e o horário personalizado só no início não congela o fim, proposta no Goal066

**Status:** ACCEPTED no [review066](reviews/066-review.md) (rodada 2 de 2, 2026-09-28; rodada 1 `CHANGES_REQUIRED` com 8 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal066, rodada 2 (correção dos 8 blockers da revisão da rodada 1), sobre a baseline aceita `f565978a8da01165fd3b397f5c1a9ef58dd6e747` (fechamento do Goal065, ACCEPTED no [review065](reviews/065-review.md)). Aplica **U-09** (decidida por Felipe Borges em 2026-09-27, na revisão local). Fecha **QA O-17**, **QA O-18**, **QA O-19**, **QA O-20**, **QA O-21** e **QA O-22** do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md), fora da enumeração A-01…A-24 do FINAL_AUDIT, e a **observação 5 do [review065](reviews/065-review.md)**.

**Contexto:** na baseline (`f565978`), `onboardingFlow` tinha `fonte-da-agenda`, `agenda-atendly-confirmar` e `agenda-atendly-metodo` entre `modalidade` e `servico-nome`: uma tela com um card só ("Agenda Atendly"), uma de confirmação com o fuso cru (`America/Sao_Paulo`) e uma com "Começar do zero" pré-marcado, em que "Importar do Minha Agenda" só guardava `servicePopulation` no rascunho, mostrava "A importação acontece depois, em Configurações → Agenda." e seguia para `servico-nome` do mesmo jeito. A única gravação do bloco era `calendar.source`, e a importação recusa a execução com `404 CALENDAR_SETTINGS_NOT_FOUND` sem `calendarSettings` (`import-execution-service.ts`, Scheduling). A experiência de importação só existia em `/importacao`, dentro do shell da plataforma: `ImportsScreen` chama `useShellConfig`, que lança fora de `ShellConfigProvider`, e `ImportsPage` desenha um link "Configurações" e o `<h1>` da tela. No bloco de horários, personalizar só o início de um dia gravava o par inteiro, e o fim antigo ficava congelado quando o fim do intervalo-base mudava depois.

**Decisão:**

1. **U-09 fica aplicada, e D-036 é revista nessa parte.** A importação fica nos dois lugares: o onboarding pergunta pelo sistema atual e oferece "Importar agora / Fazer depois"; Mais › Importação (`/importacao`, `MORE_DESTINATIONS`, `SettingsHub`) continua para quem pulou. D-036 continua valendo para o estado da importação, a escolha de categoria e a conclusão única; só a parte que punha a interface de importação apenas em Configurações é revista.
2. **Sequência nova do bloco "Sua agenda".** … Modalidade → Endereço (só com "Local próprio") → **Sistema atual** (`sistema-atual`) → se "Sim, quero importar": **Quando importar** (`quando-importar`) → se "Importar agora": **Importação** (`importacao`) → Primeiro serviço, Dias e Horários só se a importação não os trouxe → Demonstração da IA. Com "Não, começar do zero" ou "Fazer depois", o caminho é o de antes: Primeiro serviço → Serviços adicionais → Dias → Horários → Agenda pronta → Demonstração da IA. `fonte-da-agenda`, `agenda-atendly-confirmar` e `agenda-atendly-metodo` deixam de ser etapa e redirecionam para `sistema-atual` por `legacyStepRedirects`. `quando-importar` e `importacao` são desvio condicional, como `endereco`: ficam fora de `onboardingFlow` e usam a posição de `sistema-atual` no progresso.
3. **"Sistema atual" sem padrão.** "Você já usa algum sistema para organizar seus clientes e agendamentos?", com dois cards que são a ação ("Sim, quero importar" e "Não, começar do zero"): nenhum marcado, sem `aria-pressed`, sem ✓ e sem "Continuar" (QA O-19 e QA O-22 fecham por construção). Os dois ficam desabilitados enquanto uma gravação está em curso. Nenhuma etapa do bloco mostra fuso horário, "Fonte oficial" ou "Agenda Atendly" como escolha (QA O-17, QA O-18). "Quando importar" diz "Quer importar agora?", que a cópia é do Minha Agenda para a Atendly, uma vez só, e "Se fizer depois, a importação fica em Mais › Importação." (QA O-21); "Configurações → Agenda" e `servicePopulation` saem do onboarding.
4. **Quando o bloco grava `calendar.source`, e por quê.** "Sim, quero importar" só navega. "Importar agora", "Fazer depois" e "Não, começar do zero" gravam `calendar: { source: "ATENDLY", timezone }` pelo `PATCH /v1/onboarding` de antes, releem o onboarding e só então avançam; falha no `PATCH` fica na etapa, com o erro de tela, sem avançar. Assim a importação sempre encontra `calendarSettings` (sem isso ela recusa com `CALENDAR_SETTINGS_NOT_FOUND`), e quem sai antes de responder volta para `sistema-atual`. Nenhum campo novo é gravado; o BFF não muda.
5. **A mesma experiência de importação nas duas molduras.** `features/imports` separa a moldura das telas: `useImportState` lê só `getImportState` (nunca abre sessão por montar) e `ImportsFlow` escolhe a tela (conectar, análise e revisão, conflitos, execução, resultado) pelo estado lido. `/importacao` (`ImportsScreen`) continua chamando `useShellConfig` uma vez e mostrando o link "Configurações". A etapa `importacao` do onboarding (`OnboardingImportStep`) monta o mesmo `ImportsFlow` dentro de `ImportsFrameProvider frame="onboarding"`, com a barra superior do onboarding (marca, bloco, progresso, "Sair") e sem o formulário da etapa: `ImportsPage` não desenha o link "Configurações", nenhum link sai do onboarding, e o `<h1>` da tela de importação é o único da tela. Nenhuma chamada da importação muda (QA O-20).
6. **A saída depois da importação (vault §5B) e a retomada.** Com a importação concluída, a etapa mostra o resultado (`ImportHistoryCard`), relê o onboarding e oferece "Continuar" para a primeira pendência, com o aviso de cada caso (`stepAfterImport`): sem serviço ativo, `servico-nome` ("Nenhum serviço importado está ativo. Cadastre pelo menos um serviço para continuar."); sem regra de horário ativa, `dias-de-atendimento` ("A importação não trouxe seus horários de atendimento…"); sem pendência, `demonstracao-da-ia`. Na retomada, `nextRequiredStep(state, importState)` devolve `importacao` quando `calendar.source` está gravado, não há serviço ativo e há sessão de importação viva; com a importação concluída vale a ordem de §5B, que é a de antes; `OnboardingResume` só lê o estado da importação nesse ponto, e, se a leitura falhar, segue a regra sem importação (`servico-nome`), sem bloquear o onboarding.
7. **Não há tela separada de escolha de origem.** O produto só importa do Minha Agenda (pergunta 250 do vault), e uma tela de um card só é o defeito de QA O-17: "Quando importar" já nomeia a origem. **Fica para conferência humana.**
8. **Horário personalizado só no início (observação 5 do review065).** `dayHours` guarda, por dia, só os campos personalizados; cada campo (início, fim) usa o valor do dia quando existe e o do intervalo-base quando não. Personalizar só o início não congela o fim, e vice-versa; um campo igual ao intervalo-base deixa de ser personalização. A gravação manda, para cada dia, o intervalo que a tela mostra. A retomada continua como o Goal065 deixou.
9. **O gate autenticado mede as etapas novas.** `ONBOARDING_ROUTES` ganha `sistema-atual`, `quando-importar` e `importacao` (estado de conectar, porque a segunda conta não tem sessão de importação), cada uma com o seu `<h1>` como marcador, nas cinco larguras e com a régua de `e2e/measure.ts`. A conta principal, as dez etapas do Goal065 e `AUTHENTICATED_ROUTES` não mudam; `scripts/goal033-authenticated-ui-rehearsal.mjs` não muda; nenhuma exceção nova em `KNOWN_*`.

**Alternativas:** uma tela de escolha de origem com o Minha Agenda como único card — rejeitada, é o defeito de QA O-17. Gravar `calendar.source` só em "Importar agora" — rejeitada: quem começa do zero também precisa do registro para o resto do onboarding, e quem sai antes de responder precisa voltar à pergunta. Uma segunda implementação das telas de importação para o onboarding — rejeitada, U-09 pede a mesma experiência, e duas implementações divergiriam. Montar as telas de importação dentro do formulário da etapa — rejeitada: as telas têm os próprios formulários e o próprio `<h1>`, e a tela ficaria com dois.

**Motivo:** a escolha de importar não fazia nada (QA O-20, ALTA), o bloco tinha duas telas sem decisão antes da pergunta real, e a importação exigia sair do onboarding para um lugar que o texto nomeava errado.

**Consequências:** muda só `apps/frontend/` (`features/onboarding/`, `features/imports/ImportsLayout.tsx` e `ImportsScreen.tsx`, `app/onboarding/[step]/page.tsx`, `e2e/routes.ts`) e `apps/frontend/AGENTS.md`. `apps/bff/`, `apps/scheduling-service/`, `POST /v1/onboarding/complete`, as regras de conclusão, a ativação da IA, as chamadas da importação e `/importacao` não mudam; nenhuma migration; `this.http.` em `apps/bff/src/clients/` segue **42**. Os testes existentes do módulo `features/imports` passam sem mudança de asserção.

**Limites declarados:**

- **Análise, revisão, conflitos, execução e resultado dentro do onboarding ficam no jsdom** (`tests/goal066-onboarding-importacao.test.tsx`); o gate renderizado mede `importacao` só no estado de conectar, porque os outros estados exigem uma origem real.
- **A importação dentro do onboarding não foi percorrida contra uma conta real do Minha Agenda.**
- **A fidelidade das etapas novas ao protótipo aprovado** (`Onboarding-2-Importacao*`: diagrama, ilustrações, composição) é do Goal072.
- **A conferência humana do §7 do Goal não foi feita.**
- **O Product Vault e o `QA_LOCAL_REVIEW.md` não foram editados.**

**Revisar se:** o produto passar a importar de outra origem (a tela de escolha de origem volta a ter sentido); a conferência humana achar a ausência dessa tela inaceitável; ou o Goal072 encontrar divergência de fidelidade que mude a ordem das etapas do bloco.

**Prova:** vermelho da baseline, controles negativos com saída colada e contagens da execução final em [FINAL_AUDIT §45](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md).

## D-085 — Regras de oferta ganham tela em Configurações › Agenda sem mudar contrato, disponibilidade passa a ser por dia com mais de um intervalo, "Outras informações importantes" volta a ser relida, pausar com a IA desligada deixa de consumir a prova do teste real, a pessoa edita o próprio nome, "Ajuda" sai dos dois menus e o "Mais" fica completo no celular, proposta no Goal067

**Status:** ACCEPTED no [review067](reviews/067-review.md) (rodada 2 de 2, 2026-09-28; rodada 1 `CHANGES_REQUIRED` com 4 blockers, rodada 2 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no Goal067, rodada 1, e revista na rodada 2 (correção dos 4 blockers da revisão da rodada 1), sobre a baseline aceita `a069d77f6dd1c7621edb032d6b606b3546016383` (fechamento do Goal066, ACCEPTED no [review066](reviews/066-review.md)).

**Contexto:** sobre a baseline aceita `a069d77f6dd1c7621edb032d6b606b3546016383` (fechamento do Goal066, ACCEPTED no [review066](reviews/066-review.md)). Fecha, do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md): **QA S-06** (só a parte das regras de oferta — antecedência mínima, limite no futuro e intervalo entre horários oferecidos), **QA S-04**, **QA S-07**, **QA M-01**, **QA M-02**, **QA L-09**, **QA S-01**, **QA S-03**, **QA S-05**, **QA S-10** e **QA NT-03**. Fecha também a **observação 2 do [review063](reviews/063-review.md)** (salvar o estilo com a IA desligada marcava a execução do teste como usada) e a **observação 4 do [review064](reviews/064-review.md)** (conta anterior ao Goal064 sem nome e sem onde informá-lo). Todos fora da enumeração A-01…A-24 do FINAL_AUDIT. **Não fecha** a política de cancelamento de QA S-06 nem **QA S-08** ("Como você vê a agenda"): nenhuma das duas existe em camada nenhuma do produto (sem campo, sem rota, sem regra na IA) e as duas passam ao **Goal073**, conforme o Goal067 §"Fora do escopo".

**Decisão:**

1. **Regras de oferta em Configurações › Agenda, sem mudar contrato.** `CalendarSettings` mostra antecedência mínima (1h/2h/4h/1 dia, com `minLeadMinutes: 0` representado como "Sem antecedência mínima" quando é o valor gravado), limite no futuro (30/60/90 dias) e intervalo entre horários (15 min/30 min/1h), sempre com o valor lido selecionado. Salvar chama `PATCH /v1/settings/availability` de sempre, reenviando o `timezone` e as `rules` de disponibilidade exatamente como foram lidas, mais os três campos de oferta — a rota e o Scheduling não mudam.
2. **Disponibilidade por dia, com mais de um intervalo, em `/configuracoes/disponibilidade`.** `AvailabilitySettings` representa qualquer grade que o Scheduling devolva (`fitsSingleIntervalForm` sai); cada dia liga/desliga e tem um ou mais intervalos, com "Adicionar intervalo" e remover; sobreposição e início depois do fim são recusados inline, sem `PATCH`; regras inativas lidas voltam intactas no envio; o limite de 28 regras do Scheduling é respeitado pela tela.
3. **Leitura de "Outras informações importantes".** `GET /internal/knowledge/other-info` (orquestrador) devolve o texto do documento `BUSINESS_INFO` ativo de `source` `business-info/other-important-information` do tenant do contexto, ou vazio sem documento, nunca de outro tenant. `GET /v1/knowledge/other-info` (BFF) repassa a leitura. `OtherInfoSection` abre com o texto lido; o aviso "o conteúdo salvo não é reexibido" sai; falha de leitura mostra erro de tela sem apagar o que a pessoa já digitou.
4. **Pausar não consome mais a prova do teste real quando a IA já estava desligada.** Em `PATCH /v1/settings/ai`, o ramo `enabled: false` só grava `activatedByRunId` quando o `enabled` gravado era `true` (passagem ligada→desligada); salvar só o estilo com a IA desligada não toca `activatedByRunId`, e a reconciliação de `GET /v1/status` continua livre para ligar a IA sozinha com essa prova, como a autoativação (Goal019 §7).
5. **Nome da pessoa em Configurações › Conta.** `PATCH /v1/account/profile` com `{ name }`, mesma validação de `POST /v1/auth/register` (`nameSchema`, Goal064) e os mesmos pré-handlers de escrita autenticada de `PATCH /v1/auth/password`; escreve só o `User` da sessão. `AccountSettings` mostra o nome ou o convite a informá-lo quando é nulo, e grava.
6. **"Mais" completo no celular, "Ajuda" sai dos dois menus.** `MORE_DESTINATIONS` ganha Disponibilidade e Conversas; `CalendarSettings` linka para Disponibilidade. "Ajuda" sai da folha "Mais" e do menu da conta em `AppShell` — item morto sem destino, viola `AGENTS.md`.
7. **Texto de produto e estados.** Estilos da IA sem "V1" nem "tools"; Configurações › Agenda sem "Fonte oficial" nem "migração assistida"; título e descrição separados no nome acessível de cada linha de liga/desliga (Configurações e Notificações); `ProductSettingsScreen` ignora o abort do cleanup do efeito, como `ReminderSettingsSection` já fazia.
8. **O gate autenticado mede as três telas tocadas.** `AUTHENTICATED_ROUTES` ganha `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta`, nas cinco larguras, com a sessão da conta principal; as rotas já medidas continuam medidas, `ONBOARDING_ROUTES` não muda.
9. **A política de cancelamento e QA S-08 ficam para o Goal073**, porque não existem em camada nenhuma e pedem dado novo, migration e regra na IA — não é redução de escopo deste Goal, é escopo que a evidência da baseline mostrou nunca ter existido.

**Alternativas:** gravar as regras de oferta junto de um `PATCH` que também aceite `rules` vazio como "sem mudança" — rejeitada, o Scheduling substitui a grade inteira (`deleteMany`/`createMany`) e um contrato implícito desses seria mais frágil que reenviar o que já foi lido. Um segundo campo para a política de cancelamento sem regra na IA por trás — rejeitada, teria produto exibindo controle sem efeito. Manter "Ajuda" desabilitada em vez de remover — rejeitada, item morto sem destino é o próprio defeito (QA M-02, QA L-09).

**Motivo:** as regras de oferta já existiam de ponta a ponta menos na tela (evidência da baseline, Goal067 §"O que a evidência desta passada mostra"); a disponibilidade só aceitava um horário para a semana toda; o texto de "Outras informações importantes" era gravado e nunca lido; pausar com a IA desligada consumia a prova do teste sem necessidade; a conta sem nome (Goal064) não tinha onde ser corrigida; e três telas de Configurações eram inalcançáveis no celular.

**Consequências:** toca `apps/frontend/src/features/settings/`, `features/knowledge/OtherInfoSection.tsx`, `features/reminders/ReminderSettingsSection.tsx` (só texto/separação), `features/notifications/NotificationPreferenceSection.tsx` (só separação), `shared/layout/navigation.ts`, `shared/layout/AppShell.tsx`, `src/data/`, `shared/styles/`, `e2e/routes.ts`; `apps/bff/src/modules/settings/routes.ts`, `modules/knowledge/routes.ts`, `modules/account/routes.ts`, `clients/ai-orchestrator/index.ts`, `PUBLIC_API_V1.md`; `apps/ai-orchestrator/src/modules/internal/routes.ts` e `modules/knowledge/knowledge-document-service.ts`. **Desvio declarado do Goal067 §10:** `PATCH /v1/account/profile` e `GET /v1/knowledge/other-info` são rotas novas, e o adapter do frontend (`apps/frontend/src/data/http/BffHttpClient.ts`, `routeSchema()`) só resolve o schema de resposta de uma tabela — a checagem `public_api_route_coverage` (VALIDATION_GATE) já recusa qualquer rota com chamador sem entrada nessa tabela. Por isso `packages/public-api-contract/src/schemas.ts` ganha `accountProfileResultSchema` e `otherInfoResultSchema`, e `packages/public-api-contract/src/routes.ts` ganha as duas entradas correspondentes em `publicApiRoutes` — sem isso as duas leituras novas não teriam como validar a resposta. `apps/scheduling-service/`, `tools/ia-loop/`, `scripts/`, o Product Vault e o `QA_LOCAL_REVIEW.md` não mudam. Nenhuma migration. `this.http.` em `apps/bff/src/clients/` passa de **42** para **43** (a chamada nova de leitura de `other-info`).

**Limites declarados:**

- **A conferência humana do Goal067 §8 não foi feita:** que Configurações bate com o protótipo `Mais-Negocio-Agenda-IA` e `Mais-WhatsApp-Importacao-Conta` nas opções e nos textos, e que a IA, depois de mudar as regras de oferta, oferece horários com a antecedência, o limite e o intervalo escolhidos, numa conversa real.
- **A política de cancelamento e "Como você vê a agenda" (QA S-08) ficam para o Goal073.**
- **A fidelidade visual de Configurações ao protótipo além do que este Goal cria é do Goal068.**
- **O Product Vault e o `QA_LOCAL_REVIEW.md` não foram editados.**
- **`packages/public-api-contract/` foi tocado, contra o Goal067 §10**, para registrar `accountProfileResultSchema` e `otherInfoResultSchema` em `publicApiRoutes` — ver "Consequências" acima.

**Revisar se:** o Goal073 definir a política de cancelamento e QA S-08 de um jeito que também mude a tela de Agenda deste Goal; a conferência humana do §8 achar divergência que exija nova rodada; ou o Goal068 encontrar divergência de fidelidade visual que troque texto ou layout desta passada.

**Prova:** controles negativos do Goal067 §7 (sete controles, restauração conferida por hash, saída real colada) e contagens da execução final em [FINAL_AUDIT §46](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). O vermelho da baseline de cada escopo obrigatório (§6 do Goal) foi produzido pelas unidades que o implementaram (WU-01 a WU-04), antes da execução final; esta unidade (WU-15) não o reproduz.

## D-086 — Política de cancelamento e remarcação pelo WhatsApp, "Como você vê a Agenda" e as observações 2 e 5 do review067, proposta no Goal073

**Status:** ACCEPTED no [review073](reviews/073-review.md) (rodada 4 de 4, 2026-09-29; rodadas 1 a 3 `CHANGES_REQUIRED` com 4, 3 e 1 blockers, rodada 4 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no [Goal073](goals/073-politica-de-cancelamento-e-visualizacao-da-agenda.md), rodada 1, com as correções da rodada 2 (itens 3 e 4 e **Prova**), sobre a baseline aceita `a1adf4b08f31c691b85c16afb342949cf9e9e98a` (fechamento do Goal067, ACCEPTED no [review067](reviews/067-review.md)).

**Contexto:** o Goal067 mostrou, com evidência conferida na baseline, que a política de cancelamento e remarcação pelo WhatsApp (QA S-06, a parte não fechada por ele) e "Como você vê a agenda" (QA S-08) não existem em camada nenhuma — sem campo, sem rota, sem regra na IA, e a Agenda sempre abre em "Dia" em qualquer largura. Fecha também as observações 2 e 5 do [review067](reviews/067-review.md): a caixa de "Outras informações importantes" ficava editável durante leitura pendente ou falhada, e `toggleDay` de `AvailabilitySettings` ignorava o limite de 28 regras.

**Decisão:**

1. **A política mora no Scheduling, que a aplica.** `CalendarSettings` ganha `customerChangeMinNoticeMinutes Int @default(0)` (migration aditiva `20260928120000_goal073_customer_change_policy`, constraint SQL de 0 a 10080); negócio existente fica em 0 ("sem restrição", o comportamento de hoje), sem backfill. O mesmo prazo vale para cancelar e para remarcar. `GET`/`PATCH /internal/availability-settings` devolvem e aceitam o campo, opcional no corpo (ausente preserva o gravado); o `PATCH` continua só humano (`requireHumanCaller`).
2. **A regra.** Um pedido está fora do prazo quando `startAt − agora < customerChangeMinNoticeMinutes`. Na remarcação, o prazo é medido contra o início **atual** do atendimento, nunca contra o horário novo. Dentro da transação de `cancelAppointment`/`rescheduleAppointment` (`AtendlyCalendarProvider.assertCustomerChangePolicy`), depois da releitura e do atalho de atendimento já cancelado, um chamador `AI` fora do prazo recebe `CUSTOMER_CHANGE_OUTSIDE_POLICY` (409) e nada é gravado; chamador `USER` (a Agenda) nunca é barrado. A única isenção é `policyExemption: "ACTIVATION_TEST_CLEANUP"`, aceita só em `/cancel` e enviada só por `ActivationTestCleanupService`.
3. **A IA confere o prazo ao preparar, e o Scheduling decide na escrita.** O cliente do Scheduling no orquestrador lê `GET /internal/availability-settings`. Em `prepare` de `cancel_appointment` e `reschedule_appointment`, fora do prazo a ferramenta devolve recusa estruturada (`code: "CUSTOMER_CHANGE_OUTSIDE_POLICY"` com `details: { outsidePolicy: true, minNoticeHours, minNoticeMinutes }`, o prazo em horas com uma casa decimal quando não for hora cheia), sem gravar ação pendente e, na remarcação, antes de criar o hold. Em `confirm`, `CUSTOMER_CHANGE_OUTSIDE_POLICY` do Scheduling vira a mesma recusa, com os mesmos campos, e limpa a ação pendente (e o hold da remarcação); se o erro do Scheduling não trouxer o prazo, `minNoticeHours` e `minNoticeMinutes` vão `null`, nunca um valor inventado. A recusa nunca entra em `loadTurnConfirmedEffects` (`assistant.service.ts` só lê `AiToolCall` com `status: "SUCCEEDED"`; uma chamada recusada grava `status: "FAILED"`), então a guarda de afirmação do Goal057 continua valendo sem exceção nova, em cancelamento e em remarcação. `prompts/scheduling.ts` instrui a IA a explicar o prazo em horas (`minNoticeHours`) e oferecer falar com o profissional diante de `outsidePolicy: true`.
4. **Configurações › Agenda mostra a política.** "Cancelar ou remarcar pelo WhatsApp" com as opções Sem restrição/12h/24h/48h; o valor gravado fora dessas opções aparece selecionado como opção extra. Salvar usa o mesmo `PATCH /v1/settings/availability` do Goal067, reenviando a grade e as regras de oferta lidas. Os dois painéis da tela ("Como a IA oferece horários" e "Cancelar ou remarcar pelo WhatsApp") gravam cada um só o próprio campo: o resto do corpo sai do que está gravado (`settings.availability`, atualizado a cada gravação), nunca da edição não salva do outro painel, e cada painel tem o próprio estado de envio e a própria mensagem ("Regras de oferta salvas." / "Política salva."); enquanto um painel grava, o botão do outro fica desabilitado.
5. **"Como você vê a Agenda" mora no BFF.** Modelo novo `AgendaViewPreference` (uma linha por `tenantId`, `onDelete: Cascade`; migration aditiva `20260928130000_goal073_agenda_view_preference`), com `hiddenWeekdays Int[]` (0=domingo…6=sábado, até seis dias, sem repetido) e `initialView` opcional (`DAY`/`WEEK`/`MONTH`). Rotas novas `GET`/`PATCH /v1/settings/agenda-view`, autenticadas por tenant; sem linha, a leitura devolve `hiddenWeekdays: []` e `initialView: null`, sem gravar linha.
6. **Visualização inicial e dias ocultos na Agenda.** `initialView: null` ("Automática") segue Semana a partir de 1024px e Dia abaixo disso (`AgendaBoard.automaticView`); Dia, Semana ou Mês gravados valem em qualquer largura. Dias ocultos somem das colunas de Semana (`WeekView`) e Mês, com o espaço redistribuído; "Dia" continua navegando por todos os dias. Leitura falhada de `/v1/settings/agenda-view` abre a Agenda em Automática com todos os dias, sem erro; em Configurações, a mesma falha bloqueia salvar.
7. **Observação 2 do review067.** `OtherInfoSection` fica com o campo e "Salvar informações" somente leitura (`readOnly`/`disabled`) enquanto a leitura está pendente ou falhou; nada que a pessoa digite é sobrescrito pela leitura.
8. **Observação 5 do review067.** `toggleDay` de `AvailabilitySettings` respeita o limite de 28 regras (`MAX_RULES`), como "Adicionar intervalo": no limite, recusa com texto de produto e não liga o dia.

**Alternativas:** prazo diferente por serviço, por cliente, ou separado para cancelar e remarcar — rejeitada, o vault fixa uma regra global (pergunta 99). Barrar também o chamador `USER` — rejeitada, pela Agenda a pessoa sempre cancela e remarca (Objetivo e posição do Goal). Isenção genérica por qualquer valor de string — rejeitada, o erro é para o lado seguro: só `"ACTIVATION_TEST_CLEANUP"` é aceito, e só em `/cancel`.

**Motivo:** a política e "Como você vê a agenda" não existiam em camada nenhuma (evidência do Goal073, confirmada na baseline do Goal067); a Agenda sempre abrindo em "Dia" contraria o vault (perguntas 321/322); as duas observações do review067 eram blockers de produto não fechados por aquele Goal.

**Consequências:** toca `apps/scheduling-service/prisma/schema.prisma`, `modules/internal-api/routes.ts`, `modules/calendar/routes.ts`, `modules/integrations/atendly/provider.ts`; `apps/ai-orchestrator/src/modules/scheduling-service/{client,types}.ts`, `modules/tools/assistant-tools.ts`, `modules/activation-test/ActivationTestCleanupService.ts`, `modules/prompts/scheduling.ts`; `apps/bff/prisma/schema.prisma`, `src/modules/settings/routes.ts`, `src/clients/scheduling/index.ts`, `PUBLIC_API_V1.md`; `packages/public-api-contract/src/{schemas,routes}.ts`; `apps/frontend/src/features/settings/{CalendarSettings,AvailabilitySettings}.tsx`, `features/knowledge/OtherInfoSection.tsx`, `features/agenda/{AgendaBoard,WeekView,MonthView}.tsx`, `src/data/services/BffSettingsService.ts`, `shared/styles/atendly-agenda.css`. Duas migrations aditivas, uma por serviço, nenhuma outra. `this.http.` em `apps/bff/src/clients/` permanece **43** — nenhuma chamada nova a outro serviço. **Desvio declarado, fora do Goal073:** o gate autenticado (`e2e/authenticated-matrix.spec.ts`, `ensureAgendaOnMeasuredDate`) assumia que `/agenda` sempre abre em "Dia" e clicava "Próximo dia" em qualquer largura; a partir de 1024px a Agenda agora abre em Semana, visualização sem esse botão, e a medida travava em timeout nas larguras `notebook-1024` e `desktop-1440`. Corrigido pulando a navegação por dia quando o botão não existe: a semeadura do gate procura horário livre nos dois dias seguintes a "hoje", que a semana (ou o mês) corrente já cobre sem precisar navegar. Achado e corrigido por esta mesma unidade (WU-17), ao rodar a execução final exigida pelo Goal073 §10; sem essa correção `validate:integration` não passa.

**Limites declarados:**

- **A conferência humana do Goal073 §9 não foi feita:** que Configurações › Agenda e a Agenda, num aparelho real, batem com o protótipo `Mais-Negocio-Agenda-IA` nas opções e nos textos, e se a opção Automática deve existir; e que a IA, numa conversa real, explica o prazo e oferece falar com o profissional sem dizer que cancelou.
- **A estrutura e a fidelidade visual da Agenda além do que este Goal muda (qual visualização abre, quais colunas aparecem) ficam para o Goal069.**
- **O Product Vault e o `QA_LOCAL_REVIEW.md` não foram editados.**

**Revisar se:** o Goal069 mudar estrutura ou fidelidade visual da Agenda de um jeito que afete visualização inicial ou dias ocultos; a conferência humana do §9 achar divergência que exija nova rodada; ou o Goal068 encontrar divergência de fidelidade visual que troque texto ou layout desta passada.

**Prova:** os oito controles negativos do Goal073 §8 (restauração conferida por hash, saída real colada), o vermelho da baseline `a1adf4b` dos testes novos dos quatro serviços (§7 do Goal) e as contagens da execução final estão em [FINAL_AUDIT §47](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). O vermelho do Scheduling foi rodado pela unidade que o implementou (WU-01, rodada 1); o do orquestrador, do BFF e do frontend foi rodado na rodada 2 (FIX-001), contra uma cópia de `a1adf4b` com só os arquivos de teste novos copiados. A execução final e os controles foram reexecutados na rodada 3 (FIX-001) sobre a árvore final, nessa ordem, depois da última edição de código (da rodada 2); o controle 3 roda contra o teste permanente de fronteira, com `databaseNow` congelado.

## D-087 — Marca v4 em SVG de uma cor, assinatura animada por sessão, telas de entrada por largura em Petróleo e saudação neutra no login, proposta no Goal068

**Status:** ACCEPTED no [review068](reviews/068-review.md) (rodada 5 de 5, 2026-09-29; rodadas 1 a 4 `CHANGES_REQUIRED` com 4, 3, 3 e 3 blockers, rodada 5 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no [Goal068](goals/068-fidelidade-visual-marca-e-autenticacao.md), rodada 1, com a nota de correção da rodada 2 e a nota de fechamento abaixo, sobre a baseline aceita `2995be57e34d74cf1ca4e62d70f541856bb118a7` (fechamento do Goal073, ACCEPTED no [review073](reviews/073-review.md)).

**Contexto:** o Goal068 mostrou, com evidência conferida na baseline, que o símbolo da marca era um desenho de CSS (quadrado com raio, dois pontos e uma barra), não o "A que confirma" do `Marca.dc.html` (G-01, G-02, G-03); que o wordmark herdava a fonte do corpo em vez de Literata (G-04); que o favicon era o logo antigo em PNG, com assets mortos não referenciados em `public/` (G-05, G-06); que o painel de entrada usava Tinta (`--navy`) em vez de Petróleo, sem composição própria de tablet e sem o mock de conversa do protótipo (C-07…C-10, L-08); e que os textos de cadastro e login (C-05, C-06, L-07) não eram os do protótipo. Fecha G-01…G-07, C-05…C-10 e L-06…L-08 do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md).

**Decisão:**

1. **A marca é um componente SVG de uma cor só, não CSS.** `Brand`/`BrandMark` (`apps/frontend/src/shared/ui/Brand.tsx`) desenha os três traços do `Marca.dc.html` (`M6 56L28 9L40.85 36.5`, `M44.7 44.8L50 56`, `M25.5 38L32 44.5L58 21`), grade 64, traço 6, pontas e junções arredondadas, `stroke="currentColor"` e `fill="none"`; a cor vem do contexto CSS que envolve o componente (Tinta no papel, Papel no Petróleo), e nenhum traço recebe cor própria. As regras de `.brand-mark` que desenhavam caixa, pontos ou pseudo-elemento saem de `atendly.css`. O wordmark usa `--font-display` (Literata), peso 600 e tracking −2%.
2. **Favicon em SVG.** `apps/frontend/public/brand/atendly-icon.svg` — quadrado Petróleo com o A v4 em Papel — substitui os quatro PNGs antigos (`atendly-favicon-32x32.png`, `atendly-favicon-512x512.png`, `atendly-logo-horizontal.png`, `atendly-logo-icon.png`), removidos de `public/brand/` depois de confirmar que nada em `src/`, `e2e/`, `tests/` ou `scripts/` os referenciava. Os cinco SVGs de exemplo do Next (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) saem de `public/` pelo mesmo motivo. `layout.tsx` aponta o ícone para o SVG novo.
3. **A assinatura anima uma vez por sessão do navegador, nunca deixando o símbolo incompleto.** Na entrada sem sessão (`signature="entry"`), a primeira montagem da sessão desenha os três traços com os tempos do `Marca.dc.html` (460ms/380ms/220ms, a partir de 0/340ms/600ms, somando 820ms); com sessão, só o check anima na sidebar (`signature="check"`, 420ms). `Brand` registra em `sessionStorage` (chaves separadas por assinatura) que já desenhou; recarregar a página na mesma aba não repete, e tocar uma assinatura não consome a chave da outra. Com `prefers-reduced-motion: reduce`, ou sem `sessionStorage` disponível (acesso lançando exceção), o símbolo aparece completo e parado, sem transição — nunca invisível ou parcial.
4. **Telas de entrada compõem por largura com painel Petróleo (`--accent`), nunca Tinta.** Limiares em `768px`, `1024px` e `1280px` (`.entry-panel`/`.entry-main`/`.entry-mock` em `atendly.css`): abaixo de 768px, faixa Petróleo no topo com a marca e a folha do formulário nasce com raio de 24px no topo; de 768px a 1279px, painel Petróleo cheio com o card centralizado; a partir de 1280px, painel Petróleo com a frase e o mock de conversa (estático, `aria-hidden`, sem dado real e sem rede) ao lado do card. Cadastro mostra "Configure o negócio e conecte seu WhatsApp em poucos minutos." (C-05) e o botão "Criar conta" com seta decorativa `aria-hidden` que não entra no nome acessível (C-06); "Esqueci minha senha" fica sozinho na linha, à direita e abaixo da senha (L-06, já garantido por `.auth-row:has(> :only-child)` desde o Goal064). Os textos antigos por cenário (`story`) saem.
5. **A saudação do login é neutra, divergindo do protótipo.** O protótipo diz "Bem-vinda de volta.", no feminino; esta passada usa título "Entrar" e apoio "Boas-vindas de volta. Sua agenda continua de onde parou." (L-07). **Divergência declarada**, fora da conferência automatizada, para a conferência humana do §8 do Goal.
6. **A Home sai deste Goal.** O protótipo (`Home.dc.html`/`Home-Desktop.dc.html`) pede números da semana ("Esta semana: agendamentos, marcados pela IA, conversas que você assumiu"); `dashboardSchema` (`packages/public-api-contract/src/schemas.ts`) só tem contadores de **hoje**, e nenhum serviço soma a semana. Cumprir a Home pede contrato, BFF e orquestrador, com outro perfil de risco — vai para o **Goal074** (H-01, H-06, H-07, H-08, H-10).

**Alternativas:** manter o símbolo em CSS e só trocar cores — rejeitada, não produz o "A" do protótipo nem elimina G-01…G-03. Pintar o check de outra cor no contexto Petróleo — rejeitada, nenhum contexto do `Marca.dc.html` pinta o check de cor diferente do resto do traço. Repetir a animação a cada montagem, sem `sessionStorage` — rejeitada, o protótipo (`Movimento.dc.html`) descreve a assinatura como algo que acontece uma vez por sessão, não a cada navegação. Reproduzir literalmente "Bem-vinda de volta." — rejeitada nesta passada por declarar a saudação como neutra por padrão do produto; fica como divergência para a conferência humana do §8, não como decisão fechada. Fazer a Home com números fixos ou estimados — rejeitada, inventaria dado que a camada não tem.

**Motivo:** G-01…G-07, C-05…C-10 e L-06…L-08 são achados de fidelidade visual confirmados no código da baseline `2995be5` (Goal068, "O que a evidência desta passada mostra"); a Home exige camada de dado que não existe (evidência do mesmo Goal, §8 do achado).

**Consequências:** toca só `apps/frontend/`: `shared/ui/Brand.tsx`, `shared/styles/atendly.css`, `app/layout.tsx`, `public/brand/`, `public/*.svg`, `features/auth/AuthScreen.tsx`. Nenhum contrato, BFF, orquestrador, Scheduling, `packages/` ou migration tocados. Os cinco usos existentes de `Brand` (sidebar, cabeçalho do celular, onboarding, telas de sistema, telas legais) passam a herdar o símbolo em SVG sem mudança de props além de `signature`, onde aplicável.

**Limites declarados:**

- **A conferência humana do Goal068 §8 não foi feita:** que a marca, a assinatura animada e as telas de entrada, num aparelho real nas cinco larguras, batem com `Marca.dc.html`, `Movimento.dc.html` e os três protótipos de login; e que a saudação neutra é aceitável no lugar de "Bem-vinda de volta.".
- **A Home (Goal074), Agenda/Clientes/Serviços/Conversas/Notificações (Goal069) e o onboarding fiel ao protótipo (Goal072) ficam fora**, exceto pela troca de marca, que já vale para eles pelos cinco usos de `Brand`.
- **Campos, validação, regra de senha, aceite e o fluxo de recuperação por link não mudam** (D-082 continua valendo); o código de 6 dígitos do protótipo continua divergência declarada.

**Revisar se:** a conferência humana do §8 achar divergência que exija nova rodada; o Goal074 tratar a Home de um jeito que troque a marca usada nela; ou aparecer decisão de produto explícita sobre a saudação do login que substitua a neutralidade escolhida aqui.

**Prova:** os sete controles negativos do Goal068 §6 (restauração conferida por `sha256sum` idêntico antes e depois, saída real colada) e as contagens da execução final estão em [FINAL_AUDIT §48](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). Os controles foram rodados por esta unidade (WU-11), depois da execução final de `validate:core`, `test:gate`, `validate:ui` e `validate:integration` (WU-07 a WU-10).

**Nota de correção — rodada 2 (FIX-001), 2026-09-29:** a revisão da rodada 1 encontrou quatro blockers, todos corrigidos por esta unidade: (1) o item 3 acima ("só o check anima na sidebar") não valia na prática — `AppShell.tsx` renderizava `<Brand />` sem `signature="check"`, então a sidebar logada nunca animava; corrigido passando `signature="check"` no único caller da sidebar; (2) o item 2 acima (favicon em SVG) tinha geometria divergente de `Marca.dc.html` — traço full-bleed numa grade 64 com `rect rx="14"`, saindo do canto arredondado; corrigido para grade 120, `rect rx="27"` e símbolo escalado a 80×80 centralizado (2/3 do quadrado, igual à referência); (3) o item 4 acima ("faixa Petróleo no topo com... a folha do formulário nasce com raio de 24px no topo") também não valia no celular — `.entry-main` e `.entry-shell` usavam o mesmo `--surface`, sem sobreposição, então o raio não aparecia contra o Petróleo; corrigido com `margin-top: -24px` e `z-index: 1` em `.entry-main` abaixo de 768px, zerado nos três limiares de composição. Os sete controles do §6 foram re-executados sobre a árvore corrigida, com os mesmos resultados de WU-11 (os três arquivos que eles tocam — `Brand.tsx`, `layout.tsx`, `AuthScreen.tsx` — não foram alterados pelos três blockers). Prova e contagens novas em [FINAL_AUDIT §48 — Rodada 2](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). Status continua **PROPOSED**: a conferência humana do §8 do Goal não foi feita por esta rodada.

**Nota de fechamento — review068, 2026-09-29:** três pontos deste registro ficaram imprecisos na árvore aceita. (1) O item 4 diz "de 768px a 1279px, painel Petróleo cheio com o card centralizado". Isso só vale de 768px a 1023px. De 1024px a 1279px, `atendly.css` põe o painel Petróleo à esquerda (440px, com a frase e sem o mock) e o card sobre papel à direita. O §3 do Goal pede "os dois sobre Petróleo", e o protótipo só diz "formulário à direita". A composição dessa faixa fica para a conferência humana do §8. (2) O item 3 vale por construção: só o `Brand` da sidebar (`AppShell.tsx:155`) passa `signature="check"`, e o do cabeçalho do celular é `<Brand />`, sem assinatura. (3) "Consequências" não lista `apps/frontend/src/shared/layout/AppShell.tsx` nem os três testes `tests/goal068-{marca,assinatura,telas-de-entrada}.test.tsx`. Os dois entraram no diff aceito, e a lista completa está no [review068](reviews/068-review.md). A prova final é a da correção da rodada 5 do IA Loop, que os documentos chamam de "Rodada 4": oito controles negativos (a sidebar e os sete do §6) e execução final com gate autenticado 155/0/0 e 0 retentativas ([FINAL_AUDIT §48 — Rodada 4](FINAL_AUDIT.md)).

## D-088 — Três números reais em "Esta semana", registro durável de tomada de controle humano e a Home com uma faixa de estado só, conforme o protótipo, proposta no Goal074

**Status:** ACCEPTED no [review074](reviews/074-review.md) (rodada 4 de 4, 2026-09-29; rodadas 1 a 3 `CHANGES_REQUIRED` com 6, 3 e 3 blockers, rodada 4 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no [Goal074](goals/074-a-home-conforme-o-prototipo.md), rodada 1, com o item 8 reescrito na rodada 4 e a nota de fechamento abaixo, sobre a baseline aceita `7d62f4f9eb2415c6dc7ccdefb2f2aa4a8c024692` (fechamento do Goal068, ACCEPTED no [review068](reviews/068-review.md)).

**Contexto:** o Goal068 já tinha delimitado que a Home ficava fora dele porque `dashboardSchema` só tem contadores de **hoje** e nenhum serviço soma a semana (D-087, item 6). O Goal074 mostrou, com evidência conferida no código da baseline `7d62f4f` ("O que a evidência desta passada mostra"): a Home renderiza seções que o protótipo não tem, em duas peças de estado (`StatusStrip` mais os alertas empilhados) em vez de uma faixa só (H-01, H-06); copy técnica ("Agenda Atendly · fonte oficial", "Confirmados somente após persistência na fonte oficial", "O que a Atendly fez hoje") continua na tela (H-08); `DashboardScreen.tsx:587` mostra `nextAppointment.date` cru, em ISO (H-10); "conversas que você assumiu" não tem registro durável em camada nenhuma — `SessionService.assumeHumanControl` só grava `humanHandling`/`humanHandlingSince`/`humanHandlingSource` na sessão, sobrescritos a cada tomada, sem como contar tomadas da semana; os outros dois números (`aiAppointmentsToday` no orquestrador, `appointmentsToday` no Scheduling) têm fonte, mas não janela de semana; o sino do protótipo não existe — só a contagem de não lidas no item "Notificações" da sidebar e do "Mais". Fecha H-01, H-06, H-07, H-08 e H-10 do [QA_LOCAL_REVIEW](QA_LOCAL_REVIEW.md); H-02, H-03, H-04, H-05 e H-09 já estavam fechados e não regridem. Entram também a observação 3 do [review068](reviews/068-review.md) (título de teste defasado) e a observação 1 do [review073](reviews/073-review.md) (`PUBLIC_API_V1.md` não nomeava `CUSTOMER_CHANGE_OUTSIDE_POLICY`).

**Decisão:**

1. **A semana vai de segunda 00:00 a domingo 23:59, no fuso do negócio**, como a Agenda. Cada serviço usa, para a semana, o mesmo fuso que já usa para hoje: o Scheduling, o do calendário; o orquestrador, o do contexto do negócio. Este Goal não unifica as duas fontes de fuso.
2. **"Agendamentos" é a contagem de agendamentos da semana**: não cancelados, com `date` de segunda a domingo da semana corrente, incluindo os dias que já passaram — o mesmo filtro de `appointmentsToday`, aplicado à semana (`apps/scheduling-service/src/modules/internal-api/routes.ts`, `appointmentsThisWeek`).
3. **"Marcados pela IA" é a contagem de confirmações da IA desde segunda 00:00, pela mesma regra de `aiAppointmentsToday`.** A regra vive numa função só (`countConfirmedAppointments`, `apps/ai-orchestrator/src/modules/internal/routes.ts`), usada pelas duas janelas, para que hoje e semana nunca divirjam. `prepare`, hold vencido, remarcação e cancelamento continuam sem contar (H-09 continua fechado).
4. **"Conversas que você assumiu" é a contagem de conversas distintas com tomada de controle humano desde segunda 00:00.** Tabela nova `HumanTakeover` (migration aditiva `20260929120000_goal074_human_takeover`, índice por `tenantId` e instante, `onDelete: Cascade` a partir de `ConversationSession`, como as demais tabelas dependentes dela): uma linha por passagem real de "IA atende" para "humano atende", gravada na mesma transação que já existe em `assumeHumanControl`, só quando a sessão ainda não estava em atendimento humano; fontes `WHATSAPP` e `ATENDLY`; `BACKFILL` nunca grava, porque reconstrói estado passado, não uma tomada que aconteceu agora; a linha guarda `tenantId`, sessão, conversa, fonte, autor quando houver e o instante, nunca conteúdo de mensagem; `releaseToAi` não apaga linha, e assumir/devolver/assumir de novo grava duas linhas; duas tomadas concorrentes na mesma sessão podem gravar duas linhas, e a contagem por conversa distinta absorve isso.
5. **Não há reconstrução do passado.** Tomadas anteriores à migration não existem em registro nenhum: a sessão legada que já estava em atendimento humano antes da migration continua com zero tomadas registradas ("nunca foi tomada por humano" é um estado legítimo, não "aconteceu mas não foi contado"). O número da semana começa a contar a partir da migration — limite declarado abaixo.
6. **Os três números são aditivos no contrato.** `ai.data` ganha `aiAppointmentsThisWeek` e `conversationsTakenOverThisWeek`; `scheduling.data` ganha `appointmentsThisWeek`; nenhum campo existente muda ou sai. `nextAppointment` e `estimatedRevenueToday` continuam no contrato, mesmo sem uso na Home.
7. **Dependência indisponível mostra "—", nunca 0.** Se `ai` ou `scheduling` vier com `status: "error"`, os números daquela fonte aparecem como "—" — 0 afirmaria "nenhuma atividade" quando na verdade é "não sabemos".
8. **A Home vira uma faixa de estado só.** `StatusStrip` e os alertas empilhados saem; `OperationalBand` resolve um só estado, pela gravidade, na ordem de `resolveOperationalState` em `DashboardScreen.tsx`: agenda indisponível → WhatsApp desconectado → WhatsApp não confirmado → dados de IA indisponíveis → IA em ativação (`PENDING`) → IA não confirmada (`UNKNOWN`) → verificando (leitura de status em andamento) → IA inativa (`OFF` com o checklist incompleto; o checklist fica visível) → IA pausada (`OFF` com os quatro passos concluídos; o checklist fica oculto) → IA ativa. Nunca dois estados ao mesmo tempo (H-01; H-02 continua fechado). "Pausada" é inferida pelo checklist completo, porque não existe dado de pausa em camada nenhuma (ver a divergência "sem hora da pausa"). Em "IA em ativação", a descrição só fala em "passos abaixo" quando o checklist está na tela; com os quatro passos concluídos ela diz que falta a IA confirmar a ativação (correção da rodada 4, coberta por `apps/frontend/tests/goal074-home.test.tsx`). Ordem do protótipo: faixa de estado → "Precisa da sua atenção" (só com pendência) → "Hoje" (lista, com marcador "agora") → "Esta semana"; sem cards dentro de cards (H-06). O checklist de ativação do Goal063 fica, sem itens em card, no lugar do estado H4 do protótipo (H-03 e H-04 continuam fechados).
9. **Saem "Próximo atendimento", "O que a Atendly fez hoje", a receita estimada e "Ações rápidas".** Nenhuma destas copies aparece em `/inicio`: "fonte oficial", "persistência", "O que a Atendly fez hoje", "Status honesto" (H-08). Nenhuma data ISO aparece; toda data é formatada em português no fuso do negócio (H-10) — inclusive a que antes vinha crua de `nextAppointment.date`, que sai da tela junto com o card.
10. **O sino fica no cabeçalho da Home, em todas as larguras** (H-07). Link para `/notificacoes`, nome acessível "Notificações" ou "Notificações, N não lidas" quando houver, e o ponto só aparece com `unreadCount` maior que zero. O item "Notificações" da sidebar e do "Mais" continua, até o Goal069 trocar a central por gaveta — divergência declarada abaixo.
11. **Observação 3 do review068.** O título do teste em `apps/frontend/tests/goal068-assinatura.test.tsx:258` deixa de dizer "a sidebar consome a sessão primeiro" e passa a descrever o que a asserção prova (só a sidebar tem `signature="check"`, qualquer que seja a ordem do JSX); a asserção não muda.
12. **Observação 1 do review073.** `apps/bff/PUBLIC_API_V1.md` passa a nomear `CUSTOMER_CHANGE_OUTSIDE_POLICY`, dizendo que ele é visto pela IA nas ferramentas de cancelar e remarcar e não é resposta de rota pública.

**Alternativas:** contar tomadas de `BACKFILL` também — rejeitada, `BACKFILL` reconstrói estado passado por inferência, não registra uma transição que aconteceu agora; contá-la inflaria "conversas que você assumiu" com tomadas que talvez nunca tenham existido como evento real. Reconstruir retroativamente as tomadas anteriores à migration a partir de `humanHandlingSince`/`humanHandlingSource` — rejeitada, esses campos são sobrescritos a cada tomada nova e não preservam histórico; qualquer reconstrução inventaria contagem que a camada não tem. Mostrar 0 em vez de "—" quando a fonte falha — rejeitada, pelo mesmo motivo que H-08 já rejeita copy que afirma "tudo certo" sem verificação: 0 diz "sem atividade", "—" diz "não sabemos". Uma tabela por fonte (`WHATSAPP`/`ATENDLY` separadas) — rejeitada, a Home só precisa do total de conversas distintas por semana, e separar por fonte não tem consumidor nesta passada. Fazer o sino abrir a gaveta agora — rejeitada, a gaveta é NT-01 e pertence ao Goal069; o sino desta passada é um link para a página que já existe.

**Motivo:** H-01, H-06, H-07, H-08 e H-10 são achados de fidelidade visual e de copy confirmados no código da baseline `7d62f4f` ("O que a evidência desta passada mostra"); os três números da semana exigem camada de dado que a baseline não tem (mesma evidência, itens 4 e 5); a observação 3 do review068 e a observação 1 do review073 são blockers de documentação não fechados pelos Goals que os levantaram.

**Consequências:** toca `apps/ai-orchestrator/prisma/schema.prisma`, `prisma/migrations/20260929120000_goal074_human_takeover/`, `src/modules/session/SessionService.ts`, `src/modules/internal/routes.ts`, `src/lib/dates.ts`; `apps/scheduling-service/src/modules/internal-api/routes.ts`; `packages/public-api-contract/src/schemas.ts`; `apps/bff/src/clients/ai-orchestrator/index.ts`, `src/clients/scheduling/index.ts`, `PUBLIC_API_V1.md`; `apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `shared/styles/atendly.css`, e os testes com `goal074` no nome em cada serviço tocado, mais os testes existentes da Home que dependiam da composição antiga (`goal018-dashboard-status`, `goal059-whatsapp-status-view`, `goal063-home-checklist`, `goal064-greeting-and-account`, `goal068-assinatura`). Uma migration só, aditiva, no orquestrador; nenhuma migration no BFF nem no Scheduling. Nenhum campo público muda ou sai; só os três novos entram.

**Desvio declarado do §11 do Goal ("não toca `scripts/`").** Este Goal também toca `scripts/goal074-human-takeover-migration-rehearsal.mjs` (novo), `scripts/validate-integration.mjs` e `scripts/tests/validate-integration.test.mjs`. Necessário porque esta é a primeira migration da IA desde o Goal023, e o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o `_goal004` deixado pelo ensaio do Goal004) só recebe migration nova por ensaio em `scripts/` — sem ele, `SessionService.assumeHumanControl` falha com "the table HumanTakeover does not exist" na suíte de persistência dentro de `validate:integration`. O ensaio roda em banco descartável próprio, deriva de `BFF_TEST_DATABASE_URL`, e nenhum banco de app real é tocado. Nenhuma outra regra do §11 é afetada: nenhuma migration no BFF nem no Scheduling, nenhum campo público muda ou sai, nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration`/`validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada.

**Limites declarados:**

- **A conferência humana do Goal074 §10 não foi feita:** que a Home, percorrida num aparelho real nas cinco larguras e nos estados da faixa, bate com `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`; e que os três números da semana fazem sentido para quem usa.
- **Tomadas de controle humano anteriores à migration não existem em registro nenhum** — o número de "conversas que você assumiu" só conta a partir dela, nunca retroativo.
- **Sem hora da pausa da IA** na faixa de estado (o protótipo H5 diz "IA pausada · desde 09:12"; `systemStatusSchema` não tem esse instante) e **sem bloqueios pessoais em "Hoje"** (o dashboard não os traz) — os dois pedem dado novo, fora do escopo desta passada.
- **O sino leva à página `/notificacoes`, não a uma gaveta**, até o Goal069 (NT-01).
- **A fidelidade visual das telas de módulo e da central de notificações (Goal069) e do onboarding (Goal072) não são tocadas.**
- **O Product Vault e o `QA_LOCAL_REVIEW.md` não foram editados.**

**Revisar se:** o Goal069 trocar a central de notificações por gaveta (o sino passa a abri-la, não mais navegar); a conferência humana do §10 achar divergência de composição ou de sentido dos três números que exija nova rodada; o produto pedir hora da pausa ou bloqueios pessoais na Home, o que exigiria dado novo nos dois serviços; ou decisão explícita sobre reconstruir tomadas anteriores à migration.

**Prova:** os oito controles negativos do Goal074 §8 (restauração conferida por `sha256sum` idêntico antes e depois, saída real colada) e as contagens da execução final estão em [FINAL_AUDIT §49](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md), [CURRENT_STATE](CURRENT_STATE.md) e a migration em [DATA_MIGRATION](DATA_MIGRATION.md). O vermelho da baseline de cada escopo obrigatório (§7 do Goal) foi produzido pelas unidades que o implementaram (WU-01 a WU-04), antes da execução final; esta unidade (WU-16) não o reproduz — só roda os controles negativos do §8 e escreve esta documentação, depois da execução final de `validate:core`, `test:gate`, `validate:ui` e `validate:integration` (WU-05 a WU-15).

**Nota de fechamento — review074, 2026-09-29:** quatro pontos deste registro ficaram imprecisos ou incompletos na árvore aceita. (1) O item 4 e "Consequências" falam só do cascade a partir de `ConversationSession`. A purga de tenant também apaga `HumanTakeover` por enumeração: a tabela entrou em `TENANT_PURGE_TABLES` (`apps/ai-orchestrator/src/modules/internal/tenantPurge.ts`), antes de `ConversationSession`. (2) "Consequências" não lista `tenantPurge.ts` nem os testes ajustados `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` (207 para 208 arquivos varridos, pelo client Prisma gerado com o modelo novo), `tests/internal/dashboard-ai-appointments.routes.test.ts`, `tests/retention/tenant-purge.test.ts`, `tests/session/support/fake-prisma.ts` e `apps/bff/tests/goal059-whatsapp-status.integration.test.ts`. A lista completa está no [review074](reviews/074-review.md). (3) "IA pausada" (item 8) é inferida pelo checklist completo. Uma IA desligada depois da ativação e uma IA que nunca ligou, mas com os quatro passos feitos, aparecem iguais até existir dado de pausa. Por isso o teste do Goal063 "itens concluídos continuam marcados e alcançáveis" passou a usar 3 de 4 passos, com um teste novo para o checklist oculto com 4 de 4. (4) A prova que sustenta o aceite é a da correção da rodada 4 do IA Loop, que os documentos chamam de "Correção — rodada 3" ([FINAL_AUDIT §49](FINAL_AUDIT.md)). A nota "Rodada 2" afirma os seis blockers da rodada 1 corrigidos, mas dois só fecharam na rodada 4. Nessa rodada, `validate:integration` ficou `SKIPPED` no IA Loop por falta de `*_TEST_DATABASE_URL`. Os **36**/**36** passos e o gate autenticado com **155** e **0** retentativas são a execução declarada pelo Developer contra um PostgreSQL descartável, não reproduzida pelo Tech Lead.

## D-089 — Barra superior única com "+ Novo" nos três tipos, faixa da semana com pontos, duas colunas no Dia a partir de 1024px e as regras de tela que fecham AG-01…AG-12, proposta no Goal069

**Status:** ACCEPTED no [review069](reviews/069-review.md) (rodada 6 de 6, 2026-09-29; rodadas 1 a 5 `CHANGES_REQUIRED` com 4, 2, 2, 2 e 2 blockers, rodada 6 com zero), pelo Tech Lead Agent ([AGENT_ROLES](AGENT_ROLES.md), D-018). Proposta pelo Developer Agent no [Goal069](goals/069-fidelidade-visual-agenda.md), rodada 1, com os itens 1 e 2 e a prova reescritos até a rodada 6 e a nota de fechamento abaixo, sobre a baseline aceita `37c7371659a8fa328d896a282b9479842a188ce7` (fechamento do Goal074, ACCEPTED no [review074](reviews/074-review.md)).

**Contexto:** o Goal069 herdou doze achados da [revisão local](QA_LOCAL_REVIEW.md) (AG-01…AG-12) e as observações 2 e 4 do [review073](reviews/073-review.md), todos confirmados no código da baseline `37c7371` ("O que a evidência desta passada mostra" do Goal): `/agenda` tinha um cabeçalho técnico ("Operação diária", `SourceStrip`, badge "Operacional") e três botões soltos em vez de um "+ Novo" único; Compromisso pessoal já existia em `BlockForm` mas sem ponto de entrada; o dia vazio não dizia se o negócio atendia naquele dia; "Próximo agendamento" era o primeiro item da janela navegada, não o próximo real; o histórico imprimia `event.actor` cru; as ações de fim olhavam só o status, nunca o horário; a copy técnica se repetia em quatro telas; o trilho escondia a marca entre 768 e 1099px; e Configurações › Agenda deixava ocultar os sete dias, com o BFF recusando e a tela mostrando só a mensagem genérica. Só frontend: nenhum contrato, rota, schema do BFF, migration ou serviço muda.

**Decisão:**

1. **Composição da Agenda.** Uma barra superior só (`AgendaBoard.tsx`), nesta ordem: mês/ano do dia focado, o segmentado Dia · Semana · Mês em toda largura a partir de 360px, ‹ › com nomes acessíveis por unidade ("Dia anterior", "Próximo dia", "Semana anterior", "Próxima semana", "Mês anterior", "Próximo mês") e "+ Novo" (`AgendaNewMenu`). Saem o cabeçalho "Operação diária", `SourceStrip` e os três botões soltos; o `<h1>` "Agenda" continua na página, escondido visualmente pela classe local `.agenda-page-title` (`shared/styles/atendly-agenda.css`: `position: absolute`, `width`/`height` de 1px, `overflow: hidden`, sem `clip`/`clip-path`), o que o mantém hit-testável pelo `elementFromPoint` do gate autenticado; `e2e/routes.ts` fica na baseline. "+ Novo" abre um menu (`role="menu"`) com Agendamento (`/agenda/novo`), Compromisso pessoal (`/agenda/bloquear?type=PERSONAL`) e Bloqueio (`/agenda/bloquear?type=BLOCK`), cada item só com a capacidade que já o regia (`createAppointments` para Agendamento, `manageAvailability` para os outros dois); sem nenhuma das duas, o botão não existe; Escape fecha o menu e devolve o foco ao botão. `BlockForm` lê o tipo inicial da URL (`?type=PERSONAL`/`?type=BLOCK`), com `BLOCK` como padrão sem o parâmetro. No Dia, a faixa da semana (`WeekStrip`, dentro de `DayView.tsx`) mostra os sete dias da semana do dia focado, menos os ocultos pela preferência (D-086), com um ponto (`datesWithActiveAppointment`, `occupancy.ts`) só nos dias com agendamento ativo; tocar num dia foca esse dia. A partir de 1024px, o Dia ganha duas colunas: a lista à esquerda e, à direita, `DayDetailPanel` — um painel próprio que reaproveita `LifecycleActions` e `AppointmentHistory` (não duplica regra de ciclo de vida nem de histórico), mas monta seu próprio cabeçalho de resumo em vez de embutir o componente `AppointmentDetail` inteiro; abaixo de 1024px, tocar no agendamento continua levando a `/agenda/agendamento?id=…`.
2. **Regras de tela novas.** Dia vazio mostra "Nenhum atendimento neste dia." e, quando a disponibilidade (lida à parte, `GET /v1/settings/availability`) diz que o negócio não atende naquele dia da semana, o motivo "Você não atende neste dia."; com `createAppointments`, a ação "Criar agendamento"; se a leitura de disponibilidade falhar, o motivo some e o resto continua. Bloco da Semana (`WeekView.tsx`, `WeekEntryBar`) mostra nome do cliente e serviço, no texto e no nome acessível, com o tipo como prefixo do nome acessível (`${typeLabel}: `), para que um bloqueio e um compromisso pessoal com o mesmo título tenham nomes acessíveis distintos. Trocar de visualização preserva o dia focado (AG-05): `goToAdjacent` (`AgendaBoard.tsx`) navega por semana com `addDays(startOfWeek(cursor), direction * 7)`, o que ancora o `cursor` na segunda-feira da semana mostrada; `changeView` usa o `cursor` para abrir o Mês porque `goToAdjacent` o ancora ali, sem estado de "dia focado" separado. "Próximo agendamento" (`nextActiveAppointment`, `occupancy.ts`) vem de uma leitura própria, hoje até 60 dias à frente (`UPCOMING_WINDOW_DAYS`), independente da data navegada, e aparece em Dia, Semana e Mês. O histórico (`AppointmentHistory.tsx`, `actorLabel`) mostra o nome (ou e-mail, sem nome) só quando `actor` bate com o `user.id` da sessão; qualquer outro valor não aparece. As ações de fim ("Concluir atendimento", "Marcar falta") só aparecem quando `appointmentHasStarted` (`occupancy.ts`) é verdadeiro — `canComplete`/`canMarkNoShow` (`LifecycleActions.tsx`) agora exigem status **e** início já passado. Nenhuma das copies banidas ("fonte oficial", "Operação diária", "persistidos", "Operacional") aparece em `/agenda`, no detalhe nem no formulário de agendamento. AG-08 (telefone) fecha **sem mudança de código**: o telefone do caso reproduzido (`5511998887766`, um celular brasileiro de 13 dígitos) já saía formatado por `displayPhone` (`shared/phone.ts`) na baseline; o teste §6.10 prova isso contra a baseline sem vermelho.
3. **"Exceções do dia" continua alcançável.** Saiu da barra superior; ficou como link (`Button variant="secondary"`) logo abaixo da faixa de comando, visível com `manageAvailability`, mesmo destino (`/agenda/excecoes`).
4. **Observação 4 do review073.** `toggleHiddenDay` (`CalendarSettings.tsx`) recusa ocultar o sétimo dia quando já há seis ocultos; o botão do único dia visível fica `disabled` (`isLastVisibleDay`) com o motivo "Pelo menos um dia precisa aparecer na Agenda." visível; a recusa do servidor pelo mesmo motivo (`hiddenWeekdaysLimitReason`) mostra a mesma frase, não a genérica.
5. **Observação 2 do review073.** `ensureAgendaOnMeasuredDate` (`e2e/authenticated-matrix.spec.ts`) passa a navegar até a data semeada em qualquer visualização aberta (dia, semana ou mês, cada uma com seu par de botões e sua própria conta de passos); só essa função e o auxiliar `mondayOfWeek` mudam no arquivo.

**Divergências declaradas:**

- **`DayDetailPanel` não embute o componente `AppointmentDetail`**, como a redação literal das escolhas de desenho do Goal sugere ("reusa os componentes do detalhe (`AppointmentDetail`, `LifecycleActions`, `AppointmentHistory`)"); ele reaproveita `LifecycleActions` e `AppointmentHistory` diretamente, mas monta o próprio cabeçalho de resumo (status, nome, data, serviço) com as mesmas funções de formatação de `occupancy.ts`, sem duplicar regra de ciclo de vida ou de histórico.

**Motivo:** os doze achados fecham com mudança só de composição, copy e leitura adicional de dado que os serviços já expõem (disponibilidade, sessão, calendário); nenhuma regra de agenda, ocupação, cancelamento (D-086), hold, série ou recorrência muda.

**Consequências:** toca só `apps/frontend/`: `e2e/authenticated-matrix.spec.ts` (só `ensureAgendaOnMeasuredDate`), `src/features/agenda/AgendaBoard.tsx`, `AppointmentDetail.tsx`, `AppointmentForm.tsx`, `AppointmentHistory.tsx`, `BlockForm.tsx`, `DayView.tsx`, `LifecycleActions.tsx`, `WeekView.tsx`, `occupancy.ts`, `src/features/settings/CalendarSettings.tsx`, `shared/styles/atendly-agenda.css`, `shared/styles/atendly.css`, os testes `goal016-agenda-reachability`, `goal016-agenda-views`, `goal016-lifecycle-history`, `goal016-shell-invariant`, `goal021-notify-and-reminder-state` e `goal073-agenda-visualizacao` (asserções ajustadas à composição nova) e os quatro testes novos `goal069-agenda-structure.test.tsx`, `goal069-agenda-views.test.tsx`, `goal069-appointment-detail.test.tsx` e `goal069-hidden-days-limit.test.tsx`. Nenhum contrato, rota, schema do BFF ou migration muda; `apps/bff/`, `apps/scheduling-service/`, `apps/ai-orchestrator/`, `packages/`, `apps/evolution-go/`, `scripts/` e `tools/ia-loop/` não são tocados por esta decisão.

**Limites declarados:**

- **A conferência humana do §9 do Goal não foi feita:** que a Agenda, percorrida num aparelho real nas cinco larguras, em Dia, Semana e Mês, com e sem agendamento, bate com `Agenda.dc.html`, `Agenda-Tablet.dc.html` e `Agenda-Desktop.dc.html`; e que a marca no trilho, o segmentado numa linha e o bloco da Semana legível batem com o protótipo. Nenhum teste é prova de fidelidade visual.
- **Fidelidade visual de Clientes, Serviços, Conversas e da central de notificações (Goal075) e do onboarding (Goal072) não são tocadas.**
- **"Como você vê a Agenda" (D-086) continua como está**; este Goal não muda a regra, só a forma.
- **O Product Vault e `docs/design-reference/` não foram editados.**

**Revisar se:** a conferência humana do §9 achar divergência de composição frente aos protótipos que exija nova rodada; ou o Goal075 (Clientes, Serviços, Conversas, notificações) precisar de uma composição de barra superior consistente com a desta Agenda.

**Prova:** os oito controles negativos do Goal069 §7, rodados contra a árvore vigente (restauração conferida por `git hash-object` idêntico antes e depois; `AgendaBoard.tsx` em `43b4d65c6dc50b22fc1da66bd850733fbd0ddd62`; o controle 4 remove a âncora `startOfWeek(cursor)` de `goToAdjacent` e reprova `-t "Próxima semana"`), com as quatro suítes `goal069-*.test.tsx` em **30**/**30** depois de revertidos, e as contagens da execução final estão em [FINAL_AUDIT §50](FINAL_AUDIT.md); resumo em [VALIDATION_GATE](VALIDATION_GATE.md) e [CURRENT_STATE](CURRENT_STATE.md). Execução final (rodada 2, sobre o código vigente): `test:gate` **233**/**233**; `test:frontend` **104**/**104** arquivos e **1079**/**1079** testes (baseline **100**/**1048**); `typecheck` e `lint` exit 0; `validate:core` **17** passos, **15** `passed`, **2** `skipped`; `validate:ui` **169** `passed`, **21** `skipped`; `validate:integration` **36**/**36** passos, com o gate autenticado em **155** `passed` e **0** retentativas, contra o PostgreSQL descartável da estação. Vermelho da baseline dos testes reescritos, com `AgendaBoard.tsx`, `WeekView.tsx` e `DayView.tsx` servidos do blob de `37c7371` sem sobrescrever a árvore: o §6.6 ("'Próxima semana' e depois Mês") reprova, exit 1, com o Mês aberto em outubro; o §6.5 de nome e serviço reprova, exit 1; o §6.5 "Almoço" passa contra a baseline, porque o `WeekEntryBar` de `37c7371` já prefixava o tipo, e reprova, exit 1, contra o `WeekView.tsx` da rodada 1, onde o defeito existiu. O vermelho da baseline dos demais escopos do §6 foi produzido pelas unidades que os implementaram (WU-01 a WU-04).

**Rodadas de correção, 2026-09-29:** rodada 2 — `e2e/routes.ts` volta à baseline, o `<h1>` troca `sr-only` por `.agenda-page-title`, AG-05 passa a ser corrigido em `goToAdjacent` e o bloco da Semana recupera o prefixo do tipo, com o teste de regressão "Almoço"; rodada 3 — os oito controles refeitos contra `AgendaBoard.tsx` depois das edições da rodada 2; rodada 4 — o controle 4 passa a mutar `goToAdjacent`; rodada 5 — sem mudança de código; rodada 6 — itens 1 e 2 e a prova reescritos no estado vigente, com o vermelho da baseline. A conferência humana do §9 do Goal não foi feita.

**Nota de fechamento — review069, 2026-09-29:** três pontos deste registro ficaram imprecisos na árvore aceita. (1) O item 1 diz que a barra começa por "mês/ano do dia focado". O código mostra `periodLabel` (`AgendaBoard.tsx`): a data completa no Dia, o intervalo "dd mmm – dd mmm" na Semana e mês/ano só no Mês. Se isso atende o protótipo, decide a conferência humana do §9. (2) AG-12 (marca no trilho entre 768 e 1099px) fecha sem mudança de código: `AppShell.tsx` não mudou, e a regra `@media (max-width: 1099px)` de `shared/styles/atendly.css` continua escondendo `.sidebar .brand span`, então só o símbolo da marca aparece no trilho. O "Contexto" lista o trilho entre os defeitos confirmados, mas a decisão não o corrige; a mesma conferência humana decide. (3) O motivo "Você não atende neste dia." (item 2) vem só da disponibilidade semanal; uma exceção que fecha o dia não produz motivo, embora a barra da exceção apareça na grade. A prova que sustenta o aceite é a execução da rodada 2 (código inalterado desde então, `AgendaBoard.tsx` em `43b4d65…`) mais os gates do IA Loop da rodada 6, todos exit 0, inclusive `validate:integration`, que desta vez rodou no IA Loop. O vermelho do §6.6 e do §6.5 contra `37c7371` foi reproduzido pelo Tech Lead na rodada 6; o controle 4, na rodada 3. Detalhe no [review069](reviews/069-review.md).
