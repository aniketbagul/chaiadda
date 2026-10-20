# Chai Adda

A responsive React website and private shop dashboard backed by an Express API and SQLite. The public site supports menu filtering, quantity selection, WhatsApp order-request links, and a photo gallery. The dashboard manages menu items and prices, shop contact settings, and the status of customer order requests.

This project needs a Node.js server and persistent disk for its API and SQLite database. It is **not a GitHub Pages-only site**: GitHub Pages cannot run the authentication or backend. The repository can be hosted on GitHub and deployed to a Node.js host that supports persistent storage.

## Stack and layout

- React 18 and Vite for the frontend.
- Express for the API and production static-file server.
- SQLite for menu, shop settings, order requests, users, and server-side sessions.
- bcrypt password hashing, HttpOnly/SameSite session cookies, CSRF tokens, Helmet security headers, and rate limits on login and public order requests.

```text
chai-adda/
├── index.html
├── style.css
├── src/
│   └── main.jsx
├── server/
│   ├── db.js
│   └── index.js
├── assets/images/
├── data/                 # Created at runtime; do not commit
├── .env.example
├── package.json
└── vite.config.js
```

## Requirements

- Node.js 20 or newer and npm.
- A server or host with a persistent writable directory for SQLite.

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`. Set a private `SESSION_SECRET` of at least 32 characters and a unique `ADMIN_PASSWORD` of at least 12 characters. `ADMIN_USERNAME` sets the dashboard login name. Never commit `.env`.

   To make a random session secret, run `openssl rand -hex 32`.

3. Start the API in one terminal:

   ```sh
   npm run server
   ```

   SQLite tables and the sample menu are initialized automatically. On first startup, the admin is created from the environment values. The configured username/password are synchronized on subsequent server starts, so update `.env` and restart to rotate them.

4. Start the React development server in a second terminal:

   ```sh
   npm run dev
   ```

5. Open the local Vite URL printed in the terminal. Visit `/admin` to sign in.

For a production-style local run, build the frontend and run the API server:

```sh
npm run build
npm start
```

Then open `http://localhost:3001`.

## Dashboard

- **Menu:** add, edit, hide, or delete menu items and prices. The Chai + Biscuit offer is seeded as an editable offer item.
- **Shop settings:** edit shop name, WhatsApp number, phone number, address, opening hours, and an optional Google Maps URL.
- **Order requests:** review requests created when a visitor starts a WhatsApp order, then set each request to Requested, Contacted, Completed, or Cancelled.

An order request in the dashboard records that a customer opened an order flow. It does **not** mean the customer sent the WhatsApp message or that the shop confirmed the order. Confirm availability with the customer in WhatsApp.

## Login and security

There is no public signup or hard-coded default password. Configure `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the private server environment before starting the backend. Use a long, unique password and a random session secret. Admin sessions use server-side SQLite storage and HttpOnly, SameSite cookies; cookies are marked Secure in production. Login and order-request endpoints are rate-limited.

For production, use HTTPS and a host with persistent storage. Point `DATABASE_PATH` to a private writable location outside the public web directory. Back up that database file securely. Do not publish the `.env` file or database.

## Customization

### Menu content

The sample menu is inserted into SQLite the first time the database is created. Use the admin dashboard for ongoing edits. To reset to a clean sample database, stop the server and remove only the configured SQLite database and its `-shm` / `-wal` companion files; this also deletes users and order-request history.

### Images

Images currently use Unsplash URLs. Add shop photos under `assets/images/` and enter relative paths such as `assets/images/masala-chai.jpg` in the menu editor. Use descriptive image text for accessibility. Broken images use a visual fallback.

### Shop details

Update details in the dashboard. WhatsApp numbers should include the country code; the public site opens WhatsApp with a prepared message for the customer to review and send. The Call Now control is only usable after a phone number is configured. The Get Directions link only appears for an HTTPS Google Maps URL.

## Tests and build

```sh
npm test
npm run build
```

## Deploy

1. Push the source repository to GitHub. Keep `.env` and `data/` out of the repository.
2. Choose a Node.js hosting service that supports running a persistent Express process and durable writable storage. GitHub Pages alone cannot host this backend.
3. Configure the host to install dependencies, run `npm run build`, then start with `npm start`.
4. Set `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and (optionally) `DATABASE_PATH` as private host environment variables. Use a persistent path for `DATABASE_PATH`.
5. Configure HTTPS and confirm the host's reverse-proxy setup. The application trusts one proxy hop in production to set secure session cookies.
6. Visit `/admin` on the deployed site, sign in, replace all placeholder contact details, set the WhatsApp number, and update the sample menu/prices.

The exact public URL and persistent-storage setup depend on the hosting provider. Do not use GitHub Pages for this full-stack version.
