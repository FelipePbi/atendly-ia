import { buildApp } from "./app/build-app.js";
import { env } from "./config/env.js";

const app = await buildApp();

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, "Scheduling Service failed to start");
  process.exit(1);
}
