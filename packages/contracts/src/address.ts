import { z } from "zod";

export const addressParamsSchema = z.object({
  id: z.string().min(1),
});

/** line1, city and country are NOT NULL in the database. */
export const createAddressInput = z.object({
  label: z.string().max(255).nullish(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).nullish(),
  city: z.string().min(1).max(255),
  region: z.string().max(255).nullish(),
  postalCode: z.string().max(32).nullish(),
  country: z.string().min(1).max(255),
});

export const updateAddressInput = createAddressInput.partial();

export type CreateAddressInput = z.infer<typeof createAddressInput>;
export type UpdateAddressInput = z.infer<typeof updateAddressInput>;
