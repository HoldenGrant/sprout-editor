// editor/code-highlight.js
//
// A small, dependency-free HTML syntax highlighter for the Code View modal.
// No bundled library — matches the rest of this project's "no external
// dependencies" approach (hand-authored SVG icons, etc.). Returns HTML
// (safe to set as innerHTML) with tags/attributes/values/comments wrapped
// in <span class="cv-*"> for editor.css to color. Read-only display only —
// this never feeds back into the edit model.

/** Escapes text for safe insertion as HTML content. */
function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Walks the raw HTML string char-by-char (not a real parser — just enough
 * structure to tell "this is a tag" from "this is text/a comment" without
 * getting confused by '<'/'>' inside quoted attribute values) and returns
 * highlighted HTML.
 */
export function highlightHtml(rawHtml) {
  let out = '';
  let i = 0;
  const len = rawHtml.length;

  while (i < len) {
    if (rawHtml.startsWith('<!--', i)) {
      const close = rawHtml.indexOf('-->', i);
      const stop = close === -1 ? len : close + 3;
      out += `<span class="cv-comment">${esc(rawHtml.slice(i, stop))}</span>`;
      i = stop;
    } else if (rawHtml[i] === '<') {
      let j = i + 1;
      let inQuote = null;
      while (j < len) {
        const c = rawHtml[j];
        if (inQuote) {
          if (c === inQuote) inQuote = null;
        } else if (c === '"' || c === "'") {
          inQuote = c;
        } else if (c === '>') {
          break;
        }
        j++;
      }
      const stop = Math.min(j + 1, len);
      out += highlightTag(rawHtml.slice(i, stop));
      i = stop;
    } else {
      let j = rawHtml.indexOf('<', i);
      if (j === -1) j = len;
      out += esc(rawHtml.slice(i, j));
      i = j;
    }
  }

  return out;
}

/** Highlights one complete tag, e.g. `<div class="foo" id='bar'>`, `</div>`, `<img src="x"/>`. */
function highlightTag(tagText) {
  const open = /^<(\/?)([a-zA-Z][\w:-]*)/.exec(tagText);
  if (!open) return esc(tagText); // malformed/unexpected — just escape it plainly rather than throw

  const [wholeOpen, closingSlash, tagName] = open;
  let rest = tagText.slice(wholeOpen.length);

  let closer = '';
  if (rest.endsWith('/>')) {
    closer = '/>';
    rest = rest.slice(0, -2);
  } else if (rest.endsWith('>')) {
    closer = '>';
    rest = rest.slice(0, -1);
  }

  let attrsHtml = '';
  let lastIndex = 0;
  const attrPattern = /([a-zA-Z_:][\w:.-]*)(\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  let match;
  while ((match = attrPattern.exec(rest))) {
    attrsHtml += esc(rest.slice(lastIndex, match.index)); // whitespace between attributes
    const [whole, name, , value] = match;
    attrsHtml += `<span class="cv-attr">${esc(name)}</span>`;
    if (value !== undefined) {
      // Everything between the attr name and the value is "= " plus optional spacing/quote — pass it through escaped as-is.
      const between = whole.slice(name.length, whole.length - value.length);
      attrsHtml += esc(between);
      attrsHtml += `<span class="cv-value">${esc(value)}</span>`;
    }
    lastIndex = match.index + whole.length;
  }
  attrsHtml += esc(rest.slice(lastIndex));

  return (
    `<span class="cv-punct">&lt;${closingSlash}</span>` +
    `<span class="cv-tag">${esc(tagName)}</span>` +
    attrsHtml +
    `<span class="cv-punct">${esc(closer)}</span>`
  );
}
