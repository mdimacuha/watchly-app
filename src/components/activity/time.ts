const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Lightweight relative-time formatter. No external dependencies.
 *
 * Returns strings like:
 *   "Just now"
 *   "5 minutes ago"
 *   "2 hours ago"
 *   "Yesterday at 8:30 PM"
 *   "Mon, 10:00 AM"
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }
  if (diff < 2 * DAY) {
    return `Yesterday at ${formatTime(date)}`;
  }

  return `${SHORT_DAYS[date.getDay()]}, ${formatTime(date)}`;
}
