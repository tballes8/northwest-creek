// Date handling. `new Date('2026-10-30')` is UTC midnight, so in US time zones
// it renders as Oct 29. Plain calendar dates (ex-dividend, IPO, filing,
// snapshot dates...) must be parsed as LOCAL dates; full timestamps (with a
// time/zone) are left to the Date constructor.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" as a local calendar date; anything else goes to `new Date`. */
export const parseLocalDate = (s: string): Date => {
  const m = DATE_ONLY.exec(s.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
};

const SHORT_WITH_YEAR: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** Format a date-only string ("Oct 30, 2026"). Unparseable input is returned as given. */
export const formatDateOnly = (
  s: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = SHORT_WITH_YEAR,
  locale: string | undefined = 'en-US',
): string => {
  if (!s) return '—';
  const d = parseLocalDate(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(locale, opts);
};
