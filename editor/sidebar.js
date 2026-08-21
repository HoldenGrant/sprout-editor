// editor/sidebar.js
//
// The left "Elements" sidebar. v1 keeps this simple per the spec: a static
// list of categories that, when clicked, jump the canvas to (and select) the
// first matching element. All the real lookup logic lives in canvas.js
// (scrollToCategory) — this module just wires up the click handlers.

export function initSidebar(listEl, { onCategoryClick }) {
  listEl.querySelectorAll('[data-category]').forEach((item) => {
    item.addEventListener('click', () => onCategoryClick(item.dataset.category));
  });
}
