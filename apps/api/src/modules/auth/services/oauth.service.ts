import {
  SessionService,
  UsersService,
  db,
  type DBTransaction,
  type SessionProvider,
  SessionStatus,
} from "@repo/db";
import { encrypt, logger, type OAuthProvider } from "@repo/shared";
import { oauthProviderFactory } from "../providers";
import { oauthEventsCounter } from "../auth.metrics";
import { env } from "@/env";

export interface OAuthCallbackResult {
  user: Awaited<ReturnType<typeof UsersService.create>>;
  session: Awaited<ReturnType<typeof SessionService.create>>;
}

/**
 * Execute OAuth callback transaction logic
 */
async function executeOAuthCallbackTransaction(
  provider: SessionProvider,
  tokenResponse: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    scope?: string;
  },
  userInfo: {
    id: string;
    email: string;
    given_name?: string;
    family_name?: string;
    name?: string;
    picture?: string;
  },
  oauthProvider: OAuthProvider,
  tx: DBTransaction,
): Promise<OAuthCallbackResult> {
  // Handle missing name fields
  const firstName = userInfo.given_name || userInfo.name?.split(" ")[0] || "User";
  const lastName = userInfo.family_name || userInfo.name?.split(" ").slice(1).join(" ") || "";

  // Create or update user
  const user = await UsersService.upsertByProviderAccountId(
    {
      email: userInfo.email,
      firstName,
      lastName,
      avatar: userInfo.picture || null,
      providerAccountId: userInfo.id,
    },
    { tx },
  );

  // Encrypt tokens
  const {
    data: encryptedAccessToken,
    iv: accessTokenIv,
    tag: accessTokenTag,
  } = encrypt(tokenResponse.access_token, env.ENCRYPTION_KEY);

  const {
    data: encryptedRefreshToken,
    iv: refreshTokenIv,
    tag: refreshTokenTag,
  } = encrypt(tokenResponse.refresh_token, env.ENCRYPTION_KEY);

  // Calculate token expirations
  const accessTokenExpiresIn = tokenResponse.expires_in || 3600; // Default 1 hour
  const accessTokenExpiresAt = new Date(Date.now() + accessTokenExpiresIn * 1000);
  const refreshTokenExpiresIn = 90 * 24 * 60 * 60; // 90 days
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresIn * 1000);
  const sessionExpiresAt = new Date(Date.now() + refreshTokenExpiresIn * 1000); // 90 days

  // Create session with tokens
  const session = await SessionService.create(
    {
      userId: user.id,
      status: SessionStatus.ACTIVE,
      provider,
      providerAccessToken: encryptedAccessToken,
      providerAccessTokenIv: accessTokenIv,
      providerAccessTokenTag: accessTokenTag,
      providerAccessTokenExpiresAt: accessTokenExpiresAt,
      providerRefreshToken: encryptedRefreshToken,
      providerRefreshTokenIv: refreshTokenIv,
      providerRefreshTokenTag: refreshTokenTag,
      providerScope: tokenResponse.scope || oauthProvider.getDefaultScopes().join(" "),
      providerRefreshTokenExpiresAt: refreshTokenExpiresAt,
      providerAccountId: user.providerAccountId,
      expiresAt: sessionExpiresAt,
      lastAccessedAt: new Date(),
      metadata: {},
    },
    { tx },
  );

  return { user, session };
}

export namespace OAuthService {
  /**
   * Handle OAuth callback flow
   * @param provider - The OAuth provider (e.g., SessionProvider.GOOGLE)
   * @param code - Authorization code from OAuth provider
   * @param options - Optional database transaction
   * @returns User and session created/updated
   */
  export async function handleCallback(
    provider: SessionProvider,
    code: string,
    options?: {
      tx?: DBTransaction;
    },
  ): Promise<OAuthCallbackResult> {
    const oauthProvider = oauthProviderFactory.getProvider(provider);

    try {
      // Exchange code for tokens
      const tokenResponse = await oauthProvider.exchangeCodeForToken(code);

      if (!tokenResponse.access_token) {
        throw new Error("Token response missing access_token");
      }

      if (!tokenResponse.refresh_token) {
        logger.warn(`OAuth provider ${provider} response missing refresh token`, {
          module: "auth",
          action: "oauth:callback:missing_refresh_token",
          provider,
        });
        throw new Error("Refresh token is required for session creation");
      }

      // Get user info using access token
      let userInfo = await oauthProvider.getUserInfo(tokenResponse.access_token);

      // Validate required id field
      if (!userInfo.id) {
        throw new Error("User info missing required field (id)");
      }

      // At this point we know refresh_token exists, so we can assert it
      const tokenResponseWithRefresh = {
        ...tokenResponse,
        refresh_token: tokenResponse.refresh_token,
      };

      const runCallback = async (tx: DBTransaction) => {
        // Apple (and similar providers) may omit email on repeat sign-ins
        if (!userInfo.email) {
          const existingUser = await UsersService.findByProviderAccountId(userInfo.id, { tx });

          if (!existingUser?.email) {
            throw new Error("User info missing required fields (id, email)");
          }

          userInfo = { ...userInfo, email: existingUser.email };
        }

        return executeOAuthCallbackTransaction(
          provider,
          tokenResponseWithRefresh,
          userInfo,
          oauthProvider,
          tx,
        );
      };

      // Use transaction if provided, otherwise start a new one
      if (options?.tx) {
        return await runCallback(options.tx);
      }

      return await db.transaction(async (tx) => {
        const result = await runCallback(tx);

        // Track successful OAuth login
        oauthEventsCounter.inc({ provider, event_type: "login:success" });

        return result;
      });
    } catch (err) {
      // Track OAuth errors
      oauthEventsCounter.inc({ provider, event_type: "login:error" });

      logger.error(`Error handling OAuth callback for provider ${provider}`, {
        module: "auth",
        action: "oauth:callback:error",
        provider,
        error: err as Error,
      });
      throw err;
    }
  }

  /**
   * Generate OAuth authorization URL
   * @param provider - The OAuth provider
   * @param state - CSRF protection state token
   * @returns Authorization URL
   */
  export function getAuthorizationUrl(provider: SessionProvider, state: string): string {
    const oauthProvider = oauthProviderFactory.getProvider(provider);
    return oauthProvider.getAuthorizationUrl(state);
  }
}
