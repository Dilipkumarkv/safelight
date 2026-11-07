# Safelight — image lab

A phone-first PWA for turning a described scene into an image, then keeping the frames you like.
Built because the Perchance generator is powerful but clunky to use on a phone.

## Why this is a separate app (not a wrapper)

The original page can't be restyled from the outside, by anyone:

- `perchance.org/busters-real-generator` sends `X-Frame-Options: sameorigin`, so a browser refuses to embed it.
- The actual UI lives in a cross-origin subframe (`<id>.perchance.org`), so no wrapper — a PWA *or* a native
  WebView app — can read, style or click inside it.
- Perchance's AI tools are ad-funded and gated; the generator's image API answers `client_update_required`
  to outside callers.

So Safelight owns its UI end to end and generates with Pollinations' public image endpoint
(`image.pollinations.ai`), which allows browser (CORS) requests.

## What it does

- **Prompt composer** with style presets, aspect ratio, seed (with dice), and 1/2/4 plates per run.
- **Contact sheet** gallery: favourites, newest first, tap for a full-screen viewer.
- **Viewer**: share (native share sheet), save, "new seed" re-roll, delete.
- **Local-first**: every frame is stored as a Blob in IndexedDB, so history survives reloads and opens offline.
- **Installable PWA**: manifest, maskable icon, offline shell via service worker, theme follows the system.
- **Resilience**: 429/503 queue retries with a visible countdown, refusal messages, storage-quota warnings.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Markup: composer, gallery, viewer, settings sheet |
| `styles.css` | Darkroom theme, dark/light, reduced-motion support |
| `app.js` | Generation, IndexedDB, gallery, viewer, install prompt |
| `sw.js` | Service worker: network-first shell, offline fallback |
| `manifest.webmanifest` | PWA metadata and icons |
| `icons/` | Generated PNG icons (192 / 512 / maskable / apple-touch) |
| `tools/make_icons.py` | Regenerates the icons with no dependencies |
| `tools/dev_server.py` | Local dev server that forbids caching |

## Run locally

```bash
python tools/dev_server.py 8080
# open http://127.0.0.1:8080/
```

Plain `python -m http.server` works too, but Chrome's heuristic cache will keep serving old
`app.js` between edits — the bundled dev server sends `no-store` for that reason.

## Notes and limits

- The backend is a free shared endpoint: expect occasional queue waits and the odd refusal. There is no
  uptime guarantee, and some prompts are filtered.
- Images are saved in this browser's storage only. Clearing site data deletes them — use **Save** for keepers.
- To publish: serve the folder over HTTPS (GitHub Pages, Cloudflare Pages, Netlify). Installation and the
  offline shell require HTTPS (or `localhost`).
