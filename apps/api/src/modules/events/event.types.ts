import type { Event } from "@repo/db";
import type { z } from "@repo/contracts";

import type {
  createEventSchema,
  eventParamsSchema,
  updateEventSchema,
} from "./event.schema.js";

export type EventDTO = Event;

export type EventParams = z.infer<typeof eventParamsSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
