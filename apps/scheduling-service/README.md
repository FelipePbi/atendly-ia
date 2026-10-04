# Scheduling Service

Representa o domínio operacional de agenda, clientes, serviços, disponibilidade, agendamentos e importação.

Consulte:

- `../../docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md`
- `../../docs/product-vault/01-Regras/06-Importacao-Minha-Agenda.md`
- `../../docs/product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md`
- `../../docs/product-vault/02-Fluxos/05-Importacao-Unica.md`

Leia também [`AGENTS.md`](AGENTS.md) para os guardrails locais. As abstrações atuais de provider e migração bidirecional são fatos do runtime e dívida técnica; não definem comportamento de produto.

## Operação: importação da Minha Agenda

A importação usa duas variáveis de ambiente (modelo em [`.env.example`](.env.example)):

- `MINHA_AGENDA_API_BASE_URL`: endereço público da API da Minha Agenda. Tem default (o host de produção).
- `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`: identificação do app do portal, usada no cabeçalho `Authorization: Basic` do login. É igual para todo negócio, fornecida pela operação da Avenly e nunca pedida ao usuário. Aceita o valor com ou sem o prefixo `Basic `.

O valor nunca entra no repositório. A integração não é oficial: pode quebrar se o portal mudar.

Sem `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, o serviço sobe normalmente (`/health` não muda) e registra um aviso (`warn`) que nomeia a variável. Os registros de operação nunca contêm o valor da variável, e-mail, senha, token nem o corpo da resposta da origem.

| Código no log | O que quer dizer | O que a pessoa vê na tela |
| --- | --- | --- |
| `MINHA_AGENDA_NOT_CONFIGURED` (`error`, por recusa) | A variável não está configurada neste ambiente. Configure-a. | Importação indisponível por uma falha da Avenly, não pelos dados informados. |
| `MINHA_AGENDA_CLIENT_REJECTED` (`error`, com `originStatus`) | O portal recusou a identificação do app configurada. Confira o valor da variável e se o portal mudou o login. | O mesmo texto de `MINHA_AGENDA_NOT_CONFIGURED`. |

`MINHA_AGENDA_AUTH_FAILED` não é registrado como erro de operação: é a senha ou o e-mail da pessoa, e a tela pede para conferi-los. Em segundo plano, `MINHA_AGENDA_CLIENT_REJECTED` também é falha nossa (`IMPORT_INTERNAL_ERROR`), e o log do trabalho traz esse código em `originCode`.
