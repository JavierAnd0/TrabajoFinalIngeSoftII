import { SectionValidationTarget } from '../../../domain/entities/AcademicEntities';

export interface SectionOfferItem {
  id: string;
  groupNumber: string;
  scheduleText: string;
  classroom: string;
  maxQuota: number;
  occupiedQuota: number;
  availableQuota: number;
  isEnrolledByStudent: boolean;
  course: {
    id: string;
    code: string;
    name: string;
    credits: number;
    semesterLevel: number;
  };
  teacher: {
    id: string;
    fullName: string;
    email: string;
  };
  campus: {
    id: string;
    code: string;
    name: string;
    city: string;
  };
  period: {
    id: string;
    code: string;
    name: string;
  };
}

export interface ICourseSectionRepository {
  listAvailableSections(filters: {
    campusId?: string;
    studentId?: string;
  }): Promise<SectionOfferItem[]>;
  findSectionValidationTarget(sectionId: string): Promise<SectionValidationTarget | null>;
}
