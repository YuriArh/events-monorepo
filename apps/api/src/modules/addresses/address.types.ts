import type { Address } from "@repo/db";
import type { z } from "zod";

import type { createAddressSchema, updateAddressSchema } from "./address.schema.js";

export type AddressDTO = Address;

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
