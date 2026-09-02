/**
 * 成员管理页。
 *
 * 用 Form.List 管成员数组，Table 只负责展示。fields 既是表格 dataSource，
 * 也是每行 Form.Item 的 name 索引。新增 / 删除走 List 的 add / remove，
 * 表单值和表格行始终一致。
 *
 * 键盘导航挂在表格外层：data-table-keyboard-nav + onKeyDownCapture。
 */
import { Button, Flex, Form, Table, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { FormListFieldData } from "antd";
import { getColumns } from "./columns";
import { emptyMember, initialMembers } from "./data";
import type { MemberFormValues } from "./type/member";
import { useTableKeyboardNav } from "./useTableKeyboardNav";

export default function Members() {
  const [form] = Form.useForm<MemberFormValues>();
  const onKeyDownCapture = useTableKeyboardNav();

  const handleSave = async () => {
    const values = await form.validateFields();
    message.success(`已保存 ${values.members.length} 条成员数据`);
  };

  return (
    <Form form={form} initialValues={{ members: initialMembers }}>
      <Form.List name="members">
        {(fields, { add, remove }) => (
          <>
            <Flex className="app-toolbar" justify="flex-end" gap={8}>
              <Button icon={<PlusOutlined />} onClick={() => add(emptyMember)}>
                新增成员
              </Button>
              <Button type="primary" onClick={handleSave}>
                保存
              </Button>
            </Flex>
            <div data-table-keyboard-nav onKeyDownCapture={onKeyDownCapture}>
              <Table<FormListFieldData>
                rowKey="key"
                columns={getColumns(remove)}
                dataSource={fields}
                pagination={false}
                scroll={{ x: 2020 }}
              />
            </div>
          </>
        )}
      </Form.List>
    </Form>
  );
}
