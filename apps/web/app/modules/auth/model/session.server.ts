import { serverRequest } from "@/shared/api/request.server";
import { meQuery } from "./queries";
import { getServerQueryClient } from "@/shared/query/query-client.server";

/** The visitor, or null. Deduplicated with the layout's prefetch. */
export const getMe = () => getServerQueryClient().query(meQuery(serverRequest));
