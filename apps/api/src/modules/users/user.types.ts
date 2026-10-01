import type { z } from "@repo/contracts";

import type { changePasswordSchema } from "../auth/auth.schema.js";
import type { updateProfileSchema } from "./user.schema.js";

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type { PublicUser } from "./user.repository.js";
