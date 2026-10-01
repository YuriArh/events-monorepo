import { hashPassword, verifyPassword } from "../../lib/password.js";
import { authRepository } from "../auth/auth.repository.js";
import { userRepository } from "./user.repository.js";
import type { ChangePasswordInput, UpdateProfileInput } from "./user.types.js";

/** Re-entering the password guards destructive actions against a borrowed, signed-in browser. */
export class WrongPasswordError extends Error {
  constructor() {
    super("Current password is incorrect");
    this.name = "WrongPasswordError";
  }
}

const assertPassword = async (userId: string, password: string) => {
  const credentials = await userRepository.findCredentialsById(userId);

  if (!credentials || !(await verifyPassword(credentials.passwordHash, password))) {
    throw new WrongPasswordError();
  }
};

export const userService = {
  updateProfile(userId: string, input: UpdateProfileInput) {
    return userRepository.updateProfile(userId, { name: input.name });
  },

  /** Keeps the session that made the change; every other one is signed out. */
  async changePassword(userId: string, currentSessionId: string, input: ChangePasswordInput) {
    await assertPassword(userId, input.currentPassword);

    await userRepository.updatePasswordHash(userId, await hashPassword(input.newPassword));
    await authRepository.deleteUserSessions(userId, currentSessionId);
  },

  async deleteAccount(userId: string, password: string) {
    await assertPassword(userId, password);

    await userRepository.delete(userId);
  },
};
