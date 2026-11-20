import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/core/logger.js';

describe('Logger machine output and fatal handling', () => {
  let logger;
  let log;
  let error;
  let exit;

  beforeEach(() => {
    logger = new Logger();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes human output to stdout by default', () => {
    logger.printInfo('hello');
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('moves every human message to stderr in machine mode', () => {
    logger.setVerbose(true);
    logger.setMachineOutput(true);

    logger.printInfo('info');
    logger.printSuccess('success');
    logger.printStatus('status');
    logger.print('plain');
    logger.printVerbose('verbose');
    logger.printVerboseList('list', ['a']);

    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(7);
  });

  it('exits on a fatal error by default', () => {
    logger.handleError(new Error('boom'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps running after a fatal error when exiting is turned off', () => {
    logger.setExitOnFatal(false);
    logger.handleError(new Error('boom'));
    expect(error).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
