---
title: Importação do Minha Agenda
aliases: [Migração Minha Agenda]
tags: [atendly, importacao, migracao]
status: vigente
---

# Importação do Minha Agenda

## Conceito

A importação é uma **migração assistida** e não uma sincronização.

O Minha Agenda serve apenas como origem de dados para mover a operação para a Atendly.

## Quando pode acontecer

- durante onboarding;
- posteriormente em Configurações, caso o negócio nunca tenha concluído uma importação.

## Quantidade

Cada negócio pode concluir apenas **uma importação**.

Falhas técnicas antes de uma conclusão não contam como uma importação consumida.

Uma importação parcial pode permanecer em andamento até o usuário decidir concluí-la.

## Fluxo

1. Escolher importação.
2. Selecionar Minha Agenda como origem disponível.
3. Explicar que não haverá sincronização permanente.
4. Informar credenciais.
5. Analisar dados sem alterar a Atendly.
6. Mostrar preview.
7. Importar tudo por padrão, com opção de escolher categorias.
8. Resolver conflitos quando necessário.
9. Executar importação.
10. Revisar pendências.
11. `Concluir importação`.
12. Exibir resultado e histórico.

## Dados desejados

Importar o máximo tecnicamente disponível, incluindo:

- serviços;
- clientes;
- horários/disponibilidade;
- agendamentos futuros;
- histórico de atendimentos;
- cancelamentos;
- faltas;
- bloqueios futuros quando disponíveis.

Se a fonte não fornecer determinada categoria, importar o restante e explicar a limitação.

## Preview

Mostrar resumo por categoria, por exemplo:

- 12 serviços
- 386 clientes
- 42 agendamentos futuros
- 1.840 atendimentos anteriores
- horários encontrados

`Importar tudo` é o caminho principal. `Escolher o que importar` é secundário.

## Clientes incompletos

- sem telefone: importar normalmente;
- sem nome, mas com telefone: importar como cadastro incompleto usando identificação temporária visível;
- mesmo telefone com nomes diferentes: não mesclar automaticamente;
- duplicata claramente idêntica: deduplicar.

## Serviços incompletos

- sem preço: `Sem preço informado`;
- sem duração: `Precisa de revisão` e indisponível para novos agendamentos da IA até correção;
- recorrência não é inferida na importação; profissional configura posteriormente.

## Agendamentos

Agendamentos futuros importados tornam-se agendamentos normais da Atendly.

Históricos devem preservar informações disponíveis, como:

- data;
- horário;
- cliente;
- serviço;
- status;
- preço quando existir.

Cancelamentos e faltas devem ser preservados quando a origem oferecer essa informação.

## Conflitos

Caso o negócio já tenha dados na Atendly:

- correspondências claras podem ser mescladas automaticamente;
- divergências relevantes exigem decisão do usuário;
- nomes semelhantes podem ser sugeridos como possíveis correspondências, mas nunca mesclados silenciosamente apenas por semelhança.

Conflitos não precisam bloquear milhares de registros válidos.

O usuário pode deixar um item fora da importação e concluir, mas deve receber aviso forte de que não poderá importar novamente depois.

## Conclusão

Antes de concluir definitivamente, se houver pendências:

> Esta é sua única importação. Depois de concluir, não será possível importar novamente do Minha Agenda. Existem registros não importados. Deseja concluir mesmo assim?

Depois:

> **Importação concluída**  
> Seus dados agora estão na Atendly. A partir deste momento, sua agenda deve ser gerenciada por aqui. Alterações futuras no Minha Agenda não serão refletidas na Atendly.

## Histórico

Configurações → Importação continua mostrando:

- origem;
- data;
- quantidade importada por categoria;
- itens ignorados/falhos;
- status final.

Não existe CTA de nova importação.
