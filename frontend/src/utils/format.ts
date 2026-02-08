/**
 * Formatting utilities for currency, dates, etc.
 */

/**
 * Format a number as currency.
 * Coerces to number and uses 0 when value is not finite (avoids "NaN €").
 */
export function formatCurrency(amount: number, currency = "EUR", locale = "fr-FR"): string {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a date string to a localized display format.
 */
export function formatDate(dateStr: string, locale = "fr-FR"): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Format a date as "Janvier 2026" style.
 */
export function formatMonthYear(dateStr: string, locale = "fr-FR"): string {
  const date = new Date(dateStr + "-01");
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Format a number with sign (+/-).
 */
export function formatSignedAmount(amount: number, currency = "EUR"): string {
  const formatted = formatCurrency(Math.abs(amount), currency);
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}
