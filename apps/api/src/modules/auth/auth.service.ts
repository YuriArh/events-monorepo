import { generateToken, hashToken } from "../../lib/crypto.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../../lib/password.js";
import { userRepository } from "../users/user.repository.js";
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

/** The single place emails are normalized. The unique index relies on it. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Always a brand-new token: reusing one would allow session fixation. */
const startSession = async (userId: string, meta: SessionMeta) => {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await authRepository.createSession({ tokenHash: hashToken(token), userId, expiresAt, ...meta });

  return { token, expiresAt };
};

export const authService = {
  async register(input: RegisterInput, meta: SessionMeta) {
    const user = await userRepository.createIfEmailFree({
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      name: input.name ?? null,
    });

    if (!user) throw new EmailTakenError();

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
};
