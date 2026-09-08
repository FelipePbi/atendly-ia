import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "dist/**"],
    // As suítes de `tests/integration` compartilham o mesmo banco descartável e
    // o claim da inbox é global por definição: rodar arquivos em paralelo faria
    // um worker reivindicar o evento do outro. Só vale quando o gate de
    // integração fornece o banco; o gate core segue paralelo.
    fileParallelism: !process.env.AI_TEST_DATABASE_URL,
  },
});
