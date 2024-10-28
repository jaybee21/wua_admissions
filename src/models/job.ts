export interface Job {
    id?: number; 
    title: string; 
    description: string; 
    qualifications: string; 
    experience: string; 
    startDate: string; 
    endDate: string; 
    status: string;
    createdBy: string;
    createdAt?: Date; 
    updatedAt?: Date; 
  }
  