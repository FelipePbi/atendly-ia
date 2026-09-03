# AI Workflow — documentação, Graphify e RTK

Este documento detalha a política resumida em [`../CLAUDE.md`](../CLAUDE.md). Ele é **consultado sob demanda**, não carregado por padrão.

## Divisão de responsabilidades

| Fonte | Responde | Não responde |
| --- | --- | --- |
| `docs/product-vault/` | o que o produto deve fazer, para quem, com qual copy e qual regra | como o código está estruturado |
| `docs/` fora do vault + `AGENTS.md`/README dos apps | arquitetura conceitual, contratos, decisões técnicas, limites de cada app | detalhe de implementação atual |
| Graphify | onde está implementado, quais símbolos e dependências existem | qual é a regra de produto correta |
| RTK | execução de shell, testes, build, git, busca textual com pouco output | qualquer decisão de produto ou arquitetura |

Uma tarefa pode usar mais de uma fonte. Use Graphify e documentação juntos quando precisar confrontar intenção com implementação.

## Fluxo padrão

1. entender a tarefa;
2. classificar a necessidade — produto? arquitetura? código? shell?;
3. consultar **apenas** a fonte necessária;
4. implementar;
5. validar (testes/build via RTK);
6. verificar impacto documental;
7. atualizar somente os documentos afetados.

## Busca seletiva no vault

O vault (`docs/product-vault/`) é um Obsidian Vault: notas interligadas por `[[wikilinks]]`.

1. busque o **conceito** (`rtk grep` / busca por título) em vez de abrir pastas inteiras;
2. identifique o menor conjunto de arquivos plausíveis;
3. leia 1 arquivo; leia +1/+2 relacionados só se a dúvida continuar.

Siga um `[[link]]` apenas quando ele puder resolver uma dúvida necessária à tarefa atual. Não percorra backlinks automaticamente.

Evite: busca → 15 arquivos → contexto enorme.

## Roteamento por tema

| Tema | Ponto de entrada |
| --- | --- |
| Visão, escopo do MVP, público | `product-vault/00-Produto/` |
| Navegação e módulos | `product-vault/00-Produto/04-Navegacao-e-Modulos.md` |
| Regras centrais de negócio | `product-vault/01-Regras/01-Regras-de-Negocio.md` |
| Agenda, disponibilidade, agendamento, remarcação | `product-vault/01-Regras/02-Agenda-e-Agendamentos.md` + `product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md` |
| IA, estilos, conversas, handoff | `product-vault/01-Regras/03-IA-e-Conversas.md` + `product-vault/02-Fluxos/04-Handoff-e-Atendimento-Humano.md` |
| Clientes e memória | `product-vault/01-Regras/04-Clientes-e-Memoria.md` |
| WhatsApp, ativação, contatos ignorados | `product-vault/01-Regras/05-WhatsApp.md` + `product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md` |
| Importação da Minha Agenda | `product-vault/01-Regras/06-Importacao-Minha-Agenda.md` + `product-vault/02-Fluxos/05-Importacao-Unica.md` |
| Lembretes, notificações, instabilidade | `product-vault/01-Regras/07-Lembretes-Notificacoes-e-Instabilidade.md` |
| Privacidade, retenção, dados do cliente | `product-vault/01-Regras/08-Privacidade-e-Retencao.md` |
| Onboarding | `product-vault/02-Fluxos/01-Onboarding.md` + `product-vault/03-UX-UI/03-Onboarding-UX.md` |
| UX, responsividade, telas, design system, copy | `product-vault/03-UX-UI/` |
| Termo desconhecido | `product-vault/04-Referencia/01-Glossario.md` |
| "Isso não foi decidido diferente antes?" | `product-vault/04-Referencia/02-Decisoes-Substituidas.md` e `product-vault/04-Referencia/99-Perguntas-e-Respostas.md` |
| Prototipação visual | `UI_UX_PROTOTYPE_GUIDELINES.md` |
| Trabalho técnico de alinhamento | `PLANO_REFATORACAO.md` |
| Contrato HTTP registrado hoje | `../apps/bff/PUBLIC_API_V1.md` |
| ADRs / decisões arquiteturais | `architecture/` |

Se nenhuma entrada servir, comece por `product-vault/00-HOME.md` e escolha **um** caminho.

## Dúvida arquitetural

1. procure a documentação arquitetural relevante;
2. procure ADRs/decisões relacionadas em `architecture/`;
3. consulte o product vault se envolver domínio ou produto;
4. use Graphify para confrontar com a implementação real;
5. abra somente os arquivos de código identificados.

Não tente reconstruir a arquitetura lendo o repositório inteiro.

## Documentação x código divergentes

Regra documentada explicitamente = intenção de produto. Se o código divergir, não escolha um lado em silêncio. Determine se:

- o código está desatualizado;
- a documentação está desatualizada;
- houve mudança incompleta;
- existe decisão mais recente em outro documento.

Resolva dentro do escopo da tarefa quando possível; caso contrário, informe a divergência.

## Quando atualizar documentação

Atualize quando a alteração mudar arquitetura, regra de negócio, contrato, integração, fluxo, domínio, comportamento do usuário, API, persistência, configuração estrutural, decisão técnica ou feature documentada. Não espere pedido explícito.

**Não** atualize por: refactor puramente interno, rename local sem impacto conceitual, formatação, lint, typo em código, teste sem mudança de comportamento, ou implementação que apenas adequa o código ao comportamento já documentado.

Critério único: *essa alteração faz algum documento atual mentir, ficar incompleto ou induzir ao erro?*

### Mudança arquitetural

1. atualize o documento arquitetural existente;
2. atualize o ADR, se aplicável;
3. atualize as notas relacionadas pelos links necessários;
4. preserve o histórico da decisão quando relevante — marque como `superseded`/`deprecated` em vez de apagar, registrando em `product-vault/04-Referencia/02-Decisoes-Substituidas.md` quando for decisão de produto.

### Novos conceitos

Crie nota nova apenas quando houver valor de longo prazo: conceitos, decisões, contratos, regras, fluxos, arquitetura. Não documente classe, função ou componente individualmente.

Antes de criar um `.md`, verifique se o assunto já está documentado e prefira atualizar o arquivo existente a criar `Feature-v2-final-new.md`. Uma fonte de verdade por assunto.

Adicione `[[wikilinks]]` apenas quando a relação for relevante — não transforme toda menção em link.

## Checklist de conclusão

- [ ] código validado;
- [ ] testes relevantes executados;
- [ ] documentação afetada identificada;
- [ ] docs atualizados quando necessário;
- [ ] links relacionados continuam válidos;
- [ ] nenhuma documentação ficou evidentemente obsoleta.

## Não fazer

- carregar o vault inteiro ou ler todos os `.md` preventivamente;
- atualizar timestamps sem mudança real;
- gerar documentação automática gigantesca ou duplicar código dentro de docs;
- criar arquivos de documentação sem necessidade;
- rodar Graphify profundo apenas para entender regra já documentada;
- atualizar documentos não relacionados à tarefa.

## Comandos essenciais

```bash
# Produto (Obsidian vault) — busca dirigida, sem abrir a pasta inteira
rtk grep "remarcação" docs/product-vault

# Código — sempre começando pelo budget menor
graphify query "onde a remarcação é aplicada" --budget 800
graphify explain "AppointmentService"
graphify affected "publicApiSchemas.ts"

# Manutenção do grafo (AST, sem custo de LLM); os hooks git já fazem isso sozinhos
graphify update .
graphify hook status

# Shell verboso — o hook PreToolUse já reescreve; use explicitamente quando quiser garantir
rtk git diff
rtk test
rtk gain
```

## Troubleshooting mínimo

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `rtk gain` não existe | binário errado (Rust Type Kit) | reinstalar de `rtk-ai/rtk` |
| Comandos não são reescritos | hook ausente | `rtk init --show`; hook fica em `~/.claude/settings.json` |
| `graphify query` sem resultado | grafo defasado ou caminho ignorado | `graphify update .`; conferir `.graphifyignore` |
| Grafo não atualiza após commit | hook git ausente ou Python errado | `graphify hook status`; reinstalar com `graphify hook install` |
| Vault não abre no Obsidian | pasta errada | abrir `docs/product-vault` como vault (config em `.obsidian/`) |

> Nota sobre os hooks do Claude Code: `.claude/settings.json` mantém apenas o guard de busca do Graphify (`Bash|Grep`). O guard de `Read|Glob` foi removido de propósito — ele injeta "use Graphify antes de ler" em *toda* leitura, inclusive de notas do vault, o que contraria o roteamento acima e cobra tokens em leituras pequenas e dirigidas. Se você rodar `graphify claude install` de novo, ele volta: remova-o outra vez.

Graphify indexa **código**; o vault é o grafo de **produto**. Nunca exporte Graphify por cima de `docs/product-vault/` — a visualização técnica é `graphify-out/graph.html`.
