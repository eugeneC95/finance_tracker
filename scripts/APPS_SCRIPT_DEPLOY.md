# Deploy Google Apps Script (v6 merge-on-save)

Your web app URL (already built into the PWA / extension):

https://script.google.com/macros/s/AKfycbyoAUYxXl55wCVZzuZ2e8nIWus2V0NeGxtUA4_vQucPWkeyl7XN88kGXkyIjEkB6TF8/exec

**Do not change this URL in the app** after redeploying — only publish a **new version** of the same deployment.

## Steps

1. Open [Google Apps Script](https://script.google.com) and open the project that owns the URL above.
2. Open `Code.gs` (or the main script file), **select all**, delete, paste the full contents of **`google-apps-script.js`** from this repo.
3. **Save** (Ctrl+S).
4. **Deploy → Manage deployments**
5. Click the **pencil (Edit)** on the active **Web app** deployment (the one whose URL ends with `…/exec`).
6. **Version:** choose **New version** (required — editing code alone does not update the live URL).
7. **Execute as:** Me · **Who has access:** Anyone
8. Click **Deploy**. The `/exec` URL should stay the same.

## Verify

From the repo root:

```bash
node scripts/verify-apps-script.mjs
```

Expected: `"apiVersion":6` and `"ok":true`.

Or in the app: **Settings → Test connection** — no hint to “redeploy v6”.

## If ping still shows apiVersion 5

- You edited code but did not create a **New version** on the deployment.
- You deployed a different project than the one tied to this `/exec` link.
- Wait 1–2 minutes and ping again.
