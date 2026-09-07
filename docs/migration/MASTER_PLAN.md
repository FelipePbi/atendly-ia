# Plano mestre de migração

Roadmap de planejamento v3, atualizado em 2026-09-06, derivado da auditoria de `5fb5d51` — baseline histórica do Goal0, não a baseline operacional vigente. Há **25 Goals estimados**, mais Goal0. O número resulta de limites distintos de revisão: autorização, validação, ownership, transporte, domínios operacionais, IA, superfícies UI, automações e corte. Não são versões menores do MVP nem estimativa de prazo.

Objetivo final: implementar o único MVP do Product Vault, com experiência Claude Design aprovada e Agenda Atendly única. Direção: [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md); decisões: [DECISIONS](DECISIONS.md); gates de dados: [DATA_MIGRATION](DATA_MIGRATION.md).

## Regras de execução

- Somente um Goal executável fica detalhado por vez; os anteriores são preservados como histórico. Depois de cada implementação, Astra inspeciona diff real, testes e dados relevantes, aceita ou devolve correção, e só reavalia e escreve o próximo Goal depois do commit de fechamento — ver [Fechamento por commit e baseline aceita](#fechamento-por-commit-e-baseline-aceita).
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
| 003 — Tenant, sessão e vínculo WhatsApp | Consolidar identidade/confiança/credenciais e fechar G-35 antes de novos fluxos persistidos | 002 | BFF, IA, Scheduling, Evolution transporte/docs | Alto | Ownership/scopes/CSRF/revogação; /message/status isolado por instância, linhas sem dono tratadas, testes A/B e documentação de segurança alinhada |
| 004 — Transporte e mensagens duráveis | Remover perda por ACK/dedupe antecipado e efeito remoto incerto | 003 | IA inbox/outbox, Go webhook/receipts, contracts | Alto | Evento persistido antes de ACK; retomada/lease/dedupe; status delivery e segredos sanitizados; queda exercitada |
| 005 — Contatos, sessão e controle humano | Impedir processamento indevido antes de evoluir assistente/consumers | 004 | IA/Conversas/Contact, BFF endpoints | Alto | Três categorias/override/ignore, sessão24h, inbox IA off, envio humano assume e modelo não disputa |
| 006 — Clientes como pessoas | Retirar identidade por telefone antes de novas escritas/importação | 003,005 | Scheduling clientes, IA mapeamento, BFF/contracts | Alto | Cliente sem telefone/número compartilhado, ID estável, relações/notas/tags/permissão e backfill conservador |
| 007 — Catálogo e acordo comercial | Estabelecer semânticas consumidas pela agenda e IA | 003 | Scheduling serviços, BFF/contracts | Médio/alto | Quatro preços, atributos MVP, pendências importadas, ativo/operacional e contratos compatíveis |
| 008 — Transações, holds e histórico da agenda | Corrigir atomicidade/replay e preservar acordo antes de ampliar ocupação | 006,007 | Scheduling agenda/idempotência/DB, tools/adapters | Alto | Mesma política writers, hold5min, snapshot/proposta, cancelar/remarcar seguros, status/presença/valor final/eventos |
| 009 — Disponibilidade, pessoal e recorrência | Completar entidades e conflitos usados pelas telas e importação | 008 | Scheduling regras/exceções/blocos/séries, BFF/contracts | Alto | Exceções gerenciáveis, pessoal/bloqueios recorrentes, ocorrências/conflitos e override humano autorizado |
| 010 — Importação única e corte do writer remoto | Implantar import-only depois de identidade/catálogo/agenda sólidos | 004,006,007,009; gates M0–M4/U-02 se aplicável | Scheduling importação/adapter, BFF, ajustes mínimos de consumers atuais | Alto | Preview/itens/parcial/concluir único/base preenchida; capacidade origem comprovada; novos fluxos sem provider remoto; corte dos legados reconciliado |
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
| 025 — Auditoria final do MVP | Verificar produto inteiro, arquitetura e UX antes de uso real | 024 e todos critérios MVP | Todos apps, dados, fluxos E2E, referência visual | Alto | Conformidade global aceita por Astra; relatório de evidência/limites e pendências zero de MVP |

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
| Isolamento/credenciais | 001 aceito; 003 com testes negativos de objetos, incluindo G-35; revisão de scopes e tokens fora de logs/raw |
| Perda/duplicação de mensagem ou efeito | 004/008/020: restart, timeout, receipt unknown, replay pós-commit, race DB |
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
Claude implementa Goal N
→ Astra revisa a implementação real
→ CHANGES_REQUIRED, se necessário → Claude corrige → Astra revisa de novo
→ Goal N = ACCEPTED
→ Astra atualiza review/status/documentos afetados
→ Astra cria o commit de fechamento do Goal N
→ o SHA desse commit vira a baseline aceita vigente
→ Astra reavalia o roadmap incrementalmente
→ somente então Astra cria o Goal N+1
→ Goal N+1 = READY
→ Claude executa
```

O Goal N+1 **não** pode ser criado como READY enquanto o Goal N estiver IMPLEMENTED, REVIEW_REQUIRED, CHANGES_REQUIRED, CORRECTION_REQUIRED, BLOCKED — ou ACCEPTED sem commit de fechamento.

### Quem commita, e quando

O commit de fechamento é do **Astra** e só existe depois do ACCEPTED formal. Claude entrega diff, testes e relatório; não cria commit de fechamento. Havendo CHANGES_REQUIRED, CORRECTION_REQUIRED ou BLOCKED não há commit: Claude corrige e Astra revisa de novo.

O commit representa o estado completo e aceito do Goal: implementação do Claude, testes, migrations/contratos/configs pertencentes ao escopo, correções das rodadas do mesmo Goal, review final do Astra e as atualizações documentais causadas diretamente pelo aceite.

Não entram automaticamente: arquivos temporários, caches, logs, bancos locais, artefatos de teste, alterações externas, alterações preexistentes não relacionadas e cleanup oportunista.

Antes de commitar, Astra: (1) roda `git status`; (2) inspeciona o diff; (3) separa o que pertence ao Goal do que é externo ou preexistente; (4) faz stage seletivo; (5) evita `git add .` quando houver mudança não relacionada; (6) preserva as alterações externas sem descartá-las; (7) roda `git diff --check`; (8) confere que nenhum segredo ou credencial foi introduzido. Push, merge e PR exigem autorização explícita do usuário.

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

Astra obtém o SHA do novo HEAD, adota-o como baseline, reavalia o MASTER_PLAN de forma incremental, verifica novos gaps/decisões/achados, insere/divide/reordena/supersede Goals quando necessário, escreve **somente** o próximo Goal executável com a baseline declarada e marca apenas ele como READY. Nenhum prompt de Goals posteriores é gerado antecipadamente.

## Definition of Done por Goal

1. Claude implementou somente escopo vigente e entregou diff/testes/report com arquivos, contratos/dados afetados e comandos/resultados; o commit de fechamento não é dele.
2. Testes obrigatórios e build/checks do escopo passaram; skipped, baseline failures e limitações estão separados, nunca mascarados como sucesso.
3. Astra inspecionou diff real, migrations/consumers/testes e reproduziu a verificação relevante.
4. Astra confirmou aderência ao Goal, arquitetura e Product Vault.
5. Documentação necessária atualizada para refletir a implementação verificada.
6. Decisões, riscos e pendências registrados; dados/rollback tratados quando aplicáveis.
7. MIGRATION_STATUS atualizado após review: IMPLEMENTED não significa ACCEPTED. Correções exigidas antes de seguir consumer dependente.
8. Astra declarou ACCEPTED e atualizou a documentação afetada pelo aceite.
9. Astra criou o commit de fechamento do Goal e registrou o SHA como baseline aceita vigente.
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
- Astra concluiu auditoria final de conformidade com evidências reais, não só relatório do executor.

## Histórico de planejamento

v1 — 2026-09-05: plano inicial após consolidação factual. Goal001 escolhido pelo defeito confirmado de autorização; base de testes em002. Novas descobertas podem inserir/dividir/juntar/cancelar Goals com rastreabilidade. Nenhuma execução funcional iniciada por este documento.

v3 — 2026-09-06: adotado o fechamento de Goal por commit do Astra, com baseline aceita vigente e proibição de criar o próximo Goal antes desse commit; DoD estendida e política de review incremental completada. Regra operacional a partir desta data, sem reescrever Goals já concluídos. Ver D-017.

v2 — 2026-09-05: review001 ACCEPTED sobre working tree4ca1301, sem commit. Goal002 detalhado just-in-time e refinado para validação reproduzível; DTOs continuam por domínio. G-35 acrescentado como requisito obrigatório de003 antes de004; dívidas documentais de segurança agrupadas no mesmo escopo. Falhas preexistentes de cleanup Go ficam em002, sem bloquear artificialmente001. Ver D-016 e review001 para evidência e condição de antecipar security Goal.

## Política de review do Astra

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