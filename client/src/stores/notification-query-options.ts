/** Poll unread notification count every 10 minutes after initial load. */
export const NOTIFICATION_UNREAD_POLL_MS = 10 * 60 * 1000;

/**
 * Stable RTK Query options for the single polling subscriber (NotificationBell).
 * Fetch on app load / page refresh; then poll every 10 min only.
 */
export const NOTIFICATION_UNREAD_POLL_OPTIONS = {
  pollingInterval: NOTIFICATION_UNREAD_POLL_MS,
  refetchOnFocus: false,
  refetchOnReconnect: false,
} as const;

/** Read cached unread count without starting another poll timer. */
export const NOTIFICATION_UNREAD_CACHE_OPTIONS = {
  refetchOnFocus: false,
  refetchOnReconnect: false,
} as const;
