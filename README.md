# 🌱 Sprout Editor

A Chrome Extension (Manifest V3) that lets non-technical users visually edit a static HTML file
stored in a GitHub repo — no code required — and save the result back as a real commit.

## How it works

```
github.com/{owner}/{repo}/blob/{branch}/{path}.html
        │  content script detects the page, injects "🌱 Edit with Sprout"
        ▼
Sprout Editor opens in a new tab
        │  fetches the file (+ local CSS/images) via the GitHub Contents API
        ▼
Visual canvas — click any text, button, or image to edit it
        │  changes are tracked in an edits map, with full undo/redo
        ▼
"Save to GitHub" → commits the updated file back to the same branch
```

See `manifest.json` for the extension's permission footprint (just `storage` +
`https://api.github.com/*` — no broad host access is requested).

## Project structure

```
sprout-editor/
├── manifest.json
├── background/service-worker.js     # opens the editor tab, hands off file context
├── content/
│   ├── github-detector.js           # pure URL parsing, zero network calls
│   ├── github-toolbar.js            # injects the "Edit with Sprout" button
│   └── github-toolbar.css
├── editor/
│   ├── editor.html/css/js           # shell + EditorState + toolbar/save flow
│   ├── canvas.js                    # sandboxed preview iframe, hover/select/inline-edit
│   ├── inspector.js                 # right-panel edit controls
│   ├── sidebar.js                   # left-panel element categories
│   └── history.js                   # undo/redo command stack
├── services/
│   ├── github-api.js                # Contents API: get/update file
│   ├── github-auth.js               # token storage, swappable auth strategy
│   ├── file-loader.js               # orchestrates fetch + asset inlining
│   └── html-utils.js                # DOM parsing/tagging/serialization
├── shared/constants.js
└── assets/icons/
```

## Setup

1. **Load the extension**
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** → select this `sprout-editor` folder

2. **Connect a GitHub account**
   - Right-click the Sprout Editor icon → **Options** (or visit it via the prompt
     Sprout Editor shows the first time you try to save)
   - Create a GitHub **fine-grained Personal Access Token**
     (Settings → Developer settings → Fine-grained tokens) scoped to the repo(s)
     you want to edit, with **Contents: Read and write** permission
   - Paste it in, click **Validate** to confirm, then **Save Token**

   The token is stored only in `chrome.storage.local` on your machine — it is never
   written into source code or sent anywhere except `api.github.com`. See
   `services/github-auth.js` for the auth architecture (structured so a future
   OAuth flow can replace the PAT strategy without touching any calling code).

3. **Try it**
   - Visit `https://github.com/HoldenGrant/sprout/blob/main/index.html`
   - Click **🌱 Edit with Sprout**
   - Click any heading, paragraph, button, or image to edit it
   - **Ctrl/Cmd+Z** / **Ctrl/Cmd+Shift+Z** to undo/redo
   - **Save to GitHub** → confirm the commit message → **Save Changes**

## Editable elements

- **MODE 2 (explicit)**: if any element on the page has `data-sprout="text|image|button"`,
  those are the only editable elements.
- **MODE 1 (smart detection)**, used otherwise: `h1–h6, p, span, li` (text),
  `a, button` (button/link), `img` (image).

## Known v1 limitations

- Branch names containing `/` (e.g. `feature/foo`) aren't resolvable from the URL alone
  and aren't supported — see the comment in `content/github-detector.js`.
- The GitHub Contents API returns file content inline only up to ~1MB; larger assets
  are skipped (with a console warning) rather than fetched via the Git Blobs API.
- Background images set via inline `style="background-image:url(...)"` aren't inlined
  for preview (only `<link rel="stylesheet">`, `<img src>`, and CSS `url()` references
  inside fetched stylesheets are).
- Undoing an `<img src>` edit back to its very first (pre-edit) value shows a broken
  image in the *live preview* (the original relative path can't resolve inside the
  sandboxed `srcdoc` iframe) — the *saved* file is unaffected either way, since saving
  always replays the edit history onto the pristine original HTML, never the live DOM.
- v1 applies style edits as inline styles on the target element (as the spec allows);
  the edit-tracking model (`services/html-utils.js`) is structured so a future version
  could redirect them into real CSS rules instead.

## Architecture notes

- **Two DOM lifecycles, one source of truth.** The live preview iframe has its local
  asset URLs (images, stylesheets) rewritten to `data:` URIs so they render — but saving
  always re-parses the pristine original HTML string and replays only the recorded
  `edits` map onto it, so rewritten preview URLs can never leak into a commit. See the
  top of `services/html-utils.js`.
- **Content-script detection makes zero network calls.** URL parsing runs on every
  GitHub page load; all GitHub API usage is deferred until the user actually clicks
  "Edit with Sprout".
