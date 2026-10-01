import { prisma } from "@repo/db";

import { publicUserSelect } from "../users/user.repository.js";

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
};
