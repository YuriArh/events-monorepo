import type { z } from "@repo/contracts";

import type { geocodeQuery as geocodeQuerySchema } from "@repo/contracts";

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
