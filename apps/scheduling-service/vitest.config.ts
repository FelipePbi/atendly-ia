import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "dist/**"],
    // As suítes de `tests/integration` compartilham o mesmo banco descartável
    // e criam/limpam linhas por tenant: rodar arquivos em paralelo faria uma
    // suíte enxergar o estado da outra.
    fileParallelism: !process.env.SCHEDULING_TEST_DATABASE_URL,
  },
});
