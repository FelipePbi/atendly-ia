# Registro de decisões

Baseline factual `5fb5d51`; data 2026-09-05. `ACCEPTED` identifica restrição autorizada ou decisão técnica aceita em review identificado. Novas direções sem review permanecem `PROPOSED`; não são decisões do usuário presumidas. Somente questões de produto/custo sem fonte vigente exigem resposta específica do usuário.

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

**Status:** PROPOSED.

**Contexto:** BFF conhece User/Tenant; WA BFF por user e IA por tenant; tokens globais e raw ampliam confiança. **Decisão:** tenant BFF canônico, instância vinculada ao negócio, FKs/scoping, credenciais por chamador/escopo, contexto interno autenticado; guardar segredos cifrados/versionados e fora de eventos persistidos. **Alternativas:** tenant enviado pelo browser, telefone como tenant, novo auth provider. **Motivo:** alinhar vínculo existente sem arquitetura nova. **Consequências:** inventário e rollout de tokens com compatibilidade; no Go apenas autorização de transporte, sem lógica de tenant de produto. **Revisar se:** novo número/multiusuário for aprovado fora deste MVP.

## D-005 — Identidade da pessoa independe do telefone

**Status:** PROPOSED (regra de produto já vigente).

**Contexto:** unique por número/upsert pode renomear pessoa. **Decisão:** Customer no Scheduling por ID; telefone opcional/não exclusivo; Contact na IA é canal; referências/mapeamentos não fundem pessoas. **Alternativas:** ID=phone, heurística de merge. **Motivo:** manual sem telefone e familiares no mesmo número. **Consequências:** migrar tools/busca/importação antes de retirar índice; ambiguidade exige confirmação. **Revisar se:** nova modelagem de contato vier de evidência de uso, preservando identidade.

## D-006 — Transação de agenda e ledger de efeito

**Status:** PROPOSED.

**Contexto:** Serializable/advisory existentes não cobrem todos writers e replay é posterior. **Decisão:** mesma política de conflito para create/reschedule/hold/block/exceção, e transação guarda efeito/snapshots/histórico/idempotency result/outbox. **Alternativas:** Redis lock separado, confiar no check anterior, serializar só IA. **Motivo:** consistência local simples com PostgreSQL já usado. **Consequências:** retry limitado de serialização, lock ordering e testes DB concorrentes; override humano explícito continua possível. **Revisar se:** contenda medida justificar outro particionamento.

## D-007 — Inbox/outbox duráveis, sem promessa de exactly-once remoto

**Status:** PROPOSED.

**Contexto:** ACK prematuro, dedupe antecipado e envio com resultado incerto. **Decisão:** persistir antes de ACK, processamento com lease/resultados e outbox/receipts; mensagens possuem estado pending/sent/failed/unknown. **Alternativas:** Map/goroutine fire-and-forget; repetir envio em todo timeout. **Motivo:** preservar trabalho e evidência em restart. **Consequências:** nova persistência de trabalho nos bancos donos; receipt e reconciliação para efeitos externos; Go só confiabilidade de transporte. **Revisar se:** provider documentar garantia idempotente que permita reduzir incerteza.

## D-008 — Jobs no banco do dono; health permanece monitor

**Status:** PROPOSED.

**Contexto:** lembretes, lifecycle, purge e importação precisam sobreviver a restart; monitor não possui ownership. **Decisão:** jobs/outbox PostgreSQL e loops nos serviços existentes, lease/fencing/retry/dead-letter; nenhuma fila externa ou novo serviço por default. **Alternativas:** health genérico; broker externo; biblioteca PostgreSQL. **Motivo:** transação local e menor custo operacional; comparação em TARGET_ARCHITECTURE. **Consequências:** execução contínua precisa ser comprovada; eventual biblioteca só após decisão técnica com compatibilidade transacional. **Revisar se:** volume, atraso ou carga do processo justificarem executor dedicado.

## D-009 — Política de contato/sessão fora do LLM

**Status:** PROPOSED.

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

**Status:** PROPOSED.

**Contexto:** dados com dois tons e recovery real fora do escopo. **Decisão:** proposta de backfill PROFESSIONAL_OBJECTIVE→Profissional, LIGHT_CLOSE→Equilibrada, preservando original; sem inferir Descontraída. Recuperação fica visual no MVP e não anuncia envio real; backend fica isolado até checar consumo implantado. **Alternativas:** escolher estilo casual para todos, remover recuperação/dados sem inventário, manter UX fora do escopo. **Motivo:** menor alteração de intenção e respeito ao MVP. **Consequências:** leitores compatíveis, reescolha normal do estilo, retirada posterior condicionada de rotas. **Revisar se:** inventário/decisão do usuário indicar semântica histórica diferente.

## D-016 — Aceite001, base de validação e segurança de metadados

**Status:** ACCEPTED como decisão de review/replanejamento em 2026-09-05; não aprova implementação futura ou custo.

**Contexto:** Goal001 satisfaz sua autorização delimitada. Duas fixtures Go falham no Windows também na baseline; foi encontrada consulta independente de status por ID global sem dono da instância. **Decisão:** aceitar001 com evidências; detalhar002 como base de validação reproduzível (fixtures, requestId, BFF real, build Scheduling, gates local/CI); exigir fechamento de G-35 no Goal003 antes de ampliar persistência em004. Centralização de DTOs não entra em002; D-011 continua por operação. **Alternativas:** bloquear001 por dívida independente; corrigir todo o Go dentro de001; ignorar G-35 porque SAVE_MESSAGES está false no exemplo. Rejeitadas por falta de relação com o diff ou ausência de prova sobre dados implantados. **Motivo:** manter revisões pequenas, checks confiáveis e scoping pronto antes dos novos dados. **Consequências:** ordem/IDs mantidos; segurança003 inclui ownership de metadados, tratamento de linhas legadas sem dono, teste A/B e alinhamento dirigido de docs. Não criar um segundo Goal redundante enquanto003 cobre esse escopo separado. **Revisar se:** evidência de exposição ativa/exploração exigir antecipar um security Goal, ou solução de ownership demandar divisão adicional. `source`/telefone não é chave de instância; desenho exato será decidido no prompt003.

## Questões específicas do usuário, isoladas

| ID | Decisão pendente | Opções e recomendação | Impacto / ponto limite |
| --- | --- | --- | --- |
| U-01 | Prazo de conteúdo em Não classificadas | Recomendar aplicar o prazo configurado de Pessoal (default30), por poder conter conteúdo pessoal; alternativa prazo Comercial (default90) | O vault permite categoria indefinida, mas não fixa seu prazo. Escolha pode apagar dados; não aceitar nem executar purge desse grupo antes de decisão. Gate Goal022 |
| U-02 | Tratamento de MigrationJob.COMPLETED legado, se existirem negócios assim | Recomendar reconciliar operação e registrar conclusão histórica reconhecida com ciência do usuário, sem conceder segunda importação; alternativa revisão manual de casos sem prova de conclusão | Não consumir direito nem habilitar reimportação por default. Só necessário se inventário encontrar casos; gate Goal010/corte |
| U-03 | Custo/provider para execução contínua e email crítico | Recomendar aproveitar infraestrutura/provedor existente se cumprir requisitos; alternativa contratar capacidade mínima comprovadamente necessária | Nenhuma compra/mudança de provider autorizada aqui. Apresentar custo concreto após inventário; gate antes de jobs reais/Goal021–024 |

Capacidade da API Minha Agenda, volume, restore e estado das migrations são perguntas técnicas a verificar, não escolhas de produto a repassar ao usuário sem investigação. U-01/U-02/U-03 não bloqueiam Goal001 nem a entrega da auditoria.

## Replanning

Ao mudar decisão: registrar evidência/commit, marcar anterior SUPERSEDED quando aplicável, indicar substituta e impactos em DATA_MIGRATION/MASTER_PLAN/status. Não reutilizar ID de Goal cancelado para outro trabalho. Nenhuma proposta se torna ACCEPTED só porque Claude a mencionou no relatório; Astra inspeciona diff/testes reais.
