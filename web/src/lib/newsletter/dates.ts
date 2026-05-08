/**
 * Returns the Sunday (last day) of the given ISO week as a UTC Date.
 * ISO weeks run Monday–Sunday. This is the canonical "issue date" for an edition.
 */
export function isoWeekSunday(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return sunday;
}
