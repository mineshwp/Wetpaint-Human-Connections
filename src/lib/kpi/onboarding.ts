// Onboarding KPI periods (server and client safe). Staff whose status is
// "onboarding" are reviewed in Month 1, 2 and 3; once they are active
// (permanent) they move to Q1–Q4 and the Month reviews stay on record as
// their onboarding KPI.

export const MONTH_PERIODS = ["Month 1", "Month 2", "Month 3"] as const

export function isMonthPeriod(period: string | null | undefined): boolean {
  return !!period && /^Month [1-3]$/.test(period.trim())
}

/** 1, 2 or 3 for "Month 1".."Month 3"; null for anything else. */
export function monthNumber(period: string | null | undefined): 1 | 2 | 3 | null {
  const m = period ? /^Month ([1-3])$/.exec(period.trim()) : null
  return m ? (Number(m[1]) as 1 | 2 | 3) : null
}

export function isQuarterPeriod(period: string | null | undefined): boolean {
  return !!period && /^Q[1-4] \d{4}$/.test(period.trim())
}

export function isValidReviewPeriod(period: string | null | undefined): boolean {
  return isQuarterPeriod(period) || isMonthPeriod(period)
}

/** Month periods are only for onboarding staff; quarters only for permanent staff. */
export function periodMatchesStatus(period: string, employeeStatus: string | null | undefined): boolean {
  return isMonthPeriod(period) === (employeeStatus === "onboarding")
}

export const PERIOD_STATUS_ERROR =
  "Onboarding staff are reviewed in Month 1–3; Q1–Q4 reviews start once they are permanent (active)."
