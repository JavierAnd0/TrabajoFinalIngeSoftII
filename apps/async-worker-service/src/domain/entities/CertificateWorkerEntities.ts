export type CertificateTypeWorker = 'STUDY' | 'GRADES' | 'GOOD_STANDING';

export interface CourseGradePdfRow {
  courseCode: string;
  courseName: string;
  credits: number;
  groupNumber: string;
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  finalGrade: number;
  statusText: string;
}

export interface OfficialCertificateRenderData {
  jobId: string;
  verificationCode: string;
  certificateType: CertificateTypeWorker;
  issuedAtIso: string;
  digitalSignatureHash: string;
  verificationUrl: string;
  student: {
    id: string;
    fullName: string;
    studentCode: string;
    documentNumber: string;
    email: string;
    programName: string;
    programCode: string;
    faculty: string;
    campusName: string;
    campusCode: string;
    campusCity: string;
  };
  period: {
    code: string;
    name: string;
  };
  metrics: {
    pga: number;
    enrolledCredits: number;
    enrolledCoursesCount: number;
    financialStatus: string;
  };
  courses: CourseGradePdfRow[];
}

export interface RecentWorkerJobEntry {
  jobId: string;
  queueName: 'certificate-pdf-queue' | 'notification-queue';
  type: string;
  studentId: string;
  verificationCode?: string;
  status: 'COMPLETED' | 'PROCESSING' | 'FAILED';
  latencyMs: number;
  processedAt: string;
  pdfUrl?: string;
}
