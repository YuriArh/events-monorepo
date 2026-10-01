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

/**
 * Started at module load, so the first unknown-email login isn't slower than
 * the rest (which would itself be a timing signal). A failed computation is
 * dropped rather than cached, and the next call starts a new one.
 */
const computeDummyHash = () => {
  const pending = hashPassword("dummy password that is never stored anywhere");

  pending.catch(() => {
    if (dummyHash === pending) dummyHash = undefined;
  });

  return pending;
};

let dummyHash: Promise<string> | undefined = computeDummyHash();

/**
 * Spends the same time as a real check, for logins with an unknown email, so
 * response time does not reveal which emails have accounts. Never throws: a
 * failed login is a failed login, not a 500.
 */
export const verifyAgainstDummy = async (password: string): Promise<false> => {
  dummyHash ??= computeDummyHash();

  try {
    await verifyPassword(await dummyHash, password);
  } catch {
    // The hash failed to compute; it has already been dropped for a retry.
  }

  return false;
};
