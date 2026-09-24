import type { z } from "@repo/contracts";

import type { geocodeQuerySchema } from "./geocode.schema.js";

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
