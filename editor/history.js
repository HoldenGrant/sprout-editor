// editor/history.js
//
// Generic undo/redo command stack. Deliberately DOM-agnostic — it doesn't
// know what a "command" contains, it just stores {before, after} pairs and
// calls back into editor.js to actually apply them to EditorState + the live
// preview. This keeps history bookkeeping separate from DOM manipulation
// (per the project's modularity requirements).

export class HistoryStack {
  /** @param {{ onApply: (command: object, direction: 'undo'|'redo') => void }} options */
  constructor({ onApply }) {
    this.undoStack = [];
    this.redoStack = [];
    this.onApply = onApply;
  }

  /** Record a new command. Any pending redo history is discarded, matching standard editor UX. */
  push(command) {
    this.undoStack.push(command);
    this.redoStack = [];
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    this.onApply(command, 'undo');
    this.redoStack.push(command);
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    this.onApply(command, 'redo');
    this.undoStack.push(command);
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/** Wires Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl+Y (redo) to a HistoryStack. */
export function attachHistoryKeyboardShortcuts(historyStack, onChange) {
  document.addEventListener('keydown', (event) => {
    const modifierPressed = event.metaKey || event.ctrlKey;
    if (!modifierPressed) return;

    const key = event.key.toLowerCase();
    const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
    const isUndo = key === 'z' && !event.shiftKey;

    if (isUndo) {
      event.preventDefault();
      if (historyStack.undo()) onChange?.();
    } else if (isRedo) {
      event.preventDefault();
      if (historyStack.redo()) onChange?.();
    }
  });
}
