/**
 * Jerarquía de Errores Puros de Dominio (100% libre de dependencias HTTP o de infraestructura).
 * Cada error de dominio define su código semántico y sugerencia de estado para la capa adaptadora HTTP.
 */
export class DomainError extends Error {
  public readonly errorCode: string;
  public readonly statusCode: number;

  constructor(message: string, errorCode = 'DOMAIN_ERROR', statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuotaExceededError extends DomainError {
  constructor(sectionGroup: string, courseCode: string, maxQuota: number) {
    super(
      `Cupo agotado en la sección ${sectionGroup} de la asignatura ${courseCode} (Capacidad máxima: ${maxQuota}/${maxQuota}).`,
      'QUOTA_EXCEEDED',
      409
    );
  }
}

export class DuplicateEnrollmentError extends DomainError {
  constructor(courseCode: string, periodCode: string) {
    super(
      `El estudiante ya cuenta con una matrícula activa para la asignatura ${courseCode} en el periodo académico ${periodCode}.`,
      'DUPLICATE_ENROLLMENT',
      409
    );
  }
}

export class UnauthorizedRoleError extends DomainError {
  constructor(message = 'Acceso denegado: Su rol institucional no tiene privilegios para ejecutar esta operación.') {
    super(message, 'UNAUTHORIZED_ROLE', 403);
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(resourceName: string, identifier: string) {
    super(
      `${resourceName} con identificador '${identifier}' no fue encontrado en el registro académico.`,
      'RESOURCE_NOT_FOUND',
      404
    );
  }
}

export class ValidationError extends DomainError {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = 'Credenciales institucionales inválidas. Verifique su correo @usco.edu.co y contraseña.') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}
