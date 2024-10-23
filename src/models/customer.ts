export type CustomerRole = 'customer';

export interface Customer {
  id?: number;
  Fullname: string;
  Address: string;
  phone: string;
  NationalID: string;
  DateOfBirth: Date;
  Email: string;
  Occupation: string;
  createdAt?: Date;
}
