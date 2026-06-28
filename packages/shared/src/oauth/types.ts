/**
 * Base interface for OAuth providers
 * All OAuth providers must implement this interface
 */
export interface OAuthProvider {
  /**
   * Get the provider name (e.g., "google", "github", "discord")
   */
  getName(): string;

  /**
   * Generate the OAuth authorization URL
   * @param state - CSRF protection state token
   * @returns The authorization URL
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for access token
   * @param code - Authorization code from callback
   * @returns Token response with access_token, refresh_token, etc.
   */
  exchangeCodeForToken(code: string): Promise<OAuthTokenResponse>;

  /**
   * Refresh an expired access token using refresh token
   * @param refreshToken - Refresh token from previous token exchange
   * @returns New token response
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>;

  /**
   * Get user information using access token
   * @param accessToken - OAuth access token
   * @returns User information from provider
   */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Get default scopes for this provider
   */
  getDefaultScopes(): string[];

  /**
   * Get the token endpoint URL
   */
  getTokenEndpoint(): string;

  /**
   * Get the user info endpoint URL
   */
  getUserInfoEndpoint(): string;
}

/**
 * Standard OAuth token response structure
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // Token lifetime in seconds
  token_type?: string;
  scope?: string;
  /** OIDC id_token — returned by Apple and other OIDC providers */
  id_token?: string;
}

/**
 * Standard OAuth user information structure
 */
export interface OAuthUserInfo {
  id: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  [key: string]: unknown; // Allow provider-specific fields
}

/**
 * OAuth provider factory interface
 */
export interface OAuthProviderFactory {
  getProvider(provider: string): OAuthProvider;
  hasProvider(provider: string): boolean;
  getRegisteredProviders(): string[];
}
