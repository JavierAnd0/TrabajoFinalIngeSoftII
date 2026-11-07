export type RoleType = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type EnrollmentStatusType = 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
export type PaymentStatusType = 'PAID' | 'PENDING';
export type CertificateTypeDomain = 'STUDY' | 'GRADES' | 'GOOD_STANDING';
export type CertificateJobStatusDomain = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  fullName: string;
  role: RoleType;
  campusId: string;
  campusCode: string;
  campusName: string;
  studentCode: string | null;
  documentNumber: string;
}

export interface GradeCalculationResult {
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  accumulatedGrade: number;
  finalGrade: number;
  requiredCut3ForThree: number;
  evaluatedPercentage: number;
  passed: boolean;
  statusText: 'APROBADA' | 'EN CURSO' | 'REPROBADA';
}

export interface SectionValidationTarget {
  id: string;
  groupNumber: string;
  maxQuota: number;
  occupiedQuota: number;
  courseId: string;
  courseCode: string;
  courseName: string;
  periodId: string;
  periodCode: string;
  campusId: string;
  campusIsActive: boolean;
}

export interface ExistingEnrollmentRecord {
  id: string;
  sectionId: string;
  courseId: string;
  courseCode: string;
  periodId: string;
  status: EnrollmentStatusType;
}
