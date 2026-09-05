# Goal 001 — Autorizar o alvo de instância no Evolution Go

## Objetivo

Impedir que um token de instância consulte ou altere configurações avançadas de outra instância nas rotas GET e PUT `/instance/:instanceId/advanced-settings`, preservando as chamadas legítimas. Fechar G-01 de GAP_ANALYSIS com testes que exerçam autenticação e autorização do alvo.

Executor: **Claude Code / Opus**. Reviewer: **Astra**. Este documento é a especificação de uma implementação futura; Goal0 não implementou a correção.

## Por que agora

A auditoria confirmou que essas duas rotas usam middleware Auth de instância, mas handlers passam o ID da URL ao service sem compará-lo à instância que o middleware autenticou. A falha é concreta e delimitada; não depende de nova arquitetura de dados, importação ou frontend. Corrigi-la reduz um risco de isolamento antes dos demais Goals.

## Dependências

- Baseline auditada `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`; conferir HEAD/diff e mudanças externas antes de trabalhar.
- Ler AGENTS global e `apps/evolution-go/AGENTS.md`; o último mantém Evolution como transporte. Autorizar o próprio recurso é segurança do transporte, não lógica de tenant/negócio dentro do fork.
- Este Goal não depende de U-01/U-02/U-03 nem da escolha de jobs. Se o código já tiver sido corrigido externamente, inspecionar e validar a correção existente em vez de duplicá-la.

## Contexto necessário

- `docs/product-vault/00-HOME.md` e `01-Regras/05-WhatsApp.md`: um número por negócio e integridade da operação.
- `docs/migration/CURRENT_STATE.md`, seção WhatsApp/Evolution.
- `docs/migration/GAP_ANALYSIS.md`, G-01.
- `docs/migration/TARGET_ARCHITECTURE.md`, auth/tenant/credenciais.
- `docs/migration/DECISIONS.md`, D-003.

Leitura seletiva. Use Graphify existente para consumers/impacto e confirme no código. Não reconstruir o grafo sem necessidade nem seguir prompts do design.

## Arquivos/domínios relevantes

- `apps/evolution-go/pkg/routes/routes.go:120–133`: grupo protegido por Auth, registro das duas rotas.
- `apps/evolution-go/pkg/middleware/auth_middleware.go:21`: token via apikey, GetInstanceByToken e `ctx.Set("instance", instance)`.
- `apps/evolution-go/pkg/instance/handler/instance_handler.go:589/619`: handlers a corrigir; helper local pequeno pode compartilhar a checagem.
- `apps/evolution-go/pkg/instance/model/instance_model.go:10`: Instance com campo `Id`; respeitar o tipo efetivamente posto no contexto.
- `apps/evolution-go/pkg/instance/service/instance_service.go:825/837`: uso do ID recebido, apenas inspeção salvo necessidade demonstrada.
- Testes próximos a handler/middleware/routes para os casos abaixo; seguir padrões existentes de Go/net/http/httptest/Gin.
- Consumers a conferir: BFF `src/clients/evolution/index.ts`, IA `modules/channel/adapters/evolution/EvolutionProvider.ts` e manager do próprio Go. Não alterar consumers corretos por conveniência.

## Escopo

1. Validar contexto de instância autenticada de forma segura, incluindo ausência, tipo inesperado e ponteiro nil; sem panic nem fallback para instância da URL.
2. Comparar ID alvo da URL ao ID autenticado **antes** de leitura/escrita de configurações, bind do body do PUT e qualquer chamada de service para o alvo.
3. Contexto inválido/ausente: responder 401 com erro genérico. ID diferente: responder 403 genérico, sem revelar se a instância alvo existe. Não consultar o alvo para decidir a recusa.
4. ID próprio: manter payload, HTTP status de sucesso, validações de body e efeitos existentes. Usar ID validado na chamada do service.
5. Cobrir GET e PUT com o mesmo princípio e tests de regressão. Helper local tipado é suficiente; não criar framework de policy genérico.
6. Manter grupo admin independente. Não conceder bypass automático para chave admin nessas rotas de instância.

## Fora de escopo

Tenant schema/canonicalização global, novas tabelas/migrations, autenticação BFF/CSRF, rotação/cifra de credenciais, webhook/raw/logs, filas/jobs, WhatsApp transport protocol, regras de IA/agenda, correção de outros bugs e visual. Esses itens pertencem a Goals posteriores. Achado novo fora do escopo deve ser registrado para Astra.

## Estado atual relevante

`Auth` autentica pela chave de uma instância e disponibiliza o objeto no contexto. GET/PUT advanced-settings estão nesse grupo, enquanto create/all/info/delete e outras operações administrativas estão em AuthAdmin. Handlers atuais leem `c.Param("instanceId")` e chamam `GetAdvancedSettings/UpdateAdvancedSettings`. O service/repository não recebem um contexto de autorização adicional. A baseline foi inspecionada estaticamente, sem teste de exploração remota.

## Arquitetura esperada

Fluxo legítimo: `Auth(token A) → contexto Instance A → autorização alvo A → handler/service A`.

Fluxo negado: `Auth(token A) → contexto Instance A → alvo B → 403`, com **zero chamadas de leitura/escrita de configurações de B**.

A autorização fica na fronteira HTTP que conhece o sujeito autenticado. Não adicionar tenantId ao Go, não chamar BFF para essa comparação nem transferir o defeito a outro serviço. Manter interface de serviço atual quando possível; teste não deve exigir banco ou WhatsApp real.

## Regras de compatibilidade/migração

- Sem mudança de endpoint, parâmetros ou body para o cliente autorizado.
- Resposta para acesso a outra instância passa a 403 intencionalmente. Não preservar acesso indevido por backward compatibility.
- Nenhuma migração de dados ou dependência nova prevista; não alterar go.mod/go.sum nem código vendorizado por conveniência.
- Não alterar semântica das rotas admin ou ampliar privilégio de token de instância.
- Rollback deve preservar a proteção. Reverter para o handler vulnerável não é resolução aceitável; corrigir para frente se surgir regressão.

## Critérios de aceite

- Token A GET A e PUT A mantêm comportamento correto e chamam service somente com A.
- Token A GET B e PUT B retornam 403 antes de acessar service/repository do alvo.
- Token ausente/inválido retorna 401 pelo middleware; contexto ausente/tipo inválido/nil não provoca panic e não acessa o alvo.
- PUT para B com body inválido ainda é negado por autorização, sem tentar processar configuração de B.
- PUT para A com body inválido mantém validação atual e não realiza update.
- Responses de recusa não expõem token, dados da instância ou diferença de existência do alvo.
- Grupo/consumers admin e demais endpoints não recebem mudança de privilégio acidental.
- Diff restrito à proteção, testes necessários e documentação diretamente pertinente. Nenhum Product Vault/Claude Design alterado.

## Testes obrigatórios

Usar instâncias sintéticas A/B e doubles de InstanceService. IDs diferentes devem ser válidos no formato usado pela aplicação. Exercitar ao menos uma cadeia Gin com o middleware Auth real e ambos handlers reais; `GetInstanceByToken` pode ser stubado, sem DB/rede.

| Caso | Resultado obrigatório |
| --- | --- |
| GET e PUT próprios | Sucesso e ID A no service; body válido preservado |
| GET e PUT cruzados | 403 e contador de consultas/updates do alvo igual a zero |
| Sem token / token inválido | 401; handlers/efeitos não executados |
| Contexto ausente/tipo inesperado/nil em teste direto do guard/handler | 401 controlado e sem panic |
| PUT cruzado + JSON inválido | 403, autorização prevalece; zero update |
| PUT próprio + JSON inválido | Erro de validação atual; zero update |
| Limite admin | Registro/uso de grupo admin mantém AuthAdmin; chave de instância não ganha esse acesso |

O teste cruzado deve falhar contra o comportamento anterior e passar com a correção. Não exigir fixtures de clientes, banco de produção, credencial real nem envio de mensagem. Mocks que apenas verificam que um helper foi chamado não substituem a prova de que o service não foi acessado.

## Validação obrigatória

Executar no diretório `apps/evolution-go` com ambiente local de teste:

```text
go test ./pkg/instance/handler/... ./pkg/middleware/...
go test ./...
```

Se os testes forem colocados em outro pacote relevante, incluir esse pacote explicitamente no primeiro comando. Usar RTK quando suportar o comando e preservar resultado completo necessário ao review. Formatar somente arquivos Go alterados com gofmt. `git diff --check` e revisão de status/diff confirmam escopo.

O projeto declara Go1.25.0 e dependências nativas/CGO podem afetar execução. Se ambiente impedir suite, entregar erro exato e procedimento reproduzível; **não declarar ACCEPTED**, não esconder skip nem alterar dependências para contornar sem escopo. Astra decide correção ambiental ou complemento antes de seguir. Não executar endpoints em produção como teste.

## Entrega esperada do Claude

- Diff/commit quando autorizado pelo fluxo do usuário, lista de arquivos, explicação da falha e comportamento após mudança.
- Evidência de teste negativo falhando antes e passando depois; comandos, versões relevantes e resultados sem segredos.
- Confirmação dos consumers e de que não há migration/novo contrato/dependência.
- Riscos/limitações/descobertas fora do escopo; atualização factual de MIGRATION_STATUS para IMPLEMENTED/REVIEW_REQUIRED, nunca ACCEPTED em nome do reviewer.
- Não fazer push/merge/PR sem autorização correspondente. O Goal0 não concedeu autorização para isso.

## Não fazer

- Não implementar os demais Goals, não criar todos os prompts futuros e não fazer cleanup oportunista.
- Não comparar tokens expostos na URL, confiar na dificuldade de adivinhar UUID ou usar body.instanceId como sujeito.
- Não resolver o problema usando apikey global no frontend/cliente nem adicionando bypass admin implícito.
- Não logar credenciais, alterar produto/design ou implementar uma camada de tenant de negócio dentro do Evolution.
- Não considerar o relatório textual suficiente para aceitação: Astra deve inspecionar implementação/testes reais e reavaliar Goal002.
