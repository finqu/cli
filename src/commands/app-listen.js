/**
 * App listen command for Finqu CLI.
 * Connects to realtime webhook websocket and forwards events to localhost.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

const DEFAULT_LOCAL_URL = 'http://localhost:3000/webhooks';

function normalizeTopics(topics) {
  if (!topics) {
    return [];
  }

  if (!Array.isArray(topics)) {
    return String(topics)
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean);
  }

  return topics
    .flatMap((topic) => String(topic).split(','))
    .map((topic) => topic.trim())
    .filter(Boolean);
}

export class AppListenCommand extends BaseCommand {
  get name() {
    return 'listen';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'listen';
  }

  get description() {
    return 'Listen for app webhook events and forward to localhost';
  }

  get options() {
    return [
      {
        flags: '--url <url>',
        description: 'Local webhook receiver URL',
        defaultValue: DEFAULT_LOCAL_URL,
      },
      {
        flags: '--realtime-url <url>',
        description: 'Realtime websocket URL override',
      },
      {
        flags: '--topic <topics...>',
        description: 'Only forward matching topics (space or comma separated)',
      },
    ];
  }

  async execute(options = {}) {
    this.logger.printStatus('Starting app webhook listener...');

    const stopController = new AbortController();
    const onSignal = () => {
      this.logger.printInfo(
        'Shutdown signal received. Closing webhook listener...',
      );
      stopController.abort();
    };

    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    try {
      const tokenManager = this.app.services.tokenManager;
      const profileService = this.app.services.profile;
      const listener = this.app.services.appWebhookListener;

      if (!tokenManager.hasAccessToken()) {
        throw AppError.authError('Not signed in. Run "finqu sign-in" first.');
      }

      const accessToken = await tokenManager.ensureValidToken();

      let profile = null;
      try {
        profile = await profileService.getProfile();
      } catch (profileError) {
        this.logger.printVerbose(
          'Unable to read profile for realtime endpoint discovery.',
          profileError,
        );
      }

      const realtimeUrl = listener.resolveRealtimeUrl({
        explicitRealtimeUrl: options.realtimeUrl,
        profile,
      });

      if (!realtimeUrl) {
        throw AppError.configError(
          'Realtime websocket URL could not be resolved. Pass --realtime-url to set it.',
        );
      }

      await this.config.saveConfigValue('appRealtimeUrl', realtimeUrl);

      const localUrl = options.url || DEFAULT_LOCAL_URL;
      const topics = normalizeTopics(options.topic);

      this.logger.printStatus(`Forwarding webhook events to ${localUrl}`);
      if (topics.length > 0) {
        this.logger.printInfo(`Topic filter enabled: ${topics.join(', ')}`);
      }

      await listener.listen({
        realtimeUrl,
        accessToken,
        localUrl,
        topics,
        signal: stopController.signal,
      });

      this.logger.printSuccess('Webhook listener stopped.');
      return { success: true };
    } catch (err) {
      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }

      this.logger.handleError(err);
      return { success: false, error: err };
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
  }
}

export function createAppListenCommand(app) {
  return new AppListenCommand(app);
}
