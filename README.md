# 🌱 Sprout Editor

A Chrome Extension (Manifest V3) that lets non-technical users visually edit a static HTML file
stored in a GitHub repo — no code required — and save the result back as a real commit.

Currently installable via `chrome://extensions` → Developer Mode → Load unpacked (see
Setup below). For publishing this to the Chrome Web Store so anyone can install it
normally, everything text-based (privacy policy, listing copy, permissions justification)
is drafted in [`docs/webstore/`](docs/webstore/) — `docs/webstore/submission-checklist.md`
covers what's left.

A public homepage/instructions page for the extension itself lives at
[holdengrant.github.io/sprout-editor](https://holdengrant.github.io/sprout-editor/)
(source: `docs/index.html`). See `CHANGELOG.md` for the full history of what's changed
and why.

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

See `manifest.json` for the extension's permission footprint: `storage`, plus host access
to `api.github.com` (Contents API) and `github.com` (OAuth device flow endpoints only —
`/login/device/code` and `/login/oauth/access_token`).

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
│   ├── layers.js                    # left-panel DOM tree, synced with canvas selection
│   └── history.js                   # undo/redo command stack
├── services/
│   ├── github-api.js                # Contents API: get/update file
│   ├── github-auth.js               # token storage, swappable auth strategy
│   ├── file-loader.js               # orchestrates fetch + asset inlining
│   └── html-utils.js                # DOM parsing/tagging/serialization
├── shared/constants.js
└── assets/icons/
```

(`docs/` and `CHANGELOG.md` sit outside this tree — `docs/` is the public GitHub Pages
site, not part of the loadable extension itself.)

## Setup

1. **Load the extension**
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** → select this `sprout-editor` folder

2. **Connect a GitHub account**
   - Right-click the Sprout Editor icon → **Options** (or visit it via the prompt
     Sprout Editor shows the first time you try to save)
   - Click **Connect with GitHub** — you'll get a short code and a link to
     `github.com/login/device`; enter the code there, pick which repos to allow, and
     you're done. No copy-pasting a token required.
   - *(Advanced fallback, or if device flow isn't configured yet — see below)*: expand
     **"Advanced: use a Personal Access Token instead"**, create a GitHub
     **fine-grained Personal Access Token** (Settings → Developer settings →
     Fine-grained tokens) scoped to the repo(s) you want to edit with **Contents: Read
     and write** permission, paste it in, **Validate**, then **Save Token**.

   Either way, the resulting token is stored only in `chrome.storage.local` on your
   machine — never written into source code or sent anywhere except `github.com`/
   `api.github.com`. See `services/github-auth.js` for the auth architecture.

   > **Gotcha worth knowing:** GitHub treats *authorizing* a GitHub App (what device
   > flow does) and *installing* it on specific repos as two separate consent steps —
   > it's possible to complete device flow successfully and still have zero repo
   > access, since installation never happened. Sprout Editor checks for this
   > automatically right after sign-in and shows a direct "Grant repository access"
   > link if it detects it, but it's a real GitHub behavior worth knowing about if
   > loads ever fail with a "not found" right after connecting.

   **One-time setup for device flow (only needed once, by whoever ships this extension —
   not by each end user):** create a GitHub App at
   [github.com/settings/apps/new](https://github.com/settings/apps/new) with:
   - Repository permissions → **Contents: Read and write**
   - **Enable Device Flow** checked (in the app's settings, after creation)
   - "Where can this app be installed?" → **Any account** (so anyone can connect
     their own repos — "Only on this account" would block everyone else)

   Then copy the app's **Client ID** into `GITHUB_APP_CLIENT_ID` in
   `shared/constants.js`. Until that's set, the Options page automatically falls back
   to the Personal Access Token flow with a note explaining why.

3. **Try it**
   - Visit `https://github.com/HoldenGrant/sprout/blob/main/index.html`
   - Click **🌱 Edit with Sprout**
   - Click any heading, paragraph, button, or image to edit it
   - Browse the **Layers** panel in the sidebar (collapsible) to see the page's
     structure and jump straight to any element — including sections and `<div>`s,
     which get their own background color/image controls
   - Use the **file dropdown** in the toolbar to switch to another `.html` file in the
     same repo without leaving the tab
   - **Ctrl/Cmd+Z** / **Ctrl/Cmd+Shift+Z** to undo/redo
   - **Save to GitHub** → confirm the commit message → **Save Changes**

## Editable elements

- **MODE 2 (explicit)**: if any element on the page has `data-sprout="text|image|button"`,
  those are the only editable elements.
- **MODE 1 (smart detection)**, used otherwise: `h1–h6, p, span, li` (text),
  `a, button` (button/link), `img` (image) — unconditionally. Generic container tags
  (`div, td, th, dt, dd, label, figcaption, summary, blockquote, caption`) also count as
  editable text, but *only* when they're a leaf (no nested elements) holding real text —
  a template's `<div class="stat-label">10+ years…</div>` qualifies, a `<div>` wrapping
  a whole page section doesn't. See `GENERIC_LEAF_TEXT_TAGS` in `shared/constants.js`
  for why that distinction matters.
- **Structural containers** (`div, section, article, header, footer, aside, main, nav,
  ul, ol, figure, table, form`) are editable too — background color, background image,
  and spacing — but only reachable through the **Layers panel**, never by hovering or
  clicking them directly in the canvas. Every `<div>` on a real page becoming
  individually clickable would be exactly the noise the leaf-only rule above is
  designed to avoid; the Layers panel is the deliberate way to reach a specific section
  without that. See `CONTAINER_TAGS` in `shared/constants.js`.

## Smart handling for script-dependent sites

The preview iframe is sandboxed with no `allow-scripts` (see `editor/canvas.js`) — the
site's own JavaScript never runs, which is exactly right for safety, but means anything
a site's script would normally do on page load simply doesn't happen. Two common
patterns get handled anyway:

- **Stuck loading-screen overlays.** Template sites commonly show a full-screen
  `#loader`-style div that a script fades out on window load. `canvas.js`
  `_autoHidePreloaders()` detects elements that both look like a loader by name *and*
  are actually a fixed/absolute overlay covering most of the viewport, and hides them —
  preview-only, never touching the saved file.
- **Missing images with an `onerror` fallback.** A site guarding a possibly-missing
  image with `onerror="this.src='https://cdn.../fallback.jpg'"` normally shows that
  fallback seamlessly to real visitors; the sandbox can't run that handler either.
  `file-loader.js` `applyOnerrorFallback()` parses that exact pattern and applies the
  same fallback itself when the primary local image can't be loaded.
- **Carousels/sliders.** Bootstrap Carousel, Slick, Swiper, Owl Carousel, and similar
  libraries hide every slide but the active one via real CSS, and only their JS (which
  never runs) moves which one is active — left alone, every slide but the first would be
  not just unanimated but genuinely unreachable. `canvas.js` `_revealHiddenSlides()`
  forces every element matching a known slide-item class pattern into normal document
  flow, trading "looks like an animated carousel" for "every slide is actually
  selectable and editable."

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
- The file-switcher dropdown's repo file list comes from one recursive Git Trees API
  call, which GitHub caps for very large repos (`truncated: true` in the response) — in
  that case the switcher just won't list every `.html` file. Loading/saving the file
  already open is unaffected.

## Architecture notes

- **Two DOM lifecycles, one source of truth.** The live preview iframe has its local
  asset URLs (images, stylesheets) rewritten to `data:` URIs so they render — but saving
  always re-parses the pristine original HTML string and replays only the recorded
  `edits` map onto it, so rewritten preview URLs can never leak into a commit. See the
  top of `services/html-utils.js`.
- **Content-script detection makes zero network calls.** URL parsing runs on every
  GitHub page load; all GitHub API usage is deferred until the user actually clicks
  "Edit with Sprout".
- **Detecting GitHub's SPA navigation is belt-and-suspenders, not any single signal.**
  Clicking through GitHub's own UI (its file tree, breadcrumbs) uses Turbo client-side
  routing, which doesn't reliably fire a consistent event across GitHub's frontend
  versions. `github-detector.js` listens for several known Turbo/pjax event names *and*
  runs a plain 400ms `location.href` poll — the poll is what actually guarantees
  detection; the events are just a faster path when they do fire.
- **The injected button re-asserts its own presence, independent of navigation.**
  GitHub's toolbar region is React-controlled and can re-render for reasons that have
  nothing to do with navigation, silently stripping out any DOM node the extension
  inserted itself. `github-toolbar.js` checks every 800ms that its button is still
  actually in the DOM and re-inserts it if a host re-render removed it — a separate
  concern from detecting *which* file the button should be showing for.
- **Two separate, deliberately uncoupled element-id schemes.** `data-sprout-uid`
  (`services/html-utils.js`) means "this element has Inspector controls" and only ever
  goes on elements smart detection or `data-sprout` marks as editable. `data-sprout-
  layer-id` (`editor/layers.js`) means "this element shows up in the Layers panel" and
  goes on nearly everything, including plain structural wrappers with no Inspector
  controls at all. Collapsing these into one scheme would either flood the editable-uid
  system with non-editable wrapper divs, or leave the Layers tree unable to reference
  (and scroll to / outline) anything that isn't independently editable.
- **Carousels/sliders aren't just unhidden, their layout mechanism is neutralized too.**
  Bootstrap Carousel doesn't hide inactive slides with `position:absolute` — it uses
  `float:left; width:100%; margin-right:-100%`, which keeps pulling every slide back on
  top of the same spot regardless of `display`/`position`. `_revealHiddenSlides()`
  resets `float`/`width`/`margin` too, not just the more obvious `display`/`visibility`/
  `position`/`opacity` — the first pass without that produced illegible overlapping
  text.
