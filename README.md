# Finance Tracker — PWA

A personal finance tracker that works as an installable app on iPhone, Android, and desktop.  
Data syncs to your private Google Sheet.

## Deploy to GitHub Pages (free, ~5 min)

### 1. Create a GitHub account
Go to [github.com](https://github.com) and sign up if you don't have one.

### 2. Create a new repository
- Click the **+** button (top right) → **New repository**
- Name it: `finance-tracker` (or anything you like)
- Set it to **Public** ← required for free GitHub Pages
- Click **Create repository**

### 3. Upload the files
- On the repository page, click **uploading an existing file**
- Drag and drop the PWA files from this folder into the browser (everything needed for `index.html`, `lock.html`, CSS/JS, the service worker, and the empty `.nojekyll` file).
- The `finance-tracker-chrome/` subfolder is only for the Chrome extension. It is safe to publish (the extension source is already public-style HTML/JS), but you may omit it for a smaller upload — the PWA does not import from it.
- Click **Commit changes**

> `.nojekyll` disables Jekyll processing on GitHub Pages so files are served verbatim. Keep it at the repo root.

### 4. Enable GitHub Pages
- Go to **Settings** (tab at the top of your repo)
- Click **Pages** in the left sidebar
- Under "Source" → select **Deploy from a branch**
- Branch: **main** · Folder: **/ (root)**
- Click **Save**

### 5. Wait ~2 minutes, then visit your URL
GitHub gives you a URL like:  
`https://yourusername.github.io/finance-tracker`

Open that URL in **Safari on iPhone** → tap **Share → Add to Home Screen**  
It will appear as a full-screen app icon on your home screen.

---

## Google Sheets sync setup

Follow the same steps as the Chrome extension:

1. Go to [script.google.com](https://script.google.com) → New project
2. Delete all code, paste everything from `google-apps-script.js`
3. Save → Deploy → New deployment
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the `/exec` URL
5. Open the PWA → Settings → Google Sheets Sync → paste URL → Test connection

Your data syncs automatically every time you add or edit anything.

**PWA note (GitHub Pages):** The web app saves to Sheets using GET requests (small payloads) or chunked GET requests (large datasets) so data survives Google’s redirect. If you use a **custom** Apps Script backend, paste in the latest `google-apps-script.js` from this repo and **re-deploy** the web app (Manage deployments → Edit → New version) whenever that file changes — otherwise chunked saves will not work.

---

## Password

The app is password-protected. The default password is stored as a SHA-256 hash in `lock.html` — the raw password is never visible in the source code.

To change the password: compute the SHA-256 hash of your new password (use any online SHA-256 tool), replace the `HASH` value in `lock.html`, and re-upload the file to GitHub.

## Notes

- **Offline support**: The app works without internet. Data saves locally. Syncs when connection returns.
- **iOS storage**: Safari may clear PWA data if the phone is low on storage. Use Google Sheets sync to prevent data loss.
- **Sharing data**: The Chrome extension and PWA share the same Google Sheet — they stay in sync automatically.
- **Privacy**: Your financial data only goes to your own Google account. GitHub only hosts the app files, not your data.

## Repo housekeeping

- `.nojekyll` — disables Jekyll on GitHub Pages so the service worker, manifest, and any leading-underscore filenames are served as-is.
- `.gitignore` — keeps OS files (`.DS_Store`, `Thumbs.db`), editor folders (`.vscode/`, `.idea/`), local backups, log files, secrets (`.env`, `secrets.txt`), and Chrome packaging artifacts (`*.crx`, `*.pem`, `*.zip` inside `finance-tracker-chrome/`) out of commits.
- `.gitattributes` — normalizes text files to LF in the repository so Pages, the service worker, and Windows checkouts produce consistent diffs.
- **Backend parity** — `google-apps-script.js` is kept identical between repo root (PWA) and `finance-tracker-chrome/` (Chrome extension). Only one copy is actually deployed as the Apps Script web app, but both should match so either folder can be the source of truth.
- **Client parity** — `app.js`, `features.js`, `extras.js`, `sync.js`, and `import-inline.js` are mirrored in both folders. The only intentional differences are:
  - PWA uses a `chromeStorage` adapter (top of `app.js`) that wraps `localStorage`; the extension uses real `chrome.storage`.
  - PWA does direct `fetch()` to Apps Script; the extension routes through `chrome.runtime.sendMessage({ type:'SYNC_FETCH' })` to `background.js` to avoid extension-context CORS.
  - PWA's auto-backup uses an `<a download>` link; the extension uses `chrome.downloads.download()`.
- **PWA-only files (not mirrored to extension):** `lock.html`, `nosw.html` (one-tap unregister of the service worker + clear `caches` API storage, then reload `index.html` — use if the PWA shows a blank white screen after an update; same as Settings → **Fix stuck update**), `service-worker.js`, `manifest.webmanifest`. The extension has none of those concerns (Chrome handles install and the SW is replaced by `background.js`), so they intentionally have no counterpart in `finance-tracker-chrome/`.
- **Version tagging:** when a shared file is updated, bump both the PWA build stamp (top of `lock.html` / bottom-right of `index.html`) **and** the extension's `manifest.json` `version`, so the two stay numerically aligned and you can tell at a glance whether an update reached both.
