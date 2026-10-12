import { BrandMark } from "@/shared/ui/Brand";

/**
 * Pedido de 2026-10-12: no celular, travar a orientação em retrato.
 *
 * Uma página no navegador não consegue travar a rotação (a Screen
 * Orientation API só trava em tela cheia ou app instalado). Quem instala a
 * Avenly na tela inicial ganha o retrato pelo `orientation` do manifest
 * (`src/app/manifest.ts`). No navegador, este aviso cobre a tela quando o
 * celular está deitado.
 *
 * Só CSS, sem JS de detecção (`avenly-orientation.css`): fora da condição o
 * aviso tem `display: none`, que já o tira da árvore acessível (o mesmo
 * efeito de `aria-hidden`, sem precisar alternar atributo). Por isso não leva
 * `aria-hidden` fixo: ele esconderia o aviso também quando visível. Na
 * condição, o resto do `body` recebe `visibility: hidden`, que tira o
 * conteúdo de trás da árvore acessível e do foco por teclado, um "inert" sem
 * JS. `role="alert"` faz o leitor de tela anunciar quando o aviso aparece.
 */
export function OrientationGuard() {
  return (
    <div className="orientation-guard" role="alert">
      <span className="orientation-guard-mark">
        <BrandMark />
      </span>
      <p className="orientation-guard-title">Gire o celular</p>
      <p className="orientation-guard-text">A Avenly funciona na vertical.</p>
    </div>
  );
}
