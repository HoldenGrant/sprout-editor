# Handoff

Where things stand, for picking this back up later (a future session, or someone else
entirely). Read `README.md` for how the extension works and `CHANGELOG.md` for the full
history — this file is the "state of the world right now" summary.

## Status: working, not yet published

The extension is fully functional and has been verified against the real
`HoldenGrant/sprout` repo (a live child care business site): load, edit, undo/redo,
save-as-commit, switch between files, browse/collapse the Layers panel, and edit
section/div backgrounds — all confirmed working end-to-end as of the 2026-08-25 style-save
fix (see below — earlier claims of this being "confirmed working" for any Inspector style
field, backgrounds included, predate that fix and weren't actually true for the save half
of it).

It is **not** on the Chrome Web Store yet — still `chrome://extensions` → Load unpacked
only. See `docs/webstore/submission-checklist.md` for exactly what's left, and note that
most of it needs a human (the $5 developer fee, real screenshots, the actual submit).

## What's actually been verified live

Not just "written and assumed correct" — these were diagnosed and fixed against real
failures on the real test repo, not hypothetically:

- Loading a private repo's files (auth, both PAT and OAuth device flow)
- A GitHub App being authorized but not installed anywhere (the two-step consent gotcha
  — see the README's Setup section)
- A stuck JS-driven loading-screen overlay, and a missing image with an `onerror`
  fallback — both on the actual `services.html` file
- Two Bootstrap carousels and a Slick slider leaving every slide but the first
  genuinely unreachable, not just unanimated — and the follow-up bug where the first
  fix (`display`/`position` only) still left slides visually overlapping, since
  Bootstrap's real mechanism is `float`/negative-`margin`, not absolute positioning
- Plain-text `<div>`s not being detected as editable (found via a real template's
  `stat-label` divs)
- Selecting a section/div in the Layers panel not showing anything in the Inspector —
  root cause was containers having no uid at all, not a wiring bug; fixed by giving them
  a real one, not by patching the symptom
- The "Edit with Sprout" button not appearing at all on a fresh navigation, and
  separately, appearing then vanishing seconds later — two different root causes, both
  fixed
- The device-flow sign-in code being generated correctly but never visually appearing
  (a CSS specificity bug)
- Every Inspector style field (alignment, font size, colors, border radius, spacing,
  container backgrounds) silently never surviving a save on its first edit — the canvas
  looked right, so it went unnoticed until an actual save+reload was checked. Root cause
  and fix in `CHANGELOG.md`'s 2026-08-25 entry.

See `CHANGELOG.md` for the full list with technical detail on each.

## Open items

- **Chrome Web Store submission** — not started beyond the drafted materials in
  `docs/webstore/`. Needs: the developer account fee, real screenshots of the extension
  in use, zipping it, and going through review.
- **Real icon design** — `assets/icons/*.png` are a simple programmatically-generated
  placeholder (see `assets/icons/generate_icons.py`), fine to ship but not a real design
  pass.
- **Large-file support** — the Contents API's ~1MB inline-content cap isn't worked
  around with the Git Blobs API yet (documented limitation, not silently broken).
- **Branch-protected repos** — saving assumes a direct commit to the branch always
  succeeds; a repo requiring PR review would just fail the save with whatever error
  GitHub returns. No "create branch + open PR" fallback exists.
- **Background images from an external CSS class** aren't shown/editable in the new
  container background-image field (only an *inline* `style="background-image:..."` is
  — reading the computed value would risk leaking a rewritten preview data: URI into the
  field, see README's Architecture notes). A section styled that way shows a hint
  instead of the actual value; typing a new URL still works, it just starts from blank
  rather than the current one.
- **No delete.** Elements can be inserted (2026-08-25) but not removed — undoing right
  after inserting is the only way back. Not started, and not just a small add-on:
  removing an *original* (non-inserted) element would need its own structural-diff
  representation in the save/undo model, distinct from `insertions`.
- **Insert palette is fixed, not generic.** Paragraph/Heading/Button/Image/Container
  only — no arbitrary-tag or custom-HTML insertion, and no way for a site owner to
  extend the palette themselves yet.

## Key decisions worth knowing before changing things

- **No backend server, anywhere, on purpose.** OAuth uses GitHub's Device Flow
  specifically because it needs no client secret — adding any feature that would need a
  secret (token refresh included) breaks that constraint. If a GitHub App's "Expire user
  authorization tokens" setting is ever turned on, tokens would need re-authentication
  every ~8 hours rather than a silent refresh, since refreshing requires a secret we
  don't have anywhere to hold. Current guidance if that comes up: leave that setting off
  rather than build a backend for it.
- **The toolbar-icon popup never runs the OAuth device flow.** Chrome closes an
  extension popup the instant focus leaves it, including when a link inside it opens a
  new tab — which device flow requires (entering the code at `github.com/login/device`).
  "Connect with GitHub" only lives on the Settings page (a real tab, immune to that),
  which the popup links to rather than duplicating. Don't move that button into the
  popup without solving the focus-loss problem first (e.g. moving the poll into the
  background service worker) — it looks like a simple UI move but would silently break
  a working, verified flow.
- **The preview iframe never runs the site's own JavaScript**, deliberately (see
  `editor/canvas.js`'s sandbox comment) — this is what makes "Smart handling for
  script-dependent sites" in the README necessary, and it's a constraint worth keeping,
  not a gap to "fix" by enabling `allow-scripts`.
- **Save always replays onto a fresh parse of the pristine original HTML**, never the
  live (asset-URL-rewritten) preview DOM — see the top-of-file comment in
  `services/html-utils.js`. This is the single most load-bearing piece of the
  architecture; don't shortcut it even for a quick fix.
- **`inspector.js` must never mutate the DOM itself — it only reports intent.**
  `editor.js`/`canvas.js` are the only place a change actually gets applied, specifically
  *because* `editor.js` needs to read an element's pre-edit value before anything
  changes it, to know what "before" was. `inspector.js` briefly violated this (its own
  header comment said otherwise) for style edits specifically, mutating `el.style`
  directly before handing off — every first style edit to a field silently failed to
  save as a result (2026-08-25 fix, see `CHANGELOG.md`). If a future field type is added
  to Inspector, route it through `onTextChange`/`onAttrChange`/`onStyleChange` only.
- **Containers are editable (uid'd, in the save/undo pipeline) but never clickable in
  canvas.** Resist the urge to "simplify" by wiring hover/click for them the same way as
  text/button/image — that's exactly the every-`<div>`-is-clickable noise the leaf-only
  smart-detection rule was designed to avoid. The Layers panel is the deliberate,
  separate way in. This held through adding element-insertion (2026-08-25) on purpose:
  canvas's hover + buttons only ever appear on non-container elements (`_wireOne` is
  never called for a CONTAINER-kind element, insertable ones included) — a container you
  just inserted from canvas still only gets a Layers-panel + afterward, same as any
  other container. One deliberate, narrow exception (2026-08-25): an *empty* container
  gets a persistent "+ Add element" placeholder injected inside it — not the container
  itself becoming clickable, a separate injected child element with its own click
  handler (see `canvas.js` `_createEmptyContainerHint`). It exists only because there'd
  otherwise be zero way to discover Layers is the only path in for a container with
  nothing else in it to hover.
- **`data-sprout-uid` and `data-sprout-layer-id` are intentionally two different
  numbering schemes**, not one reused for both purposes — see the note at the top of
  `editor/layers.js`. Collapsing them would either flood the editable-uid system with
  every non-editable wrapper on the page, or leave the Layers tree unable to reference
  anything that isn't independently editable.
- **`state.insertions` and `state.edits` are deliberately two separate lists, not one
  merged model.** `edits` only ever means "text/attr/style change to a uid that already
  exists"; `insertions` only ever means "create this new element here." Save replays
  `insertions` first (see `applyInsertionsToDocument`) so `edits` can then treat every
  uid uniformly whether it's original or freshly inserted. Don't fold insertion into the
  edits map to "simplify" it — the replay order (structure before content) is load
  bearing, same category of thing as save always re-parsing the pristine original HTML.
- **History commands have a `type` — `'field'`, `'insert'`, or `'multiStyle'` — and any
  multi-property change (Button/Link Alignment: `display` + `margin-left` +
  `margin-right`; Container Columns: `display` + `grid-template-columns` + `gap`) must
  go through `'multiStyle'`, not several separate `'field'` pushes.** Several separate
  commands would make a single undo only revert one property, leaving the element in a
  broken in-between visual state — e.g. undoing just `margin-right` back out of a
  centered button leaves `margin-left: auto` alone, producing right-alignment nobody
  asked for. If a future field needs more than one CSS property to move together
  atomically, route it through `Inspector.onMultiStyleChange` /
  `editor.js`'s `handleMultiStyleChange` rather than firing multiple `onStyleChange`
  calls for it — that's exactly how Columns reused Alignment's mechanism rather than
  reinventing it.
- **`display: inline-block` does NOT let `margin: auto` center anything — this bit the
  first version of Button/Link Alignment for real (shipped, then had to be fixed the
  same day).** Per CSS2.1 §10.3.9, auto margins on an inline-block box always resolve to
  0; only a block-level box's auto margins actually center/right-align it.
  `display: table` is the fix — block-level for margin purposes, but still shrinks to
  its content width instead of stretching full-width like plain `display: block` would.
  Worth remembering for *any* future "move this element via margin" field, not just
  alignment.

## Reference material

- **CHANGELOG.md** — full chronological history of what changed and why.
- **docs/webstore/** — Chrome Web Store submission materials + checklist.
- **[Sprout Care GitHub Guide](https://claude.ai/code/artifact/5fa9594c-cab3-4a2e-9cbb-eb3d5d6b7d32)**
  — a separate, illustrated guide for editing `index.html`/`services.html` directly on
  GitHub's own web editor, without this extension at all. Published as a Claude artifact
  (private by default), not part of this repo.
- **[holdengrant.github.io/sprout-editor](https://holdengrant.github.io/sprout-editor/)**
  — the extension's own public homepage (source: `docs/index.html`).
