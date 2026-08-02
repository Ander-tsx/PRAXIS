export * from "./constants.mjs";
export { BACKEND_SERVICES } from "./services_backend.mjs";
export { FRONTEND_APPS } from "./services_frontend.mjs";

import { BACKEND_SERVICES } from "./services_backend.mjs";
import { FRONTEND_APPS } from "./services_frontend.mjs";

export const ALL_SERVICES = [...BACKEND_SERVICES, ...FRONTEND_APPS];
