import { useState, type ReactNode } from "react";
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

const cellFormItem = { marginBottom: 0 };

function shouldOpenFromNav(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-nav-open-popup]"))
  );
}

function NavSelect(props: SelectProps) {
  const [open, setOpen] = useState(false);
  return (
    <Select
      {...props}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        props.onOpenChange?.(next);
      }}
      onFocus={(event) => {
        if (shouldOpenFromNav(event.target)) setOpen(true);
        props.onFocus?.(event);
      }}
    />
  );
}

function NavDatePicker(props: DatePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <DatePicker
      {...props}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        props.onOpenChange?.(next);
      }}
      onFocus={(event, info) => {
        if (shouldOpenFromNav(event.target)) setOpen(true);
        props.onFocus?.(event, info);
      }}
    />
  );
}

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
            <InputNumber
              min={18}
              max={70}
              controls={false}
              style={{ width: "100%" }}
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
            <Input placeholder="邮箱" />
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
