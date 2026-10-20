import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const databasePath = path.resolve(process.env.DATABASE_PATH || "./data/chai-adda.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    category TEXT NOT NULL CHECK (category IN ('chai', 'special', 'other')),
    image TEXT NOT NULL DEFAULT '',
    alt TEXT NOT NULL DEFAULT '',
    available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
    is_offer INTEGER NOT NULL DEFAULT 0 CHECK (is_offer IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shop_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_requests (
    id TEXT PRIMARY KEY,
    items_json TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'requested'
      CHECK (status IN ('requested', 'contacted', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS order_requests_created_idx ON order_requests(created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

const seedMenu = [
  ["cutting-chai", "Cutting Chai", "A little cup of strong, classic chai.", 10, "chai", "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=600&q=75", "A cup of freshly brewed cutting chai"],
  ["masala-chai", "Masala Chai", "Comforting tea with aromatic spices.", 15, "chai", "https://images.unsplash.com/photo-1561336526-2914f13ceb36?auto=format&fit=crop&w=600&q=75", "A warm cup of spiced tea"],
  ["ginger-chai", "Ginger Chai", "A warming brew with a gingery kick.", 15, "chai", "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=75", "A freshly served cup of tea"],
  ["elaichi-chai", "Elaichi Chai", "Classic chai with fragrant cardamom.", 20, "chai", "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=600&q=75", "A cup of tea ready to enjoy"],
  ["kulhad-chai", "Special Kulhad Chai", "A special chai in a traditional kulhad.", 25, "special", "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=600&q=75", "Tea served in a traditional style"],
  ["green-tea", "Green Tea", "A light, soothing tea for a quiet moment.", 20, "special", "https://images.unsplash.com/photo-1530968464165-7a1861cbaf9f?auto=format&fit=crop&w=600&q=75", "Tea leaves for a soothing cup of tea"],
  ["lemon-tea", "Lemon Tea", "A bright, refreshing tea with lemon.", 15, "other", "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=75", "A refreshing cup of lemon tea"],
  ["coffee", "Coffee", "A comforting cup for your coffee moment.", 20, "other", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=75", "A freshly made cup of coffee"]
];
const seedOffer = ["chai-biscuit-combo", "Chai + Biscuit Combo", "Your perfect evening chai break.", 20, "special", "", "Chai and biscuit combo", 1];

const seedItem = db.prepare(`
  INSERT OR IGNORE INTO menu_items (id, name, description, price, category, image, alt, is_offer)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const seedItemsTransaction = db.transaction((items) => items.forEach((item) => seedItem.run(...item)));
seedItemsTransaction([...seedMenu.map((item) => [...item, 0]), seedOffer]);

const seedSettings = {
  shopName: "Chai Adda",
  whatsappNumber: "",
  phoneNumber: "",
  address: "[Shop address — update in dashboard]",
  openingHours: "[Opening hours — update in dashboard]",
  mapUrl: ""
};
const insertSetting = db.prepare("INSERT OR IGNORE INTO shop_settings (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(seedSettings)) insertSetting.run(key, value);

export function ensureAdmin(username, password) {
  const passwordHash = bcrypt.hashSync(password, 12);
  const synchronize = db.transaction(() => {
    db.prepare("DELETE FROM admins WHERE username <> ?").run(username);
    db.prepare(`
      INSERT INTO admins (username, password_hash) VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
    `).run(username, passwordHash);
    db.prepare("DELETE FROM sessions").run();
  });
  synchronize();
}

export function getSettings() {
  return Object.fromEntries(db.prepare("SELECT key, value FROM shop_settings").all().map(({ key, value }) => [key, value]));
}

export function getMenuItems({ includeUnavailable = false, includeOffers = true } = {}) {
  const filters = [];
  if (!includeUnavailable) filters.push("available = 1");
  if (!includeOffers) filters.push("is_offer = 0");
  const query = `SELECT * FROM menu_items ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY name COLLATE NOCASE`;
  return db.prepare(query).all().map((item) => ({ ...item, available: Boolean(item.available), is_offer: Boolean(item.is_offer) }));
}

export function isValidMapUrl(value) {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "maps.google.com" ||
      url.hostname === "google.com" ||
      url.hostname.endsWith(".google.com") ||
      url.hostname === "goo.gl"
    );
  } catch {
    return false;
  }
}

export function isValidImageSource(value) {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return !value.startsWith("//") && !value.includes("\\") &&
      !/^[a-z][a-z\d+.-]*:/i.test(value) &&
      !value.split("/").includes("..");
  }
}
