# Changelog

All notable changes to Sprout Editor, in the order they happened. Dates are when each
change landed in this repo.

## 2026-08-22

### Added
- **File-switcher dropdown** in the toolbar — switch which `.html` file in the repo
  you're editing without leaving the tab. Lists every `.html`/`.htm` file at any depth
  via one Git Trees API call; switching with unsaved changes prompts for confirmation
  first. (`services/github-api.js` `listHtmlFiles`, `editor.js` `switchToFile`)
- **Sprout Care GitHub Guide** — a standalone illustrated guide to editing `index.html`
  / `services.html` directly on github.com, without the extension. Published as an
  artifact; not part of the loadable extension itself.
- **GitHub OAuth Device Flow sign-in** ("Connect with GitHub") — the primary way to
  connect now. No backend server: device flow needs no client secret, so it runs
  entirely from the extension. The original manual Personal Access Token flow is still
  available under "Advanced" in Options, and both write to the same storage, so
  `services/github-api.js` never needed to change.
- **Auto-detects "authorized but not installed"** — a GitHub App can be authorized
  (signed in) without being installed on any repo yet, a distinct GitHub consent step
  that's easy to miss. Options now checks for this right after sign-in and shows a
  direct "Grant repository access" link instead of leaving the user to hit a confusing
  404 later.
- **Chrome Web Store submission materials** (`docs/webstore/`) — privacy policy (hosted
  live via GitHub Pages), store listing copy, permissions justification, data-usage
  disclosure draft, and a checklist of what's left (all the parts only a human can do:
  the $5 developer fee, real screenshots, the actual submission).
- **Marketing/instructions homepage** (`docs/index.html`) — live at
  [holdengrant.github.io/sprout-editor](https://holdengrant.github.io/sprout-editor/).

### Fixed
- **GitHub's own React UI silently removing the injected button.** The button could
  appear then vanish seconds later with no URL change — GitHub re-renders the toolbar
  region for reasons unrelated to navigation, wiping out any DOM node the extension
  inserted itself. `github-toolbar.js` now independently re-checks every 800ms that its
  button is still actually in the DOM and re-inserts it if gone.
- **Button never appearing on some GitHub navigations.** GitHub's Turbo-based
  client-side routing doesn't always fire a detectable event or DOM mutation;
  `github-detector.js` now also polls `location.href` every 400ms as a
  framework-agnostic guarantee, on top of (not instead of) the event-based detection.
- **CSS specificity bug hiding the device-flow code entirely.** `#connectStatus`
  (an ID selector) always beat `.status-box.info` (a class selector) regardless of
  source order, so the sign-in code and link were generated correctly but never
  visible. Fixed by keeping that element's visibility on the class exclusively.
- **Stuck loading-screen overlays in the preview.** Many template sites hide a
  full-screen `#loader`-style div via a script that runs on window load — which never
  runs in Sprout's script-disabled sandbox. The preview now detects overlay elements by
  name *and* by actually covering most of the viewport, and hides them (preview-only,
  never touches the saved file).
- **Missing local images with an `onerror` fallback showing broken instead of the
  fallback.** Same root cause as above (the fallback is also a script). Now parses a
  `this.src='...'` `onerror` pattern and applies the same fallback the live site would.
- **Plain-text `<div>`/`<td>`/`<label>`/etc. not being detected as editable.** Smart
  detection originally only covered `h1-h6/p/span/li`. Now also treats these container
  tags as editable text, but *only* when they're a leaf (no nested elements) — a bare
  wrapper `<div>` is still correctly left alone.
- **Stale "check your Personal Access Token" language** in error messages, left over
  from before OAuth existed — misleading for anyone connected via device flow. Made
  connection-method-agnostic.
- **Private-repo loads failing with a bare, unhelpful "Not Found."** GitHub reports
  private content as 404 to anyone without access, indistinguishable from a typo. Error
  messages now proactively suggest checking/adding a GitHub connection.

### Changed
- UI polish pass across the editor and Options page: replaced every functional-icon
  emoji (undo/redo, preview, sidebar categories) with a small hand-authored SVG icon
  set — emoji standing in for icons was flagged as a real defect, not a style choice.
  Added themed `:focus-visible` rings everywhere (there were none before), a loading
  spinner (the overlay was text-only), and restrained open/close motion for the modal
  and toasts (they used to snap instantly). Made sidebar categories real keyboard
  targets. Consolidated two near-duplicate busy-button-state code paths in
  `options.js` into one pair of focused helpers.

## Initial build

The first working version, covering the full spec in one pass:

- **Foundation** — MV3 manifest, GitHub URL detection (owner/repo/branch/path, any
  folder depth), the injected "Edit with Sprout" button.
- **Editor UI** — toolbar, element sidebar, sandboxed preview canvas, inspector panel.
- **Loading** — GitHub Contents API fetch, local CSS/image inlining with relative-path
  resolution.
- **Visual editing** — MODE 2 (`data-sprout` attributes) prioritized over MODE 1 (smart
  tag detection); in-place `contentEditable` text editing that preserves nested markup;
  inspector-driven attribute/style edits.
- **Undo/redo** — a generic command stack, `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`.
- **Save flow** — Personal Access Token auth (`chrome.storage.local` only), a save
  modal with a commit message, 409-conflict handling that never discards in-progress
  edits.

See `README.md` for the current architecture and setup instructions, and
`docs/webstore/` for what's left before this can ship to the Chrome Web Store.
