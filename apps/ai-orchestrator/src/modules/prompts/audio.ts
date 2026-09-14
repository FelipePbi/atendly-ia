import { AUDIO_TURN_MARKER } from "../media/audio-turn.js";

/**
 * Secao de audio transcrito.
 *
 * E fixa, e nao condicional ao turno, de proposito: o modelo precisa saber o
 * que o marcador significa **antes** de ver um, inclusive quando audio e texto
 * chegam agrupados no mesmo turno. Ela tambem diz o que a transcricao nao
 * garante — a voz virou texto por maquina e pode ter errado —, que e a unica
 * forma honesta de aceitar confirmacao por audio sem inventar conteudo.
 */
export function buildAudioPrompt(): string[] {
  return [
    "AUDIO TRANSCRITO:",
    `- Mensagem que chegou como audio aparece nas novas mensagens agrupadas com o marcador ${AUDIO_TURN_MARKER} antes do texto.`,
    "- Esse texto e transcricao automatica da voz da cliente, nao algo que ela digitou: pode errar palavra, nome, numero, data e horario.",
    "- Trate o conteudo como pedido real da cliente e siga o atendimento normalmente. Nao comente que houve transcricao e nao peca para repetir por escrito o que voce entendeu.",
    "- Confirmacao clara em audio (por exemplo: pode confirmar, isso mesmo, sim pode marcar) vale como confirmacao da cliente, exatamente como valeria por texto, e continua sujeita as mesmas regras de preparar antes e confirmar depois.",
    "- Se a transcricao estiver ambigua ou truncada, ou se um dado critico (servico, dia, horario, valor, nome) nao der para ler com seguranca, pergunte e espere a resposta antes de agir. Nunca adivinhe o que faltou.",
    "- Nunca invente conteudo de audio que nao esteja transcrito aqui e nunca afirme que voce ouviu o audio.",
  ];
}
