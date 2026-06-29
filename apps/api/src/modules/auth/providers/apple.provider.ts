import { env } from "@/env";
import { type OAuthProvider, type OAuthTokenResponse, type OAuthUserInfo } from "./base.provider";
import { logger } from "@repo/shared";
import jwt from "jsonwebtoken";
import { createPrivateKey, createPublicKey, type JsonWebKey, type KeyObject } from "crypto";

/**
 * Normalizes an Apple .p8 private key from env (handles quotes, escaped newlines, trailing garbage).
 */
function normalizeApplePrivateKey(raw: string): KeyObject {
  let key = raw.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").replace(/\r/g, "");

  const endMarker = "-----END PRIVATE KEY-----";
  const endIndex = key.indexOf(endMarker);
  if (endIndex !== -1) {
    key = key.slice(0, endIndex + endMarker.length);
  }

  if (!key.includes("\n") && key.includes("-----BEGIN PRIVATE KEY-----")) {
    key = key
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");
  }

  return createPrivateKey({ key, format: "pem" });
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface AppleJwksResponse {
  keys: AppleJwk[];
}

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

interface AppleFirstTimeUser {
  name?: {
    firstName?: string;
    lastName?: string;
  };
  email?: string;
}

/**
 * Apple Sign In OAuth provider.
 *
 * Apple-specific behavior:
 * - Client secret is an ES256 JWT signed with the .p8 private key (not a static string)
 * - User info comes from the id_token in the token response (no userinfo REST endpoint)
 * - The `user` JSON blob with name/email is only sent on the first authorization (form_post callback body)
 * - Email may be absent from id_token on subsequent sign-ins
 * - Requires response_mode=form_post when name/email scopes are requested
 */
export class AppleOAuthProvider implements OAuthProvider {
  private readonly clientId: string;
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly redirectUri: string;
  private readonly defaultScopes: string[];

  /** Cached from token exchange for use in getUserInfo within the same request */
  private idToken?: string;
  private firstTimeUser?: AppleFirstTimeUser;

  constructor() {
    this.clientId = stripEnvQuotes(env.APPLE_CLIENT_ID);
    this.teamId = stripEnvQuotes(env.APPLE_TEAM_ID);
    this.keyId = stripEnvQuotes(env.APPLE_KEY_ID);
    this.privateKey = normalizeApplePrivateKey(env.APPLE_PRIVATE_KEY);
    this.redirectUri = env.APPLE_REDIRECT_URI;
    this.defaultScopes = ["name", "email"];
  }

  getName(): string {
    return "apple";
  }

  getDefaultScopes(): string[] {
    return this.defaultScopes;
  }

  getTokenEndpoint(): string {
    return "https://appleid.apple.com/auth/token";
  }

  /**
   * Apple has no userinfo REST endpoint; user data is extracted from id_token.
   * Returns the JWKS URL used for id_token signature verification.
   */
  getUserInfoEndpoint(): string {
    return "https://appleid.apple.com/auth/keys";
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: this.defaultScopes.join(" "),
      response_mode: "form_post",
      state,
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  /**
   * Receives first-time user data and id_token from Apple's form_post callback body.
   */
  setCallbackData(data: { user?: string; idToken?: string }): void {
    if (data.idToken) {
      this.idToken = data.idToken;
    }

    if (data.user) {
      try {
        this.firstTimeUser = JSON.parse(data.user) as AppleFirstTimeUser;
      } catch {
        logger.warn("Failed to parse Apple first-time user payload from callback", {
          module: "auth",
          action: "oauth:apple:parse_user",
        });
      }
    }
  }

  /**
   * Generates a client secret JWT for Apple token requests.
   * Apple requires ES256-signed JWTs with a max expiry of 6 months.
   */
  private generateClientSecret(): string {
    return jwt.sign({}, this.privateKey, {
      algorithm: "ES256",
      expiresIn: "180d",
      audience: "https://appleid.apple.com",
      issuer: this.teamId,
      subject: this.clientId,
      keyid: this.keyId,
    });
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(this.getTokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.generateClientSecret(),
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: string;
          error_description?: string;
        };

        logger.error("Failed to exchange Apple OAuth code for token", {
          module: "auth",
          action: "oauth:apple:exchange_code",
          status: response.status,
          error: errorData.error,
          error_description: errorData.error_description,
        });

        throw new Error(
          `Token exchange failed: ${errorData.error_description || errorData.error || "Unknown error"}`,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse & {
        id_token?: string;
        user?: string;
      };

      if (!tokenData.access_token) {
        throw new Error("Token response missing access_token");
      }

      if (tokenData.id_token) {
        this.idToken = tokenData.id_token;
      }

      if (tokenData.user) {
        try {
          this.firstTimeUser = JSON.parse(tokenData.user) as AppleFirstTimeUser;
        } catch {
          logger.warn("Failed to parse Apple first-time user payload", {
            module: "auth",
            action: "oauth:apple:parse_user",
          });
        }
      }

      return tokenData;
    } catch (err) {
      logger.error("Error exchanging Apple OAuth code", {
        module: "auth",
        action: "oauth:apple:exchange_code",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(this.getTokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.generateClientSecret(),
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: string;
          error_description?: string;
        };

        logger.error("Failed to refresh Apple OAuth token", {
          module: "auth",
          action: "oauth:apple:refresh_token",
          status: response.status,
          error: errorData.error,
          error_description: errorData.error_description,
        });

        throw new Error(
          `Token refresh failed: ${errorData.error_description || errorData.error || "Unknown error"}`,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse;

      if (!tokenData.access_token) {
        throw new Error("Token response missing access_token");
      }

      return tokenData;
    } catch (err) {
      logger.error("Error refreshing Apple OAuth token", {
        module: "auth",
        action: "oauth:apple:refresh_token",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getUserInfo(_accessToken: string): Promise<OAuthUserInfo> {
    try {
      if (!this.idToken) {
        throw new Error("Apple id_token not available — exchangeCodeForToken must be called first");
      }

      const payload = await this.verifyIdToken(this.idToken);

      const email = payload.email ?? this.firstTimeUser?.email;
      const givenName = this.firstTimeUser?.name?.firstName;
      const familyName = this.firstTimeUser?.name?.lastName;

      if (!payload.sub) {
        throw new Error("Apple id_token missing required sub claim");
      }

      return {
        id: payload.sub,
        email: email ?? "",
        email_verified: payload.email_verified === true || payload.email_verified === "true",
        given_name: givenName,
        family_name: familyName,
        name: givenName && familyName ? `${givenName} ${familyName}` : givenName,
      };
    } catch (err) {
      logger.error("Error fetching Apple user info", {
        module: "auth",
        action: "oauth:apple:get_user_info",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async verifyIdToken(idToken: string): Promise<AppleIdTokenPayload> {
    const decoded = jwt.decode(idToken, { complete: true });

    if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
      throw new Error("Invalid Apple id_token structure");
    }

    const jwksResponse = await fetch(this.getUserInfoEndpoint());

    if (!jwksResponse.ok) {
      throw new Error("Failed to fetch Apple JWKS for id_token verification");
    }

    const jwks = (await jwksResponse.json()) as AppleJwksResponse;
    const jwk = jwks.keys.find((key) => key.kid === decoded.header.kid);

    if (!jwk) {
      throw new Error("No matching Apple JWKS key found for id_token");
    }

    const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }).export({
      type: "spki",
      format: "pem",
    }) as string;

    return jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      audience: this.clientId,
    }) as AppleIdTokenPayload;
  }
}
