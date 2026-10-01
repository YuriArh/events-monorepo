import { WEB_ORIGIN } from "../../lib/config.js";
import { generateToken, hashToken } from "../../lib/crypto.js";
import type { Mailer } from "../../lib/mailer.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../../lib/password.js";
import { type PublicUser, userRepository } from "../users/user.repository.js";
import { authRepository } from "./auth.repository.js";
import type { LoginInput, RegisterInput, SessionMeta } from "./auth.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Renew at most once a day, so an active user costs one write per day, not per request. */
const RENEW_AFTER_MS = DAY_MS;

/** One message for unknown email and wrong password, so login can't be used to probe accounts. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "EmailTakenError";
  }
}

const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_TTL_MS = DAY_MS;

/** One message for unknown, expired, used and wrong-type tokens. */
export class InvalidTokenError extends Error {
  constructor() {
    super("This link is invalid or has expired");
    this.name = "InvalidTokenError";
  }
}

/** The single place emails are normalized. The unique index relies on it. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Always a brand-new token: reusing one would allow session fixation. */
const startSession = async (userId: string, meta: SessionMeta) => {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await authRepository.createSession({ tokenHash: hashToken(token), userId, expiresAt, ...meta });

  return { token, expiresAt };
};

const sendVerification = async (user: { id: string; email: string }, mailer: Mailer) => {
  const token = generateToken();

  await authRepository.issueToken({
    userId: user.id,
    type: "EMAIL_VERIFY",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });

  await mailer.send({
    to: user.email,
    subject: "Confirm your email",
    text: `Confirm your email address for eventapp:\n${WEB_ORIGIN}/verify-email?token=${token}\n\nThe link is valid for 24 hours.`,
  });
};

export const authService = {
  async register(input: RegisterInput, meta: SessionMeta, mailer: Mailer) {
    const user = await userRepository.createIfEmailFree({
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      name: input.name ?? null,
    });

    if (!user) throw new EmailTakenError();

    await sendVerification(user, mailer);

    return { user, session: await startSession(user.id, meta) };
  },

  async login(input: LoginInput, meta: SessionMeta) {
    const credentials = await userRepository.findCredentialsByEmail(normalizeEmail(input.email));

    if (!credentials) {
      await verifyAgainstDummy(input.password);
      throw new InvalidCredentialsError();
    }

    if (!(await verifyPassword(credentials.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }

    const user = await userRepository.findById(credentials.id);
    if (!user) throw new InvalidCredentialsError();

    return { user, session: await startSession(user.id, meta) };
  },

  /** Null for unknown or expired tokens. `renewedExpiresAt` is set when the cookie must be re-sent. */
  async resolveSession(token: string) {
    const session = await authRepository.findSessionWithUser(hashToken(token));
    if (!session) return null;

    const now = Date.now();

    if (session.expiresAt.getTime() <= now) {
      await authRepository.deleteSession(session.id);
      return null;
    }

    let renewedExpiresAt: Date | null = null;

    if (session.expiresAt.getTime() - now < SESSION_TTL_MS - RENEW_AFTER_MS) {
      renewedExpiresAt = new Date(now + SESSION_TTL_MS);
      await authRepository.extendSession(session.id, renewedExpiresAt);
    }

    return { user: session.user, sessionId: session.id, renewedExpiresAt };
  },

  async logout(sessionId: string | null) {
    if (sessionId) await authRepository.deleteSession(sessionId);
  },

  /** Silent for unknown emails: the caller always answers 204. */
  async requestPasswordReset(email: string, mailer: Mailer) {
    const user = await userRepository.findByEmail(normalizeEmail(email));
    if (!user) return;

    const token = generateToken();

    await authRepository.issueToken({
      userId: user.id,
      type: "PASSWORD_RESET",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });

    await mailer.send({
      to: user.email,
      subject: "Reset your password",
      text: `Set a new password for eventapp:\n${WEB_ORIGIN}/reset-password?token=${token}\n\nThe link is valid for 30 minutes. If you didn't ask for this, ignore this email.`,
    });
  },

  async resetPassword(token: string, newPassword: string) {
    const ok = await authRepository.resetPassword(hashToken(token), await hashPassword(newPassword));

    if (!ok) throw new InvalidTokenError();
  },

  async verifyEmail(token: string) {
    if (!(await authRepository.verifyEmail(hashToken(token)))) {
      throw new InvalidTokenError();
    }
  },

  async resendVerification(user: PublicUser, mailer: Mailer) {
    if (user.emailVerifiedAt) return;

    await sendVerification(user, mailer);
  },
};
