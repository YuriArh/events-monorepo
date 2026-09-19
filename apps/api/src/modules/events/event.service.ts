import { deleteUpload } from "../../lib/uploads.js";
import { addressRepository } from "../addresses/address.repository.js";
import { eventRepository } from "./event.repository.js";
import type { CreateEventInput, UpdateEventInput } from "./event.types.js";

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Event with id "${id}" not found`);
    this.name = "EventNotFoundError";
  }
}

/** The payload referenced a venue that does not exist — a bad request, not a 404. */
export class UnknownAddressError extends Error {
  constructor(id: string) {
    super(`Address with id "${id}" does not exist`);
    this.name = "UnknownAddressError";
  }
}

export class InvalidEventDateRangeError extends Error {
  constructor() {
    super("endsAt must be after startsAt");
    this.name = "InvalidEventDateRangeError";
  }
}

/**
 * Checked up front so a bad reference is a clear 400 rather than the raw
 * foreign-key violation Prisma would otherwise throw.
 */
const assertAddressExists = async (addressId: string | null | undefined) => {
  if (!addressId) return;

  if (!(await addressRepository.findById(addressId))) {
    throw new UnknownAddressError(addressId);
  }
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

  async create(input: CreateEventInput) {
    assertDateRange(input.startsAt, input.endsAt);
    await assertAddressExists(input.addressId);

    return eventRepository.create(input);
  },

  async update(id: string, input: UpdateEventInput) {
    const existing = await this.getById(id);

    // Checked against the merged result: a payload carrying only one of the two
    // dates can still be invalid once combined with what is already stored.
    assertDateRange(merge(input.startsAt, existing.startsAt), merge(input.endsAt, existing.endsAt));
    await assertAddressExists(input.addressId);

    const updated = await eventRepository.update(id, input);

    if (
      input.imageKey !== undefined &&
      existing.imageKey &&
      existing.imageKey !== input.imageKey
    ) {
      await deleteUpload(existing.imageKey);
    }

    return updated;
  },

  async remove(id: string) {
    const existing = await this.getById(id);

    await eventRepository.delete(id);
    await deleteUpload(existing.imageKey);
  },
};
