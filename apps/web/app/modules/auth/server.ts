/** Server-only public API of the auth module (imports next/headers): never import it from a client component. */
export { getMe } from "./model/session.server";
