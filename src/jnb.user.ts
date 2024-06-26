import type {} from 'npm:@types/tampermonkey'
import triggerDownload from './download.ts'
import generateQif, { QifType } from './generate.ts'

interface CCDetail {
  payee: string
}

const pageTitle = document.querySelector<HTMLElement>('.titleL h1')!
  .textContent!

if (pageTitle.endsWith('デビット　ご利用明細一覧')) {
  void (async () => {
    await GM.setValue(
      'ccdetail',
      {
        ...(await GM.getValue<Record<string, CCDetail> | null>(
          'ccdetail',
          null,
        )),
        ...parseDebitCardStatement(),
      } satisfies Record<string, CCDetail>,
    )
  })()
} else if (pageTitle.endsWith('普通預金取引明細照会')) {
  const buttonRow = document.querySelector('.blkTitleR')
  if (buttonRow) {
    const text = document.createElement('span')
    text.classList.add('link-icon-csv')
    text.textContent = 'YNAB QIF'

    const button = document.createElement('a')
    button.appendChild(text)
    button.href = 'javascript:void 0'
    button.addEventListener('click', handleExportClick)

    const li = document.createElement('li')
    li.appendChild(button)
    buttonRow.appendChild(li)
  }
}

interface ParsedTransaction {
  date: string
  payee: string
  expense: string
  income: string
  tag?: string
  interest?: ParsedInterest
}

interface ParsedInterest {
  preTax: string
  incomeTax: string
  otherTax: string
}

async function handleExportClick(e: Event) {
  e.preventDefault()

  const { parsed, missing } = parseTransactions(
    await GM.getValue<Record<string, CCDetail>>('ccdetail', {}),
  )
  if (missing.length > 0) {
    alert(
      `Missing Debit Card transaction details for the following transactions:\n\n${
        missing.join(
          '\n',
        )
      }\n\nVisit the appropriate Debit Card details page to load the missing details.`,
    )
    return
  }

  const periodEl = document.querySelector('.detail-title > .h201')
  const period = periodEl?.textContent?.trim()
    .replaceAll('/', '-')
    .replace('～', '~')

  triggerDownload(
    period ? `jnb-${period}.qif` : 'jnb.qif',
    'application/qif',
    generateQif(
      { type: QifType.Bank },
      parsed.map(({ date, payee, expense, income, tag, interest }) => ({
        date,
        payee,
        amount: (BigInt(income || '0') - BigInt(expense || '0')).toString(),
        check: tag,
        // YNAB's parser does not support splits, also write the values in the memo field
        memo: interest && formatInterest(interest),
        splits: interest &&
          [
            { memo: 'Before Tax', amount: interest.preTax },
            {
              memo: 'Income Tax',
              amount: BigInt(`-${interest.incomeTax || '0'}`).toString(),
            },
            {
              memo: 'Other Taxes',
              amount: BigInt(`-${interest.otherTax || '0'}`).toString(),
            },
          ],
      })),
    ),
  )

  function formatInterest(interest: ParsedInterest) {
    const { preTax } = interest
    const incomeTax = interest.incomeTax || '0'
    const otherTax = interest.otherTax || '0'

    if (incomeTax == '0' && otherTax == '0') {
      return 'No deductions'
    }
    if (otherTax == '0') {
      return `${preTax} - ${incomeTax} (income tax)`
    }
    if (incomeTax == '0') {
      return `${preTax} - ${otherTax} (other taxes)`
    }
    return `${preTax} - (${incomeTax} (income tax) + ${otherTax} (other taxes))`
  }
}

function parseTransactions(details: Record<string, CCDetail>) {
  const tableRows = document.querySelectorAll<HTMLElement>(
    '.detail-list-wrap .detail-inner > ul',
  )

  const parsed: ParsedTransaction[] = []
  const missing: string[] = []
  for (const row of tableRows) {
    if (row.childElementCount !== 4) {
      alert('Table format changed')
      throw new Error('Table format changed')
    }

    const rawDate = row.children[0]!.children[0]!.textContent!.trim()
    const isExpense = new Set(row.children[1]!.classList).has('colRed')
    const value = Array.from(row.children[1]!.childNodes).filter((node) =>
      node.nodeType === 3 && node.textContent!.trim() !== ''
    )[0].textContent!.trim().replace(/,/g, '')

    // YNAB does not read time, only date
    const date = rawDate.replace(/\//g, '-').replace(/ .*$/, '')

    const interestTable = row.children[0]!.querySelector<HTMLTableElement>(
      '.detailLink-wrap ~ div > table',
    )
    if (interestTable) {
      if (
        !row.children[0]!.querySelector<HTMLAnchorElement>('a[name=detailLink]')
          ?.textContent?.startsWith('決算お利息')
      ) {
        alert('Unexpected inner table in non-interest-related transaction')
        // only affects this one transaction so probably ok to just skip
        continue
      }
      // interest payment, has no payee info to extract
      const [preTax, incomeTax, otherTax] = Array.from(
        { length: 3 },
        (_, i) =>
          interestTable.rows[i + 1].cells[1].textContent!.trim().replace(
            /\s*円/,
            '',
          ).replaceAll(',', ''),
      )

      parsed.push({
        date,
        expense: '',
        income: value,
        payee: 'JNB Interest',
        interest: { preTax, incomeTax, otherTax },
      })
    } else {
      // ordinary payee
      const rawPayee = Array.from(row.children[0]!.childNodes).filter((node) =>
        node.nodeType === 3 && node.textContent!.trim() !== ''
      )[0].textContent!.trim()

      const { payee, tag } =
        /^.デビット(?:　(?<payee>.+))?　(?<tag>[A-Z0-9]+)$/u.exec(rawPayee)
          ?.groups ??
          /^.+デビット(?:売上予約)?\((?<tag>[A-Z0-9]+)\)$/u.exec(rawPayee)
            ?.groups ??
          {}
      if (tag) {
        const detail = details[tag]
        if (!detail && !payee) {
          missing.push(tag)
        } else {
          parsed.push({
            date,
            payee: payee || detail.payee,
            expense: isExpense ? value : '',
            income: !isExpense ? value : '',
            tag,
          })
        }
      } else {
        parsed.push({
          date,
          payee: rawPayee,
          expense: isExpense ? value : '',
          income: !isExpense ? value : '',
        })
      }
    }
  }
  return { parsed, missing }
}

function parseDebitCardStatement() {
  const entries = document.querySelectorAll('.detailTbl > ul')

  const data: Record<string, CCDetail> = {}
  for (const { children: [, dateAndPayeeEl, , idEl] } of entries) {
    const id = idEl.childNodes[2]?.textContent
    const payee = dateAndPayeeEl.querySelector('.fBold')?.textContent
    if (id && payee) {
      data[id] = { payee }
    }
  }

  return data
}
