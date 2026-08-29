import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = await buildApp();

await app.listen({
  port: process.env.AI_ORCHESTRATOR_PORT ? env.AI_ORCHESTRATOR_PORT : env.PORT,
  host: "0.0.0.0",
});
