/**
 * Row limits for the interactive view (the Studio and the inline widget).
 *
 * Summaries, charts and pivots sent to the agent are computed on the server over every row.
 * These limits only bound what a browser has to hold in memory; when a dataset is larger,
 * the view says so instead of presenting partial totals as the whole.
 */

/** The most rows the interactive view holds at once. */
export const INTERACTIVE_ROW_LIMIT = 100_000

/** Rows per request when the widget pages a dataset in. */
export const ROW_PAGE_SIZE = 25_000
