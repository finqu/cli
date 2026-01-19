/**
 * Application initialization module for Finqu Theme Kit
 * Provides a clean dependency injection setup for all components
 */
import { createFileSystem } from '../io/fileSystem.js';
import { createHttpClient } from '../services/http.js';
import { createThemeApi } from '../services/themeApi.js';
import { createTokenManager } from '../services/tokenManager.js';
import { createProfileService } from '../services/profileService.js';
import { AppError } from './error.js';

/**
 * Creates a fully configured application instance
 * @param {Object} options Application options
 * @param {ConfigManager} configManager Pre-initialized ConfigManager instance
 * @param {Logger} logger Pre-initialized Logger instance
 * @returns {Object} Application instance with all services
 */
export async function createApp(options = {}, configManager, logger) {
  // Use pre-initialized core dependencies
  const fileSystem = options.fileSystem || createFileSystem();

  // Ensure logger and configManager are provided
  if (!logger) {
    throw new Error('Logger instance must be provided to createApp');
  }
  if (!configManager) {
    throw new Error('ConfigManager instance must be provided to createApp');
  }

  // Create HTTP client with default headers
  const httpClient = createHttpClient({
    defaultHeaders: () => {
      const accessToken =
        configManager.get('accessToken') || configManager.get('access_token');
      return {
        'User-Agent': 'Finqu Theme Kit',
        // Use standard OAuth2 Authorization header format instead of custom header
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      };
    },
    logger: logger,
  });

  // Create profile service first since TokenManager needs it
  const profileService = createProfileService(
    httpClient,
    configManager,
    logger,
  );

  // Create TokenManager with profileService
  const tokenManager = await createTokenManager(
    configManager,
    httpClient,
    logger,
    profileService,
  );

  // Initialize themeApi as null - will be created on demand after sign-in
  let themeApiInstance = null;

  // Return the application instance with all services
  return {
    config: configManager,
    logger: logger,
    fileSystem: fileSystem,
    services: {
      http: httpClient,
      tokenManager: tokenManager,
      profile: profileService,

      // Provide themeApi as a getter function that initializes it lazily
      get themeApi() {
        if (!themeApiInstance) {
          const apiRoot = configManager.get('resourceUrl');

          if (!apiRoot) {
            logger.printError('API root URL not configured');
            throw new AppError(
              'API root URL not configured. Please sign in first with `finqu sign-in`',
            );
          }
          themeApiInstance = createThemeApi(
            httpClient,
            tokenManager,
            logger,
            configManager,
          );
        }
        return themeApiInstance;
      },
    },
  };
}
