// editor/inspector.js
//
// Renders the right-hand "Inspector" panel based on the currently selected
// element's kind (text/button/image), and reports every change back to
// editor.js via the onTextChange/onAttrChange/onStyleChange callbacks.
// Deliberately does NOT mutate the live preview element itself — editor.js
// is the single place that applies a change to the canvas, so it can also
// snapshot the correct "before" value for undo/redo. This module only reads
// current values (for populating fields) and reports intent.

import { SPROUT_KINDS, originalValueAttr } from '../shared/constants.js';
import { isLeafTextElement } from '../services/html-utils.js';

export class Inspector {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   onTextChange: (uid: string, value: string) => void,
   *   onAttrChange: (uid: string, name: string, value: string) => void,
   *   onStyleChange: (uid: string, prop: string, value: string) => void,
   *   onMultiStyleChange: (uid: string, styles: Record<string,string>) => void,
   *   onColumnsChange: (uid: string, count: number) => void,
   * }} handlers
   */
  constructor(container, { onTextChange, onAttrChange, onStyleChange, onMultiStyleChange, onColumnsChange }) {
    this.container = container;
    this.onTextChange = onTextChange;
    this.onAttrChange = onAttrChange;
    this.onStyleChange = onStyleChange;
    // For fields where several real CSS properties have to change together
    // as one atomic edit (Button/Link Alignment) — see _applyAlignment.
    // Distinct from onStyleChange, which is always exactly one property.
    this.onMultiStyleChange = onMultiStyleChange;
    // Columns is more than a style change — it has to create actual column
    // boxes (not just lay out whatever's already there), which means
    // inserting elements, which editor.js owns. See _applyColumns.
    this.onColumnsChange = onColumnsChange;
  }

  clear() {
    this.container.innerHTML = '<p class="sprout-inspector__empty">Select an element in the preview to edit it.</p>';
  }

  render({ uid, kind, el }) {
    this.container.innerHTML = '';

    if (kind === SPROUT_KINDS.TEXT) this._renderTextPanel(uid, el);
    else if (kind === SPROUT_KINDS.BUTTON) this._renderButtonPanel(uid, el);
    else if (kind === SPROUT_KINDS.IMAGE) this._renderImagePanel(uid, el);
    else if (kind === SPROUT_KINDS.CONTAINER) this._renderContainerPanel(uid, el);

    this._renderSpacingSection(uid, el);
  }

  // ---------- Panel builders ----------

  _renderTextPanel(uid, el) {
    this._sectionTitle('Text');

    if (isLeafTextElement(el)) {
      this.container.appendChild(
        this._textareaField('Text', el.textContent, (value) => this.onTextChange(uid, value))
      );
    } else {
      const hint = document.createElement('p');
      hint.className = 'sprout-inspector__empty';
      hint.textContent = 'This element contains nested formatting — click directly on the text in the preview to edit it in place.';
      this.container.appendChild(hint);
    }

    this.container.appendChild(
      this._numberField('Font size', 'px', this._currentPx(el, 'fontSize'), (value) => {
        this._applyStyle(uid, 'font-size', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._colorField('Text color', this._currentColor(el, 'color'), (value) => {
        this._applyStyle(uid, 'color', value);
      })
    );

    this.container.appendChild(
      this._alignmentField(getComputedStyle(el).textAlign, (value) => {
        this._applyStyle(uid, 'text-align', value);
      })
    );
  }

  _renderButtonPanel(uid, el) {
    this._sectionTitle('Button / Link');

    this.container.appendChild(
      this._textField('Text', el.textContent, (value) => this.onTextChange(uid, value))
    );

    if (el.tagName === 'A') {
      this.container.appendChild(
        this._textField('Link (href)', el.getAttribute('href') || '', (value) =>
          this.onAttrChange(uid, 'href', value)
        )
      );
    }

    this.container.appendChild(
      this._colorField('Background color', this._currentColor(el, 'backgroundColor'), (value) => {
        this._applyStyle(uid, 'background-color', value);
      })
    );

    this.container.appendChild(
      this._colorField('Text color', this._currentColor(el, 'color'), (value) => {
        this._applyStyle(uid, 'color', value);
      })
    );

    this.container.appendChild(
      this._rangeField('Border radius', 'px', 0, 48, this._currentPx(el, 'borderRadius'), (value) => {
        this._applyStyle(uid, 'border-radius', `${value}px`);
      })
    );

    this.container.appendChild(
      this._alignmentField(this._currentButtonAlignment(el), (value) => {
        this._applyAlignment(uid, value);
      })
    );
  }

  _renderImagePanel(uid, el) {
    this._sectionTitle('Image');

    // Preview `src` may be a rewritten data: URI (see services/file-loader.js) —
    // show the ORIGINAL repo-relative path the loader stashed before rewriting it.
    const displaySrc = el.getAttribute(originalValueAttr('src')) ?? el.getAttribute('src') ?? '';
    this.container.appendChild(
      this._textField('Image URL', displaySrc, (value) => this.onAttrChange(uid, 'src', value))
    );

    this.container.appendChild(
      this._textField('Alt text', el.getAttribute('alt') || '', (value) => this.onAttrChange(uid, 'alt', value))
    );

    this.container.appendChild(
      this._numberField('Width', 'px', this._currentPx(el, 'width'), (value) => {
        this._applyStyle(uid, 'width', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._numberField('Border radius', 'px', this._currentPx(el, 'borderRadius'), (value) => {
        this._applyStyle(uid, 'border-radius', value ? `${value}px` : '');
      })
    );
  }

  _renderContainerPanel(uid, el) {
    this._sectionTitle('Section / Container');

    // Never show an editor-internal class (sprout-hover-outline,
    // sprout-selected-outline, ...) as if it were the element's own — a
    // freshly-inserted container has no real class at all until the user
    // adds one, so the ONLY token in its class attribute at that point can
    // genuinely be one of ours.
    const firstClass = (el.getAttribute('class') || '')
      .trim()
      .split(/\s+/)
      .find((c) => c && !c.startsWith('sprout-'));
    const hint = document.createElement('p');
    hint.className = 'sprout-inspector__empty';
    hint.textContent = `<${el.tagName.toLowerCase()}${firstClass ? ` class="${firstClass}"` : ''}> — reached via the Layers panel. Edit the text/images inside it directly, or set a background below.`;
    this.container.appendChild(hint);

    this.container.appendChild(
      this._colorField('Background color', this._currentColor(el, 'backgroundColor'), (value) => {
        this._applyStyle(uid, 'background-color', value);
      })
    );

    // Only reads/writes the INLINE background-image, never the computed value —
    // a background coming from an external CSS class may have been rewritten to
    // a data: URI for preview (see file-loader.js), and dumping that into a text
    // field would be both unreadable and wrong to save. An inline-set background
    // was never rewritten, so it's always safe to show and re-edit.
    const inlineBgImage = extractCssUrl(el.style.backgroundImage);
    const hasComputedBgImage = !inlineBgImage && getComputedStyle(el).backgroundImage !== 'none';
    this.container.appendChild(
      this._textField('Background image URL', inlineBgImage, (value) => {
        this._applyStyle(uid, 'background-image', value ? `url("${value}")` : '');
      })
    );
    if (hasComputedBgImage) {
      const cssHint = document.createElement('p');
      cssHint.className = 'sprout-inspector__empty';
      cssHint.textContent = 'This section already has a background image set by the page\'s CSS — type a URL above to override it.';
      this.container.appendChild(cssHint);
    }

    this.container.appendChild(
      this._buttonGroupField(
        'Columns',
        [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]),
        this._currentColumnCount(el),
        (value) => this._applyColumns(uid, value)
      )
    );
    // Same INLINE-only reasoning as the background-image hint above — a
    // container the page's own CSS already lays out as a grid (any shape,
    // not just N equal columns) would otherwise silently show "1" here with
    // no explanation for why the section clearly isn't stacked vertically.
    if (!/^repeat\(/.test(el.style.gridTemplateColumns || '') && getComputedStyle(el).display === 'grid') {
      const gridHint = document.createElement('p');
      gridHint.className = 'sprout-inspector__empty';
      gridHint.textContent = "This section's layout is already grid-based via the page's CSS — picking a column count above will override it.";
      this.container.appendChild(gridHint);
    }
  }

  _renderSpacingSection(uid, el) {
    this._sectionTitle('Spacing');

    this.container.appendChild(
      this._numberField('Padding', 'px', this._currentPx(el, 'paddingTop'), (value) => {
        this._applyStyle(uid, 'padding', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._numberField('Margin', 'px', this._currentPx(el, 'marginTop'), (value) => {
        this._applyStyle(uid, 'margin', value ? `${value}px` : '');
      })
    );
  }

  // ---------- Shared helpers ----------

  /**
   * Reports a style change intent — deliberately does NOT touch the DOM
   * itself. editor.js's handleStyleChange needs to read the element's
   * *pre-edit* inline style value first (to know what "before" was, for
   * undo/redo and for deciding whether anything actually changed) before
   * canvas.js applies the new value. Mutating el.style here, before that
   * read happens, would make every first edit to a style field look like a
   * no-op (before === after, since the DOM was already changed) — it would
   * still *look* right in the live canvas, but silently never get recorded
   * into state.edits, so it would never actually be saved. This bit Sprout
   * for real: the Alignment control appeared to work but the choice never
   * survived a save. See editor.js's getFieldBaseline() style branch.
   */
  _applyStyle(uid, prop, value) {
    this.onStyleChange(uid, prop, value);
  }

  /**
   * Button/link alignment, unlike text alignment, can't be a single
   * `text-align` property — `<a>`/`<button>` are inline(-block) elements,
   * so their *own* text-align has no effect on where THEY sit; only margin
   * (with a shrink-to-fit display) moves the element itself. That's three
   * real CSS properties that have to change together (display, margin-left,
   * margin-right) — reported as one call via onMultiStyleChange rather than
   * three separate onStyleChange calls specifically so a single undo
   * reverts the whole alignment change, not one property of it at a time.
   * Every state sets all three explicitly (not just the ones that "matter"
   * for that state) so switching straight from center to right, say,
   * doesn't leave a stale margin-right: auto behind from the prior state.
   */
  _applyAlignment(uid, value) {
    // display MUST be 'table', not 'inline-block' — per CSS2.1 §10.3.9, auto
    // margins on an inline-block box compute to 0, not to "fill the
    // available space." margin: auto only actually centers a BLOCK-level
    // box. 'table' is the standard shrink-to-fit-but-still-block-for-
    // margin-purposes trick (unlike plain 'block', which would stretch the
    // button to the full width of its container instead of hugging its
    // content). Shipped with 'inline-block' initially, which silently did
    // nothing at all — the display changed, but the margins always
    // resolved to 0 regardless of what value was set. Caught by a user
    // report, not caught by the earlier "does undo/redo replay the right
    // values" simulation, which only checked the STATE machine, never
    // asked whether the resulting CSS actually renders as centered.
    const styles =
      value === 'center'
        ? { display: 'table', 'margin-left': 'auto', 'margin-right': 'auto' }
        : value === 'right'
          ? { display: 'table', 'margin-left': 'auto', 'margin-right': '' }
          : { display: '', 'margin-left': '', 'margin-right': '' }; // 'left' — clear all overrides
    this.onMultiStyleChange(uid, styles);
  }

  /**
   * Container "Columns" (1–6). NOT just a style change — picking N doesn't
   * mean "lay out whatever's already in here into a grid," it means "give
   * me N actual column boxes I can add content into," each independently
   * addressable (each is its own empty container, so it gets the same
   * "+ Add element" placeholder any other empty container does — see
   * canvas.js _syncEmptyContainerPlaceholders). That's element creation,
   * which editor.js owns (state.insertions, undo/redo) — this only reports
   * the requested count.
   */
  _applyColumns(uid, count) {
    this.onColumnsChange(uid, count);
  }

  _sectionTitle(text) {
    const h = document.createElement('div');
    h.className = 'sprout-inspector-section-title';
    h.textContent = text;
    this.container.appendChild(h);
  }

  _field(labelText, inputEl) {
    const wrap = document.createElement('div');
    wrap.className = 'sprout-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  _textField(label, value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    return this._field(label, input);
  }

  _textareaField(label, value, onChange) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.addEventListener('change', () => onChange(textarea.value));
    return this._field(label, textarea);
  }

  _numberField(label, unit, value, onChange) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value ?? '';
    input.placeholder = unit;
    input.addEventListener('change', () => onChange(input.value));
    return this._field(`${label} (${unit})`, input);
  }

  _rangeField(label, unit, min, max, value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'sprout-field';
    const labelEl = document.createElement('label');
    labelEl.textContent = `${label} (${unit})`;
    const row = document.createElement('div');
    row.className = 'sprout-field-row';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = value ?? '0';
    const valueLabel = document.createElement('span');
    valueLabel.textContent = input.value;
    input.addEventListener('input', () => {
      valueLabel.textContent = input.value;
      onChange(input.value);
    });
    row.appendChild(input);
    row.appendChild(valueLabel);
    wrap.appendChild(labelEl);
    wrap.appendChild(row);
    return wrap;
  }

  _colorField(label, value, onChange) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return this._field(label, input);
  }

  _alignmentField(currentValue, onChange) {
    return this._buttonGroupField('Alignment', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], currentValue, onChange);
  }

  /** A row of equal-width single-select buttons — Alignment (3 options) and Container "Columns" (6) both use this. */
  _buttonGroupField(label, options, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'sprout-field';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    const group = document.createElement('div');
    group.className = 'sprout-button-group';

    options.forEach(([value, text]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = text;
      btn.classList.toggle('is-active', currentValue === value);
      btn.addEventListener('click', () => {
        [...group.children].forEach((c) => c.classList.remove('is-active'));
        btn.classList.add('is-active');
        onChange(value);
      });
      group.appendChild(btn);
    });

    wrap.appendChild(labelEl);
    wrap.appendChild(group);
    return wrap;
  }

  /** Reads an inline style value if set, else falls back to the computed value, as a bare number (px). */
  _currentPx(el, camelCaseProp) {
    const inline = el.style[camelCaseProp];
    const raw = inline || getComputedStyle(el)[camelCaseProp] || '0px';
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  /** Reads a color as a hex string suitable for <input type="color">. */
  _currentColor(el, camelCaseProp) {
    const inline = el.style[camelCaseProp];
    const raw = inline || getComputedStyle(el)[camelCaseProp] || '#000000';
    return rgbToHex(raw) || '#000000';
  }

  /**
   * INLINE-only (never computed — a browser resolves 'auto' to a real px
   * number in computed style, so it can't tell us it WAS auto) read of
   * which alignment state _applyAlignment last put this element in.
   */
  _currentButtonAlignment(el) {
    if (el.style.marginLeft === 'auto' && el.style.marginRight === 'auto') return 'center';
    if (el.style.marginLeft === 'auto') return 'right';
    return 'left';
  }

  /** INLINE-only read (same reasoning as _currentButtonAlignment) of the column count _applyColumns last set, or 1 if none. */
  _currentColumnCount(el) {
    const match = /^repeat\((\d+),/.exec(el.style.gridTemplateColumns || '');
    const n = match ? Number(match[1]) : 1;
    return n >= 1 && n <= 6 ? n : 1;
  }
}

/** Converts "rgb(r, g, b)" / "rgba(r,g,b,a)" / "#hex" to a "#rrggbb" hex string. */
function rgbToHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) {
    return color.length === 4
      ? `#${[...color.slice(1)].map((c) => c + c).join('')}`
      : color.slice(0, 7);
  }
  const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) return null;
  const [, r, g, b] = match;
  return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Pulls the URL out of a CSS `url("...")`/`url('...')`/`url(...)` value, or '' if there isn't one. */
function extractCssUrl(value) {
  if (!value) return '';
  const match = value.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i);
  return match ? match[1] : '';
}
