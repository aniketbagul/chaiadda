import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../style.css";

const CATEGORIES = [
  ["all", "All"],
  ["chai", "Chai"],
  ["special", "Special Tea"],
  ["other", "Other Beverages"]
];
const EMPTY_SETTINGS = {
  shopName: "Chai Adda",
  whatsappNumber: "",
  phoneNumber: "",
  address: "[Shop address — update in dashboard]",
  openingHours: "[Opening hours — update in dashboard]",
  mapUrl: ""
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function Brand({ light = false }) {
  return <a className={`brand ${light ? "brand-light" : ""}`} href="/" aria-label="Chai Adda home">
    <span className="brand-mark" aria-hidden="true">☕</span>
    <span>chai <strong>adda</strong><small>FRESH CHAI. HAPPY CONVERSATIONS.</small></span>
  </a>;
}

function FallbackImage({ src, alt, className = "", loading = "lazy" }) {
  const [broken, setBroken] = useState(false);
  return <div className={`media-frame ${className} ${broken ? "image-broken" : ""}`}>
    {src && <img src={src} alt={alt} loading={loading} onError={() => setBroken(true)} />}
    {broken && <span className="media-fallback" aria-hidden="true">☕</span>}
  </div>;
}

async function placeOrder(item, quantity, settings, csrf, onNotice) {
  const phone = (settings.whatsappNumber || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(phone)) {
    onNotice("WhatsApp ordering is not configured. Add a valid number in the admin dashboard.");
    return;
  }
  const message = `Hello ${settings.shopName || "Chai Adda"}! I would like to order ${quantity} ${item.name} (₹${item.price * quantity}). Please confirm availability.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  try {
    await api("/api/order-requests", {
      method: "POST",
      headers: { "X-CSRF-Token": csrf },
      body: JSON.stringify({ items: [{ id: item.id, quantity }] })
    });
    onNotice("Order request recorded. WhatsApp opened for you to review and send; the shop must confirm availability.");
  } catch (error) {
    onNotice(`WhatsApp opened, but this request could not be recorded: ${error.message}`);
  }
}

function QuantityOrderCard({ item, settings, csrf, onNotice }) {
  const [quantity, setQuantity] = useState(1);
  return <article className="menu-card">
    <FallbackImage src={item.image} alt={item.alt || item.name} className="menu-photo" />
    <div className="menu-card-content">
      <div className="menu-card-top"><h3>{item.name}</h3><span className="menu-price">₹{item.price}</span></div>
      <p className="menu-description">{item.description}</p>
      <div className="menu-order-row">
        <div className="quantity-control" aria-label={`Quantity for ${item.name}`}>
          <button type="button" onClick={() => setQuantity((n) => Math.max(1, n - 1))} aria-label={`Decrease ${item.name} quantity`}>−</button>
          <input type="number" value={quantity} min="1" max="99" inputMode="numeric" aria-label={`${item.name} quantity`} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} />
          <button type="button" onClick={() => setQuantity((n) => Math.min(99, n + 1))} aria-label={`Increase ${item.name} quantity`}>+</button>
        </div>
        <button className="order-card-button" type="button" onClick={() => placeOrder(item, quantity, settings, csrf, onNotice)}>Order Now ↗</button>
      </div>
    </div>
  </article>;
}

function Gallery({ onOpen }) {
  return <div className="gallery-grid">{galleryPhotos.map(([src, alt, label, className], index) =>
    <button className={`gallery-item ${className}`} type="button" key={label} onClick={() => onOpen(index)} aria-label={`View ${label} photo`}>
      <FallbackImage src={src} alt={alt} />
      <span>{label}</span>
    </button>)}</div>;
}

function Lightbox({ photos, index, onClose, onChange }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onChange((index + photos.length - 1) % photos.length);
      if (event.key === "ArrowRight") onChange((index + 1) % photos.length);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("menu-open");
    };
  }, [index, photos.length, onChange, onClose]);
  const photo = photos[index];
  return <div className="lightbox" role="dialog" aria-modal="true" aria-label="Gallery image viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="lightbox-close" type="button" aria-label="Close image viewer" onClick={onClose}>×</button>
    <button className="lightbox-prev" type="button" aria-label="Previous image" onClick={() => onChange((index + photos.length - 1) % photos.length)}>‹</button>
    <figure><img src={photo[0]} alt={photo[1]} /><figcaption>{photo[2]}</figcaption></figure>
    <button className="lightbox-next" type="button" aria-label="Next image" onClick={() => onChange((index + 1) % photos.length)}>›</button>
  </div>;
}

const galleryPhotos = [
  ["https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=700&q=80", "A freshly served cup of cutting chai", "Cutting chai", "gallery-tall"],
  ["https://images.unsplash.com/photo-1561336526-2914f13ceb36?auto=format&fit=crop&w=700&q=80", "A cup of aromatic tea", "Masala chai", ""],
  ["https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=700&q=80", "Tea served in a traditional style", "Kulhad chai", ""],
  ["https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=700&q=80", "Tea being prepared with care", "Freshly prepared", ""],
  ["https://images.unsplash.com/photo-1530968464165-7a1861cbaf9f?auto=format&fit=crop&w=900&q=80", "Tea leaves and aromatic spices", "Tea & spices", "gallery-wide"],
  ["https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=700&q=80", "A cosy neighbourhood café atmosphere", "Cosy moments", ""]
];

function HomePage({ data, csrf }) {
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showTop, setShowTop] = useState(false);
  const settings = data?.settings || EMPTY_SETTINGS;
  const items = useMemo(() => (data?.menu || []).filter((item) => filter === "all" || item.category === filter), [data, filter]);
  const phoneDigits = (settings.phoneNumber || "").replace(/\D/g, "");
  const whatsappReady = /^\d{8,15}$/.test((settings.whatsappNumber || "").replace(/\D/g, ""));

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 450);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const generalOrder = () => {
    if (!whatsappReady) return setNotice("WhatsApp ordering is not configured. Add a valid number in the admin dashboard.");
    const phone = settings.whatsappNumber.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Hello ${settings.shopName}! I would like to place an order. Please share today's menu and confirm availability.`)}`, "_blank", "noopener,noreferrer");
  };
  const closeMenu = () => setMobileOpen(false);
  const validMapUrl = (() => {
    try {
      const url = new URL(settings.mapUrl);
      return url.protocol === "https:" && (url.hostname === "maps.google.com" || url.hostname.endsWith(".google.com") || url.hostname === "goo.gl") ? url.href : "";
    } catch { return ""; }
  })();

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Brand />
        <button className="menu-toggle" type="button" aria-expanded={mobileOpen} aria-controls="primary-navigation" aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"} onClick={() => setMobileOpen((open) => !open)}><span></span><span></span><span></span></button>
        <div className={`nav-links ${mobileOpen ? "is-open" : ""}`} id="primary-navigation">
          <a href="#home" onClick={closeMenu}>Home</a><a href="#menu" onClick={closeMenu}>Our Tea</a><a href="#about" onClick={closeMenu}>About Us</a><a href="#gallery" onClick={closeMenu}>Gallery</a><a href="#contact" onClick={closeMenu}>Contact</a>
          <button className="button button-small button-green" type="button" onClick={generalOrder}>Order on WhatsApp <span aria-hidden="true">↗</span></button>
        </div>
      </nav>
    </header>
    <main id="main">
      <section className="hero section-pad" id="home"><div className="hero-decor decor-one" aria-hidden="true">✳</div><div className="hero-decor decor-two" aria-hidden="true">✳</div>
        <div className="container hero-grid"><div className="hero-copy"><p className="eyebrow"><span></span> YOUR NEIGHBOURHOOD CHAI SPOT</p><h1>Har Cup Mein <em>Sukoon.</em></h1><p className="hero-subtitle">Freshly brewed chai, warm conversations, and the perfect break from your busy day.</p>
          <div className="hero-actions"><a className="button button-green" href="#menu">Explore Our Tea <span aria-hidden="true">↓</span></a><button className="button button-outline" type="button" onClick={generalOrder}><span aria-hidden="true">☏</span> Order on WhatsApp</button></div>
          <ul className="hero-highlights" aria-label="What makes our chai special"><li><span aria-hidden="true">✦</span> Freshly Brewed</li><li><span aria-hidden="true">♡</span> Made with Love</li><li><span aria-hidden="true">☼</span> Every Day, Every Cup</li></ul>
        </div><div className="hero-visual"><FallbackImage src="https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=1100&q=85" alt="A warm cup of tea surrounded by tea leaves in a cosy setting" className="hero-image-wrap" loading="eager" />
          <div className="hero-stamp" aria-hidden="true"><span>BREWED<br />WITH</span><strong>♥</strong><span>CARE</span></div><div className="hero-caption"><span className="caption-icon">❋</span><span><strong>A pause in your day</strong><small>Best enjoyed one sip at a time</small></span></div>
        </div></div>
      </section>
      <div className="ticker" aria-hidden="true"><div>GOOD CHAI, GOOD VIBES <span>✦</span> GOOD CHAI, GOOD VIBES <span>✦</span> GOOD CHAI, GOOD VIBES <span>✦</span> GOOD CHAI, GOOD VIBES</div></div>
      <section className="menu-section section-pad" id="menu"><div className="container">
        <div className="section-heading"><div><p className="eyebrow"><span></span> BREWED FRESH, SERVED WARM</p><h2>A Cup for <em>Every Mood</em></h2></div><p>From your everyday cutting chai to a slow-sipping kulhad, find your favourite in the adda.</p></div>
        <div className="filter-row" role="group" aria-label="Filter tea menu">{CATEGORIES.map(([value, label]) => <button key={value} data-filter={value} className={`filter-button ${filter === value ? "is-active" : ""}`} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {notice && <p className="config-notice" role="status">{notice}</p>}
        {!data ? <p>Loading today's menu…</p> : <div className="menu-grid" aria-live="polite">{items.map((item) => <QuantityOrderCard key={item.id} item={item} settings={settings} csrf={csrf} onNotice={setNotice} />)}</div>}
        {data?.offer && <aside className="offer-card"><div className="offer-art" aria-hidden="true"><span>☕</span><b>+</b><span>🍪</span></div><div className="offer-copy"><p className="eyebrow">A LITTLE SOMETHING EXTRA</p><h3>{data.offer.name}</h3><p>{data.offer.description}</p></div><div className="offer-price"><span>JUST</span><strong>₹{data.offer.price}</strong><small>Sample price</small></div><button className="button button-cream" type="button" onClick={() => placeOrder(data.offer, 1, settings, csrf, setNotice)}>Order Now ↗</button></aside>}
        <p className="sample-note">Menu and prices are editable in the admin dashboard.</p>
      </div></section>
      <section className="about-section section-pad" id="about"><div className="container about-grid">
        <div className="about-visual"><FallbackImage src="https://images.unsplash.com/photo-1561336526-2914f13ceb36?auto=format&fit=crop&w=900&q=80" alt="Fresh tea being poured and prepared" /><div className="about-note"><span aria-hidden="true">🌿</span><span><strong>Simple ingredients.</strong><small>Made fresh, just for you.</small></span></div></div>
        <div className="about-copy"><p className="eyebrow"><span></span> A LITTLE ABOUT OUR ADDA</p><h2>More Than<br />Just <em>Chai</em></h2><p className="about-lead">At Chai Adda, every cup is prepared fresh with carefully selected tea, aromatic spices, and a passion for serving great chai. We believe that the best conversations often begin with a cup of tea.</p>
          <div className="about-points"><div><span>✦</span><span><strong>Fresh ingredients</strong><small>Thoughtfully chosen, full of flavour.</small></span></div><div><span>♡</span><span><strong>Friendly service</strong><small>A warm welcome with every cup.</small></span></div><div><span>₹</span><span><strong>Affordable prices</strong><small>Good chai, made for every day.</small></span></div><div><span>⌂</span><span><strong>A welcoming adda</strong><small>Make yourself at home.</small></span></div></div>
        </div></div></section>
      <section className="features-section section-pad"><div className="container"><div className="center-heading"><p className="eyebrow"><span></span> THE CHAI ADDA WAY <span></span></p><h2>Goodness in <em>Every Sip</em></h2></div><div className="features-grid">
        {[["♨", "Freshly Prepared", "Brewed to order, so every cup arrives just right."], ["✿", "Quality Ingredients", "Tea and spices selected for their comforting flavour."], ["₹", "Affordable Prices", "Everyday favourites that are easy on the pocket."], ["♡", "Friendly Service", "A little warmth and a smile with every visit."]].map(([icon, title, text]) => <article className="feature-card" key={title}><span className="feature-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{text}</p></article>)}
      </div></div></section>
      <section className="gallery-section section-pad" id="gallery"><div className="container"><div className="section-heading"><div><p className="eyebrow"><span></span> A GLIMPSE OF THE ADDA</p><h2>Made for <em>Chai Moments</em></h2></div><p>Little moments, freshly brewed. Tap a photo to take a closer look.</p></div><Gallery onOpen={setLightboxIndex} /></div></section>
      <section className="reviews-section section-pad"><div className="container review-box"><span className="quote-mark" aria-hidden="true">“</span><p className="eyebrow">A NOTE FROM OUR ADDA</p><h2>Your feedback helps us<br /><em>serve you better.</em></h2><p>We'd love to hear about your chai moment. Genuine customer reviews will appear here once shared with us.</p><a href="#contact" className="text-link">Come say hello <span aria-hidden="true">→</span></a></div></section>
      <section className="contact-section section-pad" id="contact"><div className="container contact-grid"><div className="contact-copy"><p className="eyebrow"><span></span> DROP BY THE ADDA</p><h2>Let's Make It<br /><em>A Chai Date</em></h2><p>Pop in for a cup, or get in touch before you visit. We'd be happy to see you.</p>
        <div className="contact-details"><div><span className="contact-icon">⌖</span><span><strong>Find us</strong><small>{settings.address || "[Shop address — update in dashboard]"}</small></span></div><div><span className="contact-icon">◷</span><span><strong>Opening hours</strong><small>{settings.openingHours || "[Opening hours — update in dashboard]"}</small></span></div><div><span className="contact-icon">☎</span><span><strong>Call us</strong><small>{settings.phoneNumber || "[Phone number — update in dashboard]"}</small></span></div></div>
        <div className="contact-actions"><a className={`button button-green ${phoneDigits.length < 8 ? "is-disabled" : ""}`} href={phoneDigits.length >= 8 ? `tel:${settings.phoneNumber.replace(/[^\d+]/g, "")}` : undefined} aria-disabled={phoneDigits.length < 8}>Call Now</a><button className="button button-outline" type="button" onClick={generalOrder}>WhatsApp Us ↗</button>{validMapUrl && <a className="button button-outline" href={validMapUrl} target="_blank" rel="noopener noreferrer">Get Directions ↗</a>}</div>
      </div><div className="contact-art"><FallbackImage src="https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1000&q=80" alt="A welcoming café space ready for a chai break" className="contact-image" /><div className="contact-sticker"><span>CHAI</span><strong>♥</strong><span>TIME</span></div></div></div></section>
    </main>
    <footer className="site-footer"><div className="container footer-main"><div className="footer-brand"><Brand light /><p>A little cup of comfort, a lot of room for conversation. See you at the adda.</p><button className="footer-whatsapp" type="button" onClick={generalOrder}>Order on WhatsApp ↗</button></div><div className="footer-links"><h3>Quick links</h3><a href="#home">Home</a><a href="#menu">Our Tea</a><a href="#about">About Us</a><a href="#gallery">Gallery</a><a href="#contact">Contact</a></div><div className="footer-contact"><h3>Come say hello</h3><p>{settings.address}</p><p>{settings.phoneNumber || "[Phone number — update in dashboard]"}</p><p>{settings.openingHours}</p><a className="footer-admin-link" href="/admin">Admin login</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {settings.shopName}. Sample business content.</span><span>Fresh Chai. Happy Conversations.</span><a href="#home">Back to top ↑</a></div></footer>
    <button className={`scroll-top ${showTop ? "is-visible" : ""}`} type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
    {lightboxIndex !== null && <Lightbox photos={galleryPhotos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onChange={setLightboxIndex} />}
  </>;
}

function LoginPage({ csrf, setCsrf, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/auth/login", { method: "POST", headers: { "X-CSRF-Token": csrf }, body: JSON.stringify({ username, password }) });
      setCsrf(result.csrfToken);
      onLogin(result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="admin-login-page"><a className="login-home-link" href="/">← Back to Chai Adda</a><section className="login-card"><Brand /><p className="eyebrow"><span></span> SHOP OWNER ACCESS</p><h1>Welcome <em>back.</em></h1><p>Sign in to manage the menu, shop details, and order requests.</p>{error && <p className="form-error" role="alert">{error}</p>}
    <form onSubmit={submit}><label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-green" type="submit" disabled={busy || !csrf}>{busy ? "Signing in…" : "Sign in"}</button></form>
    <small>Admin accounts are configured by the shop owner in the server environment. There is no public sign-up.</small>
  </section></main>;
}

function AdminDashboard({ user, csrf, setCsrf, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [menu, setMenu] = useState([]);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);

  async function refresh() {
    setError("");
    try {
      const [menuData, settingsData, orderData, summaryData] = await Promise.all([
        api("/api/admin/menu"), api("/api/admin/settings"), api("/api/admin/orders"), api("/api/admin/summary")
      ]);
      setMenu(menuData);
      setSettings(settingsData);
      setOrders(orderData);
      setSummary(summaryData);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { refresh(); }, []);
  const headers = { "X-CSRF-Token": csrf };

  async function saveMenu(event) {
    event.preventDefault();
    setError(""); setMessage("");
    const payload = { ...menuForm, price: Number(menuForm.price) };
    try {
      await api(editing ? `/api/admin/menu/${encodeURIComponent(editing)}` : "/api/admin/menu", {
        method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload)
      });
      setEditing(null); setMenuForm(emptyMenuForm); setMessage("Menu item saved."); await refresh();
    } catch (err) { setError(err.message); }
  }
  async function deleteMenu(id) {
    if (!window.confirm("Delete this menu item? Existing order requests will remain in the dashboard.")) return;
    try {
      await api(`/api/admin/menu/${encodeURIComponent(id)}`, { method: "DELETE", headers });
      setMessage("Menu item deleted."); await refresh();
    } catch (err) { setError(err.message); }
  }
  async function saveSettings(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const updated = await api("/api/admin/settings", { method: "PATCH", headers, body: JSON.stringify(settings) });
      setSettings(updated); setMessage("Shop details saved.");
    } catch (err) { setError(err.message); }
  }
  async function updateOrder(order, status) {
    try {
      await api(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
      setMessage("Order request updated."); await refresh();
    } catch (err) { setError(err.message); }
  }
  function startEditing(item) {
    setEditing(item.id);
    setMenuForm({ name: item.name, description: item.description, price: String(item.price), category: item.category, image: item.image, alt: item.alt, available: item.available });
    setTab("menu");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", headers });
      const token = await api("/api/csrf");
      setCsrf(token.csrfToken);
      onLogout();
    } catch (err) { setError(err.message); }
  }

  return <div className="admin-shell">
    <aside className="admin-sidebar"><Brand light /><p className="admin-sidebar-label">SHOP DASHBOARD</p><nav aria-label="Dashboard navigation">
      {[["overview", "▦", "Overview"], ["menu", "☕", "Menu"], ["orders", "▤", "Order requests"], ["settings", "⚙", "Shop settings"]].map(([id, icon, label]) => <button type="button" key={id} className={tab === id ? "is-selected" : ""} onClick={() => setTab(id)}><span aria-hidden="true">{icon}</span>{label}{id === "orders" && summary.requested > 0 && <b>{summary.requested}</b>}</button>)}
    </nav><a href="/" className="admin-back-link">← View public website</a><div className="admin-sidebar-bottom"><span>Signed in as <strong>{user.username}</strong></span><button type="button" onClick={logout}>Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><p className="eyebrow"><span></span> CHAI ADDA ADMIN</p><h1>{tab === "overview" ? "Dashboard overview" : tab === "menu" ? "Manage menu" : tab === "orders" ? "Order requests" : "Shop settings"}</h1></div><button className="button button-outline" type="button" onClick={refresh}>Refresh</button></header>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      {tab === "overview" && <section><div className="stats-grid">{[["Order requests", summary.totalRequests || 0], ["Need attention", summary.requested || 0], ["Completed", summary.completed || 0], ["Available items", summary.availableMenuItems || 0]].map(([label, value]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <div className="admin-panel"><div className="panel-heading"><div><h2>Recent order requests</h2><p>Requests are not confirmed orders; contact the customer in WhatsApp to confirm.</p></div><button className="text-button" type="button" onClick={() => setTab("orders")}>View all →</button></div><OrderTable orders={orders.slice(0, 5)} onUpdate={updateOrder} /></div>
      </section>}
      {tab === "menu" && <section className="admin-two-column"><div className="admin-panel"><div className="panel-heading"><div><h2>{editing ? "Edit menu item" : "Add a menu item"}</h2><p>Prices are in Indian rupees.</p></div></div>
        <MenuForm form={menuForm} setForm={setMenuForm} onSubmit={saveMenu} editing={Boolean(editing)} onCancel={() => { setEditing(null); setMenuForm(emptyMenuForm); }} />
      </div><div className="admin-panel"><div className="panel-heading"><div><h2>Menu items</h2><p>{menu.length} items, including offers.</p></div></div><div className="admin-menu-list">{menu.map((item) => <article key={item.id} className="admin-menu-row"><div><strong>{item.name} {item.is_offer && <span className="offer-label">OFFER</span>}</strong><small>₹{item.price} · {item.available ? "Available" : "Hidden"}</small></div><div><button className="text-button" type="button" onClick={() => startEditing(item)}>Edit</button><button className="text-button danger-text" type="button" onClick={() => deleteMenu(item.id)}>Delete</button></div></article>)}</div></div></section>}
      {tab === "orders" && <div className="admin-panel"><div className="panel-heading"><div><h2>Order requests</h2><p>These are customer requests that must be reviewed and confirmed in WhatsApp.</p></div></div><OrderTable orders={orders} onUpdate={updateOrder} /></div>}
      {tab === "settings" && <section className="admin-panel settings-panel"><div className="panel-heading"><div><h2>Shop information</h2><p>Public-facing details and WhatsApp ordering configuration.</p></div></div><form className="admin-form settings-form" onSubmit={saveSettings}>
        <label>Shop name<input required maxLength="100" value={settings.shopName} onChange={(event) => setSettings({ ...settings, shopName: event.target.value })} /></label>
        <label>WhatsApp number<input placeholder="919876543210" value={settings.whatsappNumber} onChange={(event) => setSettings({ ...settings, whatsappNumber: event.target.value })} /><small>Country code and digits recommended; customers open WhatsApp with a prepared message.</small></label>
        <label>Phone number<input placeholder="+91 98765 43210" value={settings.phoneNumber} onChange={(event) => setSettings({ ...settings, phoneNumber: event.target.value })} /></label>
        <label>Shop address<textarea rows="2" maxLength="300" value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} /></label>
        <label>Opening hours<input maxLength="200" value={settings.openingHours} onChange={(event) => setSettings({ ...settings, openingHours: event.target.value })} /></label>
        <label>Google Maps URL (optional)<input type="url" placeholder="https://maps.google.com/..." value={settings.mapUrl} onChange={(event) => setSettings({ ...settings, mapUrl: event.target.value })} /></label>
        <button className="button button-green" type="submit">Save shop settings</button>
      </form></section>}
    </main>
  </div>;
}

const emptyMenuForm = { name: "", description: "", price: "10", category: "chai", image: "", alt: "", available: true };

function MenuForm({ form, setForm, onSubmit, editing, onCancel }) {
  const change = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  return <form className="admin-form" onSubmit={onSubmit}>
    <label>Item name<input required maxLength="100" value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
    <label>Description<textarea required maxLength="280" rows="2" value={form.description} onChange={(event) => change("description", event.target.value)} /></label>
    <div className="form-row"><label>Price (₹)<input type="number" required min="0" max="100000" step="1" value={form.price} onChange={(event) => change("price", event.target.value)} /></label><label>Category<select value={form.category} onChange={(event) => change("category", event.target.value)}><option value="chai">Chai</option><option value="special">Special Tea</option><option value="other">Other Beverages</option></select></label></div>
    <label>Image URL or relative path<input value={form.image} onChange={(event) => change("image", event.target.value)} placeholder="assets/images/tea.jpg" /></label>
    <label>Image description<input maxLength="300" value={form.alt} onChange={(event) => change("alt", event.target.value)} /></label>
    <label className="check-label"><input type="checkbox" checked={form.available} onChange={(event) => change("available", event.target.checked)} /> Available on the public menu</label>
    <div className="form-actions"><button className="button button-green" type="submit">{editing ? "Save changes" : "Add menu item"}</button>{editing && <button className="button button-outline" type="button" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}

function OrderTable({ orders, onUpdate }) {
  if (!orders.length) return <p className="empty-state">No order requests yet. They will appear here after a customer starts a WhatsApp order.</p>;
  return <div className="orders-list">{orders.map((order) => <article className="order-row" key={order.id}>
    <div className="order-title"><strong>Request {order.id.slice(0, 8)}</strong><time>{new Date(`${order.created_at.replace(" ", "T")}Z`).toLocaleString()}</time><small>{order.items.map((item) => `${item.quantity} × ${item.name} (₹${item.price})`).join(", ")}</small><b>Total ₹{order.total}</b></div>
    <div className="order-status-controls"><span className={`status-badge status-${order.status}`}>{order.status}</span><label className="sr-only" htmlFor={`status-${order.id}`}>Update status for request {order.id.slice(0, 8)}</label><select id={`status-${order.id}`} value={order.status} onChange={(event) => onUpdate(order, event.target.value)}><option value="requested">Requested</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
  </article>)}</div>;
}

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [csrf, setCsrf] = useState("");
  const [publicData, setPublicData] = useState(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(path.startsWith("/admin"));
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    api("/api/csrf").then((result) => setCsrf(result.csrfToken)).catch((err) => setLoadError(err.message));
    api("/api/public-data").then(setPublicData).catch((err) => setLoadError(err.message));
  }, []);
  useEffect(() => {
    if (!path.startsWith("/admin")) { setChecking(false); return; }
    api("/api/auth/session").then((data) => { setUser(data.user); setChecking(false); }).catch(() => setChecking(false));
  }, [path]);
  function navigate(destination) {
    window.history.pushState({}, "", destination);
    setPath(destination);
  }
  const onLogin = (loggedInUser) => { setUser(loggedInUser); navigate("/admin/dashboard"); };
  const onLogout = () => { setUser(null); navigate("/admin"); };
  if (path.startsWith("/admin")) {
    if (checking) return <main className="admin-loading">Checking your sign-in…</main>;
    if (user) return <AdminDashboard key={user.username} user={user} csrf={csrf} setCsrf={setCsrf} onLogout={onLogout} />;
    return <LoginPage csrf={csrf} setCsrf={setCsrf} onLogin={onLogin} />;
  }
  return <>{loadError && <p className="config-notice global-error" role="alert">The site could not load data from the server: {loadError}. Start the Express server and refresh this page.</p>}<HomePage data={publicData} csrf={csrf} /></>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
