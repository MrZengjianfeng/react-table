/**
 * 表格单元格键盘导航。
 *
 * 目标：在 Form.List + Table 的可编辑单元格之间，用方向键 / Enter 移动焦点，
 * 体验接近 Excel（同一列上下跳、同一行左右跳；Enter 下一格，行末换行）。
 *
 * ---------------------------------------------------------------------------
 * DOM 约定（与 columns.tsx 配合）
 * ---------------------------------------------------------------------------
 * 1. 整张表外包一层带 `[data-table-keyboard-nav]` 的容器。
 *    查找下一格时只在这个根节点内 query，避免多张表互相抢焦点。
 * 2. 可导航单元格由 NavCell 渲染，带 `[data-nav-row]`、`[data-nav-col]`。
 *    row 用 Form.List 的 field.name（行索引），col 是列定义里手写的连续序号。
 *    只读列（如「电话」）不包 NavCell，方向键会直接跳过。
 * 3. 导航到达 Select / DatePicker 时，不能对内部 DOM 做程序化 click()
 *    （Ant Design 弹层时机不稳定）。改为向单元格派发 TABLE_NAV_OPEN_EVENT，
 *    由 NavSelect / NavDatePicker 自己 setOpen(true)。
 *
 * ---------------------------------------------------------------------------
 * 为什么用 onKeyDownCapture（捕获阶段）
 * ---------------------------------------------------------------------------
 * InputNumber 在冒泡阶段就会用 ↑↓ 改数字。必须在捕获阶段先拦截，
 * 否则数字已经被改掉，再跳格就晚了。
 *
 * ---------------------------------------------------------------------------
 * 主流程（useTableKeyboardNav 返回的回调）
 * ---------------------------------------------------------------------------
 * 过滤按键 → 找到当前格 → 弹层打开则放行 → 文本光标未到头则放行
 * → 算出下一格 → 不存在则拦住边界键 → 存在则 preventDefault 后微任务里 focus。
 */
import { useCallback, type KeyboardEvent } from "react";

/**
 * 自定义 DOM 事件名。
 * focusCell 在目标格上 dispatch 这个事件；NavSelect / NavDatePicker
 * 通过 useNavPopup 监听后把 open 设为 true，从而打开下拉或日期面板。
 */
export const TABLE_NAV_OPEN_EVENT = "table-nav-open";

/**
 * 会触发单元格跳转的按键。
 * Tab 故意不包含：保留浏览器默认的焦点顺序。
 * Shift / Ctrl / Alt / Meta 组合键在回调里会直接 return，这里只列裸键。
 */
const NAV_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
] as const;
type NavKey = (typeof NAV_KEYS)[number];

/**
 * 可导航单元格选择器。两个属性必须同时存在，避免误伤其它带 data-nav-* 的节点。
 */
const CELL_SELECTOR = "[data-nav-row][data-nav-col]";

/** 类型守卫：把 event.key 收窄成 NavKey，后续 switch 才能穷尽。 */
function isNavKey(key: string): key is NavKey {
  return (NAV_KEYS as readonly string[]).includes(key);
}

/**
 * 从键盘事件的 target 向上找当前所在的可导航单元格。
 * 真正聚焦的往往是格子内部的 input，所以要用 closest，不能直接拿 target。
 * target 不是 Element 时（例如注释节点）直接返回 null。
 */
function getNavCell(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(CELL_SELECTOR);
}

/**
 * 当前格的下拉 / 日期面板是否已经展开。
 * 展开时方向键要交给组件自己用（选选项、切月份），不能当成跳格。
 *
 * 判断分两路：
 * 1. `.ant-select-open` / `.ant-picker-open`：组件自己打的「已打开」标记，最可靠。
 * 2. DatePicker 有时面板已弹出，但单元格只有 `.ant-picker-focused`，
 *    没有 `-open`。这时再查页面上是否存在未 hidden 的 `.ant-picker-dropdown`。
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
 * 当前焦点是否在「需要自己处理左右键」的纯文本框上。
 *
 * 返回 true 的才走 shouldMoveFromTextControl（光标到头才跳格）。
 * 返回 false 的（Select 搜索框、checkbox 等）左右键一律跳格。
 *
 * 排除项：
 * - 不是 input / textarea：例如 div 上的焦点，直接当非文本。
 * - 落在 `.ant-select` 里：那是下拉的搜索 input，左右键应换列，不要改搜索光标。
 * - checkbox / radio / button / submit / file：没有「光标位置」概念。
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
 * 文本框里这次按键要不要跳出当前格。
 *
 * ↑↓ Enter：始终跳。表格单元格不做多行编辑，Enter 也不提交表单。
 * ←：只有光标在最左侧、且没有选区时才跳（否则先把光标往左移）。
 * →：只有光标在最右侧、且没有选区时才跳。
 *
 * start / end 同时判断是为了：有选区时先让浏览器取消选区或收缩选区，
 * 不要一按左右就整格跳走。
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
  // ArrowRight：光标和选区都在末尾才跳。
  return start === length && end === length;
}

/**
 * 文本是否处于全选。回车进格后会是这个状态。
 * 空内容不算：没有字符可走，左键应保持默认（或后续跳格判断）。
 */
function isAllSelected(el: HTMLInputElement | HTMLTextAreaElement) {
  const { length } = el.value;
  return (
    length > 0 && el.selectionStart === 0 && el.selectionEnd === length
  );
}

/**
 * 全选时按 ←：取消选区，光标落到最后一个字符前，再按 ← 继续往开头走。
 * 浏览器默认是收到起选区（跳到最前面），和「从后面往前挪」相反。
 */
function moveCaretFromEnd(el: HTMLInputElement | HTMLTextAreaElement) {
  const next = Math.max(0, el.value.length - 1);
  el.setSelectionRange(next, next);
}

/**
 * 根据当前格坐标和按键，算出「想去」的下一格行列。
 *
 * 只做算术，不查 DOM、不处理越界。
 * 下一格可能不存在（表头外、最后一行下面、只读列造成的空洞），
 * 由调用方再 query `[data-nav-row][data-nav-col]` 决定是否真的跳。
 *
 * - ↑：上一行同一列
 * - ↓：下一行同一列
 * - ← →：同一行左右一列
 * - Enter 不走这里，见 nextEnterPosition（下一格；行末换到下行第一格）
 */
function nextCellPosition(row: number, col: number, key: Exclude<NavKey, "Enter">) {
  switch (key) {
    case "ArrowUp":
      return { row: row - 1, col };
    case "ArrowDown":
      return { row: row + 1, col };
    case "ArrowLeft":
      return { row, col: col - 1 };
    case "ArrowRight":
      return { row, col: col + 1 };
  }
}

/**
 * 收集表体里真实存在的可导航格，按行优先、列次之排序。
 * 去掉测量行和重复坐标（横向滚动时 Ant Design 可能渲染两份单元格）。
 */
function listNavPositions(root: HTMLElement) {
  const seen = new Set<string>();
  const positions: { row: number; col: number }[] = [];
  root
    .querySelectorAll<HTMLElement>(
      `.ant-table-tbody tr:not(.ant-table-measure-row) ${CELL_SELECTOR}`,
    )
    .forEach((el) => {
      const nextRow = Number(el.dataset.navRow);
      const nextCol = Number(el.dataset.navCol);
      if (Number.isNaN(nextRow) || Number.isNaN(nextCol)) return;
      const key = `${nextRow}:${nextCol}`;
      if (seen.has(key)) return;
      seen.add(key);
      positions.push({ row: nextRow, col: nextCol });
    });
  positions.sort((a, b) => a.row - b.row || a.col - b.col);
  return positions;
}

/**
 * Enter 的下一格：同一行右边最近的可编辑格；行末折到下一行第一格。
 * 已经在最后一行最后一列时返回 null，停在当前格。
 */
function nextEnterPosition(root: HTMLElement, row: number, col: number) {
  const positions = listNavPositions(root);
  return (
    positions.find((p) => p.row > row || (p.row === row && p.col > col)) ??
    null
  );
}

/**
 * 在单元格里找出真正该 focus 的节点。
 *
 * 顺序有意义，必须按这个优先级：
 * 1. `.ant-select-selection-search-input`
 *    Select 肉眼看到的是 selector，真正能接收键盘的是内部搜索框。
 *    若先 focus selector，搜索框可能拿不到焦点，后续也无法输入过滤。
 * 2. `.ant-picker-input input`
 *    DatePicker 同理，可聚焦的是内部 input，不是外层 picker 容器。
 * 3. 普通 `input, textarea`
 *    工号、姓名、InputNumber 等都走这条。
 * 4. `.ant-select-selector`
 *    兜底：个别 Select 模式没有搜索 input 时，至少能把焦点放到选择器上。
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
 * 跳进文本格后，按「从哪边进来」放置光标 / 选区。
 *
 * - Enter / ↑ / ↓ 进来：全选。直接打字覆盖；← 从最后面向前移，
 *   → 有选区时不跳格，交给浏览器收起选区后再定位。
 * - → 进来：光标放到开头（接着往右读 / 在开头插入）。
 * - ← 进来：光标放到末尾（接着往左改或在末尾追加）。
 *
 * 只处理原生 input / textarea。
 * Select、DatePicker 内部也有 input，但改它们的 selection 会干扰搜索词或日期编辑，
 * 所以遇到 `.ant-select` / `.ant-picker` 直接跳过。
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
  if (key === "Enter" || key === "ArrowUp" || key === "ArrowDown") {
    el.setSelectionRange(0, length);
    return;
  }
  if (key === "ArrowRight") {
    el.setSelectionRange(0, 0);
    return;
  }
  el.setSelectionRange(length, length);
}

/**
 * 通知单元格内的 NavSelect / NavDatePicker 打开弹层。
 * 事件挂在单元格节点上（不是 document），避免一张表里多个弹层同时响应。
 */
function openCellPopup(cell: HTMLElement) {
  cell.dispatchEvent(new Event(TABLE_NAV_OPEN_EVENT));
}

/**
 * 把焦点移到指定行列的单元格，并按控件类型做收尾。
 *
 * 步骤：
 * 1. 在 root 内按 data-nav-row / data-nav-col 找到格子；找不到返回 false。
 * 2. 找出可聚焦节点；没有（空格子）返回 false。
 * 3. scrollIntoView(nearest)：横向滚动表格时把目标列滚进视口，但不猛跳整页。
 * 4. 原生 focus()：让上一格 blur、当前格 focus，Form 的校验和受控值能走完。
 *    不要用 preventScroll 以外的合成点击，Ant Design 内部状态对不上。
 * 5. 若格内是 Select / DatePicker：派发 TABLE_NAV_OPEN_EVENT 打开面板，结束。
 *    打开面板后不要再 applyCaret，以免改掉搜索框选区。
 * 6. 普通文本：立刻设一次光标，再在下一帧设一次。
 *    原因：部分控件（尤其 InputNumber）在 focus 回调里会自己重设 selection，
 *    同步写的选区会被覆盖；rAF 里再写一次才能保住。
 *    rAF 里仍检查 activeElement，防止用户在这一帧内又点了别处。
 *
 * @returns 是否成功聚焦。调用方目前未用返回值，失败即静默（目标格不存在）。
 */
function focusCell(root: HTMLElement, row: number, col: number, key: NavKey) {
  const cell = root.querySelector<HTMLElement>(
    `[data-nav-row="${row}"][data-nav-col="${col}"]`,
  );
  if (!cell) return false;

  const focusable = getFocusable(cell);
  if (!focusable) return false;

  cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  focusable.focus();

  if (cell.querySelector(".ant-select, .ant-picker")) {
    openCellPopup(cell);
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

/**
 * 表格键盘导航 Hook。
 *
 * 返回一个 keydown 回调，挂到表格外层：
 *   <div data-table-keyboard-nav onKeyDownCapture={onKeyDownCapture}>
 *
 * 必须用 Capture：赶在 InputNumber 冒泡阶段用 ↑↓ 改值之前。
 * useCallback 空依赖：逻辑不读 React state，避免表格重渲染时换掉监听引用。
 *
 * 回调决策顺序（任一条件不满足就 return，把按键留给浏览器 / 组件）：
 * 1. 不是 NAV_KEYS → 忽略。
 * 2. 带 Shift / Alt / Ctrl / Meta → 忽略（避免拦住系统快捷键、Shift+方向选文本）。
 * 3. 输入法拼写中（isComposing 或 keyCode 229）→ 忽略，否则选词时会跳格。
 * 4. 焦点不在可导航格内（点到操作列删除按钮等）→ 忽略。
 * 5. 下拉 / 日期面板已开 → 忽略，方向键给面板用。
 * 6. 纯文本全选且按 ← → 拦住默认「收到开头」，改为从最后面向前移一格。
 * 7. 纯文本框且光标未到头 → 忽略，左右键先移光标。
 * 8. 算下一格坐标；若 DOM 里没有这一格：
 *    - ↑↓ Enter：preventDefault + stopPropagation，防止 InputNumber 改数字
 *      或表单被提交，然后停在当前格（最后一行最后一列回车也走这里）。
 *    - ← →：不拦截，让浏览器继续处理（例如光标已在头仍按左，保持默认）。
 * 9. 下一格存在：拦住本次按键，queueMicrotask 后再 focusCell。
 *    不用同步 focus 的原因：当前 keydown 若已被 stopPropagation，
 *    同步触发的 Form onBlur / onFocus 会嵌在这个残缺事件栈里，
 *    校验、touched、受控值可能错乱。等 keydown 完全结束后再切焦点。
 */
export function useTableKeyboardNav() {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!isNavKey(event.key)) return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cell = getNavCell(event.target);
    if (!cell) return;
    if (isPopupOpen(cell)) return;

    if (
      event.key === "ArrowLeft" &&
      isTextControl(event.target) &&
      isAllSelected(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      moveCaretFromEnd(event.target);
      return;
    }

    if (
      isTextControl(event.target) &&
      !shouldMoveFromTextControl(event.target, event.key)
    ) {
      return;
    }

    const row = Number(cell.dataset.navRow);
    const col = Number(cell.dataset.navCol);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const root = cell.closest<HTMLElement>("[data-table-keyboard-nav]");
    if (!root) return;

    const next =
      event.key === "Enter"
        ? nextEnterPosition(root, row, col)
        : nextCellPosition(row, col, event.key);

    const hasNext = Boolean(
      next &&
        root.querySelector(
          `[data-nav-row="${next.row}"][data-nav-col="${next.col}"]`,
        ),
    );

    if (!next || !hasNext) {
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
    queueMicrotask(() => {
      focusCell(root, nextRow, nextCol, navKey);
    });
  }, []);
}
