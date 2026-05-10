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
- Drag and drop ALL files from this folder into the browser
- Click **Commit changes**

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

---

## Password

The app is password-protected. The default password is stored as a SHA-256 hash in `lock.html` — the raw password is never visible in the source code.

To change the password: compute the SHA-256 hash of your new password (use any online SHA-256 tool), replace the `HASH` value in `lock.html`, and re-upload the file to GitHub.

## Notes

- **Offline support**: The app works without internet. Data saves locally. Syncs when connection returns.
- **iOS storage**: Safari may clear PWA data if the phone is low on storage. Use Google Sheets sync to prevent data loss.
- **Sharing data**: The Chrome extension and PWA share the same Google Sheet — they stay in sync automatically.
- **Privacy**: Your financial data only goes to your own Google account. GitHub only hosts the app files, not your data.
