export interface Job {
  id: number;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  total_marks?: number;
}

export interface Requirement {
  job_id: number;
  requirement_type: string;
  description: string;
  marks: number;
  years_required?: number;
  equivalent?: string;
}
