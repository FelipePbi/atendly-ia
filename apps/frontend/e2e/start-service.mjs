import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const service = process.argv[2];
const frontendDir = fileURLToPath(new URL("..", import.meta.url));
const bffDir = fileURLToPath(new URL("../../bff", import.meta.url));

const config = service === "bff"
  ? {
      cwd: bffDir,
      args: ["--import", "tsx", "src/server.ts"],
      env: {
        NODE_ENV: "test",
        PORT: "3102",
        DATABASE_URL: "postgresql://app:app@127.0.0.1:5433/atendly_pairing_e2e?schema=public",
        JWT_SECRET: "pairing-e2e-only-secret-with-32-characters",
        FRONTEND_ORIGIN: "http://127.0.0.1:3101",
        BFF_PUBLIC_URL: "http://127.0.0.1:3102",
        EVOLUTION_GO_BASE_URL: "http://127.0.0.1:18080",
        EVOLUTION_GO_API_KEY: "e2e-global-key",
        EVOLUTION_WEBHOOK_SECRET: "e2e-webhook-secret"
      }
    }
  : service === "frontend"
    ? {
        cwd: frontendDir,
        args: ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3101"],
        env: {
          NODE_ENV: "production",
          BFF_BASE_URL: "http://127.0.0.1:3102",
          NEXT_PUBLIC_BFF_URL: "http://127.0.0.1:3102"
        }
      }
    : null;

if (!config) {
  throw new Error("Expected service argument: bff or frontend");
}

const child = spawn(process.execPath, config.args, {
  cwd: config.cwd,
  env: { ...process.env, ...config.env },
  stdio: "inherit"
});

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
