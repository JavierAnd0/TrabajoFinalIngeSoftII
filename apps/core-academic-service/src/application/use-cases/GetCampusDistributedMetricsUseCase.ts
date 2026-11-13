import { ICampusRepository } from '../ports/out/ICampusRepository';
import { IEnrollmentRepository } from '../ports/out/IEnrollmentRepository';

export class GetCampusDistributedMetricsUseCase {
  constructor(
    private readonly campusRepository: ICampusRepository,
    private readonly enrollmentRepository: IEnrollmentRepository
  ) {}

  public async execute(campusCode?: string, teacherId?: string) {
    const [campuses, enrollments] = await Promise.all([
      this.campusRepository.getAllCampusesWithMetrics(),
      this.enrollmentRepository.listAllEnrollmentsForAdmin(campusCode, teacherId),
    ]);

    const totalStudents = campuses.reduce((acc, c) => acc + c.totalStudents, 0);
    const totalActiveEnrollments = campuses.reduce((acc, c) => acc + c.activeEnrollments, 0);
    const totalOccupiedQuota = campuses.reduce((acc, c) => acc + c.occupiedQuotaTotal, 0);
    const totalMaxQuota = campuses.reduce((acc, c) => acc + c.maxQuotaTotal, 0);

    return {
      globalSummary: {
        totalCampuses: campuses.length,
        totalStudents,
        totalActiveEnrollments,
        globalOccupancyPercentage:
          totalMaxQuota > 0
            ? Number(((totalOccupiedQuota / totalMaxQuota) * 100).toFixed(1))
            : 0,
      },
      campuses,
      enrollments,
    };
  }
}
