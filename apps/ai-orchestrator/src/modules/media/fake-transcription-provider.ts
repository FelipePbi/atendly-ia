import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./transcription-provider.js";

/**
 * Dublê de transcrição que **conta chamadas**.
 *
 * A contagem é o ponto: "contato ignorado não é transcrito" só está provado se
 * o provedor puder dizer que não foi chamado. Um dublê que apenas devolvesse
 * texto deixaria passar uma chamada indevida cujo resultado fosse descartado
 * depois.
 *
 * Vive em `src/` (e não em `tests/`) porque é parte do contrato da porta:
 * qualquer teste — desta Work Unit, dos evals ou de outra unidade — usa o
 * mesmo dublê, e nenhum deles chama a OpenAI real.
 */
export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly provider: string;
  readonly model: string;
  readonly requests: TranscriptionRequest[] = [];

  constructor(
    private readonly behaviour: {
      /** Texto devolvido; ignorado quando `failWith` está presente. */
      text?: string;
      failWith?: Error;
      provider?: string;
      model?: string;
    } = {},
  ) {
    this.provider = behaviour.provider ?? "fake";
    this.model = behaviour.model ?? "fake-transcribe";
  }

  get callCount(): number {
    return this.requests.length;
  }

  async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    this.requests.push(request);
    if (this.behaviour.failWith) throw this.behaviour.failWith;
    return {
      text: this.behaviour.text ?? "transcricao de teste",
      provider: this.provider,
      model: this.model,
    };
  }
}
