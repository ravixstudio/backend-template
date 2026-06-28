import { SessionProvider } from "@repo/db";
import { type OAuthProvider, type OAuthProviderFactory } from "@repo/shared";
import { AppleOAuthProvider } from "./apple.provider";
import { GoogleOAuthProvider } from "./google.provider";

/**
 * Provider factory - creates OAuth provider instances
 * Implements OAuthProviderFactory interface from @repo/shared
 */
class OAuthProviderFactoryImpl implements OAuthProviderFactory {
  private providers: Map<SessionProvider, () => OAuthProvider> = new Map();

  constructor() {
    // Register all OAuth providers
    this.register(SessionProvider.GOOGLE, () => new GoogleOAuthProvider());
    this.register(SessionProvider.APPLE, () => new AppleOAuthProvider());
    // Add more providers here:
    // this.register(SessionProvider.GITHUB, () => new GitHubOAuthProvider());
    // this.register(SessionProvider.DISCORD, () => new DiscordOAuthProvider());
  }

  /**
   * Register a new OAuth provider
   */
  register(provider: SessionProvider, factory: () => OAuthProvider): void {
    this.providers.set(provider, factory);
  }

  /**
   * Get an OAuth provider instance by provider name
   */
  getProvider(provider: string): OAuthProvider {
    const factory = this.providers.get(provider as SessionProvider);

    if (!factory) {
      throw new Error(`OAuth provider "${provider}" is not registered`);
    }

    return factory();
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(provider: SessionProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get all registered providers
   */
  getRegisteredProviders(): SessionProvider[] {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
export const oauthProviderFactory: OAuthProviderFactory = new OAuthProviderFactoryImpl();

// Export types from shared
export type {
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
  OAuthProviderFactory,
} from "@repo/shared";
export { AppleOAuthProvider } from "./apple.provider";
export { GoogleOAuthProvider } from "./google.provider";
