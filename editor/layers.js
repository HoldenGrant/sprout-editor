// editor/layers.js
//
// Left-sidebar "Layers" panel — a persistent tree view of the loaded page's
// DOM structure (in the spirit of Elementor's Navigator), synced
// bidirectionally with canvas selection: clicking a row scrolls to and
// selects that element in the preview; selecting something in the preview
// highlights the matching row here. Purely a navigation aid — it never
// edits anything itself, Inspector still owns all actual editing.
//
// Every element the tree includes gets a data-sprout-layer-id, a SEPARATE
// numbering scheme from html-utils.js's data-sprout-uid. Layer ids cover
// every structural element (divs, sections, ...), not just the ones smart
// detection or data-sprout marks as editable — uid keeps its narrower
// meaning ("this element has Inspector controls") unchanged.

export const LAYER_ID_ATTR = 'data-sprout-layer-id';

// Not meaningful page structure — skip these and don't recurse into them.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BR', 'HR', 'TITLE']);

export class Layers {
  /**
   * @param {HTMLElement} container
   * @param {{ onSelect: (layerId: string) => void }} handlers
   */
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.doc = null;
  }

  /**
   * Rebuild the tree from the current canvas document. Call once after every
   * file load/switch — the tree doesn't need to track content edits, since
   * v1 never adds or removes elements, only changes text/attrs/styles.
   */
  rebuild(doc) {
    this.doc = doc;
    this.container.innerHTML = '';

    if (!doc?.body || doc.body.children.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'sprout-sidebar__hint';
      empty.textContent = 'Nothing to show — this page has no elements in its body.';
      this.container.appendChild(empty);
      return;
    }

    let nextId = 0;
    const assignId = (el) => {
      const id = String(nextId++);
      el.setAttribute(LAYER_ID_ATTR, id);
      return id;
    };

    const rootList = document.createElement('ul');
    rootList.className = 'sprout-layers-tree';
    this._buildLevel(doc.body, rootList, assignId, 0);
    this.container.appendChild(rootList);
  }

  _buildLevel(parentEl, listEl, assignId, depth) {
    for (const el of parentEl.children) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.id === 'sprout-editor-injected-styles') continue;

      const layerId = assignId(el);
      // SVGs are shown as a single leaf — their internal path/circle/etc
      // structure is icon plumbing, not meaningful page structure.
      const hasChildren = el.tagName !== 'SVG' && el.children.length > 0;

      const li = document.createElement('li');
      li.className = 'sprout-layer-row';
      li.dataset.layerId = layerId;
      // Collapsed by default — a fully-expanded tree is overwhelming on any
      // real page. Depth 0 (direct children of <body>) stays open so there's
      // still something to see on first load; everything below that starts
      // folded and opens on demand (or automatically, via setActiveLayer's
      // ancestor-expansion when canvas selection lands inside it).
      const startCollapsed = hasChildren && depth > 0;
      if (startCollapsed) li.classList.add('is-collapsed');

      const head = document.createElement('div');
      head.className = 'sprout-layer-row-head';
      head.style.paddingLeft = `${depth * 14}px`;

      if (hasChildren) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sprout-layer-toggle';
        toggle.setAttribute('aria-label', 'Collapse or expand');
        toggle.textContent = startCollapsed ? '▸' : '▾';
        toggle.addEventListener('click', (event) => {
          event.stopPropagation(); // don't also trigger the label's select-this-element click
          const collapsed = li.classList.toggle('is-collapsed');
          toggle.textContent = collapsed ? '▸' : '▾';
        });
        head.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'sprout-layer-toggle-spacer';
        head.appendChild(spacer);
      }

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'sprout-layer-label';
      label.textContent = this._describe(el);
      label.addEventListener('click', () => this.onSelect?.(layerId));
      head.appendChild(label);

      li.appendChild(head);

      if (hasChildren) {
        const childList = document.createElement('ul');
        this._buildLevel(el, childList, assignId, depth + 1);
        li.appendChild(childList);
      }

      listEl.appendChild(li);
    }
  }

  /** A scannable label: tag, first class (if any), and a text/alt preview for leaves. */
  _describe(el) {
    const tag = el.tagName.toLowerCase();
    const firstClass = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
    const classHint = firstClass ? `.${firstClass}` : '';

    if (tag === 'img') {
      const alt = el.getAttribute('alt');
      return `img${classHint}${alt ? ` "${truncate(alt)}"` : ''}`;
    }

    if (el.children.length === 0) {
      const text = (el.textContent || '').trim();
      if (text) return `${tag}${classHint} "${truncate(text)}"`;
    }

    return `${tag}${classHint}`;
  }

  /** Highlights the row for the given layer id (or clears highlighting if null). */
  setActiveLayer(layerId) {
    this.container.querySelectorAll('.sprout-layer-row.is-active').forEach((row) => row.classList.remove('is-active'));
    if (!layerId) return;

    const row = this.container.querySelector(`[data-layer-id="${CSS.escape(layerId)}"]`);
    if (!row) return;
    row.classList.add('is-active');

    // The match might be a canvas-driven selection (e.g. clicking directly in
    // the preview) rather than a layers click — expand any collapsed
    // ancestor rows so it's actually visible, not highlighted off-screen
    // inside a folded branch.
    let ancestor = row.parentElement?.closest('.sprout-layer-row');
    while (ancestor) {
      ancestor.classList.remove('is-collapsed');
      const toggle = ancestor.querySelector(':scope > .sprout-layer-row-head > .sprout-layer-toggle');
      if (toggle) toggle.textContent = '▾';
      ancestor = ancestor.parentElement?.closest('.sprout-layer-row');
    }

    row.scrollIntoView({ block: 'nearest' });
  }

  getElementByLayerId(layerId) {
    return this.doc?.querySelector(`[${LAYER_ID_ATTR}="${CSS.escape(layerId)}"]`);
  }
}

function truncate(text, max = 28) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
