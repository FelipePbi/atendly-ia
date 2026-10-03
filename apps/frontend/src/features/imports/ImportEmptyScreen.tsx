"use client";

import { useState } from "react";

import { ConnectSourceScreen } from "./ConnectSourceScreen";
import { ImportIllustration } from "./ImportIllustration";
import { ImportsPage, useImportsFrame } from "./ImportsLayout";
import type { ImportState } from "./types";

const ILLUSTRATION_BARS = [80, 60, 70];

/**
 * Entrada de quem ainda não importou (I2), só em Configurações: o botão leva à
 * origem (2.I1) sem pedido nenhum. No onboarding a pessoa já escolheu
 * "Importar agora", então a etapa abre direto na origem.
 */
export function ImportEmptyScreen({
  onConnected,
}: {
  onConnected: (state: ImportState) => void;
}) {
  const frame = useImportsFrame();
  const [started, setStarted] = useState(false);

  if (frame === "onboarding" || started) {
    return <ConnectSourceScreen onConnected={onConnected} />;
  }

  return (
    <ImportsPage bare title="Importação">
      <div className="imports-empty">
        <ImportIllustration bars={ILLUSTRATION_BARS} />
        <div className="imports-empty-copy">
          <h2>Você ainda não importou do Minha Agenda</h2>
          <p>
            Traga serviços, clientes, horários e agendamentos de uma vez. Leva
            alguns minutos e acontece uma única vez — depois, a Atendly é sua
            agenda oficial.
          </p>
        </div>
        <div className="imports-empty-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setStarted(true)}
          >
            Importar do Minha Agenda
          </button>
          <span>
            Já tem clientes ou serviços aqui? Avisamos se algo coincidir antes
            de importar.
          </span>
        </div>
      </div>
    </ImportsPage>
  );
}
