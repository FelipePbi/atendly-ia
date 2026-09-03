# Atendly BFF

Backend público consumido pela aplicação web Atendly.

## Contexto de produto vigente

A API pública deve suportar a experiência definida em `../../docs/product-vault/`.

Regras centrais que substituem premissas antigas:

- Agenda Atendly é a única agenda operacional;
- Minha Agenda é somente origem de uma única importação;
- não existe sincronização/reimportação/troca de fonte como comportamento de produto;
- IA usa estilos Profissional / Equilibrada / Descontraída;
- um negócio usa um único número de WhatsApp;
- inbox: Comercial / Não classificadas / Pessoal;
- estados de atendimento: IA atendendo / Aguardando você / Você atendendo.

## Superfícies de produto

O frontend precisa de capacidades para:

- autenticação e conta;
- onboarding;
- negócio/configurações;
- WhatsApp e ativação;
- Home;
- conversas;
- agenda/agendamentos;
- clientes;
- serviços;
- importação única;
- notificações;
- retenção e preferências relevantes.

Este README não define contratos HTTP ou ownership técnico. Consulte documentação técnica/código atual para esses detalhes.

## Importação

Qualquer endpoint/contrato de integração antigo deve ser interpretado à luz da regra atual:

`analisar → preview → importar → revisar pendências → concluir definitivamente`

Depois da conclusão, o produto não oferece nova importação.

## Segurança de UX

O BFF não deve induzir o frontend a:

- confirmar agendamento antes de sucesso real;
- mostrar sincronização inexistente;
- tratar erro de agenda/IA como sucesso;
- expor detalhes técnicos ao usuário final.

## Fonte de verdade

- `../../docs/product-vault/00-HOME.md`
- `AGENTS.md` local
- `../../AGENTS.md`
