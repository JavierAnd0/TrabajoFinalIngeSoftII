import { prisma } from '@edudistribuida/database';
import {
  IUserRepository,
  UserWithCampusRecord,
} from '../../application/ports/out/IUserRepository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PrismaUserRepository implements IUserRepository {
  public async findByEmail(email: string): Promise<UserWithCampusRecord | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { campus: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      supabaseUid: user.supabaseUid,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      documentNumber: user.documentNumber,
      studentCode: user.studentCode,
      role: user.role,
      campusId: user.campusId,
      campus: {
        id: user.campus.id,
        code: user.campus.code,
        name: user.campus.name,
        city: user.campus.city,
        address: user.campus.address,
        isActive: user.campus.isActive,
      },
    };
  }

  public async findByIdOrStudentCode(
    identifier: string
  ): Promise<UserWithCampusRecord | null> {
    const trimmed = identifier.trim();
    const isUuid = UUID_REGEX.test(trimmed);

    const user = await prisma.user.findFirst({
      where: isUuid
        ? { OR: [{ id: trimmed }, { studentCode: trimmed }] }
        : {
            OR: [
              { studentCode: trimmed },
              { documentNumber: trimmed },
              { email: trimmed.toLowerCase() },
            ],
          },
      include: { campus: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      supabaseUid: user.supabaseUid,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      documentNumber: user.documentNumber,
      studentCode: user.studentCode,
      role: user.role,
      campusId: user.campusId,
      campus: {
        id: user.campus.id,
        code: user.campus.code,
        name: user.campus.name,
        city: user.campus.city,
        address: user.campus.address,
        isActive: user.campus.isActive,
      },
    };
  }
}
