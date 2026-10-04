// The subsidies of the Common Agricultural Policy are published year by year:
// amounts of different years are never added up.

export type SubsidyAmounts = Readonly<{
  year: number
  feaga_amount?: string | number | null
  feader_amount?: string | number | null
  cofinanced_amount?: string | number | null
}>

export type YearOfSubsidies = Readonly<{ year: number; count: number; total: number }>

const amount = (value: string | number | null | undefined) => {
  const number = Number(value ?? 0)

  return Number.isFinite(number) ? number : 0
}

/**
 * What a company received each year, latest year first.
 */
export function subsidiesByYear(subsidies: readonly SubsidyAmounts[]): YearOfSubsidies[] {
  const years = new Map<number, { count: number; cents: number }>()

  subsidies.forEach((subsidy) => {
    const year = years.get(subsidy.year) ?? { count: 0, cents: 0 }

    years.set(subsidy.year, {
      count: year.count + 1,
      // Added up in cents: the amounts are decimal, floats would drift
      cents:
        year.cents +
        Math.round(
          (amount(subsidy.feaga_amount) +
            amount(subsidy.feader_amount) +
            amount(subsidy.cofinanced_amount)) *
            100,
        ),
    })
  })

  return [...years.entries()]
    .map(([year, { count, cents }]) => ({ year, count, total: cents / 100 }))
    .sort((a, b) => b.year - a.year)
}
