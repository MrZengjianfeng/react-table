/** 性别。与表格里 Select 的 value 一致。 */
export type Gender = "男" | "女";

/** 在职状态。与表格里 Select 的 value 一致。 */
export type MemberStatus = "在职" | "请假";

/**
 * 一条成员记录。
 * joinDate 存 YYYY-MM-DD 字符串，表格里再转成 dayjs 给 DatePicker。
 * age 允许 null：新增行还没填年龄。
 */
export interface Member {
  employeeId: string;
  name: string;
  gender: Gender;
  age: number | null;
  phone: string;
  /** 只读展示，不参与键盘导航。 */
  telephone: string;
  email: string;
  department: string;
  position: string;
  city: string;
  joinDate: string;
  status: MemberStatus;
}

/** 成员页根表单。Form.List 的 name 就是 members。 */
export interface MemberFormValues {
  members: Member[];
}
