import { createServer } from "node:http";
import { CURRENT_LEGAL_VERSIONS } from "@atendly-ia/legal-contract";

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:18181");
  if (url.pathname === "/health") return json(response, 200, { data: { ok: true }, requestId: "e2e-health" });

  if (url.pathname === "/auth/register" && request.method === "POST") {
    const body = await readBody(request);
    if (
      body.termsAccepted !== true ||
      body.termsVersion !== CURRENT_LEGAL_VERSIONS.termsVersion ||
      body.privacyPolicyVersion !== CURRENT_LEGAL_VERSIONS.privacyPolicyVersion
    ) {
      return json(response, 400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid legal acceptance." },
        requestId: "e2e-register-invalid",
      });
    }
    return json(
      response,
      201,
      {
        data: {
          user: { id: "e2e-user", email: body.email, createdAt: new Date().toISOString() },
        },
        requestId: "e2e-register",
      },
      { "set-cookie": "atendly_session=e2e-session; Path=/; HttpOnly; SameSite=Lax" },
    );
  }

  if (url.pathname === "/onboarding" && request.method === "GET") {
    return json(response, 200, {
      data: {
        profile: null,
        onboarding: { completed: false, currentStep: "PROFILE" },
        whatsappInstance: null,
      },
      requestId: "e2e-onboarding",
    });
  }

  return json(response, 404, {
    error: { code: "NOT_FOUND", message: "Not found." },
    requestId: "e2e-not-found",
  });
});

server.listen(18181, "127.0.0.1");
