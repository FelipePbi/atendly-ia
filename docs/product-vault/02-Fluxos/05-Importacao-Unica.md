---
title: Fluxo de Importação Única
aliases: [Fluxo Minha Agenda]
tags: [atendly, importacao, fluxo]
status: vigente
---

# Fluxo de Importação Única

```mermaid
flowchart TD
    A[Importar dados] --> B[Escolher origem]
    B --> C[Minha Agenda]
    C --> D[Explicar migração única]
    D --> E[Autenticar]
    E --> F[Analisar dados]
    F --> G[Preview por categoria]
    G --> H{Importar tudo?}
    H -->|Sim| I[Revisar conflitos relevantes]
    H -->|Escolher dados| J[Selecionar categorias]
    J --> I
    I --> K[Executar importação]
    K --> L{Pendências?}
    L -->|Sim| M[Revisar/reprocessar durante sessão]
    M --> N[Concluir importação]
    L -->|Não| N
    N --> O[Histórico + Agenda Atendly como fonte oficial]
```

## Regras de experiência

- análise não deve alterar dados antes da confirmação;
- mostrar quantidade por categoria;
- `Importar tudo` é CTA principal;
- conflitos claros são explicados em linguagem leiga;
- poucos conflitos não bloqueiam milhares de registros válidos;
- importação pode terminar com itens descartados, desde que usuário seja alertado;
- conclusão é uma decisão definitiva.

## Confirmação final

Se houver itens não importados:

> **Esta é sua única importação.**  
> Depois de concluir, não será possível importar novamente do Minha Agenda. Alguns registros não serão importados. Deseja concluir mesmo assim?

## Depois

Configurações → Importação mostra somente o histórico da migração concluída.

## Relacionado

- [[01-Regras/06-Importacao-Minha-Agenda]]
- [[02-Fluxos/01-Onboarding]]
