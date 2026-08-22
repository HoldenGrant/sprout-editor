// editor/sidebar.js
//
// The left "Elements" sidebar. v1 keeps this simple per the spec: a static
// list of categories that, when clicked, jump the canvas to (and select) the
// first matching element. All the real lookup logic lives in canvas.js
// (scrollToCategory) — this module just wires up the click/keyboard handlers.

export function initSidebar(listEl, { onCategoryClick }) {
  listEl.querySelectorAll('[data-category]').forEach((item) => {
    item.addEventListener('click', () => onCategoryClick(item.dataset.category));
    // The list items are marked role="button" tabindex="0" in editor.html so
    // they're keyboard-reachable — Enter/Space needs to trigger the same
    // action a native <button> would give you for free.
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onCategoryClick(item.dataset.category);
      }
    });
  });
}
