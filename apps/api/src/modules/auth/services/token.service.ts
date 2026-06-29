import { SessionService, type DBTransaction, SessionStatus } from "@repo/db";
import { encrypt, decrypt, logger } from "@repo/shared";
import { oauthProviderFactory } from "../providers";
import { env } from "@/env";

export interface TokenRefreshResult {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
}

export namespace TokenService {
  /**
   * Check if access token is expired or about to expire (within 5 minutes)
   * @param session - Session object with token expiration
   * @returns true if token is expired or expiring soon
   */
  export function isAccessTokenExpired(session: { providerAccessTokenExpiresAt: Date }): boolean {
    const now = new Date();
    const expiresAt = new Date(session.providerAccessTokenExpiresAt);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes buffer

    return expiresAt <= fiveMinutesFromNow;
  }

  /**
   * Check if refresh token is expired
   * @param session - Session object with refresh token expiration
   * @returns true if refresh token is expired
   */
  export function isRefreshTokenExpired(session: { providerRefreshTokenExpiresAt: Date }): boolean {
    const now = new Date();
    const expiresAt = new Date(session.providerRefreshTokenExpiresAt);

    return expiresAt <= now;
  }

  /**
   * Refresh access token using refresh token
   * @param sessionId - Session ID
   * @param options - Optional database transaction
   * @returns New access token and expiration
   */
  export async function refreshAccessToken(
    sessionId: string,
    options?: {
      tx?: DBTransaction;
    },
  ): Promise<TokenRefreshResult> {
    const session = await SessionService.findById(sessionId, options);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new Error("Session is not active");
    }

    // Check if refresh token is expired
    if (isRefreshTokenExpired(session)) {
      // Mark session as expired
      await SessionService.updateById(sessionId, { status: SessionStatus.EXPIRED }, options);

      logger.warn("Refresh token expired, session marked as expired", {
        module: "auth",
        action: "token:refresh:expired",
        sessionId,
      });

      throw new Error("Refresh token expired. Please re-authenticate.");
    }

    try {
      // Decrypt refresh token
      const refreshToken = decrypt(
        session.providerRefreshToken,
        session.providerRefreshTokenIv,
        session.providerRefreshTokenTag,
        env.ENCRYPTION_KEY,
      );

      // Get OAuth provider
      const oauthProvider = oauthProviderFactory.getProvider(session.provider);

      // Refresh access token
      const tokenResponse = await oauthProvider.refreshAccessToken(refreshToken);

      if (!tokenResponse.access_token) {
        throw new Error("Token refresh response missing access_token");
      }

      // Encrypt new access token
      const {
        data: encryptedAccessToken,
        iv: accessTokenIv,
        tag: accessTokenTag,
      } = encrypt(tokenResponse.access_token, env.ENCRYPTION_KEY);

      // Calculate new expiration
      const accessTokenExpiresIn = tokenResponse.expires_in || 3600; // Default 1 hour
      const accessTokenExpiresAt = new Date(Date.now() + accessTokenExpiresIn * 1000);

      // Build update payload
      const updatePayload: Parameters<typeof SessionService.updateById>[1] = {
        providerAccessToken: encryptedAccessToken,
        providerAccessTokenIv: accessTokenIv,
        providerAccessTokenTag: accessTokenTag,
        providerAccessTokenExpiresAt: accessTokenExpiresAt,
        lastAccessedAt: new Date(),
        // Update scope if provided
        ...(tokenResponse.scope && { providerScope: tokenResponse.scope }),
      };

      // Update refresh token if provider returned a new one
      if (tokenResponse.refresh_token) {
        const {
          data: encryptedRefreshToken,
          iv: refreshTokenIv,
          tag: refreshTokenTag,
        } = encrypt(tokenResponse.refresh_token, env.ENCRYPTION_KEY);

        const refreshTokenExpiresAt = new Date(
          Date.now() + (tokenResponse.expires_in || 90 * 24 * 60 * 60) * 1000,
        );

        updatePayload.providerRefreshToken = encryptedRefreshToken;
        updatePayload.providerRefreshTokenIv = refreshTokenIv;
        updatePayload.providerRefreshTokenTag = refreshTokenTag;
        updatePayload.providerRefreshTokenExpiresAt = refreshTokenExpiresAt;
      }

      // Update session with new access token
      await SessionService.updateById(sessionId, updatePayload, options);

      logger.audit("Access token refreshed successfully", {
        module: "auth",
        action: "token:refresh:success",
        sessionId,
      });

      return {
        accessToken: tokenResponse.access_token,
        accessTokenExpiresAt,
        refreshToken: tokenResponse.refresh_token,
        refreshTokenExpiresAt: tokenResponse.refresh_token
          ? new Date(Date.now() + (tokenResponse.expires_in || 90 * 24 * 60 * 60) * 1000)
          : undefined,
      };
    } catch (err) {
      logger.error("Error refreshing access token", {
        module: "auth",
        action: "token:refresh:error",
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });

      // Mark session as revoked if refresh failed
      await SessionService.updateById(
        sessionId,
        {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
        },
        options,
      );

      throw err;
    }
  }
}
