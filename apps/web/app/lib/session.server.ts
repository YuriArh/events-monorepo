import { serverRequest } from "./api.server";
import { meQuery } from "./queries";
import { getServerQueryClient } from "./query-client.server";

/** The visitor, or null. Deduplicated with the layout's prefetch. */
export const getMe = () => getServerQueryClient().fetchQuery(meQuery(serverRequest));
