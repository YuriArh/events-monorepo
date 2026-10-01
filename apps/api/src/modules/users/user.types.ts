import type { z } from "@repo/contracts";

import type {
  changePasswordInput as changePasswordSchema,
  updateProfileInput as updateProfileSchema,
} from "@repo/contracts";
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type { PublicUser } from "../users/user.repository.js";
