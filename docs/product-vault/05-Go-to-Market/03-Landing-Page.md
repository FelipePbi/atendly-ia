---
title: Landing Page
aliases: [LP Avenly, Landing Page Avenly]
tags: [avenly, go-to-market, landing-page]
status: direcao
---

# Landing Page

Estratégia, estrutura e direção visual da landing page de aquisição, definidas na sessão de 2026-10-01. A copy completa está em [[05-Go-to-Market/04-Landing-Page-Copy]]. O brief técnico para prototipação fica fora do vault, em `docs/landing-page/BRIEF_PROTOTIPO.md`.

## Objetivo

Converter visitantes (orgânico e tráfego pago, majoritariamente mobile) em **cadastros que ativam a IA**.

- Ação principal: **cadastro self-serve** via "Começar grátis".
- Métrica principal: **cadastro → IA ativa** (não apenas cadastro). Cadastro que não conecta o WhatsApp não vira assinante.

## Princípios

1. **Impacto nos primeiros segundos vem da cena funcionando**, não de efeitos visuais: entendimento em ~2 s (headline) e "aha" em ~15 s (animação da conversa).
2. **Vender resultados, não features.** Três resultados centrais: não perder cliente, não ser interrompida, menos faltas. Cada feature aparece só como prova de um resultado.
3. **Exemplos concretos do nicho** (unha em gel, sobrancelha, cílios) — nunca "Serviço A".
4. **Não prometer nada fora do MVP**: Instagram, sinal/pagamento, equipe, app nativo, **notificação push** ([[00-Produto/02-Escopo-do-MVP]]).
5. **Nada inventado**: sem estatísticas, depoimentos ou métricas sem fonte real.
6. **Sem escassez artificial.**

## Estrutura (esqueleto)

CTA "Começar grátis" no header fixo e nas seções 1, 3, 6, 10 e 12 — sempre o mesmo destino (cadastro).

| # | Seção | Trabalho |
| --- | --- | --- |
| 0 | Header fixo | logo, links (Como funciona · Preços · Dúvidas), CTA |
| 1 | Hero (fundo petróleo) | headline + subheadline + CTA + microcopy + animação da conversa |
| 2 | "Quem responde primeiro, marca" | agitar a dor principal sem estatística |
| 3 | Como funciona (3 passos) | reduzir esforço percebido |
| 4 | Resultados ("Enquanto você trabalha") | vender resultado |
| 5 | Controle ("Seu WhatsApp continua sendo seu") | matar o medo de perder controle |
| 6 | Fala do seu jeito | matar a objeção "parece robô" (3 estilos) |
| 7 | Mais que um atendente | valor do Pro e da agenda |
| 8 | Já usa o Minha Agenda? | capturar migrantes |
| 9 | Origem | substituto de prova social até existirem depoimentos |
| 10 | Preços (Grátis × Pro) | clareza da oferta e reversão de risco |
| 11 | FAQ | objeções finais |
| 12 | CTA final (fundo petróleo) | fechamento |
| 13 | Rodapé | termos, privacidade, aviso de marca WhatsApp |

## Animação da demonstração (hero)

Animação em estilo **motion design, não interativa**, simulando uma cliente conversando com o negócio no WhatsApp, ao lado da etiqueta "IA atendendo". Loop de ~16 s.

Regras de conteúdo:

- respostas da IA **divididas em mensagens curtas**, com "digitando…" entre elas — ver "Envio em mensagens separadas" em [[01-Regras/03-IA-e-Conversas]];
- a cliente também manda mensagens fragmentadas (reflete a janela de agrupamento da IA);
- eventos de sistema reproduzem a demonstração do onboarding: serviço reconhecido, agenda consultada ([[02-Fluxos/01-Onboarding]]);
- IA não menciona preço (padrão do lembrete) e não se anuncia como robô;
- o lembrete citado ("na quinta") respeita o lembrete de 24 h ([[01-Regras/07-Lembretes-Notificacoes-e-Instabilidade]]);
- encerramento: card de agenda confirmado com o **check da marca se desenhando** — o símbolo da Avenly (A com check) vira a prova do produto.

Roteiro:

| t | Elemento |
| --- | --- |
| 0 s | Cliente: "oii, tem horário sexta à tarde?" |
| 0,8 s | Cliente: "queria fazer unha em gel" |
| 2 s | Sistema: Serviço reconhecido · Unha em gel · 1h30 |
| 2,8 s | Sistema: Agenda consultada |
| 3,5 s | digitando… |
| 4,5 s | IA: "Oii! Sexta tenho 14h ou 16h30" |
| 5,2 s | digitando… |
| 6 s | IA: "Qual fica melhor pra você? 💅" |
| 8 s | Cliente: "16h30!" |
| 9 s | digitando… |
| 10 s | IA: "Fechado! Unha em gel, sexta às 16h30." |
| 10,8 s | digitando… |
| 11,6 s | IA: "Te mando um lembrete na quinta 😉" |
| 12,5 s | Card: Sexta · 16h30 · Ju · Unha em gel ✓ (check desenhando) |
| 16 s | fade e reinício |

Com movimento reduzido, exibir o quadro final estático.

## Direção visual

**Mesma identidade do produto**, com volume aumentado. Fonte visual: `docs/design-reference/claude-design/` (Marca, Movimento, Acabamento) e [[03-UX-UI/05-Design-System-Conceitual]].

- paleta papel / tinta / petróleo; tipografia Literata (display) + Hanken Grotesk (corpo);
- diferenciação deliberada da estética genérica de "SaaS de IA" (roxo/azul, gradiente neon, brilho);
- **contraste**: hero e CTA final em petróleo escuro com texto papel; demais seções sobre papel;
- **escala**: headlines Literata grandes;
- **acento** único e pontual permitido para destaques (ex.: plano Pro, "horário marcado");
- gradiente apenas como brilho sutil de fundo, nunca no símbolo da marca;
- verde do WhatsApp somente dentro dos balões da simulação, nunca como cor da Avenly;
- familiaridade gera confiança: balões no padrão do WhatsApp, agenda do dia, cenas reais.

## Restrições legais de comunicação

- não usar o logo do WhatsApp com destaque nem sugerir parceria com a Meta;
- usar "funciona no seu WhatsApp" e aviso de marca registrada no rodapé;
- textos de privacidade/LGPD dependem da revisão jurídica pendente em [[04-Referencia/03-Temas-Adiados]].

## Peças derivadas

Vídeos para anúncios (Reels, Stories, Meta Ads) devem reutilizar o mesmo roteiro de conversa da animação do hero, mantendo anúncio e landing page coerentes.

## Evolução prevista

- substituir a seção de origem por depoimentos reais (com autorização) após as primeiras usuárias;
- variações por nicho (lash, unha, barbearia) trocando conversa do hero e cenas da dor;
- variações para segmentos secundários ([[05-Go-to-Market/01-Publico-Alvo-e-Posicionamento]]).

## Relacionado

- [[05-Go-to-Market/01-Publico-Alvo-e-Posicionamento]]
- [[05-Go-to-Market/02-Oferta-e-Planos]]
- [[05-Go-to-Market/04-Landing-Page-Copy]]
