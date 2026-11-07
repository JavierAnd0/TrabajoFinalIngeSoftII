import { RoleType } from '../../../domain/entities/AcademicEntities';

export interface UserWithCampusRecord {
  id: string;
  supabaseUid: string | null;
  email: string;
  passwordHash: string;
  fullName: string;
  documentNumber: string;
  studentCode: string | null;
  role: RoleType;
  campusId: string;
  campus: {
    id: string;
    code: string;
    name: string;
    city: string;
    address: string;
    isActive: boolean;
  };
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserWithCampusRecord | null>;
  findByIdOrStudentCode(identifier: string): Promise<UserWithCampusRecord | null>;
}
