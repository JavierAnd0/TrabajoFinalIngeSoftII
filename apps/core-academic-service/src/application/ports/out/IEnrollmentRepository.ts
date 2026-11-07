import { ExistingEnrollmentRecord } from '../../../domain/entities/AcademicEntities';
import { StudentAcademicSummaryDto } from '../../dtos/AcademicDtos';

export interface AdminEnrollmentRecord {
  enrollmentId: string;
  enrolledAt: string;
  status: string;
  paymentReference: string;
  paymentStatus: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    studentCode: string | null;
    documentNumber: string;
  };
  campus: {
    id: string;
    code: string;
    name: string;
    city: string;
  };
  course: {
    id: string;
    code: string;
    name: string;
    credits: number;
  };
  section: {
    id: string;
    groupNumber: string;
    scheduleText: string;
    classroom: string;
    maxQuota: number;
    occupiedQuota: number;
  };
  grade: {
    id: string | null;
    cut1: number | null;
    cut2: number | null;
    cut3: number | null;
    accumulatedGrade: number;
    finalGrade: number;
    requiredCut3ForThree: number;
    passed: boolean;
    statusText: 'APROBADA' | 'EN CURSO' | 'REPROBADA';
    observations: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
}

export interface IEnrollmentRepository {
  getStudentAcademicSummary(studentIdOrCode: string): Promise<StudentAcademicSummaryDto | null>;
  findExistingEnrollmentsByStudent(studentId: string): Promise<ExistingEnrollmentRecord[]>;
  executeAtomicEnrollment(params: {
    studentId: string;
    sectionId: string;
    periodId: string;
    paymentReference: string;
  }): Promise<{
    enrollmentId: string;
    studentId: string;
    sectionId: string;
    courseCode: string;
    courseName: string;
    groupNumber: string;
    occupiedQuota: number;
    maxQuota: number;
    paymentReference: string;
    enrolledAt: string;
  }>;
  updateEnrollmentGrade(params: {
    enrollmentId: string;
    cut1: number | null;
    cut2: number | null;
    cut3: number | null;
    finalGrade: number;
    passed: boolean;
    observations?: string | null;
    updatedBy: string;
  }): Promise<AdminEnrollmentRecord>;
  listAllEnrollmentsForAdmin(campusCode?: string): Promise<AdminEnrollmentRecord[]>;
  confirmPaymentByWebhook(params: {
    paymentReference: string;
    status: 'PAID' | 'PENDING';
  }): Promise<{ updatedCount: number; paymentReference: string; status: string }>;
}
