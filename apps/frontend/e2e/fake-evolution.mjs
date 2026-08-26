import { createServer } from "node:http";

const instances = new Map();
let pairFailure = false;

const qrSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="white"/>
    <g fill="#0B1727">
      <path d="M24 24h64v64H24zm12 12v40h40V36zM168 24h64v64h-64zm12 12v40h40V36zM24 168h64v64H24zm12 12v40h40v-40z"/>
      <path d="M108 28h16v16h-16zm24 0h16v32h-16zm-24 40h40v16h-40zm-8 32h20v20h-20zm32 0h20v44h-20zm-32 32h20v20h-20zm60-32h20v20h-20zm28 0h16v16h-16zm24 0h20v44h-20zm-112 64h20v20h-20zm32-8h20v20h-20zm28 0h20v48h-20zm28 0h16v16h-16zm24 0h20v20h-20zm-112 40h52v16h-52zm80 20h20v16h-20zm32-20h40v36h-16v-20h-24z"/>
    </g>
  </svg>
`).toString("base64");

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:18080");
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/__test/reset" && request.method === "POST") {
    instances.clear();
    pairFailure = false;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/__test/connect" && request.method === "POST") {
    for (const instance of instances.values()) instance.connected = true;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/__test/pair-failure" && request.method === "POST") {
    pairFailure = true;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/__test/stats") {
    return json(response, 200, { instances: instances.size });
  }

  const token = request.headers.apikey;
  if (url.pathname === "/instance/create" && request.method === "POST") {
    const body = await readBody(request);
    const instance = {
      id: `e2e-${instances.size + 1}`,
      name: body.name,
      token: body.token,
      connected: false
    };
    instances.set(instance.token, instance);
    return json(response, 200, { message: "success", data: instance });
  }

  const instance = instances.get(token);
  if (!instance) return json(response, 401, { error: "instance not found" });
  if (url.pathname === "/instance/connect" && request.method === "POST") {
    return json(response, 200, { message: "success", data: { connected: true } });
  }
  if (url.pathname === "/instance/status" && request.method === "GET") {
    return json(response, 200, {
      message: "success",
      data: {
        connected: true,
        loggedIn: instance.connected,
        myJid: instance.connected ? "5511999999999@s.whatsapp.net" : ""
      }
    });
  }
  if (url.pathname === "/instance/qr" && request.method === "GET") {
    return json(response, 200, {
      message: "success",
      data: { Qrcode: `data:image/svg+xml;base64,${qrSvg}`, Code: "e2e-qr-code" }
    });
  }
  if (url.pathname === "/instance/pair" && request.method === "POST") {
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (pairFailure) return json(response, 502, { error: "pairing temporarily unavailable" });
    return json(response, 200, { message: "success", data: { PairingCode: "12345678" } });
  }

  return json(response, 404, { error: "not found" });
});

server.listen(18080, "127.0.0.1");
