import { type Prisma, prisma } from "@repo/db";

/**
 * Every read goes through this select, so `passwordHash` cannot leak by
 * accident. The only exceptions are the two `findCredentials*` methods.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  imageKey: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && Reflect.get(error, "code") === "P2002";

export const userRepository = {
  /** Null when the email is taken — the unique index decides, so concurrent sign-ups can't both win. */
  async createIfEmailFree(data: { email: string; passwordHash: string; name: string | null }) {
    try {
      return await prisma.user.create({ data, select: publicUserSelect });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: publicUserSelect });
  },

  findCredentialsByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  },

  findCredentialsById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
  },

  updateProfile(id: string, data: { name: string | null }) {
    return prisma.user.update({ where: { id }, data, select: publicUserSelect });
  },

  /**
   * New hash and the sign-out of every other session in one transaction: a
   * failure between the two must not leave a stolen session alive under the
   * new password.
   */
  changePassword(id: string, passwordHash: string, keepSessionId: string) {
    return prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash }, select: { id: true } }),
      prisma.session.deleteMany({ where: { userId: id, id: { not: keepSessionId } } }),
    ]);
  },

  /** Sessions and tokens cascade; organized events keep existing with organizerId = null. */
  delete(id: string) {
    return prisma.user.delete({ where: { id }, select: { id: true } });
  },
};
