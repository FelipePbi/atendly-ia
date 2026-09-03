---
title: Ativação e Teste do WhatsApp
aliases: [Teste de Ativação]
tags: [atendly, whatsapp, ativacao]
status: vigente
---

# Ativação e Teste do WhatsApp

## Conexão

### Desktop

QR Code como fluxo principal.

### Mobile

Código de vinculação copiável + passo a passo visual para abrir o WhatsApp e concluir conexão.

A tela detecta automaticamente a conexão e mostra confirmação do número conectado.

Antes de continuar, usuário pode trocar/desconectar caso tenha conectado o número errado.

## Orientação sobre número pessoal

Explicar antes da conexão:

- pode usar WhatsApp pessoal ou comercial;
- Atendly organiza todas as conversas;
- IA pode ser desativada para pessoas específicas;
- quando o usuário responde manualmente, a IA sai de cena.

## Contatos ignorados

Depois de conectar e antes do teste, oferecer etapa opcional:

> **Quer impedir que a IA responda algumas pessoas?**

Usuário pode selecionar conversas/contatos disponíveis e também informar telefone manualmente.

## Teste real

O teste não é apenas uma animação da interface. É uma conversa real enviada para o WhatsApp conectado por um número oficial da Atendly.

### Antes

Tela explica:

> A Atendly vai enviar uma mensagem de teste simulando um cliente. Você não precisa responder. A IA fará o atendimento automaticamente.

CTA:

> Iniciar teste

### Dentro do WhatsApp

Primeiro enviar aviso separado:

> Esta é uma conversa de teste da Atendly.

Depois iniciar o cliente simulado normalmente.

### Caminho feliz

1. pergunta o preço de um serviço apto;
2. solicita o próximo horário disponível;
3. IA consulta agenda;
4. cliente de teste aceita;
5. IA confirma;
6. agendamento é criado de verdade temporariamente;
7. teste valida o fluxo;
8. agendamento de teste é removido;
9. cliente de teste é removido.

O serviço é escolhido automaticamente pelo sistema, preferindo um serviço que permita agendamento normal.

Se não houver disponibilidade válida, não iniciar o teste até a agenda ser corrigida.

## Tela durante teste

Mostrar progresso em tempo real:

- Mensagem enviada
- Serviço identificado
- Preço informado
- Agenda consultada
- Horário selecionado
- Agendamento confirmado

No mobile, pode haver ação `Abrir WhatsApp` quando apropriado.

O teste continua mesmo se usuário trocar de aplicativo.

## Usuário interfere no teste

Se responder manualmente à conversa de teste:

- pausar teste;
- explicar que ele deve apenas observar;
- oferecer `Reiniciar teste`.

## Falha

Uma falha transitória pode gerar uma nova tentativa automática.

Se continuar falhando:

- não ativar IA;
- indicar etapa que falhou de forma amigável;
- oferecer tentar novamente.

## Sucesso

Após o caminho feliz:

- remover dados de teste;
- concluir automaticamente a conexão/validação;
- ativar a IA.

Tela:

> **Tudo pronto!**  
> Sua IA está ativa e pronta para atender seus clientes.

CTA:

> Ir para o início

## Quando repetir o teste

Novo teste é necessário ao vincular novamente/trocar o WhatsApp.

Não é uma ferramenta recorrente de “testar IA” dentro das configurações.
