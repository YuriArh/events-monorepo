import { type AuthTokenType, type Prisma, prisma } from "@repo/db";

import { publicUserSelect } from "../users/user.repository.js";

/**
 * Redeems a one-shot token. The conditional updateMany is what makes it
 * single-use under concurrency: of two simultaneous requests, only one sees
 * count === 1. Unknown, wrong-type, used and expired tokens all return null.
 */
const consumeToken = async (tx: Prisma.TransactionClient, tokenHash: string, type: AuthTokenType) => {
  const token = await tx.authToken.findUnique({ where: { tokenHash } });
  if (!token || token.type !== type) return null;

  const now = new Date();
  const { count } = await tx.authToken.updateMany({
    where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  return count === 1 ? token.userId : null;
};

export const authRepository = {
  createSession(data: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }) {
    return prisma.session.create({ data });
  },

  findSessionWithUser(tokenHash: string) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: publicUserSelect } },
    });
  },

  extendSession(id: string, expiresAt: Date) {
    return prisma.session.update({ where: { id }, data: { expiresAt } });
  },

  /** deleteMany, not delete: logging out twice is not an error. */
  deleteSession(id: string) {
    return prisma.session.deleteMany({ where: { id } });
  },

  deleteUserSessions(userId: string, exceptSessionId?: string) {
    return prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  },

  /** Issuing a token retires every unused one of the same type: only the latest link works. */
  issueToken(data: { userId: string; type: AuthTokenType; tokenHash: string; expiresAt: Date }) {
    return prisma.$transaction([
      prisma.authToken.updateMany({
        where: { userId: data.userId, type: data.type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.authToken.create({ data }),
    ]);
  },

  /** Sets the new hash and signs out everywhere, if and only if the token is redeemed. */
  resetPassword(tokenHash: string, passwordHash: string) {
    return prisma.$transaction(async (tx) => {
      const userId = await consumeToken(tx, tokenHash, "PASSWORD_RESET");
      if (!userId) return false;

      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId } });

      return true;
    });
  },

  verifyEmail(tokenHash: string) {
    return prisma.$transaction(async (tx) => {
      const userId = await consumeToken(tx, tokenHash, "EMAIL_VERIFY");
      if (!userId) return false;

      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

      return true;
    });
  },
};
