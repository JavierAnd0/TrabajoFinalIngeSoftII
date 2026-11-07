import { atom } from 'nanostores';
import type { SessionUser } from '../env';

export interface GradeDetail {
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  accumulatedGrade: number;
  finalGrade: number;
  passed: boolean;
  requiredCut3ForThree: number;
  statusText: string;
  observations?: string | null;
}

export interface StudentEnrollmentItem {
  id: string;
  enrollmentId?: string;
  status: string;
  paymentReference?: string | null;
  paymentStatus: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterLevel: number;
  groupNumber: string;
  scheduleText: string;
  classroom: string;
  teacherName: string;
  campusName: string;
  campusCode: string;
  grade: GradeDetail;
}

export interface CertificateItem {
  id: string;
  jobId?: string;
  studentId: string;
  certificateType: 'STUDY' | 'GRADES' | 'GOOD_STANDING';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  verificationCode: string;
  digitalSignatureHash?: string | null;
  pdfUrl?: string | null;
  requestedAt: string;
  completedAt?: string | null;
}

export interface StudentSummaryData {
  student: {
    id: string;
    email: string;
    fullName: string;
    studentCode: string | null;
    documentNumber: string;
    role: string;
    campusId: string;
    campusName: string;
    campusCode: string;
  };
  period: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  metrics: {
    pga: number;
    enrolledCredits: number;
    enrolledCoursesCount: number;
    approvedCoursesCount: number;
    financialStatus: string;
  };
  enrollments: StudentEnrollmentItem[];
  certificates: CertificateItem[];
}

export interface CourseSectionItem {
  id: string;
  groupNumber: string;
  scheduleText: string;
  classroom: string;
  maxQuota: number;
  occupiedQuota: number;
  availableQuota: number;
  isEnrolled: boolean;
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterLevel: number;
  teacherName: string;
  campusId: string;
  campusCode: string;
  campusName: string;
}

export interface CampusStatItem {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  isActive: boolean;
  studentsCount: number;
  activeSectionsCount: number;
  enrollmentsCount: number;
  averageGrade: number;
}

export interface AdminEnrollmentRecord {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  studentEmail: string;
  campusCode: string;
  campusName: string;
  courseCode: string;
  courseName: string;
  credits: number;
  groupNumber: string;
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  finalGrade: number;
  passed: boolean;
  statusText: string;
  observations: string;
}

export const $currentUser = atom<SessionUser | null>(null);
export const $authToken = atom<string | null>(null);
export const $studentSummary = atom<StudentSummaryData | null>(null);
export const $availableSections = atom<CourseSectionItem[]>([]);
export const $certificatesList = atom<CertificateItem[]>([]);
export const $chatbotOpen = atom<boolean>(false);
export const $chatbotMode = atom<'auto' | 'gemini' | 'groq' | 'deterministic'>('auto');
export const $syncVersion = atom<number>(0);

export function triggerAcademicSync(): void {
  $syncVersion.set($syncVersion.get() + 1);
}
