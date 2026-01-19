/**
 * Token Manager service for Finqu Theme Kit
 * Handles OAuth token management and refreshing
 */
import prompts from 'prompts';
import express from 'express';
import ClientOAuth2 from 'client-oauth2';
import terminator from 'http-terminator';
import open from 'open';
import dotenv from 'dotenv';

/**
 * Token Manager class
 */
export class TokenManager {
  /**
   * Create a new token manager
   * @param {Object} configManager Configuration manager
   * @param {Object} httpClient HTTP client
   * @param {Object} logger Logger instance
   * @param {Object} profileService Profile service (optional)
   */
  constructor(configManager, httpClient, logger, profileService = null) {
    this.configManager = configManager;
    this.httpClient = httpClient;
    this.logger = logger;
    this.profileService = profileService;
  }

  /**
   * Set the profile service
   * @param {Object} profileService Profile service instance
   */
  setProfileService(profileService) {
    this.profileService = profileService;
  }

  hasAccessToken() {
    // Check if access token exists
    const accessToken =
      this.configManager.get('accessToken') ||
      this.configManager.get('access_token');
    return !!accessToken;
  }

  /**
   * Check if the current token is valid
   * @returns {boolean} True if token is valid
   */
  isTokenValid() {
    // Check if token exists
    const accessToken =
      this.configManager.get('accessToken') ||
      this.configManager.get('access_token');
    if (!accessToken) {
      return false;
    }

    // Check expiration
    const expiresAt = this.configManager.get('expiresAt');
    const now = Date.now();

    // Add buffer time (60 seconds)
    const bufferTime = 60 * 1000;

    return expiresAt && now < expiresAt - bufferTime;
  }

  /**
   * Ensure we have a valid token, refreshing if needed
   * @returns {Promise<string>} Valid access token
   */
  async ensureValidToken() {
    // Check if token exists
    const accessToken =
      this.configManager.get('accessToken') ||
      this.configManager.get('access_token');
    if (!accessToken) {
      throw new Error('No access token found. Please sign in first.');
    }

    // If token is still valid, return it
    if (this.isTokenValid()) {
      this.logger.printVerbose('Access token is still valid');
      return accessToken;
    }

    // Otherwise refresh the token
    return this.refreshToken();
  }

  /**
   * Refresh the access token
   * @returns {Promise<string>} New access token
   */
  async refreshToken() {
    this.logger.printVerbose('Refreshing access token...');

    const refreshToken = this.configManager.get('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token found. Please sign in again.');
    }

    const authDomain = this.configManager.get(
      'authDomain',
      'account.finqu.com',
    );

    // For token refresh, we need to prompt for credentials
    this.logger.printInfo(
      'Your access token has expired. Please provide your API credentials again to refresh:',
    );

    let clientId, clientSecret;

    try {
      const response = await prompts(
        [
          {
            type: 'text',
            name: 'apiKey',
            message: 'Client Key',
            validate: (value) =>
              value && value.length === 32
                ? true
                : 'Key must be 32 characters long',
          },
          {
            type: 'password',
            name: 'apiSecret',
            message: 'Client Secret',
            validate: (value) =>
              value && value.length === 32
                ? true
                : 'Secret must be 32 characters long',
          },
        ],
        {
          onCancel: () => {
            this.logger.printError('Token refresh cancelled.');
            process.exit(1);
          },
        },
      );

      clientId = response.apiKey;
      clientSecret = response.apiSecret;
    } catch (err) {
      this.logger.printError(
        'Failed to get credentials for token refresh',
        err,
      );
      throw err;
    }

    const endpoint = `https://${authDomain}/oauth2/access_token`;
    this.logger.printVerbose(`Requesting new token from ${endpoint}`);

    // Custom request for token refresh (not using httpClient to avoid potential auth loop)
    try {
      const response = await new Promise((resolve, reject) => {
        const formData = {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        };

        this.httpClient
          .post(endpoint, null, {
            form: formData,
            json: false,
          })
          .then(resolve)
          .catch(reject);
      });

      const tokenData =
        typeof response === 'string' ? JSON.parse(response) : response;
      const accessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || refreshToken; // Use new one if provided
      const expiresIn = tokenData.expires_in;

      // Calculate absolute expiry timestamp
      const expiresAt = Date.now() + expiresIn * 1000;
      this.logger.printVerbose(
        `New token expires at: ${new Date(expiresAt).toISOString()}`,
      );

      // Save new tokens to configuration
      await this.configManager.saveConfigValue('accessToken', accessToken);
      await this.configManager.saveConfigValue('refreshToken', newRefreshToken);
      await this.configManager.saveConfigValue('expiresAt', expiresAt);

      this.logger.printVerbose('Token refresh successful');
      return accessToken;
    } catch (err) {
      this.logger.printError('Token refresh failed', err);
      throw err;
    }
  }

  /**
   * Initiates OAuth flow to get an access token.
   * @param {string|null} key Optional API key override.
   * @param {string|null} secret Optional API secret override.
   * @param {Object|null} profileService Optional profile service instance
   * @returns {Promise<string>} The obtained access token.
   */
  async getAccessToken(key = null, secret = null, profileService = null) {
    // Use provided profile service or the one set on the instance
    const profileSvc = profileService || this.profileService;

    return new Promise(async (resolve, reject) => {
      // If no keys are provided directly, prompt for them
      let clientId = key;
      let clientSecret = secret;

      if (!clientId || !clientSecret) {
        // Check for env variables but don't rely on them being there
        dotenv.config({ path: process.env.DOTENV_CONFIG_PATH });
        clientId = process.env.FINQU_API_CLIENT_ID;
        clientSecret = process.env.FINQU_API_CLIENT_SECRET;

        // If still no keys, prompt the user
        if (!clientId || !clientSecret) {
          this.logger.printInfo('Please provide your Finqu API credentials:');
          try {
            const response = await prompts(
              [
                {
                  type: 'text',
                  name: 'apiKey',
                  message: 'Client Key',
                  validate: (value) =>
                    value && value.length === 32
                      ? true
                      : 'Key must be 32 characters long',
                },
                {
                  type: 'password',
                  name: 'apiSecret',
                  message: 'Client Secret',
                  validate: (value) =>
                    value && value.length === 32
                      ? true
                      : 'Secret must be 32 characters long',
                },
              ],
              {
                onCancel: () => {
                  this.logger.printError('Authentication cancelled.');
                  process.exit(1);
                },
              },
            );

            if (!response.apiKey || !response.apiSecret) {
              this.logger.printError('Credentials were not provided.');
              process.exit(1);
            }

            clientId = response.apiKey;
            clientSecret = response.apiSecret;
          } catch (err) {
            this.logger.printError('Failed to get credentials', err);
            reject(err);
            return;
          }
        }
      }

      const serverUrl = this.configManager.get('serverUrl', 'localhost:3000');
      const authDomain = this.configManager.get(
        'authDomain',
        'account.finqu.com',
      );

      if (!clientId || !clientSecret) {
        return reject(new Error('API Client ID or Secret is missing.'));
      }

      const oAuthConfig = {
        clientId: clientId,
        clientSecret: clientSecret,
        accessTokenUri: `https://${authDomain}/oauth2/access_token`,
        authorizationUri: `https://${authDomain}/oauth2/authorize`,
        redirectUri: `http://${serverUrl}/callback`,
        scopes: this.configManager.get('scopes', [
          'themes_read',
          'themes_write',
        ]),
      };

      this.logger.printVerbose('Initiating OAuth authorization code flow');
      this.logger.printVerbose('OAuth configuration:', oAuthConfig);

      const app = express();
      const finquAuth = new ClientOAuth2(oAuthConfig);
      let server;
      let httpTerminator;

      app.get('/', (req, res) => {
        const authUri = finquAuth.code.getUri();
        this.logger.printVerbose('Redirecting user to ' + authUri);
        res.redirect(authUri);
      });

      app.get('/callback', async (req, res) => {
        this.logger.printVerbose('Received callback. Fetching access token...');

        try {
          const tokenResponse = await finquAuth.code.getToken(req.originalUrl);
          this.logger.printVerbose('Access token received.');

          const accessToken = tokenResponse.data.access_token;
          const refreshToken = tokenResponse.data.refresh_token;
          const expiresIn = tokenResponse.data.expires_in;

          // Calculate absolute expiry timestamp (current time + expires_in seconds)
          const expiresAt = Date.now() + expiresIn * 1000;
          this.logger.printVerbose(
            `Token expires at: ${new Date(expiresAt).toISOString()}`,
          );

          // Save tokens to configuration file
          this.logger.printStatus('Saving tokens to configuration...');
          await this.configManager.saveConfigValue('accessToken', accessToken);
          await this.configManager.saveConfigValue(
            'refreshToken',
            refreshToken,
          );
          await this.configManager.saveConfigValue('expiresAt', expiresAt);

          // We need to fetch the resource URL from the profile service
          if (profileSvc) {
            try {
              // Apply the new access token to the HTTP client headers for the next request
              // Use the Authorization: Bearer format for the access token
              this.httpClient.defaultHeaders = () => ({
                'User-Agent': 'Finqu Theme Kit',
                Authorization: `Bearer ${accessToken}`,
              });

              // Get the API URL which will also save it to config
              await profileSvc.getAPIUrl();
              this.logger.printVerbose(
                'Resource URL fetched and saved from profile service.',
              );
            } catch (profileErr) {
              this.logger.printError(
                'Warning: Failed to fetch resource URL from profile, API access may fail.',
                profileErr,
              );
            }
          } else {
            this.logger.printVerbose(
              'No profile service available to fetch resource URL.',
            );
          }

          this.logger.printVerbose(
            'Tokens saved. Closing browser and shutting down server.',
          );
          res.send('<script>window.close();</script>');
          if (httpTerminator) {
            await httpTerminator.terminate();
            this.logger.printVerbose('Local callback server shut down.');
          }
          resolve(accessToken);
        } catch (e) {
          this.logger.printError(
            'Failed to obtain access token',
            e.message || e,
          );
          res
            .status(500)
            .send(
              'Error obtaining token. You can close this window.<script>window.close();</script>',
            );
          if (httpTerminator) {
            await httpTerminator.terminate();
          }
          reject(e);
        }
      });

      try {
        const port = serverUrl.split(':')[1] || 3000; // Extract port or default to 3000
        server = app.listen(port, async () => {
          this.logger.printStatus(
            `Starting temporary web server at http://${serverUrl} for OAuth callback.`,
          );
          this.logger.printInfo(
            `Please authorize the application in your browser.`,
          );
          open(`http://${serverUrl}`);
        });

        httpTerminator = terminator.createHttpTerminator({ server });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            this.logger.printError(
              `Port ${port} is already in use. Please free the port or configure a different one using --server-url.`,
            );
          } else {
            this.logger.printError('Failed to start temporary server', err);
          }
          reject(err);
        });
      } catch (err) {
        this.logger.printError('Error setting up OAuth server', err);
        reject(err);
      }
    });
  }
}

/**
 * Factory function to create a TokenManager
 * @param {Object} configManager Configuration manager
 * @param {Object} httpClient HTTP client
 * @param {Object} logger Logger instance
 * @param {Object} profileService Optional profile service instance
 * @returns {TokenManager} A new TokenManager instance
 */
export async function createTokenManager(
  configManager,
  httpClient,
  logger,
  profileService = null,
) {
  const tokenManager = new TokenManager(
    configManager,
    httpClient,
    logger,
    profileService,
  );

  if (tokenManager.hasAccessToken()) {
    await tokenManager.ensureValidToken();
  }

  return tokenManager;
}
