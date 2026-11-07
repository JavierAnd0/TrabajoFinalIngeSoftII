import bcrypt from 'bcryptjs';
import { AuthTokenPayload } from '../../domain/entities/AcademicEntities';
import { InvalidCredentialsError } from '../../domain/errors/DomainError';
import { LoginRequestDto, LoginResponseDto } from '../dtos/AcademicDtos';
import { ITokenServicePort } from '../ports/out/ITokenServicePort';
import { IUserRepository } from '../ports/out/IUserRepository';

export class AuthenticateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenServicePort
  ) {}

  public async execute(input: LoginRequestDto): Promise<LoginResponseDto> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      campusId: user.campus.id,
      campusCode: user.campus.code,
      campusName: user.campus.name,
      studentCode: user.studentCode,
      documentNumber: user.documentNumber,
    };

    const accessToken = this.tokenService.signToken(tokenPayload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: '8h',
      user: tokenPayload,
    };
  }
}
