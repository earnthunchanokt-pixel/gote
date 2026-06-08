import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const dataDir = process.env.DATA_DIR || rootDir;
const stateFilePath = join(dataDir, "app-state.json");
const seedStateFilePath = join(rootDir, "recovered-drink-state.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadPersistedState() {
  try {
    return await readFile(stateFilePath, "utf8");
  } catch {
    return await readFile(seedStateFilePath, "utf8");
  }
}

async function ensureDataDirectory() {
  await mkdir(dataDir, { recursive: true });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const { method = "GET" } = request;

  if (url.pathname === "/api/state" && method === "GET") {
    try {
      const content = await loadPersistedState();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(content);
    } catch {
      sendJson(response, 404, { error: "State file not found" });
    }
    return;
  }

  if (url.pathname === "/api/state" && method === "PUT") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);
      await ensureDataDirectory();
      await writeFile(stateFilePath, JSON.stringify(parsed, null, 2));
      sendJson(response, 200, { ok: true });
    } catch {
      sendJson(response, 400, { error: "Invalid state payload" });
    }
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(rootDir, requestPath.replace(/^\/+/, ""));

  try {
    const content = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
