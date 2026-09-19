import { z } from "zod";

export const addressParamsSchema = z.object({
  id: z.string().min(1),
});

export const createAddressSchema = z.object({
  label: z.string().max(255).nullish(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).nullish(),
  city: z.string().min(1).max(255),
  region: z.string().max(255).nullish(),
  postalCode: z.string().max(32).nullish(),
  country: z.string().min(1).max(255),
});

export const updateAddressSchema = createAddressSchema.partial();
