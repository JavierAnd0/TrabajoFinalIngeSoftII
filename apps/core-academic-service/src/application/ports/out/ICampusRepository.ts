export interface CampusMetricsItem {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  isActive: boolean;
  totalStudents: number;
  openSections: number;
  activeEnrollments: number;
  maxQuotaTotal: number;
  occupiedQuotaTotal: number;
  occupancyPercentage: number;
  averageCampusGrade: number;
}

export interface ICampusRepository {
  getAllCampusesWithMetrics(): Promise<CampusMetricsItem[]>;
}
