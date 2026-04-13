/**
 * App replay command for Finqu CLI.
 * Replays or lists buffered webhook events from the current listener session.
 */
import { BaseCommand } from './base.js';

const DEFAULT_LOCAL_URL = 'http://localhost:3000';

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

export class AppReplayCommand extends BaseCommand {
  get name() {
    return 'replay';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'replay';
  }

  get description() {
    return 'Replay or list buffered webhook events from the current session';
  }

  get options() {
    return [
      {
        flags: '--url <url>',
        description: 'Local webhook receiver URL',
        defaultValue: DEFAULT_LOCAL_URL,
      },
      {
        flags: '--topic <topics...>',
        description: 'Only replay matching topics (space or comma separated)',
      },
      {
        flags: '--index <number>',
        description: 'Replay a specific event by its index (see --list)',
      },
      {
        flags: '--list',
        description: 'List buffered events without replaying',
      },
    ];
  }

  async execute(options = {}) {
    try {
      const listener = this.app.services.appWebhookListener;
      const topics = normalizeTopics(options.topic);

      if (options.list) {
        return this._listEvents(listener, topics);
      }

      return await this._replayEvents(listener, options, topics);
    } catch (err) {
      this.logger.handleError(err);
      return { success: false, error: err };
    }
  }

  async _listEvents(listener, topics) {
    const events = await listener.getBufferedEvents({ topics });

    if (events.length === 0) {
      this.logger.printInfo('No buffered webhook events.');
      return { success: true, events: [] };
    }

    this.logger.printStatus(`Buffered webhook events (${events.length}):\n`);

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const time = event.receivedAt || '?';
      const path = event.path || '';
      this.logger.printInfo(
        `  [${i + 1}]  ${time}  ${event.topic}${path ? `  ${path}` : ''}`,
      );
    }

    return { success: true, events };
  }

  async _replayEvents(listener, options, topics) {
    const localUrl = options.url || DEFAULT_LOCAL_URL;
    const index = options.index != null ? Number(options.index) : null;

    if (index != null) {
      return this._replaySingleEvent(listener, localUrl, topics, index);
    }

    this.logger.printStatus(`Replaying buffered events to ${localUrl}...`);

    const forwarded = await listener.replayEvents(localUrl, { topics });

    if (forwarded > 0) {
      this.logger.printSuccess(
        `Replayed ${forwarded} event${forwarded !== 1 ? 's' : ''}.`,
      );
    }

    return { success: true, forwarded };
  }
  async _replaySingleEvent(listener, localUrl, topics, index) {
    const events = await listener.getBufferedEvents({ topics });

    if (events.length === 0) {
      this.logger.printInfo('No buffered webhook events.');
      return { success: true, forwarded: 0 };
    }

    if (index < 1 || index > events.length) {
      this.logger.printError(
        `Invalid index ${index}. Use a value between 1 and ${events.length} (see "app replay --list").`,
      );
      return { success: false, forwarded: 0 };
    }

    const event = events[index - 1];
    const targetUrl = event.path
      ? new URL(event.path, localUrl).toString()
      : localUrl;

    await listener.forwardEvent(localUrl, event);
    this.logger.printSuccess(`Replayed ${event.topic} → ${targetUrl}`);

    return { success: true, forwarded: 1 };
  }
}

export function createAppReplayCommand(app) {
  return new AppReplayCommand(app);
}
