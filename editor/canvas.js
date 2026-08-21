// editor/canvas.js
//
// Manages the sandboxed preview iframe: loads the rewritten preview HTML,
// injects EDITOR-ONLY hover/selection outline styles (never part of the
// saved site — see services/html-utils.js stripEditorArtifacts), and wires
// up hover/click/inline-text-editing interactions. Talks to editor.js only
// through the callbacks passed into the constructor — it doesn't know about
// EditorState, history, or the inspector.

import { getEditableKind, documentUsesSproutMode } from '../services/html-utils.js';
import { SPROUT_UID_ATTR, SPROUT_KINDS, EDITOR_ONLY_STYLE_ID } from '../shared/constants.js';

export class Canvas {
  /**
   * @param {HTMLIFrameElement} iframeEl
   * @param {{
   *   onSelect: (info: {uid: string, kind: string, el: Element}) => void,
   *   onDeselect: () => void,
   *   onTextChange: (uid: string, newText: string) => void,
   * }} handlers
   */
  constructor(iframeEl, { onSelect, onDeselect, onTextChange }) {
    this.iframe = iframeEl;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.onTextChange = onTextChange;
    this.selectedUid = null;
    this.previewMode = false;
    this.useSproutMode = false;
  }

  get doc() {
    return this.iframe.contentDocument;
  }

  /** Load preview HTML into the iframe (via srcdoc) and wire up interactions once it's ready. */
  load(previewHtml) {
    return new Promise((resolve) => {
      const handleLoad = () => {
        this.iframe.removeEventListener('load', handleLoad);
        this.useSproutMode = documentUsesSproutMode(this.doc);
        this._injectEditorStyles();
        this._wireInteractions();
        resolve();
      };
      this.iframe.addEventListener('load', handleLoad);
      this.iframe.srcdoc = previewHtml;
    });
  }

  _injectEditorStyles() {
    const style = this.doc.createElement('style');
    style.id = EDITOR_ONLY_STYLE_ID;
    style.textContent = `
      [${SPROUT_UID_ATTR}] { cursor: pointer; }
      .sprout-hover-outline { outline: 2px dashed #2ea043 !important; outline-offset: 2px; }
      .sprout-selected-outline { outline: 2px solid #2ea043 !important; outline-offset: 3px; }
      [contenteditable="true"] { outline: 2px solid #2ea043 !important; outline-offset: 3px; cursor: text; }
      html.sprout-preview-mode [${SPROUT_UID_ATTR}] { cursor: default !important; }
    `;
    this.doc.head.appendChild(style);
  }

  _wireInteractions() {
    this.doc.querySelectorAll(`[${SPROUT_UID_ATTR}]`).forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (this.previewMode || el.getAttribute(SPROUT_UID_ATTR) === this.selectedUid) return;
        el.classList.add('sprout-hover-outline');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('sprout-hover-outline');
      });
      el.addEventListener('click', (event) => {
        event.preventDefault();
        if (this.previewMode) return;
        event.stopPropagation();
        this.select(el.getAttribute(SPROUT_UID_ATTR));
      });
    });

    // Any click that isn't caught (and stopped) by an editable element above
    // happened on non-editable canvas space — deselect.
    this.doc.addEventListener('click', () => {
      if (!this.previewMode) this.deselect();
    });
  }

  select(uid) {
    if (this.previewMode || this.selectedUid === uid) return;
    this.deselect();

    const el = this.getElementByUid(uid);
    if (!el) return;

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
    if (enabled) this.deselect();
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
