# Goal 064 — Conta conforme o vault: cadastro e recuperação de senha

**Status: READY.** Preparado em 2026-09-28 pelo Tech Lead Agent após [Goal071 ACCEPTED](../reviews/071-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v88 precisa o escopo com evidência conferida no código: a regra de senha, o `confirmPassword` e a falta de Nome estão no BFF e na tela; a recuperação de senha tem duas metades que não se falam — `/nova-senha` e `/link-expirado` já usam o fluxo real por link, e `/recuperar-senha` é uma encenação de quatro telas que termina afirmando uma troca que não aconteceu. A v88 também traz para cá **QA L-05** (checkbox "Manter acesso neste dispositivo" que não faz nada), que é a mesma tela e não tinha Goal.

## Baseline aceita

Baseline aceita: `fbdb0ccbfc9b8457a11b06def3e856b12894e39b`

Goal anterior: 071 — A conexão do WhatsApp pede consentimento e mantém o código válido

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal071 já integrado em `main` (origem `dadd8f1fc90e972027098139143dbabbcd634f1d`). **Três rodadas**, com 10, 4 e 0 blockers. **D-081** foi aceita e [FINAL_AUDIT §42](../FINAL_AUDIT.md) escrita sem reescrever §4 a §41. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O commit documental seguinte, `9af6cf1`, só corrigiu o status do documento do Goal071 e não muda código. O 071 mudou a conexão do WhatsApp, o painel de conexão, a etapa de conexão do onboarding e o gate autenticado. Não tocou autenticação, cadastro, recuperação de senha, a Home nem `apps/bff/src/modules/auth/`. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review071](../reviews/071-review.md): `test:gate` **233**; `test:frontend` **85** arquivos e **829** testes; integração do BFF **51** arquivos e **417** testes; integração do Scheduling **16** arquivos e **124** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **75** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Fazer a entrada no produto obedecer ao vault e nunca afirmar o que não aconteceu. Aplica a decisão **U-10** ([DECISIONS](../DECISIONS.md): senha única, mínimo de 8 caracteres com letras e números, com olho, sem "Repita a senha"; mesma regra na redefinição) e fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA C-01** (ALTA): o cadastro não pede Nome (vault, pergunta 468, vigente; `03-UX-UI/04-Especificacao-das-Telas.md` §"Cadastro").
- **QA C-02** e **QA C-03** (MÉDIA e BAIXA): "Repita a senha" e a regra só de tamanho — U-10.
- **QA C-04** (MÉDIA): dois mecanismos de aceite, o checkbox e um parágrafo passivo.
- **QA C-11** e **QA C-12** (MÉDIA e BAIXA): validação por balão nativo do navegador, um erro por vez, e só "senhas divergentes" no padrão do design system.
- **QA L-01** (ALTA): a recuperação termina em "Senha redefinida" sem mudar nada. **QA L-02** (código nasce preenchido com o e-mail) e **QA L-03** (qualquer código é aceito) somem com a encenação.
- **QA L-04** (BAIXA): nova senha sem regras ao vivo.
- **QA L-05** (BAIXA, desde a v88): "Manter acesso neste dispositivo" é controle morto.
- **QA H-05** (BAIXA): a Home cumprimenta pelo nome do negócio porque a pessoa não tem nome.

Posição: logo depois do 071 e antes do 065, na ordem da v78.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O BFF não tem Nome.** `model User` (`apps/bff/prisma/schema.prisma:55-67`) tem só `email` e `passwordHash`. `registerSchema` (`apps/bff/src/modules/auth/routes.ts:34-49`) exige `confirmPassword` e só `min(8)`. `userDto` (`apps/bff/src/lib/dto.ts:7-13`) e `userSchema` (`packages/public-api-contract/src/schemas.ts:25-29`) não têm nome.
2. **A regra de senha está em quatro lugares.** `registerSchema`, `passwordSchema` (`PATCH /v1/auth/password`) e `resetPasswordSchema` repetem `z.string().min(8).max(200)`; a tela repete "Use pelo menos 8 caracteres." Nada exige letras e números.
3. **O corpo do cadastro ignora chave desconhecida.** `registerSchema` é `z.object` sem `.strict()`, então um chamador que continue mandando `confirmPassword` não quebra quando o campo sair do schema. Quem precisa mudar é quem **não** manda `name`: `apps/bff/tests/helpers/integration.ts:111-120`, `auth-register.integration.test.ts`, `session-csrf.integration.test.ts` e os dois ensaios de `validate:integration`, `scripts/goal030-mvp-journey-rehearsal.mjs:1207` e `scripts/goal033-authenticated-ui-rehearsal.mjs:1204`. As senhas dos dois ensaios já têm letras e números.
4. **A recuperação tem duas metades.** `/recuperar-senha` monta `RecoveryFlow` sobre `features/auth/recoveryMachine.ts`, redutor puro de e-mail → código → nova senha → sucesso, sem rede. O último passo navega para `/solicitacao-enviada`, cuja tela diz "Senha redefinida — Você já pode entrar na Atendly com sua nova senha." e cujo `metadata.title` é "Senha redefinida". Já `/nova-senha` lê `?token=` e chama `POST /v1/auth/reset-password` de verdade, e `/link-expirado` é a saída de token inválido. `BffAuthService.forgotPassword` existe e nenhuma tela o chama.
5. **O backend real é por link, não por código.** `POST /v1/auth/forgot-password` grava um token de uso único (TTL `PASSWORD_RESET_TOKEN_TTL_MINUTES`, padrão 30) e entrega `resetUrl` por `PasswordResetDeliveryClient` (`apps/bff/src/clients/password-reset-delivery.ts`). **Sem `PASSWORD_RESET_DELIVERY_URL`, a rota responde `503 CONFIGURATION_ERROR` antes de ler o corpo.** Com entrega configurada, responde sempre a mesma mensagem, exista ou não a conta. O provider de e-mail está adiado por decisão humana (**U-03**), então no MVP sem provider a recuperação não entrega nada.
6. **A tela da nova senha confunde dois erros.** `resetPasswordSchema` e o token inválido respondem ambos `400 VALIDATION_ERROR`, e `AuthScreen` manda todo `VALIDATION_ERROR` de `/nova-senha` para `/link-expirado`. Uma senha recusada pela regra nova levaria a pessoa a "Este link expirou".
7. **O que o vault e o protótipo dizem.** Vault: cadastro com nome, e-mail, senha, aceite e CTA; recuperação "no MVP, experiência visual apenas; ação real não precisa funcionar nesta fase" (`04-Especificacao-das-Telas.md` §"Recuperar senha"; `00-Produto/02-Escopo-do-MVP.md:35`; pergunta 470). `AGENTS.md`: "Nunca mostre sucesso antes de a operação ter sido realmente concluída." Protótipo `Login-Desktop.dc.html`: L5 é o código de 6 dígitos; L6 é a nova senha num campo só, "Regras verificadas em tempo real" (8+ caracteres, letras e números, diferente da anterior), e sucesso "Pronto. Você já pode entrar com a nova senha".
8. **A validação é nativa.** `AuthScreen.submit` e `RecoveryFlow` chamam `checkValidity()`/`reportValidity()` sobre campos `required`/`type="email"`, e o erro inline só aparece depois de ir ao servidor.
9. **O cumprimento da Home.** `DashboardScreen.tsx:340` mostra `Olá, {dashboard.platform.tenantName || "seu negócio"}`.
10. **O gate renderizado público** (`apps/frontend/e2e/routes.ts`, `PUBLIC_ROUTES`) já mede `/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada` e `/link-expirado` nas cinco larguras.

## Escolha de desenho desta passada

A pergunta 470 do vault permite que a recuperação não funcione no MVP; ela não permite afirmar que funcionou. As duas coisas convivem assim, e o Goal as implementa:

- **A recuperação usa o fluxo real por link que o BFF e `/nova-senha` já têm.** `/recuperar-senha` passa a pedir o e-mail e chamar `POST /v1/auth/forgot-password`. A tela de código e a nova senha dentro do fluxo deixam de existir, e com elas QA L-02 e L-03.
- **Sem provider configurado (U-03), a tela diz que a recuperação está indisponível.** Isso mantém o comportamento que o vault descreve para o MVP — nenhuma entrega real — sem encenar sucesso.
- **"Senha redefinida" só aparece depois de `POST /v1/auth/reset-password` responder `200`.**
- **Divergência que fica declarada:** o vault e o protótipo descrevem um código de 6 dígitos; o backend é por link. Trocar para código exige verificação de código no BFF, com limite de tentativas, e é Goal próprio se uma pessoa decidir. Este Goal não edita o vault; a decisão proposta (**D-082**, escrita no fechamento) registra a divergência e pede confirmação humana.

## Fora do escopo

- Escolher, contratar ou configurar provider de e-mail (U-03). Nenhum teste entrega e-mail real; a entrega é dublê.
- Recuperação por código de 6 dígitos (ver "Escolha de desenho").
- Editar o nome depois do cadastro, ou mostrar o nome em Configurações › Conta. A troca de senha de Configurações › Conta muda só a regra (§2), não a forma.
- QA L-06, L-07 e L-08 (composição e texto do login) e QA C-07…C-10 (painel de marca): Goal068.
- Boas-vindas e o resto do onboarding: Goal065. Faixa de estado, seções, sino e data da Home (QA H-01, H-06…H-08, H-10): Goal068.
- Mudar login, sessão, CSRF, `logout`, `logout-all`, a exclusão de conta ou a purga, além de a purga continuar apagando a linha de `User` com o nome junto.
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059, 060, 061, 062, 063, 070 e 071 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal025-account-purge` (observação 1 do review071) ou `goal008-agenda` (observação 4 do review059) reprovarem em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal071.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas C-01…C-04, C-11, C-12, L-01…L-05 e H-05 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md); a linha U-10 de [DECISIONS](../DECISIONS.md) e a U-03 só para saber que o provider está adiado;
- no vault: `03-UX-UI/04-Especificacao-das-Telas.md` §"Login", §"Cadastro" e §"Recuperar senha"; as perguntas 468 e 470 de `04-Referencia/99-Perguntas-e-Respostas.md`;
- no protótipo, só as telas L1 (entrar), L3 (criar conta) e L4…L7 (recuperação, nova senha e sucesso) de `docs/design-reference/claude-design/prototype/project/Login-Desktop.dc.html`;
- `apps/bff/src/modules/auth/routes.ts`, `apps/bff/src/lib/dto.ts`, `apps/bff/src/lib/errors.ts`, `apps/bff/prisma/schema.prisma` (`model User`) e a migration mais recente do BFF como modelo de migration aditiva;
- em `apps/bff/PUBLIC_API_V1.md`: a tabela de rotas e as seções de autenticação e recuperação de senha;
- `packages/public-api-contract/src/schemas.ts` (`userSchema`) e `src/index.ts`;
- `apps/frontend/src/features/auth/AuthScreen.tsx`, `recoveryMachine.ts`, as páginas de `apps/frontend/src/app/` `cadastro`, `login`, `recuperar-senha`, `solicitacao-enviada`, `nova-senha` e `link-expirado`, e `apps/frontend/src/data/services/BffAuthService.ts`;
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx` (o cumprimento) e `features/settings/AccountSettings.tsx` (a troca de senha);
- os testes existentes que tocam o cadastro e a recuperação: `apps/bff/tests/auth-register.integration.test.ts`, `session-csrf.integration.test.ts`, `helpers/integration.ts`, e em `apps/frontend/tests/` `goal014-auth.test.tsx` e os de acessibilidade que montam `AuthScreen`;
- os trechos de `POST /v1/auth/register` em `scripts/goal030-mvp-journey-rehearsal.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs`.

## Pontos de implementação

- `apps/bff/prisma/schema.prisma` e uma migration nova, aditiva, `goal064_user_name`.
- `apps/bff/src/modules/auth/routes.ts`, `apps/bff/src/lib/dto.ts`, `apps/bff/src/lib/errors.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `packages/public-api-contract/src/` (regra de senha e `userSchema`).
- `apps/frontend/src/features/auth/`, as páginas de autenticação em `apps/frontend/src/app/`, `apps/frontend/src/data/services/BffAuthService.ts` e, se precisar, `apps/frontend/src/shared/styles/`.
- `apps/frontend/src/features/dashboard/DashboardScreen.tsx` e `features/settings/AccountSettings.tsx`.
- `apps/bff/tests/helpers/integration.ts`, `auth-register.integration.test.ts` e `session-csrf.integration.test.ts`: só acrescentar `name` e a senha do caso, onde o corpo do cadastro exigir.
- `scripts/goal030-mvp-journey-rehearsal.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs`: só acrescentar `name` ao corpo de `POST /v1/auth/register`.
- Testes novos com prefixo `goal064-` em `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Nome no cadastro (BFF)

- `User` ganha `name`, texto **nulável**, por migration aditiva sem `UPDATE` e sem backfill. Conta anterior fica com nome nulo, que significa "não informado", nunca um nome inventado.
- `POST /v1/auth/register` exige `name`: texto aparado, de 1 a 120 caracteres. Ausente, vazio ou só espaço: `400 VALIDATION_ERROR` com o campo, **antes** de qualquer escrita.
- `userDto` devolve `name` (texto ou `null`) em `register`, `login` e `GET /v1/auth/session`.
- `confirmPassword` sai de `registerSchema`. Corpo antigo que ainda o traga continua aceito e o campo é ignorado.

### 2. Uma regra de senha, igual no cliente e no servidor (BFF, contrato, frontend)

- A regra de U-10 — mínimo de 8 caracteres, pelo menos uma letra e pelo menos um número, máximo de 200 — é escrita **uma vez**, em `packages/public-api-contract/`, e usada pelo BFF e pelo frontend. Nenhuma cópia literal da regra em outro lugar.
- Vale para o cadastro, para `POST /v1/auth/reset-password` e para `PATCH /v1/auth/password`. **Não** vale para `POST /v1/auth/login`: conta com senha antiga fora da regra continua entrando.
- A recusa é `400 VALIDATION_ERROR` com o campo da senha, no formato de `details` já usado pelo BFF.

### 3. Redefinição de senha com erros separados (BFF)

- `resetPasswordSchema` passa a aceitar só `token` e `newPassword`. `confirmPassword` antigo continua aceito e é ignorado.
- Token ausente do banco, já usado ou vencido: `400` com **código próprio novo** (por exemplo, `PASSWORD_RESET_TOKEN_INVALID`), distinto de `VALIDATION_ERROR`. Senha fora da regra continua `VALIDATION_ERROR` com o campo.
- Nova senha igual à atual: `400 VALIDATION_ERROR` com o campo `newPassword`, conferida contra o hash atual **antes** de consumir o token. Token não consumido continua valendo até vencer.
- O resto da rota não muda: consumo atômico, apagar os demais tokens, revogar todas as sessões.
- `POST /v1/auth/forgot-password` não muda.

### 4. Cadastro conforme o vault (frontend)

- Campos: Nome, E-mail, Senha com olho, aceite, CTA "Criar conta". Nenhum "Repita a senha".
- Abaixo da senha, as regras verificadas ao digitar: 8 ou mais caracteres; letras e números. Cada regra mostra atendida ou não por texto e ícone, não só por cor.
- Um aceite só: o checkbox "Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade", com os dois links. O parágrafo passivo "Ao criar sua conta, você concorda…" sai.
- O corpo enviado leva `name`, `email`, `password`, `termsAccepted` e as versões; não leva `confirmPassword`.
- `CONFLICT` continua como erro do campo e-mail.

### 5. Validação inline em todas as telas de entrada (frontend)

- Cadastro, login, recuperar senha e nova senha validam no cliente **antes** de enviar, sem `checkValidity`/`reportValidity` e sem balão nativo (`noValidate` no formulário).
- Todos os erros do envio aparecem juntos, no padrão do design system: borda de erro no campo, texto abaixo dele ligado por `aria-describedby`, `aria-invalid` no campo. O foco vai para o primeiro campo com erro.
- Casos mínimos: campo vazio, e-mail sem formato, senha fora da regra, aceite desmarcado (cadastro), Nome só com espaço.
- Erro de campo devolvido pelo servidor cai no mesmo campo, com o mesmo texto de tela.
- O login perde o checkbox "Manter acesso neste dispositivo" (QA L-05), que não é lido por nada.

### 6. Recuperação de senha honesta (frontend)

- `/recuperar-senha` é uma tela: e-mail e "Enviar link". Ao enviar, chama `forgotPassword`.
  - `200`: navega para `/solicitacao-enviada`. O e-mail não vai para a URL.
  - `503 CONFIGURATION_ERROR`: fica na tela, com erro de formulário dizendo que a recuperação de senha está indisponível no momento e que a pessoa pode tentar de novo mais tarde. Não navega.
  - `429`: fica na tela, com texto de muitas tentativas.
  - falha de rede ou outro erro: fica na tela, com erro genérico e o e-mail preservado.
- `/solicitacao-enviada` passa a dizer o que aconteceu: se existir conta com o e-mail, chega um link para criar uma nova senha, válido por tempo limitado; verificar também o spam. Título da página e `h1` sem "Senha redefinida". CTA "Voltar para entrar".
- `/nova-senha`: um campo "Nova senha" com olho e as regras ao vivo do §4, mais a indicação de que a nova senha precisa ser diferente da anterior (conferida pelo servidor).
  - `200`: a própria tela passa a mostrar o sucesso ("Senha redefinida", com texto de que já dá para entrar com a nova senha) e "Ir para entrar". Esse texto não existe em nenhum outro caminho.
  - código de token inválido do §3: navega para `/link-expirado`.
  - `VALIDATION_ERROR`: erro no campo, sem sair da tela.
  - sem `token` na URL: `/link-expirado`, como hoje.
- O token é lido da URL só para o corpo de `reset-password`. Não é mostrado, não é gravado em armazenamento do navegador e não é enviado a outra rota.
- `recoveryMachine.ts` sai, ou deixa de ter os passos de código e nova senha. Nenhuma tela do produto mostra "Digite o código".

### 7. Nome onde ele aparece (frontend)

- A Home cumprimenta pela pessoa: "Bom dia", "Boa tarde" ou "Boa noite", pelo horário no fuso do negócio, seguido do primeiro nome. Sem nome (conta anterior a este Goal), cumprimenta sem nome e **nunca** pelo nome do negócio.
- Configurações › Conta aplica a mesma regra de senha do §2 na troca de senha, com o mesmo texto de regra. A forma da tela não muda.

### 8. Contrato público

- `apps/bff/PUBLIC_API_V1.md`, por acréscimo e correção do que passar a mentir:
  - o corpo novo de `register` (`name`, sem `confirmPassword`) e de `reset-password` (sem `confirmPassword`);
  - a regra de senha e onde ela vale;
  - `name` em `user`;
  - o código novo de token inválido;
  - o comportamento de `forgot-password` sem entrega configurada, já existente, escrito se ainda não estiver.
- `packages/public-api-contract/`: `name` em `userSchema` como texto ou `null` (opcional na decodificação, para resposta anterior a este Goal) e a regra de senha exportada. O teste de contrato do gate (Goals 035 e 036) continua passando sem exceção nova.

### 9. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**. Nenhum teste entrega e-mail real; a entrega é dublê que registra `resetUrl`.

1. **BFF, contra PostgreSQL real** (suíte de integração do BFF):
   - cadastro sem `name`, com `name` vazio e com `name` só de espaços: `400` e **nenhuma** linha nova de `User`, `Tenant` ou `LegalAcceptance`;
   - cadastro com `name` e sem `confirmPassword`: `201`, `user.name` na resposta e no banco, e `GET /v1/auth/session` devolve o mesmo nome;
   - cadastro com senha `abcdefgh` e com `12345678`: `400` com o campo da senha e nenhuma linha nova;
   - `reset-password` e `PATCH /v1/auth/password` com senha só de letras: `400` com o campo, token não consumido no primeiro caso;
   - `reset-password` com a senha atual: `400` com o campo `newPassword` e o token continua usável em seguida com uma senha válida;
   - `reset-password` com token vencido, já usado e inexistente: `400` com o código novo, diferente de `VALIDATION_ERROR`;
   - fluxo inteiro com a entrega em dublê: `forgot-password` → token tirado do `resetUrl` do dublê → `reset-password` → login com a senha nova `200` e com a antiga `401`;
   - `forgot-password` sem `PASSWORD_RESET_DELIVERY_URL`: `503 CONFIGURATION_ERROR` e nenhuma linha de `PasswordResetToken`;
   - login de conta criada com senha fora da regra nova (gravada direto no banco pelo teste) continua `200`.
2. **Frontend (jsdom):**
   - cadastro tem Nome, E-mail, uma Senha e um aceite; não tem "Repita" nem o parágrafo "Ao criar sua conta"; o corpo de `register` leva `name` e não leva `confirmPassword`;
   - envio vazio mostra todos os erros juntos, com `aria-invalid` e `aria-describedby`, foco no primeiro, e `register` não é chamado; o mesmo vale para login, recuperar senha e nova senha;
   - as regras ao vivo mudam ao digitar;
   - recuperar senha: `200` navega para `/solicitacao-enviada`; `503` fica na tela com o texto de indisponível e não navega; nenhuma tela mostra "Digite o código";
   - `/solicitacao-enviada` não contém "Senha redefinida";
   - nova senha: `200` mostra o sucesso; o código novo de token navega para `/link-expirado`; `VALIDATION_ERROR` mostra erro no campo e não navega;
   - "Senha redefinida" aparece **só** depois de `resetPassword` resolver;
   - o login não tem "Manter acesso neste dispositivo";
   - a Home cumprimenta pelo primeiro nome da sessão, e sem nome não mostra o nome do negócio;
   - nenhum texto das telas tocadas contém "token", "API", "HTTP", "CONFIGURATION_ERROR", "VALIDATION_ERROR" nem código cru.

Os testes existentes continuam passando. Só muda asserção que depende do corpo de cadastro sem `name`, de `confirmPassword`, da regra só de tamanho, da encenação de código, do texto de `/solicitacao-enviada`, do checkbox do login ou do cumprimento pelo negócio; o relatório lista cada mudança com o motivo.

### 10. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório:

1. `registerSchema` deixa de exigir `name`: o teste de cadastro sem nome do §9.1 reprova.
2. A regra de senha volta a ser só `min(8)` no pacote: os testes de senha fraca do §9.1 e do §9.2 reprovam.
3. O token inválido volta a responder `VALIDATION_ERROR`: o teste do código novo do §9.1 reprova.
4. A conferência contra a senha atual passa para depois do consumo do token: o teste de token ainda usável do §9.1 reprova.
5. `/recuperar-senha` volta a navegar sem chamar `forgotPassword`: o teste de `503` do §9.2 reprova.
6. O formulário do cadastro volta a chamar `reportValidity`: o teste de todos os erros juntos do §9.2 reprova.

### 11. O que só uma pessoa confere

- Que a recuperação com um provider de e-mail real entrega o link e que o link abre `/nova-senha` no endereço público certo. Nenhum provider está configurado (U-03); a conferência só é possível depois dessa decisão.
- Que a recuperação por link, em vez do código de 6 dígitos do protótipo e da pergunta 470 do vault, é aceitável para o produto (D-082).
- Que as telas batem com o protótipo (Goal068).

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 12. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o §8.
- [DECISIONS](../DECISIONS.md) ganha **D-082** em `PROPOSED`, no formato de D-076 a D-081. Ela diz que:
  - o cadastro exige Nome e a regra de U-10 é uma só, no pacote de contrato, para cadastro, redefinição e troca, e não para login;
  - a recuperação usa o fluxo real por link; sem entrega configurada a tela diz que está indisponível; "Senha redefinida" só depois do `200`; token inválido tem código próprio;
  - revê a parte de G-34 que D-030 (Goal014) fechou como "somente visual", como o "Revisar se" de D-030 previa ("o produto decidir recuperação de senha real, que reabre G-34");
  - limites: nenhum provider de e-mail (U-03); o vault e o protótipo descrevem código de 6 dígitos e o produto usa link, com confirmação humana pendente; o Product Vault não foi editado; conta anterior fica sem nome.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§43**, sem reescrever §4 a §42: **QA C-01…C-04, C-11, C-12, L-01…L-05 e H-05** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24; a linha G-34 da tabela histórica não é reescrita, e §43 diz o que mudou nela. O veredito segue **0/7/6**, recontado por execução.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): a linha G-34 ganha, por acréscimo, a referência a D-082, porque "recuperação somente visual" passa a mentir.
- [DATA_MIGRATION](../DATA_MIGRATION.md): a migration nova, no formato da tabela do §13 (o que cria, backfill nenhum).
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram:
  - Nome, regra de senha, recuperação por link e o cumprimento;
  - a conferência humana pendente;
  - as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Escreva a prosa **depois** da execução final, e só depois de `validate:integration` e dos seis controles terem rodado na árvore final. Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Rode `validate:core` antes de `test:gate`**: `test:gate` precisa do client Prisma que `validate:core` gera.

### 13. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `packages/public-api-contract/`. Em `scripts/`, só o corpo de `POST /v1/auth/register` nos dois ensaios.
- Cria uma migration só, aditiva, sem `UPDATE` e sem backfill.
- Não acrescenta chamada `this.http.` em `apps/bff/src/clients/` (segue **42**) e não muda `PasswordResetDeliveryClient`.
- Não muda login, sessão, CSRF, rate limit, `forgot-password`, a exclusão de conta nem a purga.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada, nenhuma medida do gate renderizado desligada e nenhuma rota tirada de `PUBLIC_ROUTES` ou `AUTHENTICATED_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte. Teste da encenação de código que perde o objeto é substituído por teste do fluxo real, e o relatório diz qual substitui qual.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. O cadastro exige Nome, grava e devolve o nome, e não exige `confirmPassword`. Provado por execução do §9.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. A regra de U-10 vale igual no cliente e no servidor para cadastro, redefinição e troca, e não bloqueia login de conta antiga. Provado por execução do §9.1 e do §9.2 e pelo diff (uma definição só).
3. A redefinição separa token inválido de senha recusada, recusa a senha atual sem consumir o token, e o fluxo inteiro troca a senha de verdade. Provado por execução do §9.1.
4. Nenhuma tela afirma "Senha redefinida" sem `200` de `reset-password`; sem entrega configurada a tela diz que está indisponível; não existe tela de código. Provado por execução jsdom do §9.2.
5. As telas de entrada validam inline, com todos os erros juntos e sem balão nativo; o cadastro tem um aceite só; o login não tem controle morto; a Home cumprimenta pela pessoa. Provado por execução jsdom do §9.2.
6. Largura, toque, contraste, foco e movimento de `/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada` e `/link-expirado` são decididos por `validate:ui`; `/inicio` pelo gate autenticado dentro de `validate:integration`. `/nova-senha` e os estados de erro e sucesso não são medidos pelo gate renderizado.
7. `PUBLIC_API_V1.md` e `packages/public-api-contract/` descrevem os corpos, o `name` e o código novo. Provado por diff e por execução de `test:gate`.
8. Os seis controles negativos do §10 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
9. Typecheck e lint de `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **85**/**829**; integração do BFF **51**/**417**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em pelo menos **75** testes e **0** retentativas. Provado por execução.
10. D-082 em `PROPOSED`, FINAL_AUDIT §43, GAP_ANALYSIS, DATA_MIGRATION, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo depois da execução final, trazem as contagens dela e dizem que a conferência humana do §11 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que um e-mail de recuperação chega a alguém: não há provider (U-03);
- que a recuperação por link é a que o produto quer, contra o código do vault e do protótipo (§11);
- que `/nova-senha` e os estados de erro e sucesso cumprem largura, toque, contraste, foco e movimento;
- que as telas batem com o protótipo aprovado (conferência humana, Goal068).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | BFF e contrato: migration de `User.name`, regra de senha no pacote, `register`, `reset-password` e `PATCH password`, código novo de token, `userDto`, `userSchema`, `PUBLIC_API_V1.md`, corpo do cadastro nos dois ensaios e nos helpers, testes `goal064-` do BFF (§1, §2, §3, §8) |
| WU-02 | STANDARD | WU-01 | Telas de entrada: cadastro, validação inline, login sem controle morto, recuperação por link, `/solicitacao-enviada`, `/nova-senha`, serviço de dados e testes jsdom (§4, §5, §6) |
| WU-03 | STANDARD | WU-01 | Cumprimento da Home pela pessoa e regra de senha em Configurações › Conta, com testes jsdom (§7) |
| WU-04…WU-08 | DETERMINISTIC | WU-02, WU-03 | typecheck e lint de `apps/bff` e `apps/frontend`, testes dirigidos `goal064` do frontend |
| WU-09 | DETERMINISTIC | WU-04…WU-08 | validate-core |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | gate-tests, validate-ui e validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§10) e documentação (§12), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Os testes `goal064-` do BFF rodam dentro de `validate:integration`, que também roda os dois ensaios com o corpo de cadastro novo. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
