import argon2 from "argon2";

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

/** A malformed stored hash is a failed login, not a 500. */
export const verifyPassword = async (hash: string, password: string) => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check, for logins with an unknown email, so
 * response time does not reveal which emails have accounts.
 */
export const verifyAgainstDummy = async (password: string): Promise<false> => {
  dummyHash ??= hashPassword("dummy password that is never stored anywhere");
  await verifyPassword(await dummyHash, password);
  return false;
};
