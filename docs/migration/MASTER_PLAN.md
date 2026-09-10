# Plano mestre de migração

Roadmap de planejamento v3, atualizado em 2026-09-06, derivado da auditoria de `5fb5d51` — baseline histórica do Goal0, não a baseline operacional vigente. Há **25 Goals estimados**, mais Goal0. O número resulta de limites distintos de revisão: autorização, validação, ownership, transporte, domínios operacionais, IA, superfícies UI, automações e corte. Não são versões menores do MVP nem estimativa de prazo.

Objetivo final: implementar o único MVP do Product Vault, com experiência Claude Design aprovada e Agenda Atendly única. Direção: [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md); decisões: [DECISIONS](DECISIONS.md); gates de dados: [DATA_MIGRATION](DATA_MIGRATION.md).

## Regras de execução

- Somente um Goal executável fica detalhado por vez; os anteriores são preservados como histórico. Depois de cada implementação, o Tech Lead Agent inspeciona diff real, testes e dados relevantes, aceita ou devolve correção, e só reavalia e escreve o próximo Goal depois do commit de fechamento — ver [Fechamento por commit e baseline aceita](#fechamento-por-commit-e-baseline-aceita).
- Cada Goal mantém repositório compilável e contratos interoperáveis. Um consumer novo entra antes do produtor ativar um contrato incompatível. Não há período planejado de frontend quebrado aguardando backend.
- Estado novo pode existir em schema sem ser exposto até consumer pronto; adapters temporários têm dono/critério de remoção. Não lançar para validação de produto enquanto faltarem partes do MVP.
- Não apagar legado antes de inventário/corte; não preservar possibilidade de duas agendas no produto novo. Janela técnica congelada para transição é indisponibilidade explicitada, não modo híbrido.
- Fixtures/bancos de teste isolados, sem mensagens a clientes reais. Relatórios do executor não substituem review real.
- IDs estáveis; inserir/dividir/reordenar com histórico, sem detalhar Goals futuros antecipadamente.

## Sequência e dependências

| ID / nome | Objetivo e motivo da posição | Dependências | Áreas principais | Risco | Resultado verificável |
| --- | --- | --- | --- | --- | --- |
| 001 — Autorizar alvo de instância | Fechar falha P0 pequena e independente antes de ampliar integração — ACCEPTED no review001 | Baseline auditada | Evolution handlers/auth/tests | Alto, escopo pequeno | Token A não lê/altera B; uso legítimo preservado e testes Go verificados |
| 002 — Base de validação reproduzível | Estabilizar checks antes do security/ownership003; fechar falhas de teste comprovadas | 001 | Scripts, suites/fixtures, builds, CI | Médio | Cleanup Go Windows corrigido, Scheduling no build, IA requestId, BFF integração real/isolada, gates propagam falhas e separam skipped; contratos atuais preservados |
| 003 — Tenant, sessão e vínculo WhatsApp | Consolidar identidade/confiança/credenciais e fechar G-35 antes de novos fluxos persistidos — ACCEPTED no [review003](reviews/003-review.md), rodada 2 | 002 | BFF, IA, Scheduling, Evolution transporte/docs | Alto | Ownership/scopes/CSRF/revogação; /message/status isolado por instância, linhas sem dono tratadas, testes A/B e documentação de segurança alinhada |
| 004 — Transporte e mensagens duráveis | Remover perda por ACK/dedupe antecipado e efeito remoto incerto — ACCEPTED no [review004](reviews/004-review.md), rodada 2 | 003 | IA inbox/outbox, Go webhook/receipts, contracts | Alto | Evento persistido antes de ACK; retomada/lease/dedupe; status delivery e segredos sanitizados; queda exercitada |
| 005 — Contatos, sessão e controle humano | Impedir processamento indevido antes de evoluir assistente/consumers — ACCEPTED no [review005](reviews/005-review.md), rodada 2 | 004 | IA/Conversas/Contact, BFF endpoints | Alto | Três categorias/override/ignore, sessão24h, inbox IA off, envio humano assume e modelo não disputa |
| 006 — Clientes como pessoas | Retirar identidade por telefone antes de novas escritas/importação — ACCEPTED no [review006](reviews/006-review.md), rodada 1 | 003,005 | Scheduling clientes, IA mapeamento, BFF/contracts | Alto | Cliente sem telefone/número compartilhado, ID estável, relações/notas/tags/permissão e backfill conservador |
| 007 — Catálogo e acordo comercial | Estabelecer semânticas consumidas pela agenda e IA — ACCEPTED no [review007](reviews/007-review.md), rodada 3 | 003 | Scheduling serviços, BFF/contracts | Médio/alto | Quatro preços, atributos MVP, pendências importadas, ativo/operacional e contratos compatíveis |
| 008 — Transações, holds e histórico da agenda | Corrigir atomicidade/replay e preservar acordo antes de ampliar ocupação — ACCEPTED no [review008](reviews/008-review.md), rodada 2 | 006,007 | Scheduling agenda/idempotência/DB, tools/adapters | Alto | Mesma política writers, hold5min, snapshot/proposta, cancelar/remarcar seguros, status/presença/valor final/eventos |
| 009 — Disponibilidade, pessoal e recorrência | Completar entidades e conflitos usados pelas telas e importação — ACCEPTED no [review009](reviews/009-review.md), rodada 2 | 008 | Scheduling regras/exceções/blocos/séries, BFF/contracts | Alto | Exceções gerenciáveis, pessoal/bloqueios recorrentes, ocorrências/conflitos e override humano autorizado |
| 010 — Importação única e corte do writer remoto | Implantar import-only depois de identidade/catálogo/agenda sólidos | 004,006,007,009; gates M0–M3/U-02 se aplicável; M4 contra a origem real fica como gate de operação | Scheduling importação/adapter, BFF, ajustes mínimos de consumers atuais | Alto | Preview/itens/parcial/concluir único/base preenchida; adaptador com resposta validada por schema, cobertura por categoria e limitações declaradas e quantificadas; novos fluxos sem provider remoto; jobs legados reconciliados. A prova de capacidade **contra a API real do Minha Agenda** exige credencial autorizada, que não existe no ambiente de migração: permanece gate operacional antes do corte, registrado em [DATA_MIGRATION §3](DATA_MIGRATION.md#3-minha-agenda-matriz-de-destino), e não critério de aceite do 010 |
| 011 — Assistente e ferramentas vigentes | Integrar raciocínio às invariantes prontas e aos três estilos | 005,006,007,008,009 | IA graph/prompts/tools, contracts | Alto | Confirmação explícita, ambiguidades, buffers, guard antes de efeito, erros sem mensagem de infraestrutura e evals |
| 012 — Conhecimento, memória e sugestões | Completar conteúdo permitido após políticas/identidade | 005,006,011 | IA RAG/memória, BFF conhecimento | Médio/alto | FAQ CRUD/versionamento, memória com proveniência/autorização, sugestões humanas sem autoenvio |
| 013 — Áudio e mídia | Fechar modos de atendimento respeitando política antes da inbox final | 004,005,011 | IA attachments/transcrição, Evolution adapter, BFF | Alto | Áudio válido nas tools; imagem humano; documento visível sem interpretação; ignored não transcreve |
| 014 — Fundação visual, shell e auth | Migrar UI pela base compartilhada já com estados/contratos confiáveis | 002,003,005 | Frontend tokens/primitivas/layout/runtime/auth | Médio | Recepção, cinco destinos mobile, status real, acessibilidade/motion; login/cadastro e recovery no escopo |
| 015 — Clientes e Serviços na UI | Conectar primeiro cadastros necessários à operação | 006,007,014 | Frontend diretórios/forms, BFF adapters | Médio | Telas completas com dados/pendências reais, busca/detalhe/editar, notas/autorização/relações, serviços progressivos |
| 016 — Agenda na UI | Entregar núcleo operacional completo após cadastros | 008,009,014,015 | Frontend Agenda, adapters | Alto | Dia/Semana/Mês mobile, criação/multi-serviço/pessoal/holds/recorrência/status/histórico e conflitos seguros |
| 017 — Conversas e chat na UI | Expor política/sessão/mídia pronta | 005,012,013,014 | Frontend inbox/chat, BFF read model | Médio/alto | Três abas, prioridade humano, busca, assunção no envio, suggestions, mídia/entrega e estados reais |
| 018 — Negócio, onboarding e ativação real | Integrar jornada de entrada depois dos mínimos e IA completos | 010,011,013,014,015,016 | BFF perfil/ativação, IA config, frontend onboarding/WhatsApp | Alto | Quatro blocos, começar/importar, demo, estilo, WA opcional, consentimento/ignorados/teste real, autoativação válida e reconciliação desired/effective |
| 019 — Importação na UI e histórico | Finalizar experiência da sessão única com operação/backend prontos | 010,014,015,016,018 | Frontend importação/Settings, BFF | Médio/alto | Preview categorias/conflitos/parcial/concluir forte/histórico e sem nova importação; não UI de source switching |
| 020 — Lembretes e lifecycle da agenda | Automatizar sobre eventos/versões estáveis e entrega recuperável | 004,005,008,009,011 | Scheduling jobs, IA entrega, contratos BFF | Alto | Até2/default1-24h, confirmação presença separada, cancelamento/remarcação invalidam jobs, conclusão+30min/falta e falha auditável |
| 021 — Notificações e alertas críticos | Tornar falhas/automações visíveis após producers estarem definidos | 004,005,018,020; capacidade/email U-03 | BFF central/preferences/email, IA/Scheduling eventos, frontend | Médio/alto | Central lida/prioridade, banners/status, alertas críticos e falha lembrete; eventos idempotentes ativados com consumer pronto |
| 022 — Retenção e exclusão recuperável | Fechar lifecycle de todas as cópias depois dos stores finais | 003,004,005,012,013,018,021; U-01 | BFF lifecycle, IA/checkpoints/mídia, Scheduling/Go comandos, frontend | Alto | Retenção configurável/confirmada, purge multistore, conta7dias, suspensão imediata e restore com novo teste |
| 023 — Home e Configurações completas | Consolidar operação e preferências com capacidades reais já disponíveis | 015–022 | Frontend Home/Settings, BFF agregação | Médio | Checklist/estados/central, negócio/modalidades/IA/FAQ/agenda/WA/retention/lembretes/conta; sem métricas não aprovadas |
| 024 — Retirada do legado e ensaio de release | Remover compatibilidade somente depois da adoção completa | 010,019,022,023; gates M5–M6 | Todos consumers, contratos/dados legados, infra/docs técnicas | Alto | Zero consumers antigos, writer remoto inexistente, migrations/restore ensaiados, build e deploy gate completos/capacidade validada |
| 025 — Auditoria final do MVP | Verificar produto inteiro, arquitetura e UX antes de uso real | 024 e todos critérios MVP | Todos apps, dados, fluxos E2E, referência visual | Alto | Conformidade global aceita pelo Tech Lead Agent; relatório de evidência/limites e pendências zero de MVP |

Goal010 inclui compatibilidade mínima dos consumers atuais para que o corte operacional não deixe o frontend oferecendo operação impossível; Goal019 entrega a composição visual final. Não há duas implementações operacionais concorrentes. Da mesma forma, cada contrato de evento entra com receptor compatível antes de ativar seu produtor.

Após review001, G-35 é gate explícito de003→004: registro de metadados sem ownership não pode ser ampliado pela entrega durável. Não há evidência de exposição ativa para exigir interrupção emergencial; SAVE_MESSAGES=false no exemplo não comprova banco vazio. Se essa evidência mudar, antecipar security Goal separado. O escopo de segurança já pertence a003 e não será implementado silenciosamente em001/002. A quantidade e os IDs dos Goals permanecem estáveis.

## Fases, marcos e caminho crítico

- **Segurança e base (001–005):** autorizar alvo, checks confiáveis, tenant e recebimento/controle humano. Marco A = eventos não aceitos sem persistência e guard de conteúdo efetivo; ainda não é validação de produto.
- **Núcleo operacional e importação (006–010):** identidade, catálogo, agenda, ocupação e import-only. Marco B = unidade operacional local e dados reconciliáveis.
- **IA e experiência (011–019):** regras/knowledge/mídia e módulos UI/onboarding. Marco C = jornadas integradas representadas com estados reais; ainda faltam operações/lifecycle.
- **Operação e conformidade (020–025):** lembretes, central, retenção, Home/settings, limpeza e auditoria. Marco D = MVP completo apto à validação real definida no vault.

Caminho crítico de dependências, sem estimativa de duração: `001 → 002 → 003 → 004 → 005 → 006 → 008 → 009 → 010 → 018 → 021/022 → 023 → 024 → 025`. Catálogo007 é requisito de008; IA011–013 e UI014–019 se juntam antes do fechamento. Pode haver execução paralela de planejamento/testes em ramos independentes, mas cada Goal implementado continua sujeito a review e replanejamento; não gerar todos os prompts agora.

## Riscos e gates globais

| Risco | Gate / controle |
| --- | --- |
| Isolamento/credenciais | 001 e 003 aceitos com testes negativos de objetos, incluindo G-35, escopos por credencial e segredos fora de raw/eventos; resta ao 004 retirar `instanceToken` do payload e o token da URL nos logs do produtor Go |
| Perda/duplicação de mensagem ou efeito | 004 aceito: inbox antes do ACK, lease/fencing, outbox com UNKNOWN reconciliado por recibo, queda e lease concorrente exercitados; 008 aceito: efeito, resultado idempotente e evento de histórico no mesmo commit, `PENDING` vencido recuperado pela referência de efeito, política única de escrita com locks ordenados e retry limitado, e concorrência real exercitada contra PostgreSQL; 009 aceito: série de atendimento confirmada de uma vez ou não confirmada de todo, com efeito idempotente próprio (`APPOINTMENT_SERIES`) que faz replay em vez de duplicar, e disputa entre série de bloqueio e confirmação de atendimento exercitada contra PostgreSQL; restam o 020 para lembretes e o heartbeat de lease como melhoria |
| Corrupção de pessoa/acordo/histórico | 006–010: IDs, snapshots, ausência explícita e reconciliação; não merge por número |
| Origem externa não fornecer categoria necessária | Prova dirigida em010; registrar limitação e replanejar, sem fingir importação completa ou reduzir MVP silenciosamente |
| Dados/instâncias implantados desconhecidos | M0 obrigatório antes de backfill/corte, backup restaurável; nunca assumir banco vazio |
| Processo free não sustentar jobs | Ensaio e capacidade real, U-03 antes de operação; não depender de health pings como garantia |
| Semântica de retenção não classificada e conclusão legada | U-01/U-02 resolvidas antes de ação irreversível correspondente, sem bloquear001 |
| Testes estáticos passarem com produto errado | Contratos/integração/E2E+review manual dos fluxos; script regex é auxiliar |

## Fechamento por commit e baseline aceita

Política vigente a partir de 2026-09-06, aplicável aos Goals aceitos daqui em diante. Goals já concluídos não são reescritos por causa dela.

### Ciclo obrigatório

```text
Developer implementa Goal N
→ Tech Lead revisa a implementação real
→ CHANGES_REQUIRED, se necessário → Developer corrige → Tech Lead revisa de novo
→ Goal N = ACCEPTED
→ Tech Lead define as atualizações de review/status/documentos afetados
→ IA Loop valida as invariantes e executa o commit de fechamento do Goal N
→ o SHA desse commit vira a baseline aceita vigente
→ Tech Lead reavalia o roadmap incrementalmente
→ somente então o Tech Lead cria o Goal N+1
→ Goal N+1 = READY
→ IA Loop entrega o Goal ao Developer
```

O Goal N+1 **não** pode ser criado como READY enquanto o Goal N estiver IMPLEMENTED, REVIEW_REQUIRED, CHANGES_REQUIRED, CORRECTION_REQUIRED, BLOCKED — ou ACCEPTED sem commit de fechamento.

### Quem commita, e quando

A **decisão** de fechar é do **Tech Lead Agent** e só existe depois do ACCEPTED formal; a **execução mecânica** do commit é do **IA Loop**, que aplica a política sem interpretá-la. O IA Loop não pode inferir ACCEPTED: a transição vem de decisão estruturada do Tech Lead. O Developer entrega diff, testes e relatório; não cria commit de fechamento. Havendo CHANGES_REQUIRED, CORRECTION_REQUIRED ou BLOCKED não há commit: o Developer corrige e o Tech Lead revisa de novo.

O commit representa o estado completo e aceito do Goal: implementação do Developer, testes, migrations/contratos/configs pertencentes ao escopo, correções das rodadas do mesmo Goal, review final do Tech Lead e as atualizações documentais causadas diretamente pelo aceite.

Não entram automaticamente: arquivos temporários, caches, logs, bancos locais, artefatos de teste, alterações externas, alterações preexistentes não relacionadas e cleanup oportunista.

Antes de commitar, o IA Loop: (1) roda `git status`; (2) inspeciona o diff; (3) separa o que pertence ao Goal do que é externo ou preexistente; (4) faz stage seletivo; (5) evita `git add .` quando houver mudança não relacionada; (6) preserva as alterações externas sem descartá-las; (7) roda `git diff --check`; (8) confere que nenhum segredo ou credencial foi introduzido. Push, merge e PR exigem autorização explícita do usuário.

### Baseline histórica e baseline aceita vigente

- **Baseline histórica do Goal0** (`5fb5d51`): fotografia auditada do sistema naquele momento. Continua válida como referência histórica e **deixa de ser** a baseline operacional assim que Goals passam a ser aceitos e commitados.
- **Baseline aceita vigente**: SHA do commit de fechamento do último Goal ACCEPTED. É contra ela que o próximo Goal é escrito e revisado. Fica registrada em [MIGRATION_STATUS](MIGRATION_STATUS.md).

Todo Goal novo declara a própria baseline logo no início, no padrão:

```markdown
## Baseline

Este Goal parte do último estado formalmente aceito:

**Baseline aceita:** `<SHA>`

Goal anterior: `NNN — <nome>`
Status: `ACCEPTED`
```

Alterações já aceitas não são revertidas nem reinterpretadas sem evidência concreta nova e decisão registrada em [DECISIONS](DECISIONS.md).

### Depois do commit: gerar o próximo Goal

O Tech Lead obtém o SHA do novo HEAD, adota-o como baseline, reavalia o MASTER_PLAN de forma incremental, verifica novos gaps/decisões/achados, insere/divide/reordena/supersede Goals quando necessário, escreve **somente** o próximo Goal executável com a baseline declarada e marca apenas ele como READY. Nenhum prompt de Goals posteriores é gerado antecipadamente.

## Definition of Done por Goal

1. Claude implementou somente escopo vigente e entregou diff/testes/report com arquivos, contratos/dados afetados e comandos/resultados; o commit de fechamento não é dele.
2. Testes obrigatórios e build/checks do escopo passaram; skipped, baseline failures e limitações estão separados, nunca mascarados como sucesso.
3. O Tech Lead inspecionou diff real, migrations/consumers/testes e reproduziu a verificação relevante.
4. O Tech Lead confirmou aderência ao Goal, arquitetura e Product Vault.
5. Documentação necessária atualizada para refletir a implementação verificada.
6. Decisões, riscos e pendências registrados; dados/rollback tratados quando aplicáveis.
7. MIGRATION_STATUS atualizado após review: IMPLEMENTED não significa ACCEPTED. Correções exigidas antes de seguir consumer dependente.
8. O Tech Lead declarou ACCEPTED e definiu a documentação afetada pelo aceite.
9. O IA Loop criou o commit de fechamento do Goal e registrou o SHA como baseline aceita vigente.
10. Roadmap reavaliado com as novas descobertas. Só então o próximo prompt executável é escrito e marcado READY.

`ACCEPTED` sem commit de fechamento é encerramento administrativo incompleto: não habilita a criação do próximo Goal. Detalhe operacional em [Fechamento por commit e baseline aceita](#fechamento-por-commit-e-baseline-aceita).

## Definition of Done global do MVP

- Todo escopo MVP do Product Vault implementado; não há corte funcional provisório nem “beta” como solução de dívida.
- Frontend fiel ao Claude Design subordinado ao vault, mobile principal, tablet/notebook/desktop tratados, Clientes principal, Dia/Semana/Mês, acessibilidade e reduced-motion.
- Agenda Atendly única operacional; Minha Agenda somente importação única com conclusão explícita, destino com dados, parcial/conflitos/histórico e dados importados operáveis.
- Serviços com preços/atributos/pendências corretos; clientes por pessoa, sem telefone quando permitido, número compartilhado, memória/observações autorizadas e histórico confiável.
- Holds/disponibilidade/recorrência/pessoal/bloqueios/multi-serviço; confirmação/cancelamento/remarcação/estados/valor final/presença e snapshots consistentes, com concorrência e replay testados.
- Três estilos, IA sem persona, regras determinísticas, conhecimento/FAQ/sugestões/memória permitida, áudio, imagem→humano, documentos sem interpretação.
- WhatsApp ponta a ponta e recuperação/entrega observável; grupos fora; Ignorar IA absoluto; controle humano e sessões funcionam sem perder inbox.
- Onboarding opcional de WhatsApp, demo distinta, teste real/ativação e estados desired/effective honestos; Home e Settings completas.
- Lembretes/central/notificar cliente/alertas críticos, retenção de cópias e conta com recuperação7dias funcionando.
- Auth/tenant isolation e credenciais validados; migrations/backfill/restore/corte ensaiados; contratos legados sem consumer retirados e nenhuma escrita remota operacional.
- Loading/erro/vazio/sucesso reais em todas as superfícies relevantes; nenhuma confirmação antes de efeito concluído.
- Checks, integrações PostgreSQL e E2E críticos passam; observabilidade/capacidade mínima comprovadas e documentação técnica representa implementação final.
- O Tech Lead concluiu auditoria final de conformidade com evidências reais, não só relatório do executor.

## Histórico de planejamento

v18 — 2026-09-09: fechamento009 integrado como `b532ccc21a816c8836bd1ef53a261e92603ff218`, baseline aceita vigente (origem `a35118fd24b767ad5301e48015cb98a76109ea68`). Roadmap reavaliado incrementalmente à luz do review009: ordem, IDs e escopo dos Goals preservados; o 009 fechou a última dependência de domínio do 010 e confirmou, no próprio diff inspecionado, que o motor de importação continua monolítico (`calendar-migration-service.ts` com transação única, destino exigido vazio e troca de fonte automática), sem sessão, item, decisão nem conclusão explícita, e que o client do Minha Agenda continua fazendo cast/JSON.parse sem schema de resposta. Única alteração do plano exigida por evidência: a linha do Goal010 passa a separar o que é provável localmente (adaptador validado por schema, cobertura por categoria, limitações declaradas e quantificadas) da prova de capacidade contra a API real, que depende de credencial autorizada inexistente no ambiente e permanece gate operacional antes do corte M4 — manter a redação anterior faria o plano prometer um aceite impossível de cumprir no 010. Goal010 escrito e liberado READY com escopo confirmado — sessão de importação com itens, decisões versionadas e conclusão única e irreversível por negócio, preview sem escrita com contagens por categoria, motor retomável com idempotência por origem/item e falha parcial, base preenchida com conflitos por item, reconciliação dos `MigrationJob` legados (U-02) e corte do provider remoto dos fluxos operacionais novos — absorvendo os resíduos direcionados a ele: telefone repetido como situação normal (review006) e validação por schema da resposta da origem (review007). Telas de importação e histórico ficam no 019; a remoção do código legado do provider remoto continua no 024. Perfil de execução do Developer: OPUS_HIGH. Nenhuma decisão nova registrada. Nenhum Goal posterior gerado.

v17 — 2026-09-09: Goal009 ACCEPTED na rodada 2 pelo Tech Lead Agent ([review009](reviews/009-review.md)). G-13 fechado na parte de domínio e contratos e DATA-11 fechado na mesma medida; D-006 passa a cobrir também exceções, regras e séries sob a política única de escrita, e D-025 registra os contratos adotados (regras de oferta como dado persistido do tenant aplicado dentro do motor, buffer como ocupação externa com snapshot, exceções geridas por rota com decisão humana registrada, séries finitas com ocorrências materializadas e série de atendimento confirmada de uma vez com efeito idempotente próprio). O resíduo do 008 foi fechado no mesmo diff: a origem da mutação passa a ser derivada da credencial do chamador e o `source` do corpo é ignorado. Rodada 1 com sete blockers — gate de integração não executado, expectativa de código errada no teste de série, falha de ocorrência sem identificação nem alternativas, ocupação estendida cega para vizinho fora da janela crua, ausência da integração do BFF e do isolamento por tenant das entidades novas, e contrato da série divergindo da documentação e do teto — todos fechados na rodada 2, com `validate:integration` 19/19 e `validate:core` reproduzidos pelo reviewer. Resíduos direcionados sem mudar ordem ou IDs: ao 016, derivar `decidedBy` do chamador autenticado junto com as telas de agenda; ao 011, oferta proativa de recorrência e liberação do hold de rascunho substituído; ao 018, modalidades e dados do negócio. Observações não bloqueantes (custo do agregado de buffer por tenant e da busca por ocorrência na pré-visualização, `upstreamDetails` documentado só na seção da série, contagem reiniciada ao editar série "desta data em diante", `stepMinutes` aceito e ignorado na confirmação) ficam como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal010 aguardam o commit de fechamento e seu SHA.

v16 — 2026-09-09: fechamento008 integrado como `1dc170eb8b04d6ee8a706dca089cfe4538175125`, baseline aceita vigente (origem `944bfabdcd87d5c233e7fb13a13f4f8125b5b469`). Roadmap reavaliado incrementalmente à luz do review008: nenhuma evidência para alterar ordem, IDs ou escopo; a política única de escrita, os holds pelo relógio do banco e o histórico por evento são a base que o 009 estende para buffers, regras de oferta, exceções, séries de bloqueio e série de atendimento. Goal009 escrito e liberado READY com escopo confirmado — antecedência mínima/máxima e granularidade aplicadas pelo motor, buffers como ocupação externa com snapshot, exceções gerenciáveis sob a política, compromisso pessoal e séries finitas de bloqueio com ocorrências materializadas e conflitos por ocorrência, série finita de atendimento com hold por ocorrência e confirmação atômica, contratos em Scheduling/BFF/frontend/IA — absorvendo o resíduo do 008 (`source` derivado do chamador). Visualizações, dias ocultos e telas ficam no 016; modalidades e dados do negócio no 018; cadência na remarcação pela IA e liberação de hold de rascunho no 011. Perfil de execução do Developer: OPUS_MEDIUM. Nenhuma decisão nova registrada. Nenhum Goal posterior gerado.

v15 — 2026-09-09: Goal008 ACCEPTED na rodada 2 pelo Tech Lead Agent ([review008](reviews/008-review.md)). G-11, G-12 e G-18 fechados; D-006 passa a ACCEPTED, D-008 ganha a primeira aplicação comprovada (loop de conclusão automática com lease dentro do Scheduling) e D-024 registra os contratos adotados; o resíduo do 007 (replay antigo sem `totalPriceType`) foi fechado no mesmo diff. Rodada 1 com nove blockers — constraint de hold que recusava qualquer horário futuro, limpeza das suítes de integração quebrada pela FK nova de eventos, ausência das rotas de hold/ciclo de vida/histórico, IA/BFF/frontend não tocados, ausência da suíte de concorrência real, `statusRaw` reescrito por transição, histórico sem desempate cronológico e gates não executados — todos fechados na rodada 2. Resíduos direcionados sem mudar ordem ou IDs: ao Goal que tocar a autenticação interna, derivar `source` do token em vez do corpo; ao 011, liberar o hold de rascunho substituído; ao 016, testes de schema do frontend junto com as telas de agenda; ao 021, alimentar a presença pelos lembretes. Observações não bloqueantes (`createdAt`/`occurredAt` ainda `TIMESTAMP`, ausência de teste dedicado do BFF para as rotas novas, drift de forma pré-existente do Goal006) ficam como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal009 aguardam o commit de fechamento e seu SHA.

v14 — 2026-09-09: fechamento007 integrado como `d20a52745cf1aae7391faf5688fb8084271ec3d4`, baseline aceita vigente (origem `cfa562ae4609e09b31e5101d0acb7a626266250f`). Roadmap reavaliado incrementalmente à luz do review007: nenhuma evidência para alterar ordem, IDs ou escopo; identidade estável (006) e acordo comercial estável (007) são os pré-requisitos que o 008 consome, e o próprio 007 confirmou que cancelamento e bloqueio escrevem fora da política transacional e que o resultado idempotente é gravado após o commit. Goal008 escrito e liberado READY com escopo confirmado — política única de escrita com locks ordenados e retry de aborto serializável, resultado idempotente gravado com o efeito, hold de cinco minutos pelo relógio do banco, estados do produto com presença e valor final separados, conclusão automática com lease no Scheduling (D-008), histórico por evento na mesma transação, override humano registrado e atendimento manual excepcional — absorvendo o resíduo do 007 (replay antigo sem `totalPriceType`). Exceções, compromisso pessoal, bloqueios recorrentes e séries ficam no 009; lembretes e presença por lembrete no 021; telas no 016. Perfil de execução do Developer: OPUS_HIGH. D-006 será implementada e avaliada no 008. Nenhum Goal posterior gerado.

v13 — 2026-09-09: Goal007 ACCEPTED na rodada 3 pelo Tech Lead Agent ([review007](reviews/007-review.md)). G-16 fechado na parte de catálogo e snapshot e G-17 fechado na parte de catálogo; D-023 registrada com os contratos adotados; observações 2, 3 e 4 do review006 fechadas. Rodada 1 com cinco blockers (ativação da IA e `/internal/services` restritos à fonte Atendly, `totalPriceType` ausente nas tools, testes e documentação faltantes) e rodada 2 com um (asserção de contagem no ensaio de migration que derrubava `validate:integration`), todos fechados. Resíduos direcionados sem mudar ordem ou IDs: ao 008, proposta versionada, hold, valor final, presença e eventos; ao 009, buffers na ocupação; ao 010, validação por schema da resposta do Minha Agenda; ao 011, recorrência pela IA; ao 015, formulário com os quatro tipos e onboarding. Observações não bloqueantes (consulta ao provider em toda leitura de `/internal/calendar`, `totalPriceType` default em replays antigos, drift de forma do Goal006) ficam como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal008 aguardam o commit de fechamento e seu SHA.

v12 — 2026-09-08: fechamento006 integrado como `8d77ed992f12e1405ae7bfaaeb2d852af5711b5d`, baseline aceita vigente (origem `7f87967b9a053b53ee68d2e20340daa6ea7f9452`). Roadmap reavaliado incrementalmente à luz do review006: nenhuma evidência para alterar ordem, IDs ou escopo; a identidade estável de pessoa e a criação dentro da transação de confirmação sustentam o acordo comercial que o 007 introduz, e o 006 confirmou que todos os consumers de catálogo estão no repositório e fechados em dois tipos de preço. Goal007 escrito e liberado READY com escopo confirmado — quatro semânticas de preço sem zero fabricado, duração explícita com revisão separada de ativo e predicado único de serviço operacional, atributos do serviço do MVP (descrição, identidade visual, buffers e recorrência de referência apenas persistidos), snapshot do acordo com total por regra única, mapper de importação sem `FIXED`/zero — absorvendo os resíduos do 006 (tag idempotente, proveniência pela sessão, compromissos por `customerId`). Buffers em ocupação ficam no 009, recorrência pela IA no 011, importação no 010, telas no 015. Perfil de execução do Developer: OPUS_MEDIUM. Nenhuma decisão nova registrada. Nenhum Goal posterior gerado.

v11 — 2026-09-08: Goal006 ACCEPTED na rodada 1 pelo Tech Lead Agent ([review006](reviews/006-review.md)). G-14 fechado, G-15 fechado na parte de cadastro e G-11 avançado na parte de identidade; D-005 aceita e D-022 registrada com os contratos adotados. Resíduos direcionados sem mudar ordem ou IDs: ao 008, o resultado idempotente recuperável e a política única de writers; ao 010, a importação com telefone repetido como situação normal; ao 012, preferências com origem, resumo e memória derivada; ao 015, as telas de cliente. Observações não bloqueantes (drift de forma no `migrate diff`, `actor` de proveniência vindo do cliente do BFF, lista de compromissos por telefone na IA, upsert de tag reescrevendo autorização) ficam como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal007 aguardam o commit de fechamento e seu SHA.

v10 — 2026-09-08: fechamento005 integrado como `30fc42f62616ba826d0f2fc737386b038fbf9fb7`, baseline aceita vigente (origem `9b31ea4d8990666defcacfd62f69bac6d8047aaf`). Roadmap reavaliado incrementalmente à luz do review005: nenhuma evidência para alterar ordem, IDs ou escopo; contato, sessão e controle humano persistidos sustentam a identidade de pessoa que o 006 introduz. Goal006 escrito e liberado READY com escopo confirmado — cliente por ID com telefone opcional e não exclusivo, criação só na confirmação do agendamento, candidatos e seleção explícita, responsável principal confirmado, observações e tags com autorização de uso pela IA, `Contact` referenciando a pessoa — absorvendo os resíduos do 005 (handoffs OPEN na rotação, índice parcial de sessão única). Perfil de execução do Developer: OPUS_MEDIUM. D-005 será implementada e avaliada no 006. Nenhum Goal posterior gerado.

v9 — 2026-09-08: Goal005 ACCEPTED na rodada 2 pelo Tech Lead Agent. G-06 (resto), G-07, G-08 e G-22 fechados; D-009 aceita e D-021 registrada com os contratos adotados. Resíduos direcionados sem mudar ordem ou IDs: ao 006 e 012, identidade de pessoa, memória estruturada, notas e tags; ao 017, a inbox em três abas; handoffs OPEN legados na rotação e índice parcial de sessão única ficam como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal006 aguardam o commit de fechamento e seu SHA.

v8 — 2026-09-08: fechamento004 integrado como `ecaf7058f2b81ffe4bd4d2966e233b4b58c16dd5`, baseline aceita vigente (origem `fd996f729845872daf6a4c6b01f5d9d5724d7953`). Roadmap reavaliado incrementalmente à luz do review004: nenhuma evidência para alterar ordem, IDs ou escopo; o transporte durável sustenta os Goals que persistem política de contato e efeitos. Goal005 escrito e liberado READY com escopo confirmado — Contato, sessão de ~24 h e categoria persistidos com override manual e ignore absoluto, inbox independente do processamento, envio humano que assume e cancela resposta pendente, contratos por operação — absorvendo os resíduos do 004 (heartbeat de lease, espera ambígua estendida). D-009 será implementada e avaliada no 005. Nenhum Goal posterior gerado.

v7 — 2026-09-07: Goal004 ACCEPTED na rodada 2 pelo Tech Lead Agent. G-04, G-05 e G-09 fechados; G-06 fechado na parte de transporte; D-007 aceita e D-020 registrada com os contratos adotados. Resíduos direcionados sem mudar ordem ou IDs: ao 005, refinar a espera ambígua junto da classificação e a política de takeover; ao 017, a composição visual do estado de entrega; ao 022, a retenção de `webhook_deliveries`. Heartbeat de lease e prova com transporte real ficam registrados como melhorias. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal005 aguardam o commit de fechamento e seu SHA.

v6 — 2026-09-07: fechamento003 integrado como `588b70f575670eeda015750b400a09752ceb5490`, baseline aceita vigente (origem `869fd4b50c4986a8c70d42c505f448c46690d136`). Roadmap reavaliado incrementalmente à luz do review003: nenhuma evidência para alterar ordem, IDs ou escopo; o gate G-35 de 003→004 está satisfeito. Goal004 escrito e liberado READY com escopo confirmado — inbox durável antes do ACK, serialização por conversa e fragmentos sobre trabalho persistido, outbox com estados e recibos, segredos fora do produtor Go — e absorvendo os resíduos pequenos do 003 apontados no review. D-007 será implementada e avaliada no 004. Nenhum Goal posterior gerado.

v5 — 2026-09-07: Goal003 ACCEPTED na rodada 2 pelo Tech Lead Agent, primeiro ciclo conduzido de ponta a ponta pelo IA Loop (D-018). G-02, G-03 (sessão/CSRF) e G-35 fechados; G-04 parcialmente fechado; D-004 aceita e D-019 registrada com os contratos adotados. Resíduos direcionados sem mudar ordem ou IDs: ao 004, segredos no payload/log do produtor Go e reenvio de resposta gerada na janela de transição; ao 022, gates de conta ativa/exclusão. O roadmap não foi reavaliado nesta etapa — a reavaliação incremental e o Goal004 aguardam o commit de fechamento e seu SHA.

v4 — 2026-09-07: reconciliação administrativa após Goal002 ACCEPTED na rodada 3. Política de workflow preservada em commit separado; fechamento002 em `1e874e2785d2bc78860db0eb571ea901a4395c17`, baseline aceita vigente. Roadmap reavaliado incrementalmente: sem evidência nova para alterar ordem, IDs ou escopo. Somente o rascunho Goal003 foi reconciliado e liberado READY após esse SHA, mantendo tenant/sessão/vínculo e G-35 antes do004. Nenhum Goal posterior gerado; sem nova revisão técnica ou implementação.

v4 — 2026-09-07: handoff operacional do papel de Tech Lead / Reviewer, de Astra para o Tech Lead Agent, com os modelos vigentes registrados em [AGENT_ROLES](AGENT_ROLES.md). A decisão de aceite continua no papel de review; a execução mecânica do commit de fechamento passa ao IA Loop. Vale a partir do Goal003; reviews e Goals já concluídos não são reatribuídos nem reescritos. Ver D-018.

v1 — 2026-09-05: plano inicial após consolidação factual. Goal001 escolhido pelo defeito confirmado de autorização; base de testes em002. Novas descobertas podem inserir/dividir/juntar/cancelar Goals com rastreabilidade. Nenhuma execução funcional iniciada por este documento.

v3 — 2026-09-06: adotado o fechamento de Goal por commit do Astra, com baseline aceita vigente e proibição de criar o próximo Goal antes desse commit; DoD estendida e política de review incremental completada. Regra operacional a partir desta data, sem reescrever Goals já concluídos. Ver D-017.

v2 — 2026-09-05: review001 ACCEPTED sobre working tree4ca1301, sem commit. Goal002 detalhado just-in-time e refinado para validação reproduzível; DTOs continuam por domínio. G-35 acrescentado como requisito obrigatório de003 antes de004; dívidas documentais de segurança agrupadas no mesmo escopo. Falhas preexistentes de cleanup Go ficam em002, sem bloquear artificialmente001. Ver D-016 e review001 para evidência e condição de antecipar security Goal.

## Política de review do Tech Lead

Por padrão, reviews são incrementais.

O reviewer NÃO deve repetir a auditoria global do Goal 0.

### FAST
Usar quando a alteração é local e não modifica arquitetura, dados ou contratos.

Ler:
- Goal
- diff
- testes
- implementation report

### STANDARD
Além do FAST:
- consultar consumers diretamente afetados;
- consultar TARGET_ARCHITECTURE/DECISIONS apenas nas seções pertinentes;
- usar Graphify de forma dirigida.

### DEEP
Usar apenas para segurança, persistência, concorrência, migração,
auth/tenant ou efeitos externos críticos.

### ARCHITECTURE
Usar somente quando uma descoberta pode modificar arquitetura,
data ownership, boundaries ou vários Goals futuros.

Subagentes não devem ser usados em FAST/STANDARD salvo lacuna concreta.

Product Vault e protótipo não devem ser reabertos em todo review;
consultar somente quando a mudança toca comportamento de produto/UX.

Um relatório do Claude não substitui inspeção real, mas também não é necessário
reexecutar toda investigação já comprovada pelo executor.

Graphify é consultado de forma dirigida, para claims específicos; o grafo não é
reconstruído para revisar.

Correction review verifica somente os blockers apontados e regressões plausíveis
do que foi corrigido — não repete o review completo já realizado.