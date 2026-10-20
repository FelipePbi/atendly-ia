"use client";

import { useEffect, useState } from "react";

import type { AiMessageDelivery, AiTone } from "@/data";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { resolveMessageDelivery } from "@/shared/messages/messageParts";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { ReturnSettingsSection } from "./ReturnSettingsSection";

/**
 * Configurações do retorno, dentro do próprio Retorno (D-210): o mesmo
 * formulário que antes ficava em Configurações › Retorno de clientes. O
 * estilo da IA e o jeito de enviar só servem para o exemplo do texto-base;
 * sem eles, valem o Equilibrado e as várias mensagens curtas.
 */
export function ReturnSettingsScreen() {
  const [tone, setTone] = useState<AiTone>("BALANCED");
  const [delivery, setDelivery] = useState<AiMessageDelivery>("PARTS");

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.get(controller.signal)
      .then((state) => {
        setTone(state.ai.tone ?? "BALANCED");
        setDelivery(resolveMessageDelivery(state.ai.messageDelivery));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useShellConfig({
    active: "retorno",
    module: "directory",
    pushed: true,
    title: "Configurações do retorno",
  });

  return (
    <div className="page return-page">
      <PushedBar
        backHref="/retorno"
        backLabel="Voltar para o retorno"
        title="Configurações"
      />
      <div className="return-content">
        <ReturnSettingsSection delivery={delivery} tone={tone} />
      </div>
    </div>
  );
}
