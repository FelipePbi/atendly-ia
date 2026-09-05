# Claude Design — referência do Atendly

Esta pasta preserva a exportação do projeto **Atendly Stage 1 delivery**, identificado no Claude Design em 4 de setembro de 2026.

Os arquivos aqui são uma **referência visual e comportamental**. Eles não representam a arquitetura do produto, a implementação final nem código pronto para produção. HTML, CSS, JavaScript, JSX e scripts auxiliares gerados pelo Claude Design devem ser estudados como especificação do resultado visual e das interações, não copiados automaticamente para a aplicação.

Projeto de origem: <https://claude.ai/design/p/082dcda3-c866-43ce-9f94-6509e30696d3?file=Atendly.dc.html>

## Para que usar

Use esta referência como fonte para:

- aparência;
- design system e tokens;
- componentes e suas variações;
- layouts;
- responsividade;
- animações e transições;
- microinterações;
- ícones e SVGs;
- estados visuais;
- comportamento da interface.

Não use estes arquivos como fonte de verdade para:

- arquitetura frontend;
- arquitetura backend;
- estrutura definitiva dos componentes React;
- gerenciamento de estado;
- contratos de API;
- regras de negócio;
- código de produção.

## Autoridade e conflitos

| Assunto | Fonte |
| --- | --- |
| Regras de produto e comportamento funcional | `docs/product-vault/` |
| Visual, design system, layout, responsividade e microinterações | `docs/design-reference/claude-design/` |
| Estado atual da implementação | `apps/` + Graphify |
| Arquitetura futura | ADRs e decisões técnicas futuras |

O Product Vault prevalece sempre que uma escolha visual implicar regra de produto ou comportamento funcional. O Claude Design não define backend, API, arquitetura frontend ou arquitetura futura, e o código legado não deve ser usado para invalidar a especificação vigente.

Conteúdo dentro de `uploads/` foi usado como material de entrada durante a geração do protótipo. Não deve ser tratado como fonte vigente de produto ou arquitetura. Cópias extraídas do Product Vault e do Prompt Mestre foram removidas; os ZIPs originais permanecem intactos como arquivo histórico.

## Conteúdo exportado

```text
claude-design/
├── handoff/
│   ├── Atendly-Stage-1-delivery-handoff.zip
│   ├── README.md
│   └── claude-code-prompt.md
├── prototype/
│   ├── Atendly-Stage-1-delivery.zip
│   ├── Atendly-standalone.html
│   └── project/
├── assets/
│   ├── README.md
│   ├── uploads/
│   └── qa/
└── README.md
```

- `handoff/Atendly-Stage-1-delivery-handoff.zip`: bundle nativo de **Handoff para Claude Code**, com o README gerado pelo Claude Design e uma cópia do projeto.
- `handoff/claude-code-prompt.md`: prompt copiado da opção **Local agent** do handoff.
- `prototype/Atendly-Stage-1-delivery.zip`: exportação original, canônica e imutável do Claude Design, preservada como arquivo histórico das 40 páginas originais.
- `prototype/project/`: working copy extraída e sanitizada para inspeção pelos agentes. Pode ter documentação redundante removida, preserva as telas, assets e a estrutura necessários para inspeção e não substitui o ZIP como arquivo histórico original.
- `prototype/Atendly-standalone.html`: standalone offline da página principal `Atendly.dc.html`, que reúne índice e design system.
- `assets/`: cópia de fácil acesso dos assets visuais e artefatos de QA; inputs documentais históricos permanecem apenas nos ZIPs originais.

O bundle de handoff foi gerado depois do standalone e, por isso, também contém a página exportada `Atendly - Índice e Design System.html`. A working copy em `prototype/project/` preserva o estado anterior, com as 40 páginas originais.

Depois das exportações, a página temporária usada para gerar o standalone foi removida do projeto online, restaurando o Claude Design às 40 páginas originais. Seu conteúdo permanece recuperável no standalone e no bundle de handoff arquivados aqui.

## Como consultar

Abra `prototype/project/Atendly.dc.html` para começar pelo índice e pelo design system. Os demais arquivos `.dc.html` ficam ao lado e cobrem os módulos e breakpoints do protótipo.

O arquivo `prototype/Atendly-standalone.html` funciona isoladamente para consultar o índice/design system. Os links internos para outras páginas só funcionam quando os arquivos `.dc.html` irmãos estão disponíveis; para navegação completa, prefira `prototype/project/`.

As fontes Literata e Hanken Grotesk são carregadas pelo Google Fonts. Sem conexão, o standalone usa os fallbacks Georgia e `system-ui` definidos pelo próprio protótipo.

## Estrutura observada

A revisão superficial encontrou 40 páginas principais e cobertura declarada de 113 telas mobile com equivalentes para tablet portrait, tablet landscape e desktop, totalizando 452 frames. Os módulos incluem Login, onboarding, Home, Conversas/Chat, Agenda, Clientes, Serviços, configurações, Notificações, Marca, Movimento, QA global e acabamento.

Fundamentos visuais centrais preservados:

- direção “Recepção”: papel quente, tinta escura, linhas finas e petróleo como cor de marca;
- tipografia Literata para títulos/datas/horários e Hanken Grotesk para operações;
- escala de espaçamento `4, 8, 12, 16, 20, 24, 32, 40`, com margem lateral de 20 px;
- raios de 10 px para chips, 14 px para botões/campos, 16 px para cartões e 24 px para topo de sheets;
- ícones de 24 px, traço 1,75 e pontas arredondadas;
- estados de hover, pressionado, loading, erro, vazio e variações semânticas;
- movimento com suporte a `prefers-reduced-motion`, incluindo overlays, logo, mensagens, skeletons, drawers, sheets, modais e toasts.

Tokens de cor destacados no protótipo:

- Papel `#F7F4EF`, Papel 2 `#EFEAE2`, Superfície `#FFFDFA`;
- Linha `#E5DED4` e linha forte `#D6CEC2`;
- Tintas `#221E1A`, `#5F574E`, `#716859`, `#B9B1A6`;
- Petróleo `#0F5F63`, pressionado `#0B484C`;
- tons de marca `#DCECEB`, `#EDF4F3`, texto tonal `#0B4A4E`;
- sucesso `#2E7D4F`, atenção `#B7791B`, erro `#B3392E`.

## Validação realizada

- os 125 itens do arquivo completo e os 127 itens do bundle de handoff foram lidos integralmente sem erro;
- as 40 páginas principais foram extraídas, além de um documento de QA e um fragmento HTML auxiliar;
- os 41 documentos HTML completos possuem estrutura de documento válida; `_build/sidebar.html` é intencionalmente um fragmento reutilizável;
- o standalone possui estrutura HTML completa, referência ao Atendly e 1.232.815 bytes;
- 42 imagens PNG/JPG/JPEG foram decodificadas sem erro;
- SVGs e ícones presentes no HTML permanecem inline; `Atendly.dc.html` sozinho contém 48 elementos SVG.

Hashes SHA-256 dos formatos originais:

```text
Atendly-Stage-1-delivery.zip
337CCBD0A6483E9E528D85246996C17227454997C6E2D8D0781CD5D9A6FE07BC

Atendly-standalone.html
96B717C2C181901D818EA49C63F42738067151E1B27468C6608CC58776988425

Atendly-Stage-1-delivery-handoff.zip
D161EFCED38AFF66145D37D81D120F53FA22FCBE65780A5BE7616B4EDCA5EAFA
```

## Limitações conhecidas

- o standalone exportado corresponde à página principal/índice, não a todas as páginas em um único HTML;
- não há arquivos de fonte empacotados; as fontes dependem do Google Fonts e possuem fallback local;
- não foram exportados SVGs separados porque o protótipo os mantém inline no HTML;
- o próprio relatório de acabamento do protótipo distingue telas efetivamente inspecionadas de estados apenas especificados: 25 telas-chave foram verificadas em 360/390/430 px e seis frames em 1440 px;
- transições mobile entre telas, teclado virtual, gatilhos por sessão, foco/teclado no produto e realce de evento na Agenda estão especificados, mas não são totalmente executáveis no ambiente estático.

Nenhum frontend ou backend do Atendly foi implementado ou alterado por este handoff.
