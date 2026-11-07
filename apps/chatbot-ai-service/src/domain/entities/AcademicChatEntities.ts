export type PreferredEngineMode = 'gemini' | 'groq' | 'deterministic' | 'auto';

export type EngineUsedType = 'GEMINI_AI' | 'GROQ_AI' | 'DETERMINISTIC_RULES';

export type IntentType =
  | 'INTENT_NEEDED_SCORE'
  | 'INTENT_GRADES'
  | 'INTENT_GENERATE_CERTIFICATE'
  | 'INTENT_SCHEDULE'
  | 'INTENT_PAYMENT_STATUS'
  | 'INTENT_FAQ_CALENDAR'
  | 'INTENT_HELP';

export interface StudentCourseGradeContext {
  enrollmentId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semesterLevel: number;
  groupNumber: string;
  scheduleText: string;
  classroom: string;
  teacherName: string;
  paymentReference: string;
  paymentStatus: 'PAID' | 'PENDING';
  cut1: number | null;
  cut2: number | null;
  cut3: number | null;
  accumulatedGrade: number;
  finalGrade: number | null;
  passed: boolean | null;
  evaluatedPercentage: number;
  neededInCut3ToPass: number | null;
  statusDescription: string;
  observations: string | null;
}

export interface StudentCertificateSummary {
  id: string;
  certificateType: 'STUDY' | 'GRADES' | 'GOOD_STANDING';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  verificationCode: string;
  pdfUrl: string;
  requestedAt: string;
  completedAt: string | null;
}

export interface StudentAcademicContext {
  userId: string;
  studentCode: string;
  fullName: string;
  email: string;
  documentNumber: string;
  campusCode: string;
  campusName: string;
  campusCity: string;
  programCode: string;
  programName: string;
  faculty: string;
  periodCode: string;
  periodName: string;
  totalEnrolledCredits: number;
  pga: number;
  financialStatus: 'PAID' | 'PENDING';
  courses: StudentCourseGradeContext[];
  certificates: StudentCertificateSummary[];
}

export interface ChatMessageRequest {
  studentId?: string;
  sessionId?: string;
  message: string;
  preferredMode?: PreferredEngineMode;
}

export interface DataAttachment {
  type: 'GRADES_TABLE' | 'CERTIFICATE_CARD' | 'SCHEDULE_LIST' | 'CALENDAR_INFO' | 'PAYMENT_SUMMARY';
  title?: string;
  payload: Record<string, unknown>;
}

export interface ChatMessageResponse {
  sessionId: string;
  reply: string;
  engineUsed: EngineUsedType;
  intentDetected: string;
  actionExecuted: string | null;
  toolCalled: string | null;
  latencyMs: number;
  suggestedQuickReplies: string[];
  dataAttachment?: DataAttachment | null;
}

export interface FaqTreeNode {
  id: string;
  category: string;
  title: string;
  questionPrompt: string;
  description: string;
  intent: IntentType;
  children?: FaqTreeNode[];
}
