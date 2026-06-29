import { createRouter, authRateLimiter } from "@repo/shared";
import { getOauthProviderRoute, getOauthHandler } from "./handlers/get-oauth.handler";
import {
  getOauthCallbackRoute,
  getOauthCallbackHandler,
} from "./handlers/get-oauth-callback.handler";
import {
  postOauthAppleCallbackRoute,
  postOauthAppleCallbackHandler,
} from "./handlers/post-oauth-apple-callback.handler";
import {
  postRefreshTokenRoute,
  postRefreshTokenHandler,
} from "./handlers/post-refresh-token.handler";
import { type AppBindings } from "../../types";
import { getMeHandler, getMeRoute } from "./handlers/get-me.handler";
import { getLogoutHandler, getLogoutRoute } from "./handlers/get-logout.handler";

const authRoutes = createRouter<AppBindings>();

// Apply auth-specific rate limiting
authRoutes.use(authRateLimiter);

// Register routes - each handler defines its own OpenAPI schema
authRoutes.openapi(getOauthProviderRoute, getOauthHandler);
authRoutes.openapi(getOauthCallbackRoute, getOauthCallbackHandler);
authRoutes.openapi(postOauthAppleCallbackRoute, postOauthAppleCallbackHandler);
authRoutes.openapi(postRefreshTokenRoute, postRefreshTokenHandler);
authRoutes.openapi(getMeRoute, getMeHandler);
authRoutes.openapi(getLogoutRoute, getLogoutHandler);

export default authRoutes;
