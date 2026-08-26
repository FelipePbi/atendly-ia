import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendDir = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3201"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    BFF_BASE_URL: "http://127.0.0.1:18181",
    NEXT_PUBLIC_BFF_URL: "http://127.0.0.1:18181",
  },
  stdio: "inherit",
});

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
