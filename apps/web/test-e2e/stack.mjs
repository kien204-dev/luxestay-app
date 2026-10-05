// Everything a browser test needs, on this machine: the real API against the
// throwaway PostgreSQL (docker-compose.test.yml), the web app built the way
// the Docker image builds it, one server in front of both (as nginx is in
// production), and an installed Chrome or Edge.
//
// Run with `npm run test:e2e` from the repository root.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.resolve(WEB_DIR, "../api");
const requireApi = createRequire(path.join(API_DIR, "server.js"));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function buildWeb() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "luxestay-e2e-web-"));
  const result = spawnSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"], {
    cwd: WEB_DIR,
    env: { ...process.env, VITE_API_URL: "/api" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error("The web app did not build");
  return outDir;
}

// Serves the built web app and passes /api and /uploads on to the API, so the
// browser talks to one origin, as it does behind nginx.
function createWebServer(distDir, getApiPort) {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    if (/^\/(api|uploads|socket\.io)\//.test(pathname)) {
      const upstream = http.request(
        { host: "127.0.0.1", port: getApiPort(), path: req.url, method: req.method, headers: req.headers },
        (answer) => {
          res.writeHead(answer.statusCode, answer.headers);
          answer.pipe(res);
        }
      );
      upstream.on("error", () => res.writeHead(502).end());
      req.pipe(upstream);
      return;
    }

    const file = path.join(distDir, pathname);
    const exists = file.startsWith(distDir) && fs.existsSync(file) && fs.statSync(file).isFile();
    const served = exists ? file : path.join(distDir, "index.html");
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(served)] || "application/octet-stream" });
    fs.createReadStream(served).pipe(res);
  });
}

// An installed browser is used, so nothing has to be downloaded:
// E2E_BROWSER_PATH, else Chrome, else Edge.
async function launchBrowser() {
  const attempts = process.env.E2E_BROWSER_PATH
    ? [{ executablePath: process.env.E2E_BROWSER_PATH }]
    : [{ channel: "chrome" }, { channel: "msedge" }];
  const failures = [];
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (err) {
      failures.push(err.message.split("\n")[0]);
    }
  }
  throw new Error(
    `No browser to test with (${failures.join("; ")}). Install Chrome or Edge, or set E2E_BROWSER_PATH.`
  );
}

export async function startStack() {
  let apiPort;
  const webServer = createWebServer(buildWeb(), () => apiPort);
  const baseUrl = `http://127.0.0.1:${await listen(webServer)}`;

  Object.assign(process.env, {
    TZ: "UTC",
    NODE_ENV: "test",
    DB_HOST: process.env.TEST_DB_HOST || "127.0.0.1",
    DB_PORT: process.env.TEST_DB_PORT || "54330",
    DB_USER: "luxestay",
    DB_PASSWORD: "luxestay",
    DB_NAME: "luxestay_test",
    DB_SSL: "false",
    JWT_SECRET: "e2e-".padEnd(48, "x"),
    CLIENT_URL: baseUrl,
    FRONTEND_URL: baseUrl,
    SMTP_HOST: "",
    STORAGE_DRIVER: "local",
    DEMO_MODE: "",
  });

  // Google's half of the sign-in cannot run here, so the token check is the
  // one thing replaced: a "token" is the JSON of the Google account it stands
  // for. What the API does with a verified Google account is the real code.
  const firebase = requireApi("./src/services/firebaseAdmin");
  firebase.isGoogleLoginConfigured = () => true;
  firebase.verifyFirebaseIdToken = async (token) => {
    const account = JSON.parse(token);
    return { ...account, email_verified: true, firebase: { sign_in_provider: "google.com" } };
  };

  const pool = requireApi("./src/db/db");
  await requireApi("./src/db/reset").reset(pool, { log: () => {} });

  const apiServer = http.createServer(requireApi("./server"));
  requireApi("./src/services/socket").initSocket(apiServer);
  apiPort = await listen(apiServer);

  const browser = await launchBrowser();

  return {
    baseUrl,
    browser,
    pool,
    async stop() {
      await browser.close();
      apiServer.closeAllConnections();
      webServer.closeAllConnections();
      await Promise.all([apiServer, webServer].map((server) => new Promise((resolve) => server.close(resolve))));
      await pool.end();
    },
  };
}
