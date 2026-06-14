# Logix Plus Desktop (Offline Sync)

Electron desktop app with **SQLite** local storage — no MongoDB or Node.js on client PCs.

## How deployment works

The desktop app **includes and auto-starts the Express API** on `http://127.0.0.1:3000` when you open it. Client PCs do **not** need Node.js or a separate terminal — double-click the app and both the UI and backend run together.

```
┌─────────────────────────────────────────────────────────┐
│  Logix Plus Desktop (single app window)                  │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ React UI        │───▶│ Embedded Express API :3000  │ │
│  │ (Electron)      │    │ (auto-started on launch)    │ │
│  └────────┬────────┘    └──────────────┬──────────────┘ │
│           │ SQLite offline cache        │ HTTPS when online│
└───────────┼─────────────────────────────┼─────────────────┘
            │                             ▼
            │              MongoDB Atlas (cloud) when online
            └─ offline invoices queue locally
```

- **Client PCs** install the desktop app only. Double-click — no terminal, no manual `npm start`.
- **MongoDB** stays in the cloud (Atlas). When offline, login uses cached credentials and invoices queue in local SQLite.
- **Online**: embedded API connects to MongoDB Atlas automatically when internet is available.

---

## For you (developer): build the installer

### 1. Configure server credentials (bundled into the app)

The desktop installer embeds your Express API. Before building, set MongoDB and JWT in `server/.env.production`:

```bash
cp server/.env.example server/.env.production
# Edit: MONGODB_URL, JWT_SECRET, etc.
```

The build copies this to `desktop/server.env` automatically. The app API URL defaults to the embedded backend:

`http://127.0.0.1:3000/v1`

Optional: override in `desktop/.env.production` only if pointing at a remote server instead.

### 2. Build on Ubuntu (`.deb` + AppImage)

```bash
cd desktop
npm install
npm run dist:linux
```

Output in `desktop/dist/`:

| File | Client install |
|------|----------------|
| `Logix Plus Solutions-1.0.0.deb` | `sudo dpkg -i "Logix Plus Solutions-1.0.0.deb"` |
| `Logix Plus Solutions-1.0.0.AppImage` | `chmod +x *.AppImage` then double-click |

### 3. Build on Windows (`.exe` installer)

Run on a **Windows PC** (native build required for SQLite):

```powershell
cd desktop
npm install
npm run dist:win
```

Output: `desktop/dist/Logix Plus Solutions Setup 1.0.0.exe`

Give this `.exe` to clients — they run it, click Next, and get a desktop shortcut.

### Optional icons

Place custom icons in `desktop/build/`:

- `icon.ico` — Windows (256×256)
- `icon.png` — Linux (512×512)

If missing, electron-builder uses the default Electron icon.

---

## For your clients: install and use

### Windows

1. Run `Logix Plus Solutions Setup 1.0.0.exe`
2. Accept defaults (creates Start Menu + Desktop shortcut)
3. Double-click **Logix Plus Solutions**
4. Log in with shop credentials

No Node.js, no commands, no separate server on that PC.

### Ubuntu / Linux

**`.deb` (recommended):**

```bash
sudo dpkg -i "Logix Plus Solutions-1.0.0.deb"
```

Launch from the app menu or desktop shortcut.

**AppImage:** make executable, then double-click.

---

## Server setup (one time, not on every client PC)

The API must be reachable from client machines before they use the desktop app.

**Option A — Cloud / VPS (recommended)**

Deploy `server/` to Railway, Render, Vercel, your VPS, etc. Use that URL in `desktop/.env.production` when building.

**Option B — One PC in the shop runs the server**

1. Install Node.js + MongoDB on **one** back-office PC or mini-server
2. Run the API there (`cd server && npm start`)
3. Build the desktop installer with `VITE_BACKEND_URL=http://<that-PC-LAN-IP>:3000/v1`
4. Other cashier PCs only install the desktop app

---

## Dev workflow (your machine only)

```bash
# Terminal 1 — API
cd server && npm run dev

# Terminal 2 — desktop
cd client && npm run build:electron
cd ../desktop && npm run dev
```

---

## Client data location

SQLite database (local cache + offline queue):

| OS | Path |
|----|------|
| Linux | `~/.config/logix-plus-desktop/data/{orgId}/{branchId}/workshop.db` |
| Windows | `%APPDATA%\logix-plus-desktop\data\{orgId}\{branchId}\workshop.db` |

---

## MVP sync scope

| Entity    | Pull (read) | Push (write) |
|-----------|-------------|--------------|
| Products  | Yes         | —            |
| Customers | Yes         | —            |
| Categories| Yes         | —            |
| Cash invoices | —     | Yes (offline queue) |

## Server endpoints

- `POST /v1/sync/register-device`
- `GET /v1/sync/bootstrap`
- `GET /v1/sync/pull?since=...`
- `POST /v1/sync/push`

Requires auth + `x-branch-id` header (same as web app).
