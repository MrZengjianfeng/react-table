/**
 * 成员表列定义。
 *
 * 数据源不是 Member[]，而是 Form.List 产出的 FormListFieldData[]。
 * 每个单元格用 Form.Item name={[field.name, '字段名']} 绑到对应成员字段。
 *
 * 键盘导航相关：
 * - 可编辑格包一层 NavCell，写入 data-nav-row / data-nav-col。
 * - col 必须连续且与视觉列一致，导航按这个坐标跳。
 * - 「电话」「紧急联系人」「紧急联系人电话」只读，没有 NavCell，方向键会跳过。
 * - Select / DatePicker 用 NavSelect、NavDatePicker：收到 TABLE_NAV_OPEN_EVENT 后打开面板。
 * - Select 聚焦时 Ctrl+↑ / Ctrl+↓ 切换上一个 / 下一个选项，到头不再循环。
 * - DatePicker 聚焦时 Ctrl+↑↓ 加减 7 天，Ctrl+←→ 加减 1 天。
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from "antd";
import type {
  DatePickerProps,
  FormListFieldData,
  SelectProps,
  TableProps,
} from "antd";
import dayjs from "dayjs";
import { TABLE_NAV_OPEN_EVENT } from "./useTableKeyboardNav";

/** 单元格里的 Form.Item 去掉默认下边距，避免撑高行。 */
const cellFormItem = { marginBottom: 0 };

/**
 * 把 Select / DatePicker 的 open 交给键盘导航控制。
 * wrapRef 用来找到外层 NavCell，监听 TABLE_NAV_OPEN_EVENT。
 */
function useNavPopup() {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const cell = wrapRef.current?.closest("[data-nav-row][data-nav-col]");
    if (!cell) return;
    const onOpen = () => setOpen(true);
    cell.addEventListener(TABLE_NAV_OPEN_EVENT, onOpen);
    return () => cell.removeEventListener(TABLE_NAV_OPEN_EVENT, onOpen);
  }, []);

  return { wrapRef, open, setOpen };
}

/**
 * 可切换的选项：去掉禁用项，并摊平 group。
 * Ctrl+↑↓ 只在这些项之间走，避免选到不能选的值。
 */
function getSelectableOptions(options: SelectProps["options"]) {
  const flattened = (options ?? []).flatMap((opt) => {
    if (opt && typeof opt === "object" && Array.isArray(opt.options)) {
      return opt.options;
    }
    return [opt];
  });
  return flattened.filter(
    (opt): opt is NonNullable<typeof opt> =>
      Boolean(opt) &&
      typeof opt === "object" &&
      !opt.disabled &&
      opt.value !== undefined,
  );
}

/**
 * 算出 Ctrl+↑ / Ctrl+↓ 的下一项。
 * 已经在第一项再向上、最后一项再向下：返回 undefined，调用方不改值。
 * 当前没有值时：只允许向下落到第一项。
 */
function nextSelectOption(
  options: SelectProps["options"],
  current: SelectProps["value"],
  direction: -1 | 1,
) {
  const items = getSelectableOptions(options);
  if (items.length === 0) return undefined;

  const index = items.findIndex((opt) => opt.value === current);
  if (index === -1) {
    return direction === 1 ? items[0] : undefined;
  }

  const next = index + direction;
  if (next < 0 || next >= items.length) return undefined;
  return items[next];
}

function NavSelect(props: SelectProps) {
  const { wrapRef, open, setOpen } = useNavPopup();

  const onCtrlArrow = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    event.stopPropagation();

    const nextOption = nextSelectOption(
      props.options,
      props.value,
      event.key === "ArrowUp" ? -1 : 1,
    );
    if (!nextOption) return;
    props.onChange?.(nextOption.value, nextOption);
  };

  return (
    <span
      ref={wrapRef}
      style={{ display: "block" }}
      onKeyDownCapture={onCtrlArrow}
    >
      <Select
        {...props}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          props.onOpenChange?.(next);
        }}
      />
    </span>
  );
}

/** DatePicker 聚焦时 Ctrl+方向键的天数偏移。 */
const DATE_CTRL_OFFSET = {
  ArrowUp: -7,
  ArrowDown: 7,
  ArrowLeft: -1,
  ArrowRight: 1,
} as const;

/**
 * 以当前日期为基准加减天数。
 * 没有有效值时从今天起算，避免空格上 Ctrl+方向键没反应。
 */
function shiftPickerDate(current: DatePickerProps["value"], days: number) {
  const base = dayjs.isDayjs(current) && current.isValid() ? current : dayjs();
  return base.add(days, "day");
}

function NavDatePicker(props: DatePickerProps) {
  const { wrapRef, open, setOpen } = useNavPopup();

  const onCtrlArrow = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      return;
    }
    const days =
      DATE_CTRL_OFFSET[event.key as keyof typeof DATE_CTRL_OFFSET];
    if (days === undefined) return;

    event.preventDefault();
    event.stopPropagation();

    const next = shiftPickerDate(props.value, days);
    if (props.disabledDate?.(next, { type: "date" })) return;
    props.onChange?.(next, next.format("YYYY-MM-DD"));
  };

  return (
    <span
      ref={wrapRef}
      style={{ display: "block" }}
      onKeyDownCapture={onCtrlArrow}
    >
      <DatePicker
        {...props}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          props.onOpenChange?.(next);
        }}
      />
    </span>
  );
}

/** 只读文本。Form.Item 仍要挂 name，保存时才能带上字段值。 */
function ReadonlyText({ value }: { value?: string }) {
  return <span>{value || "-"}</span>;
}

function NavCell({
  row,
  col,
  children,
}: {
  row: number;
  col: number;
  children: ReactNode;
}) {
  return (
    <div data-nav-row={row} data-nav-col={col}>
      {children}
    </div>
  );
}

export function getColumns(
  remove: (index: number) => void,
): TableProps<FormListFieldData>["columns"] {
  return [
    {
      title: "工号",
      width: 130,
      render: (_, field) => (
        <NavCell row={field.name} col={0}>
          <Form.Item
            name={[field.name, "employeeId"]}
            style={cellFormItem}
            rules={[{ required: true, message: "请输入工号" }]}
          >
            <Input placeholder="工号" />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "姓名",
      width: 110,
      render: (_, field) => (
        <NavCell row={field.name} col={1}>
          <Form.Item
            name={[field.name, "name"]}
            style={cellFormItem}
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input placeholder="姓名" />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "性别",
      width: 90,
      render: (_, field) => (
        <NavCell row={field.name} col={2}>
          <Form.Item name={[field.name, "gender"]} style={cellFormItem}>
            <NavSelect
              options={[
                { value: "男", label: "男" },
                { value: "女", label: "女" },
              ]}
            />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "年龄",
      width: 100,
      render: (_, field) => (
        <NavCell row={field.name} col={3}>
          <Form.Item name={[field.name, "age"]} style={cellFormItem}>
            {/* keyboard={false}：交给表格导航处理上下键，避免改数字 */}
            <InputNumber
              min={18}
              max={70}
              controls={false}
              keyboard={false}
              style={{ width: "100%" }}
              onFocus={() => {
                console.log(`${field.name}年龄focus`);
              }}
              onBlur={() => {
                console.log(`${field.name}年龄blur`);
              }}
            />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "手机号",
      width: 150,
      render: (_, field) => (
        <NavCell row={field.name} col={4}>
          <Form.Item name={[field.name, "phone"]} style={cellFormItem}>
            <Input placeholder="手机号" />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "电话",
      width: 150,
      render: (_, field) => (
        <Form.Item name={[field.name, "telephone"]} style={cellFormItem}>
          <ReadonlyText />
        </Form.Item>
      ),
    },
    {
      title: "邮箱",
      width: 210,
      render: (_, field) => (
        <NavCell row={field.name} col={5}>
          <Form.Item
            name={[field.name, "email"]}
            style={cellFormItem}
            rules={[{ type: "email", message: "邮箱格式不正确" }]}
          >
            <Input
              placeholder="邮箱"
              onFocus={() => {
                console.log(`${field.name}邮箱focus`);
              }}
              onBlur={() => {
                console.log(`${field.name}邮箱blur`);
              }}
            />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "部门",
      width: 110,
      render: (_, field) => (
        <NavCell row={field.name} col={6}>
          <Form.Item name={[field.name, "department"]} style={cellFormItem}>
            <NavSelect
              options={["研发", "产品", "设计", "运营"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "职位",
      width: 140,
      render: (_, field) => (
        <NavCell row={field.name} col={7}>
          <Form.Item name={[field.name, "position"]} style={cellFormItem}>
            <Input placeholder="职位" />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "所在城市",
      width: 120,
      render: (_, field) => (
        <NavCell row={field.name} col={8}>
          <Form.Item name={[field.name, "city"]} style={cellFormItem}>
            <Input placeholder="城市" />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "紧急联系人",
      width: 120,
      render: (_, field) => (
        <Form.Item
          name={[field.name, "emergencyContact"]}
          style={cellFormItem}
        >
          <ReadonlyText />
        </Form.Item>
      ),
    },
    {
      title: "紧急联系人电话",
      width: 150,
      render: (_, field) => (
        <Form.Item name={[field.name, "emergencyPhone"]} style={cellFormItem}>
          <ReadonlyText />
        </Form.Item>
      ),
    },
    {
      title: "入职日期",
      width: 150,
      render: (_, field) => (
        <NavCell row={field.name} col={9}>
          {/*
            DatePicker 要 dayjs，表单里存 YYYY-MM-DD 字符串。
            getValueProps：读表单值时转 dayjs；normalize：写回时再格式化成字符串。
          */}
          <Form.Item
            name={[field.name, "joinDate"]}
            style={cellFormItem}
            getValueProps={(value: string) => ({
              value: value ? dayjs(value) : undefined,
            })}
            normalize={(value) =>
              value ? dayjs(value).format("YYYY-MM-DD") : ""
            }
          >
            <NavDatePicker style={{ width: "100%" }} />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "状态",
      width: 110,
      render: (_, field) => (
        <NavCell row={field.name} col={10}>
          <Form.Item name={[field.name, "status"]} style={cellFormItem}>
            <NavSelect
              options={[
                { value: "在职", label: "在职" },
                { value: "请假", label: "请假" },
              ]}
            />
          </Form.Item>
        </NavCell>
      ),
    },
    {
      title: "操作",
      width: 80,
      fixed: "right",
      render: (_, field) => (
        <Space>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => remove(field.name)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];
}
