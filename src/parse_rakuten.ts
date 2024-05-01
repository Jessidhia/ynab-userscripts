import parseCSV from './parse_csv.ts'

type CSVColumns =
  | '利用日'
  | '利用店名・商品名'
  | '支払方法'
  | '利用金額'
  | '支払手数料'
  | '支払総額'

export const enum PaymentType {
  Single = '1回払い',
  ToRevolving = 'リボ変更',
  Installments = '分割',
}

export interface RakutenTransaction {
  /** ISO 8601 date (Japan time) */
  date: string
  payee: string
  paymentType: PaymentType
  baseAmount: number
  transactionFee: number
  // should be equal to baseAmount + transactionFee
  totalAmount: number
  notes: string
  countryCode?: string
}

export default function parseRakutenCSV(raw: string): RakutenTransaction[] {
  const rawEntries = parseCSV<CSVColumns>(raw, true)
  // for debugging convenience
  // .slice(10, 14)

  return rawEntries.flatMap(
    (
      {
        利用日: date,
        '利用店名・商品名': rawPayee,
        支払方法: rawPaymentType,
        利用金額: baseAmount,
        支払手数料: transactionFee,
        支払総額: totalAmount,
      },
      i,
      { [i + 1]: nextEntry },
    ): RakutenTransaction[] => {
      if (date === '' && rawPaymentType === '') {
        // was a note field for a previous transaction; discard
        return []
      }

      const installments = rawPaymentType.match(
        /^分割(\d+)回払い\((\d+)回目\)$/u,
      )
      const paymentType = installments
        ? PaymentType.Installments
        : rawPaymentType as PaymentType

      let payee = rawPayee
      const notes: string[] = installments
        ? [`Installment ${installments[2]} of ${installments[1]}`]
        : []
      let countryCode: string | undefined

      // Parse and clean up / process the "payee" field
      // Rakuten's data is incredibly messy and is full of bizarre whitespace
      // They stuff *a lot* of junk into the "payee" field, even if it means losing data
      // Several of the annotations are also only present on the most current month,
      // or otherwise are only present on past months. The only constant is inconsistency.

      // deno-lint-ignore no-irregular-whitespace
      // "マスター国内利用　MZZ " — the "MZZ" bit varies, sometimes "MYY", rules unknown
      payee = payee.replace(/^マスター国内利用\s+[A-Z]{3}\s+/u, '')
      // deno-lint-ignore no-irregular-whitespace
      // "ＶＩＳＡ国内利用　VS " — unknown if "VS" varies
      payee = payee.replace(/^ＶＩＳＡ国内利用\s+[A-Z]{2}\s+/u, '')

      if (/^ＪＣＢ国内利用\s+QP\s+/u.test(payee)) {
        notes.push('QuicPay')
        payee = payee.replace(/^ＪＣＢ国内利用\s+QP\s+/u, '')
      } else {
        // Guessed format
        payee = payee.replace(/^ＪＣＢ国内利用\s+[A-Z]{2}\s+/u, '')
      }

      // TODO: AMEX, but I don't know what format it comes in

      // deno-lint-ignore no-irregular-whitespace
      // "海外利用　１　" — unknown if the digits are variable
      payee = payee.replace(/^海外利用\s+[０-９]+\s+/u, '')

      if (payee.includes('利用国')) {
        void ([payee, countryCode] = payee.split('利用国'))
      }

      // there is no whitespace separating the digits from the original payee name!
      payee = payee.replace(/^返済方法変更ＷＥＢ　\d{1,6}|\(ﾍﾝｻｲﾍﾝｺｳ$/u, '')

      // remove excess spaces; keep fullwidth spaces as fullwidth spaces
      payee = payee.replace(/　{2,}/gu, '　').replace(/\s{2,}/gu, ' ').trim()

      if (nextEntry !== undefined && nextEntry['利用日'] === '') {
        const rawNote = nextEntry['利用店名・商品名']
        if (rawNote.startsWith('現地利用額')) {
          // deno-lint-ignore no-irregular-whitespace
          // Example row: "現地利用額　　　　　　　　３５．０００変換レート　１４２．０２９円"
          const tokens = rawNote.split(/\s+/u)
          const rawAmount = tokens[1].split('変換レート')[0]
          const rawRate = tokens[2].split('円')[0]

          const amount = parseFullWidthNumber(rawAmount)
          const rate = parseFullWidthNumber(rawRate)
          if (rate !== 1) {
            notes.push(`Converted ${amount.toFixed(2)} @ ${rate} ¥ e.a.`)
          }
        } else {
          console.error('Unknown 備考 entry format:', rawNote)
        }
      }

      const baseTx: RakutenTransaction = {
        date: date.replaceAll('/', '-'),
        payee,
        paymentType,
        baseAmount: parseFloat(baseAmount),
        transactionFee: transactionFee ? parseFloat(transactionFee) : 0,
        totalAmount: totalAmount ? parseFloat(totalAmount) : 0,
        notes: notes.join(' - '),
        countryCode,
      }

      return paymentType === PaymentType.ToRevolving
        // Rakuten only generates a single transaction with a totalAmount of 0
        // Instead, generate two transactions: one original, and one converted canceling the original
        ? [
          { ...baseTx, totalAmount: baseTx.totalAmount || baseTx.baseAmount },
          {
            ...baseTx,
            payee: 'Converted to Revolving',
            notes: [baseTx.payee, ...notes].join(' - '),
            baseAmount: -baseTx.baseAmount,
            totalAmount: -baseTx.baseAmount,
          },
        ]
        : [baseTx]
    },
  )
}

function parseFullWidthNumber(str: string) {
  // hack: convert characters to halfwidth, then do a normal parse
  const half = str.split('').map((char) => {
    if (char === '．') {
      return '.'
    } else {
      const code = char.charCodeAt(0)
      if (code >= 0xff10 && code < 0xff20) {
        return String.fromCharCode(code - (0xff10 - 0x30))
      }
    }
    return ''
  }).join('')

  return parseFloat(half)
}
