/**
 * The schemas live in @repo/contracts so the web app validates against the same
 * rules. The API uses the Date-coercing variants; the names below are kept so
 * the module's routes and types are unchanged.
 */
export {
  createEventPayload as createEventSchema,
  eventParamsSchema,
  updateEventPayload as updateEventSchema,
} from "@repo/contracts";
