/** Poll active reminders every 60s — matches the server-side alarm scheduler's own
 *  cadence (server/src/jobs/reminderScheduler.js), so polling faster client-side
 *  can never surface anything sooner than the source of truth actually updates. */
export const REMINDER_POLL_MS = 60 * 1000;

/**
 * Stable RTK Query options for the single shared polling subscriber. Every
 * consumer of live reminder data (watchdog, sidebar badge) must use these exact
 * options via useRemindersFeed() — identical query args + options is what lets
 * RTK Query dedupe them into ONE network poll instead of one per consumer.
 */
export const REMINDER_POLL_OPTIONS = {
  pollingInterval: REMINDER_POLL_MS,
  refetchOnFocus: false,
  refetchOnReconnect: false,
} as const;
