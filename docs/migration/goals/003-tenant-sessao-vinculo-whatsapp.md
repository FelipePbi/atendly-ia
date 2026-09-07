# Goal 003 — Tenant, sessão e vínculo WhatsApp

**Status: READY.** Executor: Claude Code / Opus. Reviewer: Astra. Rascunho de 2026-09-06 reconciliado em 2026-09-07, após [Goal002 ACCEPTED](../reviews/002-review.md#rodada-3) e seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

## Baseline aceita

Baseline aceita: `1e874e2785d2bc78860db0eb571ea901a4395c17`

Goal anterior: 002 — Base de validação reproduzível

Status anterior: ACCEPTED

O SHA identifica o fechamento aceito do Goal002, incluindo implementação, correções e review. A preparação documental deste Goal é posterior à baseline; seguir D-017 para seu futuro fechamento.

## Objetivo e posição

Consolidar a identidade canônica do negócio, a confiança entre serviços, sessões revogáveis e o vínculo seguro com a instância WhatsApp. Fechar G-35 (`/message/status` sem ownership) **antes** de ampliar persistência/entrega no Goal004.

Baseline arquitetural: Goal0 aceito, [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), seção “Auth, tenant e credenciais”; D-004/D-011/D-016 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente, com evolução dirigida somente onde esta segurança exigir. Não repetir discovery global.

## Dependências e contexto mínimo

- Goal001 e Goal002 ACCEPTED. Partir da baseline aceita acima, já consolidada por commit. Conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify não incluídos no fechamento002.
- Ler AGENTS global e dos apps tocados; consultar seletivamente as regras de negócio/WhatsApp no Product Vault. O frontend só recebe a adaptação de autenticação necessária; a renovação visual continua no014.
- [CURRENT_STATE](../CURRENT_STATE.md): BFF/autenticação, dados BFF e G-35. [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-02/G-03/G-04/G-35. [DATA_MIGRATION](../DATA_MIGRATION.md): seção9 e gate M0. [Review001](../reviews/001-review.md): evidência G-35 e dívida documental específica.
- Usar Graphify apenas para confirmar callers de símbolos/contratos a alterar. Não reconstruir o grafo, percorrer domínios não envolvidos ou reabrir R2-01/R2-02/harness aceitos.

## Pontos de implementação

- BFF: `src/lib/auth.ts`, `src/lib/tenant-context.ts`, cadastro/login/logout/senha em `src/modules/auth/routes.ts`; cliente HTTP interno; módulo WhatsApp; `prisma/schema.prisma` e migrations novas.
- IA: `ChannelConnectionService`, configuração/vínculo de canal, autenticação das rotas internas e provider Evolution; saneamento do webhook antes de persistir `raw`.
- Scheduling: autenticação/contexto de APIs internas e consumers das credenciais alteradas. Sem mudança de regra de agenda.
- Evolution: `pkg/message/model/message_model.go`, `pkg/message/repository/message_repository.go`, handler/service de status e writers de metadados em `pkg/whatsmeow/service/whatsmeow.go`; preservação da autorização001.
- Frontend: adapter HTTP/sessão existente, apenas para acompanhar CSRF/revogação sem quebrar login e mutações legítimas. Registrar todos os consumers afetados no relatório.

## Escopo obrigatório

### 1. Tenant e vínculo da instância

BFF continua dono de User/Tenant/membership e da gestão administrativa WhatsApp. Browser não escolhe tenant por body, query ou header; BFF resolve associação e estado autorizado da conta. Um usuário/profissional e um número por negócio no MVP, sem novo seletor de tenant, papéis ou multiusuário.

Vincular `WhatsAppInstance` explicitamente ao `tenantId`, com unicidade coerente com um vínculo por negócio; conservar identidade externa e proveniência do usuário. Reconciliar com `ChannelConnection` da IA (tenant/provider e provider/instance), sem escolher a primeira associação, inferir dono por telefone ou remapear instância silenciosamente. Aplicar constraints de cardinalidade somente depois de inventariar duplicidades/órfãos e demonstrar migração segura.

Consultas/mutações dos vínculos devem usar tenant autenticado e instância autorizada. Estado ambíguo impede uso do vínculo até resolução explícita, sem tornar outro negócio dono por fallback. Não construir os fluxos completos de ativação/onboarding do018.

### 2. Sessão, CSRF e revogação

Preservar JWT/cookie e o mecanismo de senha existentes; sem novo identity provider. Acrescentar identidade de sessão e estado revogável persistido no BFF, consultado pela autenticação. Logout revoga a sessão atual no servidor; alteração/reset efetivo de senha invalida as sessões correspondentes, inclusive o uso via Bearer. Sessão expirada, revogada, usuário inválido ou associação não autorizada não pode autorizar operação.

Documentar o tratamento de JWTs antigos sem identidade revogável; exigir nova autenticação quando não houver prova válida, sem criar sessão para token não verificado. Não permitir que rollback reative sessões já revogadas.

Implementar proteção de CSRF/origem nas mutações autenticadas por cookie e nos fluxos de autenticação pertinentes. Token CSRF precisa ser verificado e vinculado ao contexto esperado; apenas permitir um header no CORS não basta. Distinguir chamadas por credencial de serviço/Bearer de chamadas por cookie sem criar bypass por header declaratório. Atualizar o adapter frontend no mesmo diff e provar login/logout/cadastro e mutações legítimas. Não ampliar recuperação de senha, exclusão/restauração de conta ou UX fora deste escopo.

### 3. Confiança interna e credenciais WhatsApp

Credenciais distintas por chamador/uso, com identidade e escopos verificados pelo receptor; `x-service-audience`, `x-user-id` e `x-tenant-id` não autenticam por si. Derivar contexto público no BFF e só aceitar contexto interno de chamador autorizado para a operação. Tokens de provisionamento/admin não devem servir como fallback de comandos comuns. Preservar requestId e autoria de usuário/sistema.

BFF mantém a credencial de instância cifrada e versionada, vinculada ao negócio/instância. IA resolve a credencial por vínculo interno autenticado, ou reutiliza projeção controlada já existente se demonstrar as mesmas garantias; nunca toma `instanceToken` do corpo do webhook como autoridade. Definir contrato produtor/consumer e rotação/key-id, sem nova plataforma de segredos. Falha de resolução/cifra/rotação impede o envio; não recair na chave global.

Remover segredos de novos eventos/logs/raw persistidos nos caminhos tocados. Ativar o consumer compatível antes de retirar campos do produtor; não perder eventos silenciosamente durante a transição. Tratar o estoque legado conforme inventário, com procedimento controlado de saneamento/cifra e sem divulgar segredos no relatório. Não implementar inbox/outbox/ACK/dedupe/durabilidade do004.

### 4. G-35: ownership de metadados no transporte

Evolution conhece **instância**, não o tenant de produto. Adicionar `instance_id` ao modelo Message e carregar o identificador exclusivamente do contexto autenticado ou da instância que produz o evento. Nunca usar `source`/telefone, ID enviado pelo cliente ou conexão de A como prova de propriedade de mensagem de B.

Usar chave/consulta por **(instance_id, message_id)**. Adaptar escrita/upsert, leitura de status e demais leituras do mesmo repository que dependem de instância, incluindo o último ID por `source`. IDs iguais em duas instâncias não podem colidir ou atualizar o registro alheio. Preservar o ID interno e os campos/timestamps existentes. Operações administrativas globais só permanecem sob autorização administrativa comprovada; não conceder esse acesso ao token de instância.

Expandir schema com dono ausente permitido apenas para estoque legado durante a migração; novas gravações exigem instância conhecida. Backfill só com proveniência inequívoca; sem evidência, conservar a linha isolada e inacessível à consulta pública. Não apagar histórico, inventar dono ou manter fallback de leitura global. `SAVE_MESSAGES=false` não comprova tabela vazia.

Planejar substituição da unicidade global de `message_id` e dos writers antigos em ordem controlada; demonstrar o ensaio antes de remover a constraint, sem deixar binário antigo gravar sem owner ou recriar a consulta vulnerável. A consulta A→B e a consulta por ID desconhecido devem ser indistinguíveis quanto à existência de B, com zero dados alheios. Preservar o uso legítimo A→A e não redesenhar o transporte.

Alinhar somente a documentação de segurança impactada: contrato `/message/status`; Swagger de advanced-settings (401/403 e respostas reais); cabeçalho de autorização da wiki, nomes de campos e PUT de advanced-settings identificados no review001. Não regenerar documentação inteira nem mudar status de runtime só para satisfazer descrição antiga.

## Migração, compatibilidade e limites operacionais

- Antes de backfill/corte, inventariar schemas/migrations e vínculos diretamente afetados (M0), com contagens sanitizadas e casos ambíguos. Não presumir produção vazia nem permissão para alterar banco implantado. Ensaiar em bancos descartáveis, usando os backends já suportados pelo projeto.
- Criar migrations novas; não reescrever migrations aplicadas, rodar reset em URL herdada ou executar migration durante build. Preservar IDs e credenciais necessárias à operação até consumidores migrarem; dados ambíguos ficam em pendência segura.
- Descrever expansão, backfill retomável, constraints, ordem de troca de readers/writers/credenciais e reversão segura. Não reintroduzir exposição de metadados ou sessões revogadas como estratégia de rollback.
- Mudança de API/contexto/CSRF entra com seus consumers no mesmo Goal ou com compatibilidade explicitamente limitada e testada. D-011 continua por operação; sem centralização geral de DTOs.
- Sem WhatsApp real, deploy, credenciais reais em fixtures, rotação de produção, commits pelo executor, push/merge/PR ou alteração de provider/framework. O commit de fechamento cabe ao Astra após ACCEPTED, conforme D-017. Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras arquiteturais, registrar evidência e devolver a decisão ao Astra; não ampliar o Goal silenciosamente.

## Testes e critérios de aceite

1. Dois tenants/usuários/instâncias reais nas fixtures de banco: A usa seus objetos; A não lê/muta vínculos/configuração de B nem seleciona tenant por headers/body. Ausência, duplicidade e divergência de vínculos são recusadas com segurança. Caminhos positivos atuais permanecem funcionais.
2. Sessões: login/cadastro válidos, cookie/Bearer legítimos, logout/replay de token revogado, expiração e revogação após mudança de senha; CSRF/origem válidos passam e ausentes/incorretos/cross-site são rejeitados antes de efeito. Exercitar adapter frontend pertinente, sem teste visual global.
3. Chamador interno incorreto, audience/escopo incompatível e credencial global usada indevidamente são recusados. Contexto legítimo continua propagando tenant/ator/requestId.
4. Token adulterado no webhook não altera a credencial usada; vínculo A não obtém token de B. Testar round-trip da cifra/versionamento, rotação, falha sem fallback e ausência dos segredos sintéticos nos logs/eventos/raw tocados.
5. G-35: status A→A positivo; A→B e desconhecido sem oracle; contexto ausente/inválido recusado; mesmo message_id em A/B mantém linhas independentes; upsert/último ID filtrados; registros legados sem dono não aparecem. Testar handler/service/repository e persistência reais com adapters existentes, sem depender de WhatsApp conectado real.
6. Ensaio das migrations em base nova e fixture legada com vínculos inequívocos, duplicidades/órfãos e mensagens sem dono; contagens reconciliadas, retomada sem duplicação e plano de corte verificável. Nenhum segredo no output.
7. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam. Manter harness da IA, limites normais e skips explícitos do002. Incorporar ao gate apropriado as novas suítes deste Goal, sem fazer core depender de banco pessoal e sem pular testes de segurança.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões do escopo, migrations/compatibilidade, RED/GREEN dos casos negativos, comandos/resultados e limitações. Atualizar somente contratos/docs afetados e registrar G-02/G-03/G-04/G-35 conforme evidência, sem alegar fechamento de outros domínios. Goal003 termina IMPLEMENTED/REVIEW_REQUIRED até review do Astra.

O review de003 deve usar profundidade adequada à evidência concreta de auth/credenciais e migração de ownership (**DEEP dirigido**), sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal004 permanece condicionado ao aceite003, ao fechamento de G-35 e ao commit de fechamento003 cujo SHA será sua baseline aceita. Não gerar prompts de004 ou posteriores.
