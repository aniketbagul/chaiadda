import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let server;
let baseUrl;
let temporaryDirectory;
let stderr = "";
let stdout = "";

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`API server exited early (${child.exitCode || child.signalCode}): ${stdout}\n${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/public-data`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
  throw new Error(`API server did not start: ${stderr}`);
}

async function request(pathname, { cookie = "", csrf = "", ...options } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  return { response, data: response.status === 204 ? null : await response.json() };
}

function responseCookie(response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(value, "expected response to set a session cookie");
  return value;
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chai-adda-test-"));
  const childEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    DATABASE_PATH: path.join(temporaryDirectory, "test.sqlite"),
    SESSION_SECRET: "test-session-secret-with-more-than-thirty-two-characters",
    ADMIN_USERNAME: "test-admin",
    ADMIN_PASSWORD: "test-password-that-is-long"
  };
  delete childEnvironment.NODE_TEST_CONTEXT;
  server = spawn(process.execPath, ["--input-type=module", "-e", "await import('./server/index.js')"], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.setEncoding("utf8");
  server.stdout.on("data", (chunk) => { stdout += chunk; });
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForServer(server);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("public menu, CSRF protection, login, dashboard APIs, and order requests work", { timeout: 60000 }, async () => {
  const publicResult = await request("/api/public-data");
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.data.menu.length, 8);
  assert.equal(publicResult.data.offer.id, "chai-biscuit-combo");
  assert.equal(publicResult.response.headers.get("x-powered-by"), null);
  assert.ok(publicResult.response.headers.get("content-security-policy"));

  const noAuth = await request("/api/admin/menu");
  assert.equal(noAuth.response.status, 401);
  assert.equal((await request("/api/auth/session")).data.user, null);
  const noCsrf = await request("/api/order-requests", { method: "POST", body: JSON.stringify({ items: [{ id: "cutting-chai", quantity: 1 }] }) });
  assert.equal(noCsrf.response.status, 403);

  const csrfResponse = await request("/api/csrf");
  let cookie = responseCookie(csrfResponse.response);
  let csrf = csrfResponse.data.csrfToken;
  const wrongPassword = await request("/api/auth/login", {
    method: "POST", cookie, csrf,
    body: JSON.stringify({ username: "test-admin", password: "wrong-password" })
  });
  assert.equal(wrongPassword.response.status, 401);

  const login = await request("/api/auth/login", {
    method: "POST", cookie, csrf,
    body: JSON.stringify({ username: "test-admin", password: "test-password-that-is-long" })
  });
  assert.equal(login.response.status, 200);
  cookie = responseCookie(login.response);
  csrf = login.data.csrfToken;
  assert.equal(login.data.user.username, "test-admin");
  assert.equal((await request("/api/admin/me", { cookie })).response.status, 200);

  const unsafeImage = await request("/api/admin/menu", {
    method: "POST", cookie, csrf,
    body: JSON.stringify({
      name: "Unsafe image", description: "Should be rejected.", price: 10, category: "chai",
      image: "http://example.com/image.jpg", alt: "Unsafe image", available: true
    })
  });
  assert.equal(unsafeImage.response.status, 400);

  const updateMenu = await request("/api/admin/menu/masala-chai", {
    method: "PUT", cookie, csrf,
    body: JSON.stringify({
      name: "Masala Chai", description: "Fresh masala chai.", price: 18, category: "chai",
      image: "", alt: "A cup of masala chai", available: true
    })
  });
  assert.equal(updateMenu.response.status, 200);

  const createOrder = await request("/api/order-requests", {
    method: "POST", cookie, csrf,
    body: JSON.stringify({ items: [{ id: "masala-chai", quantity: 2 }, { id: "chai-biscuit-combo", quantity: 1 }] })
  });
  assert.equal(createOrder.response.status, 201);
  assert.equal(createOrder.data.total, 56);
  assert.equal(createOrder.data.status, "requested");

  const orders = await request("/api/admin/orders", { cookie });
  assert.equal(orders.response.status, 200);
  assert.equal(orders.data.length, 1);
  const updateStatus = await request(`/api/admin/orders/${createOrder.data.id}`, {
    method: "PATCH", cookie, csrf, body: JSON.stringify({ status: "contacted" })
  });
  assert.equal(updateStatus.response.status, 200);
  assert.equal(updateStatus.data.status, "contacted");

  const settings = await request("/api/admin/settings", { cookie });
  const invalidMap = await request("/api/admin/settings", {
    method: "PATCH", cookie, csrf,
    body: JSON.stringify({ ...settings.data, mapUrl: "https://example.org/not-a-map" })
  });
  assert.equal(invalidMap.response.status, 400);
  const updateSettings = await request("/api/admin/settings", {
    method: "PATCH", cookie, csrf,
    body: JSON.stringify({ ...settings.data, whatsappNumber: "+91 98765 43210", address: "Updated shop address" })
  });
  assert.equal(updateSettings.response.status, 200);
  assert.equal(updateSettings.data.address, "Updated shop address");

  const logout = await request("/api/auth/logout", { method: "POST", cookie, csrf });
  assert.equal(logout.response.status, 204);
  assert.equal((await request("/api/admin/me")).response.status, 401);
});
