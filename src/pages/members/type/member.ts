export type Gender = "男" | "女";
export type MemberStatus = "在职" | "请假";

export interface Member {
  employeeId: string;
  name: string;
  gender: Gender;
  age: number | null;
  phone: string;
  telephone: string;
  email: string;
  department: string;
  position: string;
  city: string;
  joinDate: string;
  status: MemberStatus;
}

export interface MemberFormValues {
  members: Member[];
}
