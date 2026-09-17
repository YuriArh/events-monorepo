import { eventRepository } from "./event.repository.js";
import type { CreateEventInput, UpdateEventInput } from "./event.types.js";

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Event with id "${id}" not found`);
    this.name = "EventNotFoundError";
  }
}

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

  create(input: CreateEventInput) {
    return eventRepository.create(input);
  },

  async update(id: string, input: UpdateEventInput) {
    await this.getById(id);

    return eventRepository.update(id, input);
  },

  async remove(id: string) {
    await this.getById(id);

    await eventRepository.delete(id);
  },
};
