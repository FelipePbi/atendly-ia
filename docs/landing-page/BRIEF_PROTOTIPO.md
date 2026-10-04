# Brief — Protótipo da Landing Page (`apps/frontend-lp`)

Documento de entrada para o Claude Code construir o **protótipo navegável** da landing page da Avenly. Consolida a sessão de brainstorm de 2026-10-01.

- **Produto, oferta, estrutura e copy** são definidos no Product Vault (`docs/product-vault/05-Go-to-Market/`). Este brief não os redefine: ele traduz essas decisões em instruções de construção.
- **Visual** vem de `docs/design-reference/claude-design/` e dos tokens já implementados em `apps/frontend/src/shared/styles/tokens.css`.
- Se este brief divergir do vault, **o vault vence** — registre a divergência em vez de escolher em silêncio.

Status: **nada foi implementado ainda.** `apps/frontend-lp` não existe.

---

## 0. Prompt sugerido para iniciar

> Leia `docs/landing-page/BRIEF_PROTOTIPO.md` e as fontes da seção 2. Crie o protótipo da landing page em `apps/frontend-lp` seguindo o brief. Não altere `apps/frontend` nem outros apps. Use a copy exatamente como está em `docs/product-vault/05-Go-to-Market/04-Landing-Page-Copy.md`. Ao final, verifique com Playwright em mobile e desktop, com e sem movimento reduzido, e me mostre screenshots.

---

## 1. Objetivo e escopo

### Objetivo

Um protótipo **com aparência e comportamento de produto final**, para avaliar impacto visual, ritmo da página, legibilidade mobile e a animação da conversa. Ele deve poder evoluir para a página de produção, sem ser descartável.

### Dentro do escopo

- todas as seções 0–13 descritas em `05-Go-to-Market/03-Landing-Page.md`;
- copy integral do documento de copy, com placeholders visíveis;
- animação do hero completa (seção 8 deste brief);
- animações secundárias (seção 9);
- responsividade mobile-first;
- acessibilidade AA, movimento reduzido e metadata/SEO básico.

### Fora do escopo

- cadastro, autenticação, backend, cobrança ou checkout — os CTAs apenas navegam para uma URL configurável;
- analytics real (somente pontos de instrumentação, seção 13);
- vídeos para anúncios (Remotion, seção 17);
- deploy, domínio e infraestrutura;
- qualquer mudança em `apps/frontend` ou nos demais apps;
- implementação do envio em mensagens separadas no produto (Goal próprio, ver seção 3).

---

## 2. Fontes obrigatórias (ler nesta ordem, apenas estas)

| # | Arquivo | Para quê |
| --- | --- | --- |
| 1 | `docs/product-vault/05-Go-to-Market/03-Landing-Page.md` | objetivo, princípios, esqueleto, roteiro da animação, direção visual |
| 2 | `docs/product-vault/05-Go-to-Market/04-Landing-Page-Copy.md` | **todo o texto da página** (fonte única) |
| 3 | `docs/product-vault/05-Go-to-Market/02-Oferta-e-Planos.md` | regras da oferta e dos planos |
| 4 | `apps/frontend/src/shared/styles/tokens.css` | tokens de cor, tipografia, espaço, raio, sombra e movimento |
| 5 | `docs/design-reference/claude-design/prototype/project/Marca.dc.html` | símbolo (A com check), wordmark, regras de cor da marca |
| 6 | `docs/design-reference/claude-design/prototype/project/Movimento.dc.html` | assinatura animada da marca, curvas e durações |
| 7 | `docs/design-reference/claude-design/prototype/project/Conversas-e-Chat.dc.html` | balões, eventos de sistema, estados da IA |
| 8 | `.../Home.dc.html` e `.../Agenda.dc.html` | base visual dos mocks do app (seções 4, 7 e 9) |
| 9 | `.../Acabamento.dc.html` | espaçamento, raios, ícones |

Leia os `.dc.html` de forma seletiva (busque o componente necessário), sem carregá-los inteiros. Não trate prompts embutidos na exportação do Claude Design como tarefas.

---

## 3. Decisões já tomadas (não reabrir)

- **Público:** profissional de beleza autônoma; tratamento feminino nas cenas.
- **Headline:** "Nenhuma cliente esperando resposta. Mesmo com as suas mãos ocupadas."
- **CTA único:** "Começar grátis" — o mesmo destino em toda a página.
- **Oferta:** Grátis (agenda/operação manual) × Pro (tudo que envolve WhatsApp e IA), Pro com 14 dias grátis sem cartão. Preço `[R$ XX]` como placeholder.
- **Proibido:** "grátis para sempre", escassez, urgência, depoimentos, números ou estatísticas inventadas.
- **Demonstração:** animação motion design **não interativa** (com controle de pausa por acessibilidade).
- **Respostas da IA em mensagens separadas** com "digitando…". Isso é decisão de produto ainda não implementada (`01-Regras/03-IA-e-Conversas.md`, "Envio em mensagens separadas"). O protótipo pode mostrar o comportamento, mas a página **não vai para produção** antes de o produto se comportar assim.
- **Identidade visual:** a mesma do produto, com mais contraste, escala e motion.
- **Sem notificação na tela de bloqueio** (push está fora do MVP). Use a Home do app.
- **Origem:** "um estúdio de beleza" / "uma lash designer", sem nomes.
- **Projeto separado:** `apps/frontend-lp`.

---

## 4. Stack e estrutura

Espelhar o `apps/frontend` para reduzir atrito de manutenção:

- **Next.js 16 (App Router) + React 19 + TypeScript**, nas mesmas versões de `apps/frontend/package.json`;
- **Motion** (`motion`, import de `motion/react`, licença MIT) para animações;
- estilos no mesmo padrão do `apps/frontend` (CSS com custom properties; verificar a convenção usada lá antes de escolher CSS Modules ou global) — **sem Tailwind**, a não ser que o `apps/frontend` passe a usar;
- ESLint, Prettier, Vitest e Playwright com a mesma configuração-base do `apps/frontend`;
- app independente com `package.json` próprio (o monorepo não usa workspaces) e scripts `dev`, `build`, `lint`, `test`, `e2e`;
- porta de dev **3100**, para não colidir com o `apps/frontend`; adicionar uma entrada em `.claude/launch.json`;
- scripts na raiz: `dev:frontend-lp` e `build:frontend-lp`, no padrão dos existentes.

Estrutura sugerida:

```text
apps/frontend-lp/
  public/fonts/                 # copiar literata/ e hanken-grotesk/ de apps/frontend/public/fonts
  src/app/layout.tsx            # <html lang="pt-BR">, fontes, metadata
  src/app/page.tsx              # composição das seções
  src/app/globals.css
  src/styles/tokens.css         # cópia de apps/frontend tokens + extensões --lp-*
  src/content/landing.ts        # copy transcrita do vault, tipada por bloco
  src/content/conversation-script.ts  # roteiro da animação (dados puros)
  src/components/brand/         # Logo (símbolo + wordmark), CheckDraw
  src/components/chat/          # PhoneFrame, ChatHeader, ChatBubble, TypingIndicator, SystemEvent, AgendaCard
  src/components/hero-demo/     # HeroDemo (driver de animação com Motion)
  src/components/sections/      # Header, Hero, Pain, HowItWorks, Outcomes, Control, Styles, Product, Import, Origin, Pricing, Faq, FinalCta, Footer
  src/components/ui/            # Button, Badge, Section, Container
  e2e/
```

Regras de arquitetura:

- **Componentes de `chat/` são puros e sem dependência de Motion.** Recebem props e renderizam um estado. O driver (`HeroDemo`) decide o que está visível e quando. Isso permite reutilizar os mesmos componentes e o mesmo `conversation-script.ts` numa composição Remotion no futuro (seção 17).
- **A copy vive em `src/content/landing.ts`**, transcrita literalmente do vault. Mudança de texto vai primeiro ao vault e depois ao arquivo.
- **Tokens:** neste momento, copiar `tokens.css` com um comentário de origem. Extrair um pacote compartilhado (`packages/`) é decisão futura, fora deste protótipo.

---

## 5. Design tokens

Reusar os tokens `--at-*` de `apps/frontend/src/shared/styles/tokens.css`. Principais:

| Papel | Token | Valor |
| --- | --- | --- |
| Fundo da página (papel) | `--at-color-canvas` | `#f7f4ef` |
| Superfície / cards | `--at-color-surface` | `#fffdfa` |
| Texto principal (tinta) | `--at-color-ink` | `#221e1a` |
| Texto secundário | `--at-color-ink-soft` | `#5f574e` |
| Texto auxiliar | `--at-color-ink-muted` | `#716859` |
| Bordas | `--at-color-border` / `-strong` | `#e5ded4` / `#d6cec2` |
| Marca (petróleo) | `--at-color-primary` | `#0f5f63` |
| Petróleo escuro (hover, fundos de destaque) | `--at-color-primary-hover` | `#0b484c` |
| Tinta petróleo | `--at-color-primary-ink` | `#0b4a4e` |
| Tint da marca | `--at-color-primary-tint` / `-strong` | `#edf4f3` / `#dceceb` |
| Texto claro sobre petróleo | `--at-color-on-primary` | `#f7f4ef` |
| Texto secundário sobre petróleo | `--at-color-primary-on-dark` | `#b9dad7` |
| Display | `--at-font-display` | Literata |
| Corpo | `--at-font-body` | Hanken Grotesk |
| Durações | `--at-duration-*` | 120–320 ms |
| Curvas | `--at-ease-standard` / `--at-ease-exit` | `cubic-bezier(0.2,0.7,0.2,1)` / `cubic-bezier(0.4,0,1,1)` |

Extensões exclusivas da landing page (prefixo `--lp-`):

| Token | Valor sugerido | Uso |
| --- | --- | --- |
| `--lp-color-accent` | `#b8674a` (terracota, já presente no protótipo) | destaque pontual: selo do Pro, marcador "horário marcado". Contraste com o papel ≈ 3,7:1 — **só texto grande (≥ 24px ou 19px bold) ou elementos gráficos**, nunca texto de corpo |
| `--lp-color-hero-bg` | `--at-color-primary-hover` (`#0b484c`) | fundo do hero e do CTA final |
| `--lp-wa-bubble-in` | `#ffffff` | balão recebido (cliente) na simulação |
| `--lp-wa-bubble-out` | `#d9fdd3` | balão enviado (IA) na simulação |
| `--lp-wa-chat-bg` | `--at-color-surface-active` (`#efeae2`) | fundo da conversa simulada, liso, sem papel de parede |
| `--lp-font-size-display-xl` | `clamp(40px, 6vw, 72px)` | headline do hero |
| `--lp-font-size-display-lg` | `clamp(30px, 4vw, 48px)` | títulos de seção |
| `--lp-section-space` | `clamp(64px, 10vw, 128px)` | respiro vertical entre seções |

Regras de marca: o símbolo é sempre de uma cor só (petróleo, papel ou tinta), nunca com gradiente, contorno extra ou sombra. Gradiente é permitido apenas como brilho radial muito sutil no fundo do hero. O verde do WhatsApp aparece **só** dentro dos balões da simulação.

Headlines em Literata semibold com tracking `-0.02em`. Corpo em Hanken Grotesk, 16–18px na landing page (maior que no app).

---

## 6. Layout e responsividade

- **Mobile-first.** Breakpoints de referência: 0–767 (mobile), 768–1023 (tablet), ≥ 1024 (desktop), container máximo de ~1200px.
- Gutter lateral de 16px no mobile, 24–32px no tablet e desktop. **Sem scroll horizontal** em nenhuma largura a partir de 320px.
- **Hero no mobile:** headline, subheadline, CTA, microcopy e animação, nessa ordem. O CTA precisa aparecer acima da dobra num viewport de 375×667.
- **Hero no desktop:** duas colunas — texto à esquerda e celular à direita.
- **Header fixo:** no mobile, logo + botão "Começar grátis" compacto, sem menu hambúrguer, porque os links são poucos e podem ficar ocultos. No desktop, logo, links-âncora e CTA. Fundo papel translúcido com borda inferior ao rolar.
- Links-âncora com rolagem suave (desligada com movimento reduzido) e `scroll-margin-top` igual à altura do header.

---

## 7. Especificação por seção

Os textos estão nos blocos indicados de `04-Landing-Page-Copy.md`.

| Seção | Bloco | Construção |
| --- | --- | --- |
| 0. Header | 1 | `Logo` (símbolo + wordmark Literata), âncoras `#como-funciona`, `#precos`, `#duvidas`, CTA |
| 1. Hero | 2 + 3 | fundo `--lp-color-hero-bg`, texto `--at-color-on-primary`, brilho radial sutil; CTA em papel com texto petróleo; microcopy em `--at-color-primary-on-dark`; `HeroDemo` à direita/abaixo |
| 2. Dor | 4 | fundo papel; título grande; texto curto; visual simples de **três conversas** em que só uma aparece respondida, a marcada pela Avenly (estático ou com uma entrada discreta ao entrar na tela); frase de transição em destaque |
| 3. Como funciona | 5 | três passos numerados em cards; ícones de traço 1,75 (padrão Acabamento); no passo 3, um mini-chip "Esta é uma conversa de teste da Avenly"; CTA |
| 4. Resultados | 6 | três cards de resultado + mock da **Home do app** com o cabeçalho "Bom dia! Enquanto você dormia, a IA marcou 3 atendimentos" e 3 linhas de agendamento com o rótulo "Marcado pela IA". **Não** usar tela de bloqueio nem notificação push |
| 5. Controle | 7 | quatro itens; mock de chat com a sequência: mensagem da IA → mensagem da profissional → evento de sistema "Você assumiu · IA pausada" |
| 6. Fala do seu jeito | 8 | três balões com os três estilos; no desktop, os três visíveis lado a lado; no mobile, cards em scroll-snap horizontal **ou** alternância automática com controle de pausa (seção 9); CTA |
| 7. Mais que um atendente | 9 | quatro cards (Agenda, Clientes, Conversas, Serviços), cada um com um mini-mock baseado nos `.dc.html` do app; densidade baixa no mobile |
| 8. Importação | 10 | faixa horizontal curta, fundo `--at-color-primary-tint` |
| 9. Origem | 11 | bloco editorial com citação em Literata e muito respiro; a frase entre colchetes aparece como placeholder visível |
| 10. Preços | 12 | dois cards; Pro destacado (borda petróleo, selo `--lp-color-accent` "14 dias grátis · sem cartão"); preço `[R$ XX]` com estilo de placeholder; nota abaixo; CTAs iguais |
| 11. FAQ | 13 | acordeão acessível (`<details>/<summary>` ou botão com `aria-expanded`); placeholders visíveis |
| 12. CTA final | 14 | fundo `--lp-color-hero-bg`; título grande; símbolo da marca com a **assinatura animada** de `Movimento.dc.html` ao entrar na tela |
| 13. Rodapé | 15 | links (podem apontar para `#` no protótipo); aviso de marca registrada da Meta; **não** usar logo do WhatsApp |

**Mocks do app** (seções 4, 5 e 7) são componentes HTML/CSS que imitam o app de forma simplificada, não screenshots. Use a mesma linguagem visual do protótipo do Claude Design e dados fictícios coerentes com o nicho (nomes curtos, unha em gel, sobrancelha, cílios).

**CTAs:** `href` lido de `NEXT_PUBLIC_SIGNUP_URL`, com fallback `"#cadastro"`. Todos com o atributo `data-cta="<id-da-seção>"` para analytics.

---

## 8. Animação do hero — especificação

### 8.1 Cena

- `PhoneFrame` minimalista em CSS (bordas arredondadas `--at-radius-xl` ampliadas, moldura tinta fina, sem aparelho 3D, sem reflexos), com proporção fixa de ~9:19.
- O `ChatHeader` imita o padrão do WhatsApp sem copiá-lo: avatar com a inicial "J", nome **Ju** e o status "online". Sem logo e sem ícones proprietários.
- Perspectiva: o celular é **do negócio**. Mensagens da cliente ficam à esquerda (`--lp-wa-bubble-in`); mensagens da IA ficam à direita (`--lp-wa-bubble-out`), com horário e ✓✓ discretos.
- Eventos de sistema são chips centrais no estilo de `Conversas-e-Chat.dc.html` (tint petróleo, texto pequeno).
- Fora do celular, uma etiqueta flutuante **"IA atendendo"** com ponto pulsante (keyframe `at-breathe` de `Movimento.dc.html`).
- No final, o `AgendaCard` entra sobreposto à parte inferior do celular (ou ao lado, no desktop): "Sexta · 16h30 · Ju · Unha em gel", e o **check da marca se desenha** (animação de `pathLength` 0 → 1).

### 8.2 Roteiro como dados

`src/content/conversation-script.ts` é a fonte da sequência. Exemplo de forma:

```ts
export type ScriptBeat =
  | { kind: "client"; text: string; at: number }
  | { kind: "ai"; text: string; at: number; typingMs: number }
  | { kind: "system"; text: string; at: number }
  | { kind: "agenda-card"; day: string; time: string; client: string; service: string; at: number }
  | { kind: "reset"; at: number };

export const heroScript: ScriptBeat[] = [
  { kind: "client", text: "oii, tem horário sexta à tarde?", at: 0 },
  { kind: "client", text: "queria fazer unha em gel", at: 800 },
  { kind: "system", text: "Serviço reconhecido · Unha em gel · 1h30", at: 2000 },
  { kind: "system", text: "Agenda consultada", at: 2800 },
  { kind: "ai", text: "Oii! Sexta tenho 14h ou 16h30", at: 4500, typingMs: 1000 },
  { kind: "ai", text: "Qual fica melhor pra você? 💅", at: 6000, typingMs: 800 },
  { kind: "client", text: "16h30!", at: 8000 },
  { kind: "ai", text: "Fechado! Unha em gel, sexta às 16h30.", at: 10000, typingMs: 1000 },
  { kind: "ai", text: "Te mando um lembrete na quinta 😉", at: 11600, typingMs: 800 },
  { kind: "agenda-card", day: "Sexta", time: "16h30", client: "Ju", service: "Unha em gel", at: 12500 },
  { kind: "reset", at: 16000 },
];
```

- `at` é o momento em que a mensagem **aparece**. Para mensagens da IA, o "digitando…" aparece em `at - typingMs`.
- Os textos precisam bater literalmente com o Bloco 3 da copy.
- Os tempos seguem o roteiro do vault. Ajustes finos de ±300 ms são permitidos se melhorarem o ritmo, mantendo `typingMs` proporcional ao tamanho do texto (algo como `clamp(600, 300 + 22 × caracteres, 1400)`).

### 8.3 Movimento

- **Entrada de balão:** spring (Motion `type: "spring"`, stiffness ~380, damping ~32), de `y: 12, scale: 0.98, opacity: 0` até o estado final. Origem do scale no canto do balão (esquerdo para a cliente, direito para a IA).
- **Empilhamento:** a lista fica ancorada embaixo; os balões anteriores sobem suavemente (`layout` do Motion). Quando o espaço acaba, os mais antigos saem por cima com máscara de fade.
- **Digitando…:** balão pequeno com três pontos em onda (opacidade/translate, 1,2 s por ciclo); é substituído pelo balão real com crossfade curto (`--at-duration-fast`).
- **Eventos de sistema:** fade + `y: 6`, `--at-duration-moderate`, `--at-ease-standard`.
- **AgendaCard:** spring vindo de baixo, depois o check desenhando em 400 ms (`--at-ease-standard`), seguido de um pulso leve no card (keyframe `at-pop`).
- **Reset:** fade-out do conjunto em `--at-duration-slow`, pausa de ~400 ms e reinício.
- Nada de bounce exagerado, rotação ou blur pesado. O movimento deve parecer interface real, rápido e útil.

### 8.4 Ciclo de vida e performance

- A animação **começa imediatamente** no carregamento (sem esperar scroll), mas só depois das fontes estarem disponíveis, para não haver salto de texto.
- **Pausa** quando o hero sai do viewport (`useInView`) e quando a aba fica oculta (`visibilitychange`). Retoma do ponto ou reinicia o ciclo.
- **Sem layout shift:** o `PhoneFrame` tem altura fixa por breakpoint; o conteúdo interno nunca altera o layout externo.
- Animar apenas `transform` e `opacity`.
- Sem vídeo, sem Lottie, sem imagens raster na animação.

### 8.5 Acessibilidade da animação

- **Controle de pausa obrigatório** (WCAG 2.2.2, porque o conteúdo se move por mais de 5 s em loop): um botão discreto "Pausar animação" / "Reproduzir animação" junto ao celular, acessível por teclado, com `aria-pressed`.
- O conteúdo animado fica em `aria-hidden="true"`. Uma `<figure>` com `<figcaption>` visualmente oculta traz a transcrição completa da conversa e o resultado ("Agendamento confirmado: sexta, 16h30, unha em gel").
- **`prefers-reduced-motion: reduce`:** renderizar direto o **quadro final estático** (todas as mensagens + card com o check já desenhado), sem loop. Respeitar também a regra global de `tokens.css`.

---

## 9. Animações secundárias

- **Reveal ao entrar na tela:** títulos e cards com fade + `y: 8` (keyframe `at-reveal`), uma vez só, stagger de 60–80 ms. Sutil: a página não pode "dançar".
- **Seção 2 (Dor):** as três conversas aparecem; duas ficam com "visto há 12 min" esmaecido e a terceira recebe resposta. Executa uma vez ao entrar na tela.
- **Seção 6 (Estilos), se alternar automaticamente:** troca a cada ~3,5 s com crossfade, pausa em hover/focus, botão de pausa e, com movimento reduzido, os três estilos estáticos.
- **Seção 12 (CTA final):** assinatura da logo (o traço do A seguido do check) de `Movimento.dc.html`, uma vez ao entrar na tela.
- **Botões:** transições de hover/active com os tokens de duração; foco sempre visível (`--at-focus-ring-*`).

---

## 10. Acessibilidade

- WCAG 2.1 AA. Contraste mínimo de 4,5:1 para texto de corpo; o acento terracota só em texto grande ou elementos gráficos.
- Hierarquia semântica: um único `h1` (headline do hero), `h2` por seção, landmarks (`header`, `main`, `footer`, `nav`).
- Skip link "Pular para o conteúdo".
- Alvos de toque com no mínimo 44×44px.
- Emojis dos balões são decorativos dentro da área `aria-hidden`; na transcrição, podem ser omitidos.
- Verificação automatizada com `@axe-core/playwright` (já usado no `apps/frontend`).

---

## 11. Performance

Público majoritariamente mobile, vindo de tráfego pago em 4G.

- Metas no mobile (Lighthouse, 4G simulado): **LCP < 2,5 s, CLS < 0,05, INP < 200 ms**.
- O LCP deve ser a headline (texto), não uma imagem.
- Fontes self-hosted em woff2 com `font-display: swap` e preload apenas de Literata 600 e Hanken 400. Nenhuma requisição a terceiros em runtime.
- Página estática (SSG). Motion carregado só nos componentes animados (client components mínimos; o resto da página é server component).
- Sem imagens pesadas; mocks em HTML/CSS e ícones em SVG inline.

---

## 12. SEO e metadata

Do Bloco 15 da copy:

- `<html lang="pt-BR">`;
- `title`, `description`, `og:title`, `og:description` (igual à meta description), `og:locale=pt_BR`, `twitter:card=summary_large_image`;
- imagem OG: placeholder estático com headline e símbolo, em petróleo e papel (pode ser gerada via `next/og`);
- favicon com o símbolo da marca;
- `robots`: `noindex` enquanto for protótipo (controlado por variável de ambiente).

---

## 13. Analytics (somente pontos de instrumentação)

Não integrar nenhum fornecedor. Criar uma função `track(event, props)` que, no protótipo, apenas faz `console.debug`. Eventos:

- `cta_click` com `{ section }` (a partir do atributo `data-cta`);
- `section_view` com `{ section }` (uma vez por seção, via IntersectionObserver);
- `faq_open` com `{ question }`;
- `hero_demo_complete` (o primeiro ciclo completo da animação);
- `hero_demo_pause`.

A métrica de negócio (cadastro → IA ativa) é medida no produto, não na landing page.

---

## 14. Placeholders e pendências

Todo trecho `[entre colchetes]` da copy deve aparecer **visível e identificável** no protótipo, com estilo próprio (fundo `--at-color-warning-bg`, texto `--at-color-warning-ink`, fonte mono pequena), para nunca ser confundido com texto final.

Pendências que dependem do usuário (não resolver no protótipo):

1. valor do Pro;
2. suporte a WhatsApp Business;
3. texto de privacidade/LGPD;
4. regra de cancelamento;
5. Clientes e histórico no Grátis;
6. frase final da seção de origem;
7. envio da IA em mensagens separadas implementado no produto.

---

## 15. O que NÃO fazer

- Não reescrever, resumir nem "melhorar" a copy. Divergências viram sugestões para o usuário.
- Não inventar números, depoimentos, logos de clientes, avaliações ou selos.
- Não usar logo, ícones ou papel de parede do WhatsApp; não sugerir parceria com a Meta.
- Não usar estética genérica de IA (roxo/azul, gradiente neon, glow, partículas).
- Não mostrar notificação push nem tela de bloqueio.
- Não prometer Instagram, sinal/pagamento, equipe, app nativo ou faturamento.
- Não adicionar escassez, urgência ou contador.
- Não criar CTAs diferentes de "Começar grátis".
- Não alterar `apps/frontend`, o vault ou outros apps durante a prototipação (exceto as atualizações de documentação da seção 17).
- Não adicionar dependências além de Next, React, Motion e as ferramentas de qualidade já usadas no `apps/frontend`, sem justificar.

---

## 16. Verificação e critérios de aceite

Verificar com o **Playwright MCP** (instrução global do usuário), com o servidor de dev em 3100.

Capturas obrigatórias:

- 375×812 (mobile), 768×1024 (tablet) e 1440×900 (desktop): página inteira + hero;
- hero em 3 momentos da animação (~2 s, ~7 s e ~13 s);
- `prefers-reduced-motion: reduce`: hero com o quadro final estático;
- 320px de largura: sem scroll horizontal.

Critérios de aceite:

- [ ] todas as seções 0–13 presentes, na ordem do vault, com a copy literal;
- [ ] headline e CTA visíveis acima da dobra em 375×667;
- [ ] animação conforme o roteiro: mensagens separadas, "digitando…", eventos, card com o check desenhando e loop;
- [ ] botão de pausa funcional; transcrição acessível presente;
- [ ] movimento reduzido mostra o quadro final estático, sem loop;
- [ ] animação pausa fora do viewport e com a aba oculta;
- [ ] zero erros no console; axe sem violações sérias ou críticas;
- [ ] Lighthouse mobile dentro das metas da seção 11 (reportar os números medidos);
- [ ] placeholders visíveis e distinguíveis;
- [ ] nenhum item da seção 15 violado;
- [ ] `lint`, `typecheck` e `build` passando.

---

## 17. Depois do protótipo

- **Vídeos para anúncios:** criar uma composição Remotion reutilizando `src/components/chat/*` e `conversation-script.ts`, que já foram desenhados para isso. A composição usa `useCurrentFrame()` e `interpolate()`, e o script e os componentes visuais são os mesmos. Licença Remotion: gratuita para empresas com até 3 funcionários; acima disso, exige licença paga.
- **Documentação** a atualizar quando o protótipo existir: `docs/README.md` (apps), README próprio de `apps/frontend-lp` e uma nota de arquitetura se for decidido compartilhar tokens/componentes via `packages/`.
- **Produção** depende de: resolver as pendências da seção 14, implementar o envio em mensagens separadas no produto, revisão jurídica e trocar `noindex`.
