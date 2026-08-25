# Changelog

All notable changes to Sprout Editor, in the order they happened. Dates are when each
change landed in this repo.

## 2026-08-25

### Added
- **Insert new elements** — a green "+" appears above/below any text, button, or image
  when hovering it in canvas, and every uid'd row in the Layers panel gets its own "+"
  on hover (container rows insert *inside*, everything else inserts a sibling *after*).
  Both open the same small picker: Paragraph, Heading, Button/Link, Image, or an empty
  Container (`shared/constants.js` `INSERT_PALETTE`) — a deliberately small fixed set for
  v1, not a generic drag-in-anything builder. Whatever's picked is immediately selected
  (a new paragraph starts in-place editable) and fully participates in undo/redo and
  save, exactly like anything already on the page.

  This is a genuinely new capability for the architecture, not just a new UI control:
  every edit before this assumed the DOM's *shape* never changed, only text/attrs/styles
  on elements that already existed (see the old top-of-file comment in
  `services/html-utils.js`). Structural changes now get their own tracked list
  (`state.insertions`, replayed onto the pristine original HTML *before* `state.edits`
  at save time — see `applyInsertionsToDocument`), kept deliberately separate from
  `edits` rather than folded into it. Inserted elements get their own uid scheme
  (`INSERTED_UID_PREFIX`, e.g. `new-3`) so they can never collide with the plain
  incrementing integers assigned to original-document elements. New: `editor/insert-
  menu.js` (the shared picker), `canvas.js` `insertElement`/`removeElement`/the hover-+
  affordances, `layers.js`'s per-row `+`, and a new `'insert'`-typed history command
  alongside the existing text/attr/style one.

  No delete yet — undoing right after inserting is the only way back for now (see
  README's "Known v1 limitations").
- **Alignment control for Button/Link.** The Text panel already had left/center/right;
  Button/Link's Inspector panel didn't. Deliberately a different mechanism than text's
  single `text-align` — `<a>`/`<button>` are inline(-block) elements, so their *own*
  text-align has no effect on where *they* sit, only margin (with a shrink-to-fit
  `display`) actually moves the element. That's three CSS properties (`display`,
  `margin-left`, `margin-right`) that need to change together, reported through a new
  `Inspector.onMultiStyleChange` callback and a new `'multiStyle'`-typed history command
  (`editor.js` `handleMultiStyleChange`) rather than three separate style-field commands —
  otherwise a single undo would only revert one of the three properties at a time.
  Verified the left/center/right cycle (including the center→right transition, which has
  to explicitly clear a stale `margin-right: auto` left over from center) and undo/redo
  against a standalone simulation. (Corrected the same day — see "Fixed" below;
  `display: inline-block` doesn't actually let auto margins center anything.)
- **Columns control for containers (1–6).** Lays a section/div's direct children out in
  a CSS grid — `display: grid` + `grid-template-columns: repeat(N, minmax(0, 1fr))` +
  a `16px` gap, all through the same `onMultiStyleChange` mechanism Button/Link
  alignment just introduced (now generalized from an alignment-specific callback to a
  reusable "several properties, one atomic edit" one — see `Inspector._buttonGroupField`,
  also extracted from what used to be alignment-only markup/CSS). "1" is treated as the
  default/off state (clears the grid override entirely) rather than an explicit
  one-track grid, since a grid with one track isn't quite identical to plain block flow
  (grid items don't margin-collapse the way block children do). A hint appears if the
  container's layout is already grid-based via the page's own CSS, matching the existing
  background-image field's same INLINE-only-read reasoning.
- **The device-flow "Go to https://github.com/login/device" step is now a real link.**
  Was plain text in the connect-status box — had to be copy-pasted or retyped by hand.
  `options.js` `showConnectStatus()` now optionally splits the one occurrence of a given
  URL out of the message and renders it as an actual `<a target="_blank">` instead.
- **Copy button on the device code.** A small icon button next to the code (typing an
  8-character code correctly by hand is exactly the kind of thing that's easy to
  mistype) copies it via `navigator.clipboard.writeText`, swapping to a checkmark icon
  and "Copied!" for 1.6s, or a "Copy failed — select the code manually" label if the
  clipboard write is rejected rather than silently pretending it worked.
- **Empty-container placeholder in canvas.** A container with nothing in it had no
  visual affordance at all in canvas — canvas's hover + buttons only ever attach to
  non-container elements, so an empty container had nothing to hover, and the only way
  in was the Layers panel's own + (not discoverable without already knowing it's there).
  `canvas.js` `_syncEmptyContainerPlaceholders()` now puts a persistent "Empty
  container / + Add element" placeholder directly inside every empty CONTAINER-kind
  element — shown unconditionally, not hover-gated, since there's nothing else to hover.
  Re-synced after load and after every insert/remove, so it disappears the instant real
  content lands inside (or reappears if that content is undone). The placeholder itself
  is real DOM (needed so its own + button can trigger an insert), so it's explicitly
  skipped in `layers.js`'s tree walk (`EMPTY_CONTAINER_HINT_CLASS`) — it was never at
  risk of being saved either way, since the save pipeline never reads the live canvas
  DOM at all. Verified the sync logic (create/remove/idempotency/restore-on-undo/nested
  containers) against a standalone simulation.

### Fixed
- **Button/Link alignment did nothing, visually, no matter what you clicked.** Shipped
  earlier today using `display: inline-block` with `margin-left`/`margin-right: auto` to
  move the element — except per CSS2.1 §10.3.9, auto margins on an inline-block box
  always resolve to **0**, not to "fill the available space." Only a block-level box's
  auto margins actually center it. The bug was invisible to the state-machine simulation
  that verified the earlier version — that check only asked "does `el.style.marginLeft`
  become the string `'auto'`?" (yes), never "does the box actually move on screen?" (no).
  Fixed by using `display: table` instead — the standard way to get a block-level box
  that still shrinks to its content width instead of stretching full-width like plain
  `display: block` would. Worth knowing: this still only touches the button's *own*
  style, never its parent's — inside a flex or grid container, the parent's own
  layout rules (`justify-content`, etc.) may still take precedence over this.
- **Every style-panel edit silently failed to save on its first change to a given field.**
  Reported as "Alignment doesn't save," but the same bug affected font size, text/button
  colors, border radius, spacing, and container backgrounds — anything driven by
  Inspector's `_applyStyle` helper. `inspector.js` was mutating the live element's inline
  style directly *before* handing off to `editor.js`, which then computed "what was this
  before the edit" by reading that same live inline style — already changed to the *new*
  value by that point. `before === after` came out true, so `editor.js` treated it as a
  no-op and never wrote it into `state.edits` — invisible in the UI (the canvas already
  looked right, because Inspector had mutated it directly) but the change was never in
  `state.edits`, so it never survived a save. Fixed by having Inspector only report the
  intent (`onStyleChange`) and never touch the DOM itself — `editor.js`/`canvas.js`
  already were, and still are, the only place a style change actually gets applied, now
  in the correct order. Verified with a standalone simulation of the exact before/after
  comparison against both the old and new call order.

## 2026-08-22

### Added
- **Toolbar-icon popup** (`popup/popup.html`/`.js`) — clicking the Sprout Editor icon now
  shows an at-a-glance connection status and an **Open Settings** button, instead of doing
  nothing and requiring a right-click → Options. The popup deliberately doesn't run the
  OAuth device flow itself — it would get closed by Chrome the moment its "enter this
  code" link opened a new tab, silently killing the flow partway through — so "Connect
  with GitHub" still lives only on the Settings page, which stays open regardless of
  focus. (`manifest.json` `action.default_popup`)
- **Layers panel** in the sidebar — an always-visible, Elementor-style tree of the whole
  page's DOM structure, synced bidirectionally with canvas selection. Every element gets
  a layer id (not just ones smart detection considers editable — structural wrapper
  `<div>`s show up too), with scannable labels (tag + first class + a text/alt preview,
  not just bare tag names). Rows with children get a collapse/expand toggle, and
  selecting something in canvas auto-expands any collapsed ancestor so it's never
  highlighted inside a folded, invisible branch. (`editor/layers.js`, new)

- **Background color/image editing for sections and containers.** `div`, `section`,
  `article`, `header`, `footer`, `aside`, `main`, `nav`, `ul`, `ol`, `figure`, `table`,
  and `form` are now full participants in the same save/undo pipeline as everything
  else — reachable via the Layers panel (deliberately not via canvas hover/click, to
  avoid making every `<div>` on the page clickable), with Inspector controls for
  background color, background image, and spacing.
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
- **Selecting a section/div in the Layers panel not showing anything in the Inspector.**
  Root cause: structural containers had no `data-sprout-uid` at all before this — there
  was nothing for Inspector to render and nothing to save even if there had been.
  Direct canvas clicks only ever "worked" because they were always clicking something
  already in the editable-uid system. Fixed by giving containers a real uid (see
  "Added" above) rather than patching the symptom.
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
- **Carousel/slider slides past the first being completely unreachable, not just
  unanimated.** Bootstrap Carousel, Slick, and similar libraries hide every slide but
  the active one via real CSS, and only a script that never runs in the sandbox moves
  which one is active. Every element matching a known slide-item naming pattern
  (`carousel-item`, `slick-slide`, `swiper-slide`, `owl-item`, generic `*-slide` names)
  is now forced into normal scrollable document flow instead — trading "looks like an
  animated carousel" for "every slide is actually selectable and editable," which is
  the right trade for an editing tool. Preview-only, as always.
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
- **A hit GitHub API rate limit was misreported as bad credentials.** GitHub returns the
  exact same 403 status for "you've hit your hourly limit" and "your token is invalid" —
  `services/github-api.js` was treating every 403 as the latter, telling people to
  reconnect in Settings when reconnecting does nothing for a rate limit. Now checks the
  extra signals GitHub sends only for rate limiting (`x-ratelimit-remaining: 0`, or
  "secondary rate limit" in the error body) *before* falling through to the generic
  auth-error path, and reports an actual wait time instead. `showFatalError` in
  `editor.js` also stopped showing the "Open Settings" button for this and any other
  non-auth fatal error — it was appearing unconditionally on every load failure before,
  regardless of cause. Same 403-ambiguity fix applied to `github-auth.js`'s
  `validateToken` (used by both Settings and the popup).

### Changed
- **Popup type scale sharpened to two deliberate sizes.** The title and body/status/hint/
  button text were all clustered within a point of each other (15px/12.5px/12px) — no
  real hierarchy at a glance. Now 17px for the title, 12px for everything else (a 1.42
  ratio instead of ~1.2).
- **Preview mode now hides both sidebars, not just the hover/selection outlines.**
  Element categories, Layers, and Inspector fields all do nothing useful while canvas
  clicks are inert in preview mode — leaving them up was just unusable UI taking up
  space. The canvas now takes the full width instead; Exit Preview restores both.
- **Layers tree starts collapsed below the top level.** Full-depth expansion on load
  was overwhelming on any real page — only direct children of `<body>` now start open;
  everything deeper opens on click, or automatically when canvas selection lands inside
  it (`setActiveLayer`'s existing ancestor-expansion logic, unchanged).
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
