// editor/insert-menu.js
//
// The small floating "what do you want to add?" menu shown when a "+"
// affordance is clicked — shared between canvas.js's hover buttons and
// layers.js's per-row + button, so both trigger points offer the exact same
// choices (see INSERT_PALETTE in shared/constants.js). Lives entirely in the
// parent document (editor.html), never inside the sandboxed iframe — even
// for a canvas-triggered click, the caller converts the click position into
// parent-viewport coordinates first (see canvas.js's onInsertRequest).

import { INSERT_PALETTE } from '../shared/constants.js';

let activeMenu = null;

/**
 * @param {{ x: number, y: number, onPick: (item: object) => void }} options
 *   x/y are parent-document viewport coordinates to anchor the menu near.
 */
export function openInsertMenu({ x, y, onPick }) {
  closeInsertMenu();

  const menu = document.createElement('div');
  menu.className = 'sprout-insert-menu';
  menu.setAttribute('role', 'menu');

  INSERT_PALETTE.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sprout-insert-menu__item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      closeInsertMenu();
      onPick(item);
    });
    menu.appendChild(btn);
  });

  // Positioned off-screen first so getBoundingClientRect() below reflects
  // its real rendered size before it's ever visible at the wrong spot.
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';
  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - menuRect.width - 8);
  const top = Math.min(y, window.innerHeight - menuRect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  activeMenu = menu;
  menu.querySelector('.sprout-insert-menu__item')?.focus();

  // Deferred one tick so the same click that opened the menu (which just
  // bubbled up to document) doesn't also immediately close it right here.
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeydown);
  }, 0);
}

export function closeInsertMenu() {
  if (!activeMenu) return;
  activeMenu.remove();
  activeMenu = null;
  document.removeEventListener('click', handleOutsideClick);
  document.removeEventListener('keydown', handleKeydown);
}

function handleOutsideClick(event) {
  if (activeMenu && !activeMenu.contains(event.target)) closeInsertMenu();
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeInsertMenu();
}
