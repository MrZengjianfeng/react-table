/**
 * 表格单元格键盘导航。
 *
 * 目标：在 Form.List + Table 的可编辑单元格之间，用方向键 / Enter 移动焦点，
 * 体验接近 Excel。
 *
 * 约定：
 * - 整张表外包一层 `[data-table-keyboard-nav]`，作为查找下一格的根节点。
 * - 可导航单元格用 `[data-nav-row][data-nav-col]` 标记行列（见 columns.tsx 的 NavCell）。
 * - Select / DatePicker 不能可靠地被程序 `click()` 打开，因此导航到达时派发
 *   TABLE_NAV_OPEN_EVENT，由单元格内的受控组件自己 `setOpen(true)`。
 *
 * 捕获阶段监听：必须赶在 InputNumber 等控件自己处理上下键改值之前拦截。
 */
import { useCallback, type KeyboardEvent } from "react";

/** 导航到达 Select / DatePicker 时派发给单元格，通知内部组件打开弹层。 */
export const TABLE_NAV_OPEN_EVENT = "table-nav-open";

const NAV_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
] as const;
type NavKey = (typeof NAV_KEYS)[number];

const CELL_SELECTOR = "[data-nav-row][data-nav-col]";

function isNavKey(key: string): key is NavKey {
  return (NAV_KEYS as readonly string[]).includes(key);
}

/** 从事件目标向上找到最近的可导航单元格。 */
function getNavCell(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(CELL_SELECTOR);
}

/**
 * 下拉 / 日期面板已展开时，方向键应交还给组件（选选项、切月份），
 * 不要当成单元格导航。
 */
function isPopupOpen(el: HTMLElement): boolean {
  if (el.closest(".ant-select-open, .ant-picker-open")) return true;
  return Boolean(
    el.closest(".ant-picker-focused") &&
    document.querySelector(
      ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)",
    ),
  );
}

/**
 * 真正需要左右键移动光标的文本框。
 * Select 内部也有 input，但那是搜索框，左右键应导航单元格而不是改光标。
 */
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

/**
 * 文本框里左右键：光标不在两端时先移动光标，到头了再跳单元格。
 * 上下键和 Enter 始终跳单元格（不做行内换行）。
 */
function shouldMoveFromTextControl(
  el: HTMLInputElement | HTMLTextAreaElement,
  key: NavKey,
) {
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

/**
 * 优先聚焦 Select 搜索框、DatePicker 输入框，否则普通 input。
 * 顺序很重要：Select 可见的是 selector，真正可聚焦的是内部 search input。
 */
function getFocusable(cell: HTMLElement): HTMLElement | null {
  return (
    cell.querySelector<HTMLElement>(".ant-select-selection-search-input") ??
    cell.querySelector<HTMLElement>(".ant-picker-input input") ??
    cell.querySelector<HTMLElement>("input, textarea") ??
    cell.querySelector<HTMLElement>(".ant-select-selector")
  );
}

/**
 * 从左侧进来时光标放到开头，从右侧 / 上下进来放到末尾，方便继续输入。
 * Select / DatePicker 内部 input 不要改选区，以免干扰搜索或日期输入。
 */
function applyCaret(el: HTMLElement, key: NavKey) {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement)
  ) {
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

function openCellPopup(cell: HTMLElement) {
  cell.dispatchEvent(new Event(TABLE_NAV_OPEN_EVENT));
}

function focusCell(root: HTMLElement, row: number, col: number, key: NavKey) {
  const cell = root.querySelector<HTMLElement>(
    `[data-nav-row="${row}"][data-nav-col="${col}"]`,
  );
  if (!cell) return false;

  const focusable = getFocusable(cell);
  if (!focusable) return false;

  cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  // 原生 focus：上一格会 blur，当前格会 focus，Form 校验 / 受控值能正常走完。
  focusable.focus();

  if (cell.querySelector(".ant-select, .ant-picker")) {
    openCellPopup(cell);
    return true;
  }

  applyCaret(focusable, key);
  // 部分控件 focus 后会自己重设选区，下一帧再写一次保证光标位置生效。
  requestAnimationFrame(() => {
    if (document.activeElement === focusable) {
      applyCaret(focusable, key);
    }
  });
  return true;
}

/**
 * 挂在表格外层容器的 onKeyDownCapture 上。
 * 使用捕获是为了先于 InputNumber 的上下键改值逻辑。
 */
export function useTableKeyboardNav() {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!isNavKey(event.key)) return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      return;
    // 中文输入法拼写过程中 keyCode 229，此时方向键不应跳格。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cell = getNavCell(event.target);
    if (!cell) return;
    if (isPopupOpen(cell)) return;

    if (
      isTextControl(event.target) &&
      !shouldMoveFromTextControl(event.target, event.key)
    ) {
      return;
    }

    const row = Number(cell.dataset.navRow);
    const col = Number(cell.dataset.navCol);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const next = nextCellPosition(row, col, event.key);
    const root = cell.closest<HTMLElement>("[data-table-keyboard-nav]");
    if (!root) return;

    const hasNext = Boolean(
      root.querySelector(
        `[data-nav-row="${next.row}"][data-nav-col="${next.col}"]`,
      ),
    );
    // 边界格：不跳走，但仍要拦住 InputNumber 用上下键改数字。
    if (!hasNext) {
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const navKey = event.key;
    const { row: nextRow, col: nextCol } = next;
    // 等当前 keydown 结束再切焦点，避免 Form 的 onBlur/onFocus 嵌套在
    // 已被 stopPropagation 的键盘事件里，导致校验或受控状态错乱。
    queueMicrotask(() => {
      focusCell(root, nextRow, nextCol, navKey);
    });
  }, []);
}
