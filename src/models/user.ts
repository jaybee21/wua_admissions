export interface User {
  id?: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  idNumber: string;
  department: string;
  password: string;
  role: string;
  isFirstLogin: boolean;
  createdAt?: Date;
}
