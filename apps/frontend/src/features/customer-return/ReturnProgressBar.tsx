import clsx from "clsx";
import type { CSSProperties } from "react";

import { countLabel } from "./returnCopy";
import type { ProgressSegment } from "./returnProgress";

/**
 * Barra de andamento do retorno (D-210), em HTML e CSS, sem biblioteca de
 * gráfico: uma fatia por situação, do melhor resultado ao que nem saiu. A
 * cor nunca fala sozinha: a legenda (ou os filtros da aprovação) escreve o
 * nome e o número de cada fatia; sem legenda, o leitor de tela ouve a frase
 * inteira na própria barra.
 */
export function ReturnProgressBar({
  className,
  decorative = false,
  legend = false,
  segments,
}: {
  className?: string;
  /** A tela já escreve os números ao lado: a barra é só desenho. */
  decorative?: boolean;
  legend?: boolean;
  segments: ProgressSegment[];
}) {
  const silent = decorative || legend;
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const visible = segments.filter((segment) => segment.count > 0);
  const spoken =
    total === 0
      ? "Nada por aqui ainda"
      : visible
          .map(
            (segment) =>
              `${segment.label}: ${countLabel(segment.count, "cliente", "clientes")}`,
          )
          .join(", ");
  return (
    <div className={clsx("return-progress", className)}>
      <div
        aria-hidden={silent || undefined}
        aria-label={silent ? undefined : spoken}
        className="return-progress-bar"
        role={silent ? undefined : "img"}
      >
        {visible.map((segment) => (
          <span
            className={`return-progress-fill is-${segment.key}`}
            key={segment.key}
            style={
              {
                "--share": `${(segment.count / total) * 100}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {legend && (
        <ul className="return-legend">
          {segments.map((segment) => (
            <li
              className={clsx(
                "return-legend-item",
                segment.count === 0 && "is-empty",
              )}
              key={segment.key}
            >
              <span className={`return-legend-swatch is-${segment.key}`} />
              <span className="return-legend-label">{segment.label}</span>
              <span className="return-legend-count">{segment.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
