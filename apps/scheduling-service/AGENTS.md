# AGENTS.md — Scheduling Service

## Fonte de produto

Leia `../../docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md` e `06-Importacao-Minha-Agenda.md` antes de alterar comportamento de agenda.

## Premissa central

**Agenda Atendly é a única agenda operacional oficial.**

Minha Agenda não é uma alternativa de runtime. Ela existe apenas como origem de uma importação concluída uma única vez por negócio.

Não trate como requisito atual:

- source switching;
- provider ativo por tenant;
- sincronização;
- reimportação;
- Agenda Atendly → Minha Agenda.

Se o código atual ainda possui abstrações antigas para esses conceitos, sua remoção/refatoração é decisão técnica separada; não continue expandindo a premissa antiga por necessidade de produto.

## Regras de agenda

- disponibilidade semanal por dias/horários;
- bloqueios e compromissos pessoais ocupam agenda;
- disponibilidade extra pode abrir exceções;
- multi-serviço soma duração;
- serviço inativo não cria novo atendimento pela IA;
- humano pode forçar sobreposição com alerta;
- IA nunca cria encaixe;
- hold de 5 minutos durante confirmação;
- remarcação preserva o horário antigo até confirmação do novo;
- cancelamento preserva histórico;
- agendamentos preservam valores/duração acordados quando catálogo muda.

## Recorrência

Recorrência pertence ao serviço como frequência padrão.

Quando cliente pede múltiplas próximas ocorrências, a IA usa essa frequência para procurar opções e apresenta o conjunto antes de confirmar.

Depois de criados, os agendamentos são operacionais independentes; não criar experiência de série infinita por requisito de produto.

## Importação

Uma única migração pode trazer serviços, clientes, disponibilidade, futuros e histórico do Minha Agenda.

Depois de `Concluir importação`, não existe nova importação.
