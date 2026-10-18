---
title: Design System Conceitual
aliases: [Design System Avenly]
tags: [avenly, design-system, ui]
status: direcao
---

# Design System Conceitual

Este documento define direção de experiência, não tokens técnicos finais.

## Personalidade visual

- clean;
- elegante;
- profissional;
- moderna;
- acessível para leigos;
- não excessivamente corporativa;
- não infantil/playful.

## Cor

Base neutra com cor de marca como destaque.

Não usar muitas cores para decorar dados. Cores funcionais devem comunicar estado.

### Cor de destaque e modo ([[../../migration/DECISIONS#D-181|D-181]])

A cor de marca é o destaque, e a profissional pode trocá-lo por uma de seis opções elegantes, nunca infantis: Verde-petróleo (padrão), Rosé, Champanhe, Azul sereno, Lavanda e Terracota. A cor muda só o destaque — botões, links, seleção e os tons de fundo que acompanham. Papel, tinta, bordas, cores de estado (perigo, aviso, sucesso) e a identidade dos serviços na Agenda não mudam com ela.

O modo é escolha separada: Claro, Escuro ou Automático. No escuro, o papel é um marrom quase preto e quente (não preto puro), a tinta é o creme do claro e o destaque fica claro, com o texto em cima dele no papel escuro. Faixas grandes na cor de destaque (como o painel da entrada) viram o tom escuro da cor, nunca um bloco pastel.

Toda combinação passa WCAG AA em todo par texto/fundo. Toda cor da interface vem de um token: cor fixa num componente fica igual em todos os temas e some no escuro.

## Identidade visual de serviço na Agenda

O Design System deve definir um padrão consistente para aplicar a identidade visual opcional do serviço nos eventos da Agenda, nas visualizações `Dia`, `Semana` e `Mês`, inclusive em estados compactos e locais com pouco espaço.

No MVP, essa identidade pode partir de uma cor escolhida pelo usuário. Sua representação pode usar faixa, borda, marcador, ponto, superfície tonal ou outra solução validada pelo design; não é obrigatório preencher toda a superfície do evento.

Quando não houver identidade configurada para o serviço, o evento usa o padrão visual da Agenda.

A cor do serviço não pode conflitar com cores semânticas de erro, alerta, sucesso ou estados operacionais. Estado e tipo do evento nunca devem depender somente da cor escolhida para o serviço.

Atendimento, compromisso pessoal, bloqueio, hold `Em confirmação` e os estados do agendamento devem continuar distinguíveis quando a identidade do serviço estiver presente.

## Gradientes

Uso pontual em:

- onboarding;
- momentos de sucesso;
- elementos de marca/marketing.

Evitar gradiente como linguagem dominante de telas operacionais.

## Bordas e cantos

Arredondamento moderado e consistente.

Evitar tanto aparência excessivamente “consumer toy” quanto visual quadrado/enterprise antigo.

## Sombras

Sutis.

Preferir separação através de:

- bordas;
- superfícies;
- espaço;
- hierarquia.

## Iconografia

Ícones devem ajudar reconhecimento rápido.

Quando a ação não for universalmente óbvia, acompanhar com texto.

## Assets e ilustrações

Podem ser usados em:

- onboarding;
- empty states;
- sucesso;
- conexão do WhatsApp;
- demonstração/teste.

Evitar assets meramente decorativos que roubem espaço da tarefa.

## Motion

Microanimações adequadas:

- mudança de etapa;
- conexão do WhatsApp;
- progresso do teste;
- mensagens entrando na demonstração;
- sucesso;
- atualização de status;
- skeleton/loading.

Motion deve ser rápido, útil e respeitar redução de movimento quando aplicável.

### Linguagem de movimento (transições de tela)

Decidida na Agenda em 2026-10-12 ([[../../migration/DECISIONS#D-168|D-168]]) e válida para as demais telas: poucos tempos, duas curvas, deslocamentos pequenos. Entrar é mais lento que sair; o que muda de contexto se move, o que só muda de estado troca de cor. Nada acima de 320 ms, nada elástico, nunca `transition: all`.

| Uso | Duração | Curva | Deslocamento |
| --- | --- | --- | --- |
| Pressionar botão, tocar linha, marcar chip | 120 ms | `ease` | scale .98 ou só cor |
| Hover, foco, cor de texto, fundo de linha; **toda saída** | 160 ms | saída suave | — |
| Componente que entra: lista, skeleton → conteúdo, aviso | 200 ms | saída suave | 8 px de subida + fade |
| Troca de contexto: aba, dia/semana/mês, painel, tela | 240 ms (sai em 160) | saída suave | 16 px na direção do gesto, ou 8 px de subida sem direção |
| Bottom sheet / diálogo | entra em 320 / 220 ms, sai em 160 | saída suave | 32 px de baixo / scale .96 |

Curvas: **saída suave** `cubic-bezier(.2,.7,.2,1)` para tudo que entra, muda de cor ou se move; **entrada** `cubic-bezier(.4,0,1,1)` só para saídas, sempre mais curtas; linear apenas no shimmer do skeleton.

Direção: ir mais fundo (lista → detalhe, formulário) empurra da direita; voltar é o espelho; a mesma profundidade só troca com fade. No desktop a tela não empurra: troca com fade e 8 px de subida, e a casca (sidebar, barras) fica sempre parada. Trocar de seção pelo menu principal (sidebar, barra inferior, folha "Mais") anima só a área do conteúdo: a tela que sai sobe 6 px e some em 160 ms enquanto a nova entra subindo 14 px com fade em 240 ms; dentro da mesma seção quem anima é a própria tela. Não anima: a lista inteira quando chega um dado, a posição dos eventos ao atualizar, a Home ao voltar de outra tela.

Voltar arrastando ([[../../migration/DECISIONS#D-198|D-198]], 2026-10-18): no celular e no tablet (abaixo de 1024 px), numa tela empurrada com voltar em chevron e no chat em tela cheia, o dedo que sai da borda esquerda arrasta a tela; solta depois de 35% da largura, ou num arremesso, ela sai e abre o mesmo destino do botão voltar, que entra como no voltar normal; antes disso volta ao lugar em 160 ms. Só toque, nunca mouse; nunca em formulário com `x`, sobre rolagem horizontal, controle deslizante ou campo de texto. Com movimento reduzido o gesto não existe e o botão voltar continua sendo o caminho.

`prefers-reduced-motion: reduce` desliga tudo por padrão: o conteúdo troca no mesmo quadro, sem fade. Nenhuma animação atrasa a interação: o clique responde na hora e o foco vai para o conteúdo novo como sem animação.

Exceção ([[../../migration/DECISIONS#D-173|D-173]], 2026-10-16): o item que abre no painel ao lado da lista — cliente, conversa, serviço, agendamento — troca com fade também com movimento reduzido, **só de opacidade e sem deslocamento** (o anterior sai em 160 ms enquanto o novo entra em 240 ms; o primeiro item entra com fade de 240 ms). A lista de Serviços e o Início, na primeira carga, também entram com esse fade, sem esqueleto (no Início, o "A" animado no centro se a leitura passar de ~150 ms). A troca de seção pelo menu principal também fica, reduzida ao mesmo fade, sem subir. O cartão "WhatsApp desconectado" da sidebar chama a atenção com ondas que se abrem e se dispersam por cerca de 3 s, a cada 20 s — nunca piscando o tempo todo; com movimento reduzido, no mesmo ritmo, só acende e apaga no lugar. Enquanto o novo carrega, o anterior fica inteiro, sem esmaecer: sem fade, esmaecer vira um pisca.

Carregamento (D-168): nenhum esqueleto aparece em cima de conteúdo que já estava na tela — trocar de visão, de período ou de item mantém o conteúdo anterior visível, ocupado (`aria-busy`, com uma linha fina discreta quando a espera é da rede), e a troca é conteúdo → conteúdo quando o novo chega. O que já se sabe (memória da aba, semente da tela anterior, pré-leitura do que vem a seguir) entra na hora e é revalidado no lugar — inclusive ao voltar a uma tela que a pessoa acabou de ver. Linhas secundárias de um conteúdo já na tela (histórico, lembrete) reservam o lugar sem brilho. Esqueleto só na primeira carga absoluta sem splash antes, na forma exata do conteúdo, e só se a carga passar de ~150 ms.

Primeiro carregamento (F5, URL digitada; D-168, revisão de 2026-10-12): o splash da marca cobre a verificação do acesso **e** a primeira leitura da tela — depois dele nunca há esqueleto. A tela monta por baixo e, quando o splash sai (160 ms), se apresenta: os blocos entram escalonados — cabeçalho/barra, depois a grade ou lista, depois o painel — com fade e 8 px de subida em 240 ms, 120 ms entre um e outro. Só nesse momento; trocar de dia ou de visão não repete. Com `prefers-reduced-motion` a tela aparece inteira no mesmo quadro.

## Componentes principais esperados

- Button / IconButton
- Input / Textarea
- Select / Combobox
- Checkbox / Radio / Toggle
- Tabs
- Badge / Status
- Alert / Banner
- Toast
- Modal de confirmação
- Drawer
- Bottom sheet para ações curtas
- List row
- Empty state
- Skeleton
- Date selector / Time selector — um só par de seletores para toda data e hora do produto, no lugar do campo nativo do navegador: o calendário que nasce como semana e abre o mês, e o tambor de horas e minutos (referência visual: `Seletores-de-Data-e-Hora.dc.html`). Dia passado não responde quando a tela pede data futura; fora do horário de atendimento é aviso, nunca bloqueio.
- Calendar event
- Chat bubble
- Chat system event
- Audio message + transcript
- Notification row
- Progress step/block
- Service row
- Customer row
- Appointment card

## Regra de consistência

O mesmo conceito deve usar o mesmo componente/padrão visual em todas as telas.

Exemplo: `IA ativa` não pode parecer um switch em uma tela, um badge sem ação em outra e um card totalmente diferente numa terceira sem motivo claro.

## Relacionado

- [[03-UX-UI/01-Principios-de-UX-UI]]
- [[03-UX-UI/04-Especificacao-das-Telas]]
