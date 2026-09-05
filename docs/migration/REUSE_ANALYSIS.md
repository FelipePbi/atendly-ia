# Análise de reaproveitamento

Baseline: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`. Auditoria documental, sem alterações de implementação. O Product Vault define o comportamento; `docs/design-reference/claude-design/` define a referência visual subordinada ao vault. Código e mocks legados descrevem apenas o estado atual.

## Síntese do frontend

Retomada em 2026-09-05: consultas e resultados anteriores foram recuperados seletivamente dos registros locais da execução interrompida. O grafo existente foi consultado em modo somente leitura; não foi reconstruído. Evidência suficiente para classificação técnica, sem alegar comparação visual de cada frame.

Constatações confirmadas até este checkpoint:

- Existe frontend real conectado ao BFF: registry de serviços, cliente HTTP com validação Zod, contexto de sessão e componentes de loading/erro. Não é necessário tratar todas as telas como mocks nem descartar essa base.
- A estrutura atual preserva regras antigas de fonte externa operacional, dois tons e onboarding que exige WhatsApp; essas regras não podem orientar o novo frontend.
- A referência visual aprovada usa direção Recepção, Literata/Hanken Grotesk e petróleo; o CSS atual usa Inter/IBM Plex Mono e identidade anterior. Reaproveitar a divisão de responsabilidades não significa preservar o visual legado.
- Os caminhos de preview e dados de demonstração precisam ser distinguidos dos caminhos reais em qualquer inventário de funcionalidade.
- Recuperação de senha tem implementação real; a adequação deve respeitar o limite de escopo vigente do vault, que a mantém visual no MVP, sem remover automaticamente backend já existente.

## Classes de decisão

| Classe | Significado |
| --- | --- |
| REUSE | Responsabilidade ou mecanismo útil e compatível; validação integrada ainda necessária |
| REFACTOR | Base útil com mudança de contrato/regra/apresentação |
| REPLACE | Unidade precisa de implementação substituta; preservar internamente apenas partes úteis |
| CREATE | Capacidade necessária não localizada no runtime auditado |
| REMOVE | Retirar após migração de consumidores e critério explícito de saída |

Os percentuais de reaproveitamento não foram estimados: quantidade de arquivos não mede esforço ou risco. Uma unidade pode preservar o mecanismo e substituir sua semântica; as linhas abaixo explicitam essa distinção.

## Matriz frontend

| Unidade / evidência em `apps/frontend/src/` | Estado e alinhamento | Decisão | Justificativa e dependências |
| --- | --- | --- | --- |
| Next App Router, `app/(platform)` e layouts | Base real, domínio já separado por feature | REUSE | Manter Next/React/TS; sem migração de framework, router ou adoção de UI kit por preferência |
| `shared/runtime/ProductRuntime.tsx:31–102` | Context/hooks, consulta sessão, fases e redirecionamento | REFACTOR | Preservar gate e erro recuperável; distinguir onboarding concluído de IA ativada; invalidar sessão quando conta entrar em exclusão |
| `data/http/BffHttpClient.ts:61–107` | Envelope, credentials include, request-id, AbortSignal e erro tipado | REFACTOR | Reusar transporte/injeção de fetch para testes; CSRF opcional hoje sem integração completa; contratos compartilhados por consumidor |
| `data/services/registry.ts` e Bff*Service | Única fronteira de dados da UI | REUSE | Evoluir métodos e parsers junto do backend. Browser não passa a chamar serviços internos |
| `data/mappers/publicApiSchemas.ts` | Parsers efetivos, enums e modelos antigos | REFACTOR | Migrar para contratos consumidos/versionados; não substituir null/erro por defaults positivos |
| `shared/layout/AppShell.tsx:68/269/310` | Estado conectado presumido; três destinos+Mais escondem Clientes | REPLACE | Shell com Home/Conversas/Agenda/Clientes/Mais, uma ação principal, estados reais IA/WA. Depende do read model operacional |
| `shared/styles/atendly*.css` | Identidade anterior Inter/IBM Plex Mono e estilos por módulo | REPLACE | Aplicar tokens Recepção e composição aprovada; preservar comportamento acessível que não conflite |
| `shared/ui/Button`, CurrencyInput, Dialog, States, RouteAnnouncer | Primitivas reais; Dialog gerencia foco/Escape/restauração | REFACTOR | Reusar lógica acessível e substituir visual; testar foco/trap, teclado, leitor de tela e touch targets |
| `shared/icons`, Brand | Infraestrutura própria reutilizável; desenho anterior | REFACTOR | Adequar SVGs e traços ao design sem copiar todo export HTML |
| `features/auth/AuthScreen.tsx` | Login/cadastro reais, validação e páginas legais | REFACTOR | Preservar integração/auth; visual aprovado e recuperação apenas visual no MVP, sem sucesso falso de envio |
| ProductOnboardingScreen + OnboardingRuntime | Fluxo legado fonte externa/tons/WA obrigatório | REPLACE | Quatro blocos percebidos e progressivo; contratos de importação, mínimos operacionais, demo, estilo e ativação independentes |
| `features/dashboard/DashboardScreen.tsx` | Home ligada ao BFF; composição depende de serviços | REFACTOR | Home operacional e checklist de ativação; erros/degradação reais; excluir métricas não aprovadas e distinguir IA pausada/instável |
| `features/conversations/ProductConversationsScreen.tsx:24/71/311` | Polling, busca, filtros AI/paused/unread, texto e takeover/release | REFACTOR | Preservar lista/chat e polling inicial; substituir taxonomia por três categorias/sessões, prioridade humano, assumir ao enviar, mídia e sugestões |
| `features/calendar/ProductAgendaScreen.tsx:34–85` | Lista semanal e forms reais new/detail/reschedule/cancel/block | REFACTOR | Reusar acesso ao BFF/abort/erros; compor Dia/Semana/Mês mobile, holds, recorrência, conflitos, pessoal, status/histórico e notificar cliente |
| ProductDirectoryScreen área customers | Lista/create/detail básicos, telefone como identidade | REFACTOR | Form/transport úteis; modelo alvo pessoa, contatos compartilhados, notas autorizadas/tags/relações/preferências/resumo/histórico |
| ProductDirectoryScreen área services | Lista/create/edit, duração e dois tipos de preço | REFACTOR | Form progressivo, quatro preços, identidade visual, ativo/pendente, buffers/recorrência/modalidade/regras privadas; snapshot já agendado imutável |
| ProductSettingsScreen | Negócio/IA/disponibilidade/integração antigas | REFACTOR | Seções progressivas, negócio/modalidades, agenda, estilos/FAQ, retenção, notificações e conta; APIs hoje ausentes |
| WhatsAppConnectionPanel | QR/pairing/reconnect e polling reais | REFACTOR | Preservar transporte; consentimento/número misto/ignorados, status exato e teste de ativação; não considerar QR emitido como conectado |
| ProductMigrationScreen | Diagnóstico/status/source-target da migração antiga | REPLACE | Sessão única, preview/categorias/conflitos/execução parcial/concluir/histórico. Depende do novo import engine |
| Notificações, retenção e exclusão recuperável | Não localizadas como capacidades integradas | CREATE | Endpoints + estados persistidos + telas; não confundir frames do design com implementação |
| `features/preview`, mocks/services e telas sem prefixo Product | Demonstrações e cenários históricos | REFACTOR / REMOVE | Manter apenas fixtures intencionais; excluir da operação e retirar cenários de regras antigas após testes substitutos |
| Testes frontend | Sem suite/script na baseline | CREATE | Testes de contrato/adapters, acessibilidade e fluxos E2E críticos; não snapshot de centenas de frames sem necessidade |

## Referência visual usada e divergências

Ponto de entrada: `docs/design-reference/claude-design/README.md` e `prototype/project/Atendly.dc.html`. Foram consultados os módulos pertinentes (Agenda, Conversas e Chat, Clientes, Serviços, onboarding, configurações/WhatsApp/importação) por auditorias recuperadas e leituras dirigidas. A cobertura de 40 páginas/452 frames é declarada no README da referência; não foi reproduzida uma inspeção manual de todos os frames neste Goal.

| Padrão alvo | Evidência / direção | Implicação técnica |
| --- | --- | --- |
| Recepção | Papel #F7F4EF, superfície #FFFDFA, petróleo #0F5F63, tinta #221E1A; Literata + Hanken Grotesk | Tokens CSS semânticos centralizados e assets locais/licenças/font fallback verificados na implementação |
| Escala | Espaços 4/8/12/16/20/24/32/40; margem 20; raios 10/14/16/24; ícone24/traço1,75 | Componentes compactos acessíveis, variações por papel, sem impor largura fixa de frame à aplicação |
| Responsividade | Mobile, tablet portrait/landscape, notebook/desktop; sheets e painéis ganham contexto | Breakpoints de layout definidos pela composição e testados em 360/390, 768, 1024 e 1440; valores são matriz de teste proposta, não tokens extraídos do protótipo |
| Motion | `Movimento.dc.html`: transições/sheets/drawers/toast/reduced-motion | Reusar mecanismos React/CSS simples; respeitar cancelamento, preferência reduzida e foco após transição |
| Estados | Normal/loading/vazio/erro/desabilitado/sucesso no design | Estados derivados da API; bloquear sucesso antes de commit ou teste real; loading não chama tudo de desconectado |
| Conflito funcional | `Movimento.dc.html:396` diz Semana/Mês só landscape/desktop; Agenda.dc.html e vault mantêm mobile | Seguir vault e módulo Agenda: Dia/Semana/Mês acessíveis no mobile. Não copiar a restrição do documento de motion |
| Variação editorial de estilos | Vault de IA usa títulos Equilibrado/Descontraído; guardrails globais usam Equilibrada/Descontraída | Três estilos, default equilibrado em todas as fontes. Padronizar labels UI com guardrail global; registrar variação, sem inventar quarto estilo |

Design exportado não define modelo de estado, APIs ou arquitetura de componentes. O nome de arquivo com “Mais” tampouco autoriza esconder Clientes na navegação principal.

## Matriz backend, contratos, dados e infraestrutura

| Área/unidade | Estado atual / alinhamento | Decisão | Justificativa / dependências |
| --- | --- | --- | --- |
| BFF público | Auth, ownership de conta e agregação úteis | REFACTOR | Preservar serviço; separar comandos de aplicação, projeções e sincronização durável; nunca guardar segunda agenda |
| JWT/cookie/membership/registro | Base sólida, revogação/CSRF/cardinalidade incompletos | REFACTOR | Endurecer e testar; não trocar auth provider sem necessidade |
| HTTP clients/error/request-id | Centralização local válida; schemas duplicados | REFACTOR | Contratos efetivamente importados, timeout/backoff de leitura, mutação com status recuperável |
| Scheduling core | Transações, cálculo de disponibilidade, multi-serviço e snapshots | REFACTOR | Preservar unidade transacional, completar produto e todos os writers |
| CalendarProvider como escolha operacional | Duas agendas | REMOVE | Manter gateway da agenda local; adapter externo exclusivo de importação |
| Minha Agenda leitor/cifra/conversão horários | Conhecimento real da integração | REFACTOR | Reuso para importação; conferir categorias, paginação, status e null vs zero |
| Minha Agenda escrita/source switching | Incompatível com produto | REMOVE | Depois do corte e migração dos consumers; sem fallback remoto |
| Migração antiga/jobs/maps/conflitos | Dados rastreáveis parciais, execução errada para alvo | REPLACE / REFACTOR | Substituir orquestração; evoluir registro/mapas preservando história |
| Cliente e serviço Scheduling | Donos adequados, schema insuficiente | REFACTOR | Pessoa independente do contato; contratos comerciais completos antes de consumers |
| IA graph/tools/LLM gateway | Separação entre modelo e efeito de agenda útil | REFACTOR | Workflow audita decisão; domínio decide efeitos; testes de falha/confirmar/handoff |
| IA inbound/buffer/entrega | ACK/dedupe prematuros e memória por request | REPLACE | Inbox/outbox duráveis e coordenação por conversa; manter mapper e abstração de provider |
| Conversas/Contact/sessão | Histórico existe; política está em JSON/flags | REFACTOR / CREATE | Contact ignorado, categoria e sessão persistidas fora de checkpoint do modelo |
| RAG/pgvector/checkpointer | Filtros e persistência úteis | REFACTOR | CRUD conhecimento versionado, consentimento e expiração de cópias; não trocar vector DB |
| Evolution Go | Transporte separado, integração estabelecida | REFACTOR | Corrigir autorização de alvo, segredos, timeout/durabilidade; sem lógica de agenda/classificação |
| Health Worker | Sonda simples e independente | REUSE | Manter monitor; reconsiderar somente se monitor substituto estiver implantado, sem virar worker de produto |
| Jobs de domínio | Não há mecanismo comum confiável | CREATE | Jobs duráveis no banco do dono; alternativas comparadas em TARGET_ARCHITECTURE |
| contracts/common | Zod utilitário existente | REUSE | Validar semântica monetária/temporal; não generalizar regra de produto cedo |
| contracts/domínios vazios | Não são contratos implementados | CREATE | Introduzir schemas por operação com produtor+consumidor reais; eliminar cópias gradualmente |
| legal-contract | Dois consumidores reais e versões compartilhadas | REUSE | Não alterar texto legal nem montar revisão jurídica neste Goal |
| PostgreSQL/Prisma/FKs | Ownership lógico separado e constraints úteis | REFACTOR | Evolução aditiva e backfill/ensaios; nenhuma troca de banco ou união física obrigatória |
| Render/Docker/scripts | Infra existente, build gate incompleto | REFACTOR | Alinhar versões, execução completa, migrate separado de build e capacidade contínua para jobs; custo exige decisão se houver gasto novo |
| Logs/redaction/health | Base útil, vazamento de query/raw e ausência de readiness de produto | REFACTOR | Métricas de backlog/erro/latência, logs mínimos e sem tokens, alertas de operação |

Arquitetura próxima das fronteiras atuais é a alternativa de menor risco. Não há evidência para reescrever o monorepo, juntar bancos ou introduzir uma nova fila externa por padrão.

## Evidências e validação

O responsável deste domínio executou leituras, buscas e consulta Graphify; não executou testes, lint, typecheck, build, browser ou aplicação. As verificações de execução recuperadas e realizadas pelo agente principal estão consolidadas em [CURRENT_STATE](CURRENT_STATE.md): IA 39 passou/1 falhou; auditoria estática 14 passou/1 health remoto pulado. Nenhuma dessas verificações comprova fidelidade visual ou E2E.
