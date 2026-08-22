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
   * }} handlers
   */
  constructor(container, { onTextChange, onAttrChange, onStyleChange }) {
    this.container = container;
    this.onTextChange = onTextChange;
    this.onAttrChange = onAttrChange;
    this.onStyleChange = onStyleChange;
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
        this._applyStyle(uid, el, 'font-size', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._colorField('Text color', this._currentColor(el, 'color'), (value) => {
        this._applyStyle(uid, el, 'color', value);
      })
    );

    this.container.appendChild(
      this._alignmentField(getComputedStyle(el).textAlign, (value) => {
        this._applyStyle(uid, el, 'text-align', value);
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
        this._applyStyle(uid, el, 'background-color', value);
      })
    );

    this.container.appendChild(
      this._colorField('Text color', this._currentColor(el, 'color'), (value) => {
        this._applyStyle(uid, el, 'color', value);
      })
    );

    this.container.appendChild(
      this._rangeField('Border radius', 'px', 0, 48, this._currentPx(el, 'borderRadius'), (value) => {
        this._applyStyle(uid, el, 'border-radius', `${value}px`);
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
        this._applyStyle(uid, el, 'width', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._numberField('Border radius', 'px', this._currentPx(el, 'borderRadius'), (value) => {
        this._applyStyle(uid, el, 'border-radius', value ? `${value}px` : '');
      })
    );
  }

  _renderContainerPanel(uid, el) {
    this._sectionTitle('Section / Container');

    const firstClass = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
    const hint = document.createElement('p');
    hint.className = 'sprout-inspector__empty';
    hint.textContent = `<${el.tagName.toLowerCase()}${firstClass ? ` class="${firstClass}"` : ''}> — reached via the Layers panel. Edit the text/images inside it directly, or set a background below.`;
    this.container.appendChild(hint);

    this.container.appendChild(
      this._colorField('Background color', this._currentColor(el, 'backgroundColor'), (value) => {
        this._applyStyle(uid, el, 'background-color', value);
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
        this._applyStyle(uid, el, 'background-image', value ? `url("${value}")` : '');
      })
    );
    if (hasComputedBgImage) {
      const cssHint = document.createElement('p');
      cssHint.className = 'sprout-inspector__empty';
      cssHint.textContent = 'This section already has a background image set by the page\'s CSS — type a URL above to override it.';
      this.container.appendChild(cssHint);
    }
  }

  _renderSpacingSection(uid, el) {
    this._sectionTitle('Spacing');

    this.container.appendChild(
      this._numberField('Padding', 'px', this._currentPx(el, 'paddingTop'), (value) => {
        this._applyStyle(uid, el, 'padding', value ? `${value}px` : '');
      })
    );

    this.container.appendChild(
      this._numberField('Margin', 'px', this._currentPx(el, 'marginTop'), (value) => {
        this._applyStyle(uid, el, 'margin', value ? `${value}px` : '');
      })
    );
  }

  // ---------- Shared helpers ----------

  _applyStyle(uid, el, prop, value) {
    if (value) el.style.setProperty(prop, value);
    else el.style.removeProperty(prop);
    this.onStyleChange(uid, prop, value);
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
    const wrap = document.createElement('div');
    wrap.className = 'sprout-field';
    const label = document.createElement('label');
    label.textContent = 'Alignment';
    const group = document.createElement('div');
    group.className = 'sprout-align-group';

    [['left', 'Left'], ['center', 'Center'], ['right', 'Right']].forEach(([value, text]) => {
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

    wrap.appendChild(label);
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
