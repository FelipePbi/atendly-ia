const POLL_INTERVAL_MS = 40_000;
const REQUEST_TIMEOUT_MS = 10_000;

const defaultTargets = [
  {
    name: "frontend",
    url: "https://atendly-ia-frontend.onrender.com/login"
  },
  {
    name: "bff",
    url: "https://atendly-ia-bff.onrender.com/health"
  },
  {
    name: "api",
    url: "https://atendly-ia-api.onrender.com/health"
  },
  {
    name: "evolution-go",
    url: "https://atendly-ia-evolution-go.onrender.com/healthy"
  }
];

const targets = parseTargets(process.env.HEALTH_TARGETS) ?? defaultTargets;

function nowIso() {
  return new Date().toISOString();
}

async function checkTarget(target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(target.url, {
      method: "GET",
      signal: controller.signal
    });
    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      console.log(
        `[${nowIso()}] healthy target=${target.name} status=${response.status} latency_ms=${latencyMs}`
      );
      return;
    }

    console.error(
      `[${nowIso()}] unhealthy target=${target.name} status=${response.status} latency_ms=${latencyMs}`
    );
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      `[${nowIso()}] unhealthy target=${target.name} error="${message}" latency_ms=${latencyMs}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOnce() {
  await Promise.all(targets.map((target) => checkTarget(target)));
}

function parseTargets(value) {
  if (!value) return null;

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, url] = item.includes("=") ? item.split("=", 2) : [null, item];
      return {
        name: name || hostnameFromUrl(url),
        url
      };
    });

  return items.length > 0 ? items : null;
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown";
  }
}

console.log(
  `[${nowIso()}] starting health worker interval_ms=${POLL_INTERVAL_MS} timeout_ms=${REQUEST_TIMEOUT_MS}`
);

await pollOnce();
setInterval(() => {
  pollOnce().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${nowIso()}] polling_cycle_failed error="${message}"`);
  });
}, POLL_INTERVAL_MS);
