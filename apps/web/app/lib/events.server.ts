import { cache } from "react";

import { serverRequest } from "./api.server";
import { fetchEvent } from "./queries";

/**
 * Server-side read of a public event. `cache` makes the page and
 * generateMetadata share one request per render. Not cached across requests —
 * edits must show immediately.
 */
export const getEvent = cache((id: string) => fetchEvent(id, serverRequest));
