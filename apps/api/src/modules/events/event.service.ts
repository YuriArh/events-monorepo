import type { UserRole } from "@repo/db";

import { deleteUpload } from "../../lib/uploads.js";
import { eventRepository } from "./event.repository.js";
import type { CreateEventInput, UpdateEventInput } from "./event.types.js";

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Event with id "${id}" not found`);
    this.name = "EventNotFoundError";
  }
}

export class InvalidEventDateRangeError extends Error {
  constructor() {
    super("endsAt must be after startsAt");
    this.name = "InvalidEventDateRangeError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("You can only change events you organize");
    this.name = "ForbiddenError";
  }
}

type Actor = { id: string; role: UserRole };

/**
 * The organizer or an admin. Ownerless events (created before accounts
 * existed) are admin-only. Kept here, not in routes, so no route can skip it.
 */
export const canModify = (event: { organizerId: string | null }, actor: Actor) =>
  actor.role === "ADMIN" || (event.organizerId !== null && event.organizerId === actor.id);

const assertCanModify = (event: { organizerId: string | null }, actor: Actor) => {
  if (!canModify(event, actor)) throw new ForbiddenError();
};

/**
 * Both dates are optional, so there is only something to compare when each is
 * present; an endsAt on its own is left alone.
 */
const assertDateRange = (startsAt: Date | null | undefined, endsAt: Date | null | undefined) => {
  if (!startsAt || !endsAt) return;

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidEventDateRangeError();
  }
};

/** A PATCH omits fields it doesn't change, and `null` means "clear it" — so an
 *  absent key falls back to the stored value while an explicit null does not. */
const merge = <T>(input: T | null | undefined, existing: T | null) =>
  input === undefined ? existing : input;

export const eventService = {
  list() {
    return eventRepository.findMany();
  },

  async getById(id: string) {
    const event = await eventRepository.findById(id);

    if (!event) {
      throw new EventNotFoundError(id);
    }

    return event;
  },

  async create(input: CreateEventInput, actor: Actor) {
    assertDateRange(input.startsAt, input.endsAt);

    return eventRepository.create(input, actor.id);
  },

  async update(id: string, input: UpdateEventInput, actor: Actor) {
    const existing = await this.getById(id);
    assertCanModify(existing, actor);

    // Checked against the merged result: a payload carrying only one of the two
    // dates can still be invalid once combined with what is already stored.
    assertDateRange(merge(input.startsAt, existing.startsAt), merge(input.endsAt, existing.endsAt));

    const updated = await eventRepository.update(id, input, existing.addressId !== null);

    if (
      input.imageKey !== undefined &&
      existing.imageKey &&
      existing.imageKey !== input.imageKey
    ) {
      await deleteUpload(existing.imageKey);
    }

    return updated;
  },

  async remove(id: string, actor: Actor) {
    const existing = await this.getById(id);
    assertCanModify(existing, actor);

    await eventRepository.delete(id, existing.addressId);
    await deleteUpload(existing.imageKey);
  },
};
