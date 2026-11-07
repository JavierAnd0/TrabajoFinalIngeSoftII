import { AuthTokenPayload } from '../../../domain/entities/AcademicEntities';

export interface ITokenServicePort {
  signToken(payload: AuthTokenPayload): string;
  verifyToken(token: string): AuthTokenPayload;
}
