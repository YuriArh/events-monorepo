import { addressRepository } from "./address.repository.js";
import type { CreateAddressInput, UpdateAddressInput } from "./address.types.js";

export class AddressNotFoundError extends Error {
  constructor(id: string) {
    super(`Address with id "${id}" not found`);
    this.name = "AddressNotFoundError";
  }
}

export const addressService = {
  list() {
    return addressRepository.findMany();
  },

  async getById(id: string) {
    const address = await addressRepository.findById(id);

    if (!address) {
      throw new AddressNotFoundError(id);
    }

    return address;
  },

  create(input: CreateAddressInput) {
    return addressRepository.create(input);
  },

  async update(id: string, input: UpdateAddressInput) {
    await this.getById(id);

    return addressRepository.update(id, input);
  },

  // The linked event is detached rather than deleted; the SET NULL foreign
  // key in the schema does that for us.
  async remove(id: string) {
    await this.getById(id);

    await addressRepository.delete(id);
  },
};
