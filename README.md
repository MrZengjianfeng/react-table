# React Table

基于 Vite + React + TypeScript + Ant Design 的可编辑表格示例。

核心页面是 **成员管理**：`Form.List` 管数据，`Table` 做展示，单元格支持方向键 / Enter 导航，接近 Excel。

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（默认 `http://localhost:5173`）。根路径会跳到 `/members`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | oxlint 检查 |

## 目录

```
src/
  main.tsx                 入口、路由、antd 中文
  App.tsx                  侧栏 + 顶栏布局
  pages/
    members/               成员管理（主功能）
      index.tsx            Form.List + Table
      columns.tsx          列、NavCell、Select/日期弹层
      useTableKeyboardNav.ts  键盘导航
      data.ts              初始数据和空行模板
      type/member.ts       Member 类型
    dashboard/             工作台占位
    settings/              设置占位
```

## 成员表怎么工作

1. `Form` 的值是 `{ members: Member[] }`。
2. `Form.List` 把每一项变成 `fields`，同时作为 Table 的 `dataSource`。
3. 单元格 `Form.Item` 的 `name` 是 `[行索引, 字段名]`，编辑直接写回表单。
4. 「新增 / 删除」走 List 的 `add` / `remove`，不要自己改 Table 数据。

入职日期在表单里是 `YYYY-MM-DD` 字符串，列定义里用 `getValueProps` / `normalize` 和 DatePicker 的 dayjs 互转。

## 键盘导航

挂在表格外层：`data-table-keyboard-nav` + `onKeyDownCapture`（捕获阶段，先于 InputNumber 处理上下键）。

可跳的格子要包 `NavCell`，带 `data-nav-row` / `data-nav-col`。只读列（电话）不要包，方向键会跳过。

| 按键 | 行为 |
| --- | --- |
| ↑ ↓ Enter | 同一列换行 |
| ← → | 换列；文本框里光标不在两端时先移光标 |
| 输入法拼写中 | 不跳格 |

到达 Select / DatePicker 时，导航派发 `table-nav-open`，由 `NavSelect` / `NavDatePicker` 自己打开面板。不要对 Ant Design 弹层做程序化 `click()`，不可靠。

边界格：不跳走，但仍 `preventDefault` 上下键，避免 InputNumber 改数字。切焦点放在 `queueMicrotask` 里，避免 Form 的 blur/focus 嵌套在被拦住的 keydown 中。
