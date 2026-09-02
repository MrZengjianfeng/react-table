/**
 * 成员表列定义。
 *
 * 数据源不是 Member[]，而是 Form.List 产出的 FormListFieldData[]。
 * 每个单元格用 Form.Item name={[field.name, '字段名']} 绑到对应成员字段。
 *
 * 键盘导航相关：
 * - 可编辑格包一层 NavCell，写入 data-nav-row / data-nav-col。
 * - col 必须连续且与视觉列一致，导航按这个坐标跳。
 * - 「电话」是只读展示，没有 NavCell，方向键会跳过它。
 * - Select / DatePicker 用 NavSelect、NavDatePicker：收到 TABLE_NAV_OPEN_EVENT 后打开面板。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
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

function NavSelect(props: SelectProps) {
  const { wrapRef, open, setOpen } = useNavPopup();
  return (
    <span ref={wrapRef} style={{ display: "block" }}>
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

function NavDatePicker(props: DatePickerProps) {
  const { wrapRef, open, setOpen } = useNavPopup();
  return (
    <span ref={wrapRef} style={{ display: "block" }}>
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

/** 只读电话。Form.Item 仍要挂 name，保存时才能带上 telephone。 */
function TelephoneText({ value }: { value?: string }) {
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
          <TelephoneText />
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
