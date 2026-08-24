// services/html-utils.js
//
// Pure HTML/DOM utilities shared by the preview pipeline (file-loader.js +
// canvas.js) and the save pipeline (editor.js). No network calls live here.
//
// KEY DESIGN NOTE — two separate DOM lifecycles:
//   1. PREVIEW: the original HTML is parsed once, editable elements are
//      tagged with a stable data-sprout-uid, and local asset URLs are
//      rewritten to data: URIs so the iframe can actually render them. This
//      preview DOM is then live-edited directly (contentEditable text,
//      inspector-driven attribute/style changes) AND every user-made change
//      is *also* recorded into an `edits` map keyed by uid.
//   2. SAVE: we re-parse the ORIGINAL, untouched HTML string from scratch,
//      re-assign the same deterministic uids, replay `insertions` then
//      `edits` on top, then serialize. This guarantees rewritten preview
//      URLs (data: URIs) can never leak into what gets committed back to
//      GitHub — the save path never even looks at the live iframe DOM.
// Uid assignment is deterministic (document-order walk over the same
// string), so the same uids for ORIGINAL elements line up correctly between
// the two lifecycles. Elements the user INSERTS get their own uids (a
// distinct INSERTED_UID_PREFIX scheme, assigned in editor.js) and are
// recorded structurally in `insertions` (see applyInsertionsToDocument) —
// deliberately kept separate from `edits`, which only ever describes
// text/attr/style changes to a uid that already exists.

import {
  SMART_TEXT_TAGS,
  SMART_BUTTON_TAGS,
  SMART_IMAGE_TAGS,
  GENERIC_LEAF_TEXT_TAGS,
  CONTAINER_TAGS,
  SPROUT_ATTR,
  SPROUT_KINDS,
  SPROUT_UID_ATTR,
  EDITOR_ONLY_STYLE_ID,
} from '../shared/constants.js';

export function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** MODE 2 takes priority over MODE 1 if any data-sprout attribute exists anywhere in the doc. */
export function documentUsesSproutMode(doc) {
  return Boolean(doc.querySelector(`[${SPROUT_ATTR}]`));
}

/** Returns one of SPROUT_KINDS, or null if this element isn't editable. */
export function getEditableKind(el, useSproutMode) {
  if (useSproutMode) {
    const value = el.getAttribute(SPROUT_ATTR);
    return Object.values(SPROUT_KINDS).includes(value) ? value : null;
  }
  if (SMART_IMAGE_TAGS.includes(el.tagName)) return SPROUT_KINDS.IMAGE;
  if (SMART_BUTTON_TAGS.includes(el.tagName)) return SPROUT_KINDS.BUTTON;
  if (SMART_TEXT_TAGS.includes(el.tagName)) return SPROUT_KINDS.TEXT;
  // Generic containers (div/td/label/...) only count as editable text when
  // they're a leaf holding real text — see GENERIC_LEAF_TEXT_TAGS in
  // shared/constants.js for why this is conditional, unlike the tags above.
  if (GENERIC_LEAF_TEXT_TAGS.includes(el.tagName) && isLeafTextElement(el) && el.textContent.trim()) {
    return SPROUT_KINDS.TEXT;
  }
  // Anything left that's a structural container (a non-leaf div/section/...,
  // or a leaf one with no text) is reachable via the Layers panel as a
  // "container" — background color/image + spacing controls, but never
  // wired for canvas hover/click (see CONTAINER_TAGS in shared/constants.js).
  if (CONTAINER_TAGS.includes(el.tagName)) {
    return SPROUT_KINDS.CONTAINER;
  }
  return null;
}

/** A "leaf" text element has no child elements, so textContent edits can't destroy nested markup. */
export function isLeafTextElement(el) {
  return el.children.length === 0;
}

/**
 * Walk the document in a deterministic order and stamp every editable
 * element with a data-sprout-uid. Returns a Map<uid, element> for lookups.
 */
export function tagEditableElements(doc) {
  const useSproutMode = documentUsesSproutMode(doc);
  const root = doc.body || doc.documentElement;
  const registry = new Map();
  let nextUid = 0;

  root.querySelectorAll('*').forEach((el) => {
    const kind = getEditableKind(el, useSproutMode);
    if (!kind) return;
    const uid = String(nextUid++);
    el.setAttribute(SPROUT_UID_ATTR, uid);
    registry.set(uid, el);
  });

  return { useSproutMode, registry };
}

/**
 * Resolve a possibly-relative asset URL against the HTML/CSS file's own repo
 * path. Returns null for anything that isn't a same-repo relative path
 * (absolute http(s) URLs, protocol-relative, data:, mailto:, tel:, #anchors,
 * javascript:) — those are left untouched.
 */
export function resolveRelativeAssetPath(fileRepoPath, url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (
    /^(https?:)?\/\//i.test(trimmed) ||
    /^(data|mailto|tel|javascript):/i.test(trimmed) ||
    trimmed.startsWith('#')
  ) {
    return null;
  }

  const baseDir = fileRepoPath.includes('/')
    ? fileRepoPath.slice(0, fileRepoPath.lastIndexOf('/'))
    : '';

  // Root-relative ("/images/x.png") is resolved from the repo root; anything
  // else is resolved relative to the current file's directory.
  const segments = trimmed.startsWith('/')
    ? trimmed.slice(1).split('/')
    : [...baseDir.split('/').filter(Boolean), ...trimmed.split('/')];

  const resolved = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}

/**
 * Find local (same-repo) asset references in the document that the preview
 * needs to fetch and inline: <link rel="stylesheet" href>, <img src>.
 * Returns a flat list the caller (file-loader.js) can fetch and then apply
 * back via applyResolvedAssetUrl().
 */
export function collectAssetReferences(doc, htmlRepoPath) {
  const refs = [];

  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
    const resolvedPath = resolveRelativeAssetPath(htmlRepoPath, el.getAttribute('href'));
    if (resolvedPath) refs.push({ kind: 'stylesheet', element: el, attr: 'href', resolvedPath });
  });

  doc.querySelectorAll('img[src]').forEach((el) => {
    const resolvedPath = resolveRelativeAssetPath(htmlRepoPath, el.getAttribute('src'));
    if (resolvedPath) refs.push({ kind: 'image', element: el, attr: 'src', resolvedPath });
  });

  return refs;
}

/** Find url(...) references inside a CSS file's text, resolved relative to that CSS file's repo path. */
export function collectCssUrlReferences(cssText, cssRepoPath) {
  const refs = [];
  const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  let match;
  while ((match = urlPattern.exec(cssText))) {
    const original = match[2];
    const resolvedPath = resolveRelativeAssetPath(cssRepoPath, original);
    if (resolvedPath) refs.push({ original, resolvedPath });
  }
  return refs;
}

/** Replace url(...) references in CSS text using a Map<originalUrlText, newUrl>. */
export function applyCssUrlReplacements(cssText, replacements) {
  if (replacements.size === 0) return cssText;
  const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  return cssText.replace(urlPattern, (fullMatch, _quote, original) => {
    const replacement = replacements.get(original);
    return replacement ? `url("${replacement}")` : fullMatch;
  });
}

/**
 * Materialize the user's recorded element insertions into a freshly-tagged
 * document. Must run BEFORE applyEditsToDocument(): insertions create the
 * structure (new elements), edits populate it (text/attrs/styles on uids
 * that may include ones just created here). Each new element is registered
 * into the SAME registry passed in, exactly like an original-document
 * element, so both a later insertion anchored on this one and
 * applyEditsToDocument's uid lookups find it uniformly — callers never need
 * to know which uids are original vs inserted.
 * @param {Document} doc
 * @param {Map<string, Element>} registry
 * @param {Array<{uid: string, anchorUid: string, position: 'before'|'after'|'prepend'|'append', tag: string, kind?: string}>} insertions
 * @param {boolean} useSproutMode
 */
export function applyInsertionsToDocument(doc, registry, insertions, useSproutMode) {
  for (const insertion of insertions) {
    const anchor = registry.get(insertion.anchorUid);
    if (!anchor) continue; // anchor no longer exists (shouldn't happen — v1 never removes original elements)

    const el = doc.createElement(insertion.tag);
    // MODE 2 pages only recognize editable elements via the data-sprout
    // attribute — without this, a newly-inserted plain <p> would be
    // invisible to getEditableKind() on such a page (see its MODE 2 branch).
    if (useSproutMode && insertion.kind) el.setAttribute(SPROUT_ATTR, insertion.kind);

    if (insertion.position === 'before') {
      anchor.parentNode?.insertBefore(el, anchor);
    } else if (insertion.position === 'after') {
      anchor.parentNode?.insertBefore(el, anchor.nextSibling);
    } else if (insertion.position === 'prepend') {
      anchor.insertBefore(el, anchor.firstChild);
    } else {
      // 'append' (default) — anchor is expected to be a container.
      anchor.appendChild(el);
    }

    registry.set(insertion.uid, el);
  }
}

/**
 * Apply the user's recorded edits onto a freshly-tagged document (used both
 * to refresh the live preview after undo/redo, and — critically — to build
 * the final HTML that gets saved to GitHub).
 * @param {Map<string, {text?: string, attrs?: Record<string,string>, styles?: Record<string,string>}>} edits
 */
export function applyEditsToDocument(registry, edits) {
  for (const [uid, edit] of edits.entries()) {
    const el = registry.get(uid);
    if (!el) continue; // element not in the registry — an edit for a removed/never-inserted uid, ignore it

    if (typeof edit.text === 'string') {
      el.textContent = edit.text;
    }
    if (edit.attrs) {
      for (const [name, value] of Object.entries(edit.attrs)) {
        if (value === null || value === undefined || value === '') {
          el.removeAttribute(name);
        } else {
          el.setAttribute(name, value);
        }
      }
    }
    if (edit.styles) {
      for (const [prop, value] of Object.entries(edit.styles)) {
        if (value === null || value === undefined || value === '') {
          el.style.removeProperty(prop);
        } else {
          el.style.setProperty(prop, value);
        }
      }
    }
  }
}

/**
 * Remove every editor-internal marker so saved/serialized HTML is clean.
 * Defensive: serializeForSave() always operates on a fresh parse of the
 * pristine original HTML, which never had these markers in the first place —
 * this exists in case any other code path ever serializes a live/preview doc.
 */
export function stripEditorArtifacts(doc) {
  doc.querySelectorAll(`[${SPROUT_UID_ATTR}]`).forEach((el) => el.removeAttribute(SPROUT_UID_ATTR));
  doc.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  doc.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.startsWith('data-sprout-original-')) el.removeAttribute(attr.name);
    });
  });
  doc.getElementById(EDITOR_ONLY_STYLE_ID)?.remove();
}

/** Serialize a Document back to an HTML string, preserving the original doctype if present. */
export function serializeDocument(doc) {
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : '';
  return doctype + doc.documentElement.outerHTML;
}

/**
 * The full save pipeline: parse the pristine original HTML fresh, replay
 * insertions then edits on top, strip editor artifacts, and serialize. Never
 * touches the live (asset-URL-rewritten) preview DOM.
 */
export function serializeForSave(originalHtml, edits, insertions = []) {
  const doc = parseHtmlDocument(originalHtml);
  const { registry, useSproutMode } = tagEditableElements(doc);
  applyInsertionsToDocument(doc, registry, insertions, useSproutMode);
  applyEditsToDocument(registry, edits);
  stripEditorArtifacts(doc);
  return serializeDocument(doc);
}
