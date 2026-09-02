import { useCallback, type KeyboardEvent } from "react";

const NAV_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"] as const;
type NavKey = (typeof NAV_KEYS)[number];

const CELL_SELECTOR = "[data-nav-row][data-nav-col]";

function isNavKey(key: string): key is NavKey {
  return (NAV_KEYS as readonly string[]).includes(key);
}

function getNavCell(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(CELL_SELECTOR);
}

function isPopupOpen(el: HTMLElement): boolean {
  if (el.closest(".ant-select-open, .ant-picker-open")) return true;
  return Boolean(
    el.closest(".ant-picker-focused") &&
      document.querySelector(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"),
  );
}

function isTextControl(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement)
  ) {
    return false;
  }
  if (el.closest(".ant-select")) return false;
  if (
    el instanceof HTMLInputElement &&
    ["checkbox", "radio", "button", "submit", "file"].includes(el.type)
  ) {
    return false;
  }
  return true;
}

function shouldMoveFromTextControl(el: HTMLInputElement | HTMLTextAreaElement, key: NavKey) {
  if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter") return true;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const { length } = el.value;

  if (key === "ArrowLeft") return start === 0 && end === 0;
  return start === length && end === length;
}

function nextCellPosition(row: number, col: number, key: NavKey) {
  switch (key) {
    case "ArrowUp":
      return { row: row - 1, col };
    case "ArrowDown":
    case "Enter":
      return { row: row + 1, col };
    case "ArrowLeft":
      return { row, col: col - 1 };
    case "ArrowRight":
      return { row, col: col + 1 };
  }
}

function getFocusable(cell: HTMLElement): HTMLElement | null {
  return (
    cell.querySelector<HTMLElement>(".ant-select-selection-search-input") ??
    cell.querySelector<HTMLElement>(".ant-picker-input input") ??
    cell.querySelector<HTMLElement>("input, textarea") ??
    cell.querySelector<HTMLElement>(".ant-select-selector")
  );
}

function applyCaret(el: HTMLElement, key: NavKey) {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return;
  }
  if (el.closest(".ant-select") || el.closest(".ant-picker")) return;

  const { length } = el.value;
  if (key === "ArrowRight") {
    el.setSelectionRange(0, 0);
    return;
  }
  el.setSelectionRange(length, length);
}

function focusCell(root: HTMLElement, row: number, col: number, key: NavKey) {
  const cell = root.querySelector<HTMLElement>(
    `[data-nav-row="${row}"][data-nav-col="${col}"]`,
  );
  if (!cell) return false;

  const focusable = getFocusable(cell);
  if (!focusable) return false;

  cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  const shouldOpenPopup = Boolean(cell.querySelector(".ant-select, .ant-picker"));
  if (shouldOpenPopup) {
    cell.setAttribute("data-nav-open-popup", "");
  }

  focusable.focus();

  if (shouldOpenPopup) {
    requestAnimationFrame(() => {
      cell.removeAttribute("data-nav-open-popup");
    });
    return true;
  }

  applyCaret(focusable, key);
  requestAnimationFrame(() => {
    if (document.activeElement === focusable) {
      applyCaret(focusable, key);
    }
  });
  return true;
}

export function useTableKeyboardNav() {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!isNavKey(event.key)) return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cell = getNavCell(event.target);
    if (!cell) return;
    if (isPopupOpen(cell)) return;

    if (isTextControl(event.target) && !shouldMoveFromTextControl(event.target, event.key)) {
      return;
    }

    const row = Number(cell.dataset.navRow);
    const col = Number(cell.dataset.navCol);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const next = nextCellPosition(row, col, event.key);
    const root = cell.closest<HTMLElement>("[data-table-keyboard-nav]");
    if (!root) return;

    const hasNext = Boolean(
      root.querySelector(`[data-nav-row="${next.row}"][data-nav-col="${next.col}"]`),
    );
    // Boundary: do nothing, but still block InputNumber from changing the value.
    if (!hasNext) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusCell(root, next.row, next.col, event.key);
  }, []);
}
