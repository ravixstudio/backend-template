import { verifyJwt, signJwt, logger } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "@repo/config";
import { OAuthService } from "../services";
import { oauthProviderFactory } from "../providers";
import { type SessionProvider } from "@repo/db";
import { env } from "@/env";
import { type AppBindings } from "@/types";
import { type Context } from "hono";
import { OAUTH_SESSION_TICKET_PURPOSE } from "./get-oauth-session-establish.handler";

function getApiOrigin(): string {
  return new URL(env.GOOGLE_REDIRECT_URI).origin;
}

export interface OauthCallbackParams {
  provider: SessionProvider;
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  /** Apple form_post: first-time user JSON string */
  user?: string;
  /** Apple form_post: id_token may be included in callback body */
  id_token?: string;
}

/**
 * Shared OAuth callback processing for GET (query) and POST (form_post) callbacks.
 */
export async function processOauthCallback(
  c: Context<AppBindings>,
  params: OauthCallbackParams,
): Promise<Response> {
  const { provider, code, state, error, error_description, user, id_token } = params;

  if (!oauthProviderFactory.hasProvider(provider)) {
    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "OAuth provider not supported",
      res: c.json({
        message: `OAuth provider "${provider}" is not supported`,
      }),
    });
  }

  if (error) {
    logger.error(`OAuth error received from ${provider}`, {
      module: "auth",
      action: "oauth:callback:error",
      provider,
      error,
      error_description,
      state,
    });

    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "OAuth authorization failed",
      res: c.json({
        message: "OAuth authorization failed",
        error: error_description || error,
      }),
    });
  }

  if (!code) {
    logger.error(`OAuth callback missing authorization code for ${provider}`, {
      module: "auth",
      action: "oauth:callback:missing_code",
      provider,
      state,
    });

    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "Authorization code is required",
      res: c.json({
        message: "Authorization code is required",
      }),
    });
  }

  if (!state) {
    logger.error(`OAuth callback missing state parameter for ${provider}`, {
      module: "auth",
      action: "oauth:callback:missing_state",
      provider,
    });

    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "State parameter is required for security",
      res: c.json({
        message: "State parameter is required for security",
      }),
    });
  }

  const decodedState = verifyJwt(state, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as { state: string; redirect: "true" | "false" };

  if (!decodedState.state) {
    logger.error("Invalid state token structure", {
      module: "auth",
      action: "oauth:callback:invalid_state_structure",
      provider,
    });

    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "Invalid state parameter",
      res: c.json({
        message: "Invalid state parameter",
      }),
    });
  }

  try {
    const ipAddress =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");

    const result = await OAuthService.handleCallback(provider, code, {
      callbackData: { user, idToken: id_token },
      metadata: {
        ...(ipAddress && { ipAddress }),
      },
    });

    const { user: authUser, session } = result;

    logger.audit(`User authenticated via ${provider} OAuth`, {
      module: "auth",
      action: "oauth:authentication:success",
      provider,
      userId: authUser.id,
      email: authUser.email,
      providerAccountId: authUser.providerAccountId,
      sessionId: session.id,
    });

    const serverAccessToken = signJwt(
      { userId: authUser.id, sessionId: session.id },
      env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const serverRefreshToken = signJwt(
      { userId: authUser.id, sessionId: session.id },
      env.JWT_SECRET,
      { expiresIn: "90d" },
    );

    if (decodedState.redirect === "false") {
      return c.json({
        message: "Logged in successfully",
        payload: {
          accessToken: serverAccessToken,
          refreshToken: serverRefreshToken,
        },
      });
    }

    const sessionTicket = signJwt(
      {
        accessToken: serverAccessToken,
        refreshToken: serverRefreshToken,
        purpose: OAUTH_SESSION_TICKET_PURPOSE,
      },
      env.JWT_SECRET,
      { expiresIn: "60s" },
    );

    const establishUrl = new URL("/v1/oauth/session/establish", getApiOrigin());
    establishUrl.searchParams.set("ticket", sessionTicket);
    establishUrl.searchParams.set("next", env.FRONTEND_URL);

    return c.redirect(establishUrl.toString());
  } catch (err: unknown) {
    if (err instanceof HTTPException) {
      throw err;
    }

    logger.error(`Unexpected error during OAuth callback for ${provider}`, {
      module: "auth",
      action: "oauth:callback:error",
      provider,
      error: err,
    });

    throw new HTTPException(StatusCodes.HTTP_500_INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
      res: c.json({
        message: "Internal Server Error",
      }),
    });
  }
}
