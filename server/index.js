import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { db, ensureAdmin, getMenuItems, getSettings, isValidImageSource, isValidMapUrl } from "./db.js";

const requiredEnvironment = ["SESSION_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
if (missingEnvironment.length) {
  throw new Error(`Missing required environment values: ${missingEnvironment.join(", ")}. Copy .env.example to .env and configure it.`);
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}
if (process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
}

ensureAdmin(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
const fallbackPasswordHash = db.prepare("SELECT password_hash FROM admins LIMIT 1").get().password_hash;

const app = express();
const port = Number(process.env.PORT || 3001);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionTable = {
  get: db.prepare("SELECT data, expires_at FROM sessions WHERE sid = ?"),
  set: db.prepare("INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at"),
  destroy: db.prepare("DELETE FROM sessions WHERE sid = ?"),
  touch: db.prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?"),
  cleanup: db.prepare("DELETE FROM sessions WHERE expires_at <= ?")
};

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = sessionTable.get.get(sid);
      if (!row || row.expires_at <= Date.now()) {
        if (row) sessionTable.destroy.run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
      sessionTable.set.run(sid, JSON.stringify(value), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      sessionTable.destroy.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
      sessionTable.touch.run(expiresAt, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"]
    }
  }
}));
app.use(express.json({ limit: "32kb" }));
app.use(session({
  name: "chaiadda.sid",
  secret: process.env.SESSION_SECRET,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/"
  }
}));

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." }
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many order requests. Please wait before trying again." }
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Please sign in to access the dashboard." });
  next();
}

function requireCsrf(req, res, next) {
  const expected = req.session.csrfToken;
  const received = req.get("x-csrf-token");
  if (!expected || !received || expected.length !== received.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return res.status(403).json({ error: "Your security token expired. Refresh the page and try again." });
  }
  next();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

function validText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function publicSettings() {
  const settings = getSettings();
  return { ...settings, phoneNumber: settings.phoneNumber, whatsappNumber: settings.whatsappNumber };
}

app.get("/api/csrf", (req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  req.session.save((error) => {
    if (error) return next(error);
    res.json({ csrfToken: req.session.csrfToken });
  });
});

app.post("/api/auth/login", loginLimiter, requireCsrf, asyncHandler(async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password || username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: "Enter your username and password." });
  }
  const admin = db.prepare("SELECT id, username, password_hash FROM admins WHERE username = ?").get(username);
  const matches = await bcrypt.compare(password, admin?.password_hash || fallbackPasswordHash);
  if (!admin || !matches) return res.status(401).json({ error: "The username or password is incorrect." });

  await regenerateSession(req);
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.json({ user: { username: admin.username }, csrfToken: req.session.csrfToken });
}));

app.post("/api/auth/logout", requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("chaiadda.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
    res.status(204).end();
  });
});

app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ username: req.session.username }));
app.get("/api/auth/session", (req, res) => {
  res.json({ user: req.session.adminId ? { username: req.session.username } : null });
});

app.get("/api/public-data", (req, res) => {
  res.json({
    settings: publicSettings(),
    menu: getMenuItems({ includeOffers: false }),
    offer: db.prepare("SELECT * FROM menu_items WHERE id = 'chai-biscuit-combo' AND available = 1").get() || null
  });
});

app.post("/api/order-requests", orderLimiter, requireCsrf, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return res.status(400).json({ error: "Choose at least one menu item." });
  }
  const requestedIds = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
        requestedIds.has(item.id)) {
      return res.status(400).json({ error: "The order request contains an invalid item or quantity." });
    }
    requestedIds.add(item.id);
  }

  const fetchItem = db.prepare("SELECT id, name, price FROM menu_items WHERE id = ? AND available = 1");
  const pricedItems = items.map(({ id, quantity }) => {
    const product = fetchItem.get(id);
    return product ? { id: product.id, name: product.name, quantity, price: product.price } : null;
  });
  if (pricedItems.some((item) => !item)) return res.status(400).json({ error: "One or more selected items are no longer available. Refresh the menu and try again." });
  const total = pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderId = crypto.randomUUID();
  db.prepare("INSERT INTO order_requests (id, items_json, total) VALUES (?, ?, ?)").run(orderId, JSON.stringify(pricedItems), total);
  res.status(201).json({ id: orderId, items: pricedItems, total, status: "requested" });
});

app.get("/api/admin/menu", requireAdmin, (req, res) => res.json(getMenuItems({ includeUnavailable: true })));

app.post("/api/admin/menu", requireAdmin, requireCsrf, (req, res) => {
  const { name, description, price, category, image = "", alt = "", available = true } = req.body || {};
  if (!validText(name, 100) || !validText(description, 280) || !Number.isInteger(price) || price < 0 || price > 100000 ||
      !["chai", "special", "other"].includes(category) || typeof image !== "string" || image.length > 1000 || !isValidImageSource(image) ||
      typeof alt !== "string" || alt.length > 300 || typeof available !== "boolean") {
    return res.status(400).json({ error: "Check the menu fields and try again." });
  }
  const id = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare("INSERT INTO menu_items (id, name, description, price, category, image, alt, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, name.trim(), description.trim(), price, category, image.trim(), alt.trim(), available ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id));
});

app.put("/api/admin/menu/:id", requireAdmin, requireCsrf, (req, res) => {
  const { name, description, price, category, image = "", alt = "", available } = req.body || {};
  if (!validText(name, 100) || !validText(description, 280) || !Number.isInteger(price) || price < 0 || price > 100000 ||
      !["chai", "special", "other"].includes(category) || typeof image !== "string" || image.length > 1000 || !isValidImageSource(image) ||
      typeof alt !== "string" || alt.length > 300 || typeof available !== "boolean") {
    return res.status(400).json({ error: "Check the menu fields and try again." });
  }
  const result = db.prepare(`
    UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, image = ?, alt = ?, available = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name.trim(), description.trim(), price, category, image.trim(), alt.trim(), available ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Menu item not found." });
  res.json(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(req.params.id));
});

app.delete("/api/admin/menu/:id", requireAdmin, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM menu_items WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Menu item not found." });
  res.status(204).end();
});

app.get("/api/admin/settings", requireAdmin, (req, res) => res.json(publicSettings()));

app.patch("/api/admin/settings", requireAdmin, requireCsrf, (req, res) => {
  const allowedFields = ["shopName", "whatsappNumber", "phoneNumber", "address", "openingHours", "mapUrl"];
  const updates = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (!Object.keys(updates).length || Object.keys(updates).some((key) => !allowedFields.includes(key))) {
    return res.status(400).json({ error: "No valid shop settings were supplied." });
  }
  const current = getSettings();
  const next = { ...current, ...updates };
  const valid = validText(next.shopName, 100) &&
    typeof next.whatsappNumber === "string" && (next.whatsappNumber === "" || /^\+?\d[\d\s()-]{6,22}$/.test(next.whatsappNumber)) &&
    typeof next.phoneNumber === "string" && (next.phoneNumber === "" || /^\+?\d[\d\s()-]{6,22}$/.test(next.phoneNumber)) &&
    typeof next.address === "string" && next.address.length <= 300 &&
    typeof next.openingHours === "string" && next.openingHours.length <= 200 &&
    typeof next.mapUrl === "string" && next.mapUrl.length <= 1000 && isValidMapUrl(next.mapUrl);
  if (!valid) return res.status(400).json({ error: "Check the shop name, contact details, and HTTPS Google Maps URL." });

  const update = db.prepare("INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const save = db.transaction(() => Object.entries(updates).forEach(([key, value]) => update.run(key, value.trim())));
  save();
  res.json(getSettings());
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT id, items_json, total, status, created_at, updated_at FROM order_requests ORDER BY created_at DESC LIMIT 200")
    .all()
    .map(({ items_json: itemsJson, ...order }) => ({ ...order, items: JSON.parse(itemsJson) }));
  res.json(orders);
});

app.patch("/api/admin/orders/:id", requireAdmin, requireCsrf, (req, res) => {
  const { status } = req.body || {};
  if (!["requested", "contacted", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Choose a valid order-request status." });
  }
  const result = db.prepare("UPDATE order_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Order request not found." });
  res.json({ id: req.params.id, status });
});

app.get("/api/admin/summary", requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT status, COUNT(*) AS count FROM order_requests GROUP BY status").all();
  const summary = Object.fromEntries(orders.map(({ status, count }) => [status, count]));
  res.json({
    totalRequests: Object.values(summary).reduce((total, count) => total + count, 0),
    requested: summary.requested || 0,
    contacted: summary.contacted || 0,
    completed: summary.completed || 0,
    availableMenuItems: db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE available = 1").get().count
  });
});

app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use(express.static(path.join(rootDirectory, "dist"), { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(rootDirectory, "dist", "index.html"), (error) => {
    if (error) next(new Error("Frontend build not found. Run npm run build before starting the production server."));
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({ error: status >= 500 ? "An unexpected server error occurred." : error.message });
});

setInterval(() => {
  try {
    sessionTable.cleanup.run(Date.now());
  } catch (error) {
    console.error("Session cleanup failed:", error);
  }
}, 60 * 60 * 1000).unref();

const server = app.listen(port, () => console.log(`Chai Adda server listening on http://localhost:${port}`));
process.on("SIGTERM", () => {
  server.close(() => db.close());
});
