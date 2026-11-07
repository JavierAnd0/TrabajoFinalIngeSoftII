import { GradeCalculationResult } from '../entities/AcademicEntities';
import { ValidationError } from '../errors/DomainError';

/**
 * Servicio de Dominio Puro para el Cálculo de Calificaciones Universitarias (Reglamento USCO).
 * Ponderación oficial:
 * - Corte 1: 30% (0.30)
 * - Corte 2: 30% (0.30)
 * - Corte 3: 40% (0.40)
 * Nota mínima aprobatoria: 3.00 en escala de 0.00 a 5.00.
 */
export class GradeDomainService {
  public static validateCutScore(score: number | null | undefined, cutLabel: string): void {
    if (score === null || score === undefined) {
      return;
    }
    if (typeof score !== 'number' || Number.isNaN(score) || score < 0.0 || score > 5.0) {
      throw new ValidationError(
        `La calificación de ${cutLabel} (${score}) debe estar en el rango reglamentario de 0.00 a 5.00.`
      );
    }
  }

  public static calculateFinalAndRequiredCut3(
    cut1: number | null | undefined,
    cut2: number | null | undefined,
    cut3: number | null | undefined
  ): GradeCalculationResult {
    const normalizedCut1 = typeof cut1 === 'number' ? Number(cut1.toFixed(2)) : null;
    const normalizedCut2 = typeof cut2 === 'number' ? Number(cut2.toFixed(2)) : null;
    const normalizedCut3 = typeof cut3 === 'number' ? Number(cut3.toFixed(2)) : null;

    this.validateCutScore(normalizedCut1, 'Corte 1 (30%)');
    this.validateCutScore(normalizedCut2, 'Corte 2 (30%)');
    this.validateCutScore(normalizedCut3, 'Corte 3 (40%)');

    const c1Value = normalizedCut1 ?? 0;
    const c2Value = normalizedCut2 ?? 0;
    const c3Value = normalizedCut3 ?? 0;

    let evaluatedPercentage = 0;
    if (normalizedCut1 !== null) evaluatedPercentage += 30;
    if (normalizedCut2 !== null) evaluatedPercentage += 30;
    if (normalizedCut3 !== null) evaluatedPercentage += 40;

    const rawAccumulated = 0.3 * c1Value + 0.3 * c2Value + 0.4 * c3Value;
    const accumulatedGrade = Number(rawAccumulated.toFixed(2));
    const finalGrade = accumulatedGrade;

    const rawRequiredCut3 = (3.0 - (0.3 * c1Value + 0.3 * c2Value)) / 0.4;
    const requiredCut3ForThree =
      normalizedCut3 !== null
        ? 0
        : Number(Math.max(0, rawRequiredCut3).toFixed(2));

    const passed = finalGrade >= 3.0;

    let statusText: 'APROBADA' | 'EN CURSO' | 'REPROBADA';
    if (passed) {
      statusText = 'APROBADA';
    } else if (normalizedCut3 === null && requiredCut3ForThree <= 5.0) {
      statusText = 'EN CURSO';
    } else {
      statusText = 'REPROBADA';
    }

    return {
      cut1: normalizedCut1,
      cut2: normalizedCut2,
      cut3: normalizedCut3,
      accumulatedGrade,
      finalGrade,
      requiredCut3ForThree,
      evaluatedPercentage,
      passed,
      statusText,
    };
  }
}
