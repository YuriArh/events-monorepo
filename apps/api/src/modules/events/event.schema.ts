import { z } from "zod";

export const eventParamsSchema = z.object({
  id: z.string().min(1),
});

export const createEventSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateEventSchema = createEventSchema.partial();

export const eventResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
