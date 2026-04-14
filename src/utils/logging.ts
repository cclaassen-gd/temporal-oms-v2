import type { LogLevel } from '@temporalio/common';
import { Context } from '@temporalio/activity';
import { Runtime, DefaultLogger } from '@temporalio/worker';

const level = (process.env.TEMPORAL_LOG_LEVEL as LogLevel) || 'INFO';

/** Logger for the API process, tests, and DB layer (no Worker Runtime). */
export const appLogger = new DefaultLogger(level);

let workerRuntimeInstalled = false;

/**
 * Installs Temporal Runtime with {@link DefaultLogger} and forwards Core (Rust) logs to the same logger.
 * Call once per worker process before creating a {@link Worker}.
 */
export function installWorkerRuntime(): void {
  if (workerRuntimeInstalled) {
    return;
  }
  Runtime.install({
    logger: new DefaultLogger(level),
    telemetryOptions: {
      logging: {
        filter: { core: 'INFO', other: 'WARN' },
        forward: {},
      },
    },
  });
  workerRuntimeInstalled = true;
}

/** Logger from Activity context when inside an activity; otherwise {@link appLogger}. */
export function getActivityLogger() {
  try {
    return Context.current().log;
  } catch {
    return appLogger;
  }
}

/** Logger for worker bootstrap (after {@link installWorkerRuntime}). */
export function getRuntimeLogger() {
  return Runtime.instance().logger;
}
