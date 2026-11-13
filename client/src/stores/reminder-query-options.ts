/** Re-read active reminders from the server every 5 minutes. The alarm itself does NOT
 *  wait for this poll: useReminderWatchdog arms a local timer for the next loaded
 *  reminder's exact dueAt, so a reminder already on the client rings on the second.
 *  The poll only picks up reminders created/changed on another device or tab; anything
 *  done in this tab (create/edit/snooze/complete) invalidates the 'Reminder' tag and
 *  refetches straight away. */
export const REMINDER_POLL_MS = 5 * 60 * 1000;

/** On tab focus, re-read only if the copy is older than this (alt-tab spam guard). */
export const REMINDER_FOCUS_STALE_MS = 60 * 1000;

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
