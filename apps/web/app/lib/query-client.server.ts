import { cache } from "react";

import { makeQueryClient } from "./query-client";

/** One client per request, shared by the layout, the page and generateMetadata. */
export const getServerQueryClient = cache(makeQueryClient);
