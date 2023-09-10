export const enum QifType {
  Cash = 'Cash',
  Bank = 'Bank',
  CCard = 'CCard',
  Invst = 'Invst',
  /** Asset */
  OthA = 'OthA',
  /** Liability */
  OthL = 'OthL',
}

export interface QifConfig {
  type: QifType
  accountName?: string
}

export interface TransactionSplit {
  /** Negative for outflows, positive for inflows */
  // T or $
  amount: number | string
  // M or E
  memo?: string
  /** Check / transaction number */
  // N
  check?: number | string
  // C, C* or CR
  cleared?: boolean | 'R'
  category?: `${string}:${string}` | [string, string]
}

export interface Transaction extends TransactionSplit {
  /** ISO 8601 format */
  // D
  date: Date | string
  // P
  payee?: string
  splits?: TransactionSplit[]
}

export default function generateQif(
  config: QifConfig,
  transactions: readonly Transaction[],
): string {
  const buffer: string[] = transactions.map((tx) =>
    [
      `D${stringifyDate(tx.date)}`,
      `T${tx.amount}`,
      tx.payee && `P${tx.payee}`,
      tx.category && `L${(typeof tx.category === 'string'
        ? tx.category
        : tx.category.join(':'))}`,
      tx.memo && `M${tx.memo}`,
      tx.check && `N${tx.check}`,
      formatSplits(tx.splits, tx.amount),
    ].filter(Boolean).join('\n')
  )

  const header = config.accountName
    ? `!Account\nN${config.accountName}\nT${config.type}\n^\n`
    : ''

  return `${header}!Type:${config.type}\n${buffer.join('\n^\n')}`

  function formatSplits(
    splits: readonly TransactionSplit[] | undefined,
    totalAmount: string | number,
  ) {
    if (!splits || splits.length === 0) {
      return undefined
    }

    let runningTotal = 0

    const result = splits.map(
      (
        split,
      ) => (runningTotal += typeof split.amount === 'string'
        ? parseFloat(split.amount)
        : split.amount,
        [
          `$${split.amount}`,
          split.category &&
          `S${(typeof split.category === 'string'
            ? split.category
            : split.category.join(':'))}`,
          split.memo && `E${split.memo}`,
          split.check && `N${split.check}`,
        ]),
    ).filter(Boolean).join('\n')

    if (
      runningTotal !==
        (typeof totalAmount === 'string'
          ? parseFloat(totalAmount)
          : totalAmount)
    ) {
      throw new Error(
        `Invalid transaction valued at ${totalAmount} whose splits sum to ${runningTotal}`,
      )
    }

    return result
  }

  function stringifyDate(dateParam: Date | string) {
    const date = typeof dateParam === 'string' ? new Date(dateParam) : dateParam

    return `${date.getFullYear()}-${leadZero(date.getMonth() + 1)}-${
      leadZero(date.getDate())
    }`

    function leadZero(value: number | string) {
      return String(value).padStart(2, '0')
    }
  }
}
