/** Pure helpers behind the site's 1-bit charts. */

/** First month (1-based) in which cumulative savings cover a one-off cost, or null within `horizon`. */
export function breakEvenMonth(monthlySaving: number, cost: number, horizon = 12): number | null {
  if (monthlySaving <= 0)
    return null
  const month = Math.ceil(cost / monthlySaving)
  return month <= horizon ? Math.max(1, month) : null
}
