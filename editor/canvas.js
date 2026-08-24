// editor/canvas.js
//
// Manages the sandboxed preview iframe: loads the rewritten preview HTML,
// injects EDITOR-ONLY hover/selection outline styles (never part of the
// saved site — see services/html-utils.js stripEditorArtifacts), and wires
// up hover/click/inline-text-editing interactions. Talks to editor.js only
// through the callbacks passed into the constructor — it doesn't know about
// EditorState, history, or the inspector.

import { getEditableKind, documentUsesSproutMode } from '../services/html-utils.js';
import { SPROUT_UID_ATTR, SPROUT_ATTR, SPROUT_KINDS, EDITOR_ONLY_STYLE_ID } from '../shared/constants.js';

export class Canvas {
  /**
   * @param {HTMLIFrameElement} iframeEl
   * @param {{
   *   onSelect: (info: {uid: string, kind: string, el: Element}) => void,
   *   onDeselect: () => void,
   *   onTextChange: (uid: string, newText: string) => void,
   *   onInsertRequest: (info: {anchorUid: string, position: string, clientX: number, clientY: number}) => void,
   * }} handlers
   */
  constructor(iframeEl, { onSelect, onDeselect, onTextChange, onInsertRequest }) {
    this.iframe = iframeEl;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.onTextChange = onTextChange;
    this.onInsertRequest = onInsertRequest;
    this.selectedUid = null;
    this.previewMode = false;
    this.useSproutMode = false;
    this._hoverUid = null;
  }

  get doc() {
    return this.iframe.contentDocument;
  }

  /**
   * Load preview HTML into the iframe (via srcdoc) and wire up interactions
   * once it's ready.
   * @returns {Promise<{ hiddenPreloaderCount: number, revealedSlideCount: number }>}
   */
  load(previewHtml) {
    return new Promise((resolve) => {
      const handleLoad = () => {
        this.iframe.removeEventListener('load', handleLoad);
        // A fresh srcdoc load means a brand-new contentDocument — any
        // insert-affordance buttons from the PREVIOUS document are now
        // pointing at nodes that no longer exist; drop the references so
        // _ensureInsertAffordances() recreates them in the new one.
        this._insertAbove = null;
        this._insertBelow = null;
        this.useSproutMode = documentUsesSproutMode(this.doc);
        this._injectEditorStyles();
        this._wireInteractions();
        const hiddenPreloaderCount = this._autoHidePreloaders();
        const revealedSlideCount = this._revealHiddenSlides();
        resolve({ hiddenPreloaderCount, revealedSlideCount });
      };
      this.iframe.addEventListener('load', handleLoad);
      this.iframe.srcdoc = previewHtml;
    });
  }

  /**
   * Many template sites show a full-screen loading/splash overlay that a
   * script normally fades out on window "load" (e.g. jQuery `.fadeOut()`).
   * Sprout's sandboxed preview never runs site scripts (see the top-of-file
   * comment — scripts are disabled for safety), so that overlay would
   * otherwise stay stuck covering the whole page forever.
   *
   * This is a preview-only, CSS-only fix (`display: none` via inline style,
   * same as any other editor-only preview affordance): it never touches the
   * saved HTML, and it's deliberately conservative — an element must BOTH
   * look like a loader by name AND actually be a fixed/absolute overlay
   * covering most of the viewport, so it won't hide an unrelated small
   * "Load More" button or similar.
   * @returns {number} how many overlay elements were hidden
   */
  _autoHidePreloaders() {
    const win = this.iframe.contentWindow;
    if (!this.doc || !win) return 0;

    const NAME_PATTERN = /load|preload|splash|spinner/i;
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;
    let hiddenCount = 0;

    this.doc.querySelectorAll('body *').forEach((el) => {
      const nameHint = `${el.id || ''} ${el.getAttribute('class') || ''}`;
      if (!NAME_PATTERN.test(nameHint)) return;

      const computed = win.getComputedStyle(el);
      if (computed.position !== 'fixed' && computed.position !== 'absolute') return;

      const rect = el.getBoundingClientRect();
      const coversViewport = rect.width >= viewportWidth * 0.7 && rect.height >= viewportHeight * 0.7;
      if (!coversViewport) return;

      el.style.setProperty('display', 'none', 'important');
      hiddenCount += 1;
    });

    return hiddenCount;
  }

  /**
   * Carousels/sliders (Bootstrap Carousel's `.carousel-item`, Slick's
   * `.slick-slide`, Swiper's `.swiper-slide`, Owl Carousel's `.owl-item`, and
   * similarly-named custom ones) show exactly one slide and hide the rest,
   * relying on JS the sandbox never runs to move which one is visible on
   * click. Left alone, every slide but the first is permanently unreachable —
   * not just unanimated, actually impossible to select or edit.
   *
   * Fix: force every element matching a known slide-item naming pattern into
   * plain vertical document flow, so the user can scroll to and edit every
   * slide. This deliberately trades "looks like an animated carousel" for
   * "every slide is actually reachable" — the right tradeoff for an editing
   * tool. Preview-only, same as _autoHidePreloaders() above; the saved
   * file's real carousel markup/behavior is completely untouched.
   *
   * Applied unconditionally to every matched element, not just ones
   * currently `display:none` — Bootstrap's carousel (and others) overlay
   * slides on the *active* one too, via `float:left; width:100%;
   * margin-right:-100%` rather than absolute positioning, so the "active"
   * slide needs the same reset as the hidden ones or they still visually
   * stack on top of each other (float + a -100% margin pulls every next
   * item back on top of the previous one, `position:static` alone doesn't
   * cancel that).
   * @returns {number} how many slide elements were touched
   */
  _revealHiddenSlides() {
    if (!this.doc) return 0;

    const SLIDE_CLASS_PATTERN = /carousel-item|slick-slide|swiper-slide|owl-item|splide__slide|(^|[-_])slide($|[-_])/i;
    let revealedCount = 0;

    this.doc.querySelectorAll('body *').forEach((el) => {
      const className = el.getAttribute('class') || '';
      if (!SLIDE_CLASS_PATTERN.test(className)) return;

      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('position', 'static', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('transform', 'none', 'important');
      el.style.setProperty('float', 'none', 'important');
      el.style.setProperty('width', '100%', 'important');
      // Zero left/right/top (the negative-margin overlap trick lives here)
      // but leave a little breathing room between now-stacked slides.
      el.style.setProperty('margin', '0 0 12px 0', 'important');
      revealedCount += 1;
    });

    return revealedCount;
  }

  _injectEditorStyles() {
    const style = this.doc.createElement('style');
    style.id = EDITOR_ONLY_STYLE_ID;
    style.textContent = `
      [${SPROUT_UID_ATTR}] { cursor: pointer; }
      .sprout-hover-outline { outline: 2px dashed #2ea043 !important; outline-offset: 2px; }
      .sprout-selected-outline { outline: 2px solid #2ea043 !important; outline-offset: 3px; }
      .sprout-layer-focus-outline { outline: 2px solid #2ea043 !important; outline-offset: 3px; transition: outline-color 0.3s ease 1.1s; }
      [contenteditable="true"] { outline: 2px solid #2ea043 !important; outline-offset: 3px; cursor: text; }
      html.sprout-preview-mode [${SPROUT_UID_ATTR}] { cursor: default !important; }
      .sprout-insert-btn {
        position: fixed;
        width: 22px;
        height: 22px;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: #2ea043;
        color: #fff;
        font-size: 15px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transform: scale(0.75);
        transition: opacity 0.12s ease, transform 0.12s ease;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }
      .sprout-insert-btn.is-visible { opacity: 1; pointer-events: auto; transform: scale(1); }
      .sprout-insert-btn:hover { filter: brightness(1.08); }
      html.sprout-preview-mode .sprout-insert-btn { display: none !important; }
    `;
    this.doc.head.appendChild(style);
  }

  _wireInteractions() {
    this.doc.querySelectorAll(`[${SPROUT_UID_ATTR}]`).forEach((el) => {
      // Containers (div/section/...) have a uid — so save/undo and the
      // Layers panel can reach them — but are deliberately NOT hoverable/
      // clickable here. Every <div> on a real page would otherwise become
      // individually clickable, which is exactly the noise the tag-based
      // detection rules elsewhere are designed to avoid. Reach a container
      // through the Layers panel instead (see editor/layers.js).
      if (getEditableKind(el, this.useSproutMode) === SPROUT_KINDS.CONTAINER) return;
      this._wireOne(el);
    });

    // Any click that isn't caught (and stopped) by an editable element above
    // happened on non-editable canvas space — deselect.
    this.doc.addEventListener('click', () => {
      if (!this.previewMode) this.deselect();
    });
  }

  /**
   * Wires hover/click/insert-affordance behavior onto ONE editable
   * (non-container) element. Called both for every element during the
   * initial full pass above, and for a single newly-inserted element
   * (insertElement()) — kept as its own method specifically so inserting an
   * element doesn't need to re-wire everything already on the page.
   */
  _wireOne(el) {
    el.addEventListener('mouseenter', () => {
      if (this.previewMode) return;
      // Skip the dashed hover outline on the already-SELECTED element (it
      // already has its own solid selected outline) — but the + buttons
      // should still show either way. "Select this paragraph, then add a
      // sibling right after it" without needing to hover away and back is
      // exactly the natural sequence this exists for.
      if (el.getAttribute(SPROUT_UID_ATTR) !== this.selectedUid) {
        el.classList.add('sprout-hover-outline');
      }
      this._showInsertButtonsFor(el);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('sprout-hover-outline');
      this._scheduleHideInsertButtons();
    });
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.previewMode) return;
      event.stopPropagation();
      this.select(el.getAttribute(SPROUT_UID_ATTR));
    });
  }

  // ---------- "+" insert affordances (canvas) ----------
  //
  // A pair of small round + buttons that hover above/below whichever
  // editable element the pointer is currently over, letting the user insert
  // a new sibling there without going through the Layers panel. Created
  // once and repositioned via getBoundingClientRect() rather than recreated
  // per-hover — cheaper, and avoids a flash of a freshly-created element.
  // Deliberately absent for CONTAINER-kind elements (_wireOne is never
  // called for them), matching the existing "containers aren't
  // canvas-clickable" rule — see editor/layers.js for how a container gets
  // its own "+" instead.

  _ensureInsertAffordances() {
    if (this._insertAbove) return;
    this._insertAbove = this._createInsertButton('before');
    this._insertBelow = this._createInsertButton('after');
    this.doc.body.appendChild(this._insertAbove);
    this.doc.body.appendChild(this._insertBelow);
    // A stale button left floating over content that's since scrolled away
    // looks broken — just hide on any scroll rather than tracking position.
    this.iframe.contentWindow?.addEventListener('scroll', () => this._hideInsertButtons(), { passive: true });
  }

  _createInsertButton(position) {
    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'sprout-insert-btn';
    btn.textContent = '+';
    btn.setAttribute('aria-label', position === 'before' ? 'Add element above' : 'Add element below');
    // Hovering onto the button itself (moving off the target element toward
    // it) must not immediately hide it — cancel the pending hide, same as
    // re-entering the target element would.
    btn.addEventListener('mouseenter', () => this._cancelHideInsertButtons());
    btn.addEventListener('mouseleave', () => this._scheduleHideInsertButtons());
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this._hoverUid) return;
      // Convert this iframe-internal click position to parent-viewport
      // coordinates (the insert-type menu it opens lives in the parent
      // document, not inside this sandboxed iframe).
      const iframeRect = this.iframe.getBoundingClientRect();
      this.onInsertRequest?.({
        anchorUid: this._hoverUid,
        position,
        clientX: iframeRect.left + event.clientX,
        clientY: iframeRect.top + event.clientY,
      });
    });
    return btn;
  }

  _showInsertButtonsFor(el) {
    if (this.previewMode) return;
    this._ensureInsertAffordances();
    this._cancelHideInsertButtons();
    this._hoverUid = el.getAttribute(SPROUT_UID_ATTR);

    const rect = el.getBoundingClientRect();
    const size = 22;
    this._insertAbove.style.top = `${rect.top - size / 2}px`;
    this._insertAbove.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
    this._insertBelow.style.top = `${rect.bottom - size / 2}px`;
    this._insertBelow.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
    this._insertAbove.classList.add('is-visible');
    this._insertBelow.classList.add('is-visible');
  }

  _scheduleHideInsertButtons() {
    clearTimeout(this._hideInsertTimeout);
    this._hideInsertTimeout = setTimeout(() => this._hideInsertButtons(), 250);
  }

  _cancelHideInsertButtons() {
    clearTimeout(this._hideInsertTimeout);
  }

  _hideInsertButtons() {
    this._insertAbove?.classList.remove('is-visible');
    this._insertBelow?.classList.remove('is-visible');
  }

  /**
   * Materializes one new element in the LIVE preview only — the mirror of
   * services/html-utils.js applyInsertionsToDocument(), kept as a separate
   * implementation on purpose, same as every other preview/save pair in this
   * codebase (the preview DOM's asset URLs are rewritten for display and
   * must never leak into what gets saved).
   * @param {{uid: string, anchorUid: string, position: 'before'|'after'|'prepend'|'append', tag: string, kind?: string}} insertion
   */
  insertElement({ uid, anchorUid, position, tag, kind }) {
    const anchor = this.getElementByUid(anchorUid);
    if (!anchor) return null;

    const el = this.doc.createElement(tag);
    el.setAttribute(SPROUT_UID_ATTR, uid);
    // MODE 2 pages only recognize editable elements via data-sprout — see
    // the matching comment in html-utils.js applyInsertionsToDocument().
    if (this.useSproutMode && kind) el.setAttribute(SPROUT_ATTR, kind);

    if (position === 'before') anchor.parentNode?.insertBefore(el, anchor);
    else if (position === 'after') anchor.parentNode?.insertBefore(el, anchor.nextSibling);
    else if (position === 'prepend') anchor.insertBefore(el, anchor.firstChild);
    else anchor.appendChild(el); // 'append' (default) — anchor is expected to be a container

    if (kind !== SPROUT_KINDS.CONTAINER) this._wireOne(el);

    return el;
  }

  /** Removes a previously-inserted element from the live preview (undo of insertElement). */
  removeElement(uid) {
    this._hideInsertButtons();
    this.getElementByUid(uid)?.remove();
  }

  select(uid) {
    if (this.previewMode || this.selectedUid === uid) return;
    this.deselect();

    const el = this.getElementByUid(uid);
    if (!el) return;

    // Only scrolls if the element isn't already fully visible — a direct
    // click in canvas means it's already on screen (jumping the viewport
    // anyway would be jarring), but selection triggered from the Layers
    // panel can land on something scrolled well out of view.
    this._scrollIntoViewIfNeeded(el);

    this.selectedUid = uid;
    el.classList.remove('sprout-hover-outline');
    el.classList.add('sprout-selected-outline');

    const kind = getEditableKind(el, this.useSproutMode);
    if (kind === SPROUT_KINDS.TEXT) {
      this._enableInlineTextEditing(el, uid);
    }

    this.onSelect?.({ uid, kind, el });
  }

  deselect() {
    if (!this.selectedUid) return;
    const el = this.getElementByUid(this.selectedUid);
    if (el) {
      el.classList.remove('sprout-selected-outline');
      this._disableInlineTextEditing(el);
    }
    this.selectedUid = null;
    this.onDeselect?.();
  }

  _scrollIntoViewIfNeeded(el) {
    const win = this.iframe.contentWindow;
    if (!win) return;
    const rect = el.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= win.innerHeight;
    if (!fullyVisible) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Scrolls to and briefly outlines a non-editable structural element (a
   * plain wrapper <div>/<section>/etc with no Inspector controls of its
   * own) — used by the Layers panel when the clicked row isn't something
   * select() applies to. Purely a "here's what you clicked" flash; it
   * doesn't touch selection state.
   */
  focusElement(el) {
    if (!el) return;
    this._scrollIntoViewIfNeeded(el);
    el.classList.add('sprout-layer-focus-outline');
    clearTimeout(this._layerFocusTimeout);
    this._layerFocusTimeout = setTimeout(() => el.classList.remove('sprout-layer-focus-outline'), 1400);
  }

  _enableInlineTextEditing(el, uid) {
    el.setAttribute('contenteditable', 'true');
    const commit = () => this.onTextChange?.(uid, el.textContent);
    el.addEventListener('blur', commit);
    el._sproutCommitHandler = commit; // referenced for cleanup in _disableInlineTextEditing
    // The click that triggered selection called preventDefault() (to stop link
    // navigation etc.), which can suppress the browser's normal focus-follows-
    // click behavior — focus explicitly so the user can start typing immediately.
    el.focus();
  }

  _disableInlineTextEditing(el) {
    if (el._sproutCommitHandler) {
      el.removeEventListener('blur', el._sproutCommitHandler);
      delete el._sproutCommitHandler;
    }
    el.removeAttribute('contenteditable');
  }

  getElementByUid(uid) {
    return this.doc?.querySelector(`[${SPROUT_UID_ATTR}="${CSS.escape(uid)}"]`);
  }

  /** Apply an attribute change directly to the live preview (Inspector-driven edits). */
  applyAttr(uid, name, value) {
    const el = this.getElementByUid(uid);
    if (!el) return;
    if (value === null || value === undefined || value === '') el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  /** Apply an inline style change directly to the live preview. */
  applyStyle(uid, prop, value) {
    const el = this.getElementByUid(uid);
    if (!el) return;
    if (value === null || value === undefined || value === '') el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
  }

  /** Apply a text change directly to the live preview (used by undo/redo replay). */
  applyText(uid, text) {
    const el = this.getElementByUid(uid);
    if (el) el.textContent = text;
  }

  /** Toggle "Preview" mode: hides all editor hover/selection chrome so the user can see the real page. */
  setPreviewMode(enabled) {
    this.previewMode = enabled;
    if (!this.doc) return;
    this.doc.documentElement.classList.toggle('sprout-preview-mode', enabled);
    if (enabled) {
      this.deselect();
      this._hideInsertButtons();
    }
  }

  /** Scroll to (and select) the first editable element matching a sidebar category. */
  scrollToCategory(category) {
    const match = this._findFirstElementForCategory(category);
    if (!match) return false;
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.select(match.getAttribute(SPROUT_UID_ATTR));
    return true;
  }

  _findFirstElementForCategory(category) {
    if (!this.doc) return null;
    const selectors = {
      hero: 'header, .hero, [class*="hero"], h1',
      nav: 'nav, [class*="nav"]',
      section: 'section, main, article',
      image: `img[${SPROUT_UID_ATTR}]`,
      button: `a[${SPROUT_UID_ATTR}], button[${SPROUT_UID_ATTR}]`,
      footer: 'footer, [class*="footer"]',
    };
    const selector = selectors[category];
    if (!selector) return null;

    // Prefer an editable element; fall back to any matching element scrolled into view.
    const candidates = [...this.doc.querySelectorAll(selector)];
    return candidates.find((el) => el.hasAttribute(SPROUT_UID_ATTR)) || candidates[0] || null;
  }
}
