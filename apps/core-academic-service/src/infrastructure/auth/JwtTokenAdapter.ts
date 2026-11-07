import jwt from 'jsonwebtoken';
import { ITokenServicePort } from '../../application/ports/out/ITokenServicePort';
import { AuthTokenPayload } from '../../domain/entities/AcademicEntities';
import { InvalidCredentialsError } from '../../domain/errors/DomainError';
import { env } from '../config/env';

export class JwtTokenAdapter implements ITokenServicePort {
  public signToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, env.SUPABASE_JWT_SECRET, {
      expiresIn: '8h',
      issuer: 'edudistribuida-core-academic-service',
      audience: 'edudistribuida-usco-net',
    });
  }

  public verifyToken(token: string): AuthTokenPayload {
    try {
      const decoded = jwt.verify(token, env.SUPABASE_JWT_SECRET) as jwt.JwtPayload &
        AuthTokenPayload;

      if (!decoded || !decoded.userId || !decoded.role) {
        throw new InvalidCredentialsError('Token JWT malformado o sin claims requeridos.');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        fullName: decoded.fullName,
        role: decoded.role,
        campusId: decoded.campusId,
        campusCode: decoded.campusCode,
        campusName: decoded.campusName,
        studentCode: decoded.studentCode ?? null,
        documentNumber: decoded.documentNumber,
      };
    } catch {
      throw new InvalidCredentialsError('Token JWT inválido, expirado o con firma adulterada.');
    }
  }
}
