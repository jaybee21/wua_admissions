export type UserRole = 'agent'| 'accounts clerk' | 'accounts manager' | 'general manager' | 'director' | 'admin' 

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
  role: UserRole;
  isFirstLogin: boolean;
  createdAt?: Date;
}
