import {
  AuthTokenPayload,
  CertificateJobStatusDomain,
  CertificateTypeDomain,
  EnrollmentStatusType,
  PaymentStatusType,
  RoleType,
} from '../../domain/entities/AcademicEntities';

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthTokenPayload;
}

export interface StudentEnrollmentViewDto {
  enrollmentId: string;
  status: EnrollmentStatusType;
  paymentReference: string;
  paymentStatus: PaymentStatusType;
  enrolledAt: string;
  course: {
    id: string;
    code: string;
    name: string;
    credits: number;
    semesterLevel: number;
  };
  section: {
    id: string;
    groupNumber: string;
    scheduleText: string;
    classroom: string;
    teacherName: string;
    campusName: string;
    campusCode: string;
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
    evaluatedPercentage: number;
    passed: boolean;
    statusText: 'APROBADA' | 'EN CURSO' | 'REPROBADA';
    observations: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
}

export interface CertificateJobViewDto {
  id: string;
  jobId: string;
  studentId: string;
  certificateType: CertificateTypeDomain;
  status: CertificateJobStatusDomain;
  verificationCode: string;
  digitalSignatureHash: string | null;
  pdfUrl: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface StudentAcademicSummaryDto {
  student: {
    id: string;
    email: string;
    fullName: string;
    documentNumber: string;
    studentCode: string | null;
    role: RoleType;
  };
  campus: {
    id: string;
    code: string;
    name: string;
    city: string;
    address: string;
  };
  program: {
    id: string;
    code: string;
    name: string;
    faculty: string;
    totalCredits: number;
  };
  activePeriod: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  metrics: {
    pga: number;
    enrolledCredits: number;
    maxAllowedCredits: number;
    enrolledCoursesCount: number;
    approvedCoursesCount: number;
    inProgressCoursesCount: number;
    financialStatus: 'AL DÍA (PAZ Y SALVO)' | 'PENDIENTE DE PAGO';
  };
  enrollments: StudentEnrollmentViewDto[];
  certificates: CertificateJobViewDto[];
}
