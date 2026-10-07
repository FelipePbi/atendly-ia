"use client";

import { useEffect, useState } from "react";

import { ImportDonePathNote } from "@/features/imports/ImportDoneScreen";
import { ImportsFrameProvider } from "@/features/imports/ImportsLayout";
import { ImportsFlow, useImportState } from "@/features/imports/ImportsScreen";
import { Icon } from "@/shared/icons/Icon";

import { onboardingError } from "./blocks/registry";
import { stepAfterImport, useOnboardingRuntime } from "./OnboardingRuntime";
import { OnboardingFrame } from "./OnboardingShell";
import type { OnboardingScenario } from "./scenarios";

/**
 * Etapa `importacao` do onboarding (Goal066, U-09): a mesma experiência de
 * `/importacao` — as mesmas telas, sobre o mesmo `getImportState` e as
 * mesmas chamadas —, na moldura do onboarding. Nada aqui chama
 * `useShellConfig`: o onboarding não está dentro do shell da plataforma, e
 * a moldura `onboarding` tira o link "Configurações" das telas do módulo.
 * Montar a etapa só lê o estado; abrir sessão continua sendo decisão da
 * pessoa, na tela de conectar.
 */
export function OnboardingImportStep({
  go,
  onExit,
}: {
  go: (step: OnboardingScenario) => void;
  onExit: () => void;
}) {
  const reader = useImportState();
  const { draft } = useOnboardingRuntime();
  return (
    <OnboardingFrame onExit={onExit} scenario="importacao">
      <ImportsFrameProvider frame="onboarding">
        <ImportsFlow
          historyActions={<ImportDoneActions go={go} />}
          reader={reader}
          timeZone={draft.timezone}
        />
      </ImportsFrameProvider>
    </OnboardingFrame>
  );
}

/**
 * Rodapé da importação concluída (vault §5B, 2.I10): relê o onboarding, que
 * já traz os serviços e horários importados, e mostra por que "Continuar"
 * leva a uma pendência — a primeira que a importação não resolveu. Com os
 * dois resolvidos, o selo e o título da tela já dizem que deu certo, e o
 * aviso de sucesso não aparece. Abaixo do botão, a nota diz onde o histórico
 * fica.
 */
function ImportDoneActions({
  go,
}: {
  go: (step: OnboardingScenario) => void;
}) {
  const { refresh } = useOnboardingRuntime();
  const [next, setNext] = useState<ReturnType<typeof stepAfterImport> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    refresh()
      .then((state) => {
        if (active) setNext(stepAfterImport(state));
      })
      .catch((caught: unknown) => {
        if (active) setError(onboardingError(caught));
      });
    return () => {
      active = false;
    };
    // Relê uma vez, quando o resultado aparece; `refresh` muda a cada render
    // do provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function continueOnboarding() {
    setBusy(true);
    setError(null);
    try {
      const target = next ?? stepAfterImport(await refresh());
      go(target.step);
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {next && next.step !== "demonstracao-da-ia" && (
        <div className="onboarding-note" role="status">
          <Icon name="info" />
          <span>{next.notice}</span>
        </div>
      )}
      {error && (
        <div className="onboarding-note is-important" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
      <div className="onboarding-actions">
        <button
          className="btn btn-primary"
          disabled={busy}
          type="button"
          onClick={() => void continueOnboarding()}
        >
          {busy ? "Abrindo..." : "Continuar"}
        </button>
      </div>
      <ImportDonePathNote />
    </>
  );
}
