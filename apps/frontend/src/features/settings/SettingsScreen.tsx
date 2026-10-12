"use client";

import { ProductSettingsScreen } from "./ProductSettingsScreen";
import type { SettingsScenario } from "./types";

export function SettingsScreen({ scenario }: { scenario?: SettingsScenario }) {
  return <ProductSettingsScreen scenario={scenario ?? "hub"} />;
}
