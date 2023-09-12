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
      parsed.map(({ date, payee, expense, income }) => ({
        date,
        payee,
        amount: (BigInt(income || '0') - BigInt(expense || '0')).toString(),
      })),
    ),
  )
}

function parseTransactions(details: Record<string, CCDetail>) {
  const tableRows = document.querySelectorAll<HTMLElement>(
    '.detail-list-wrap .detail-inner > ul',
  )

  const parsed = []
  const missing = []
  for (const row of tableRows) {
    if (row.childElementCount !== 4) {
      alert('Table format changed')
      throw new Error('Table format changed')
    }

    const rawDate = row.children[0]!.children[0]!.textContent!.trim()
    const payee = Array.from(row.children[0]!.childNodes).filter((node) =>
      node.nodeType === 3 && node.textContent!.trim() !== ''
    )[0].textContent!.trim()
    const isExpense = new Set(row.children[1]!.classList).has('colRed')
    const value = Array.from(row.children[1]!.childNodes).filter((node) =>
      node.nodeType === 3 && node.textContent!.trim() !== ''
    )[0].textContent!.trim().replace(/,/g, '')

    // YNAB does not read time, only date
    const date = rawDate.replace(/\//g, '-').replace(/ .*$/, '')

    const tag = /^.デビット.*　([A-Z0-9]+)$/.exec(payee)?.[1]
    if (tag) {
      const detail = details[tag]
      if (!detail) {
        missing.push(tag)
      } else {
        parsed.push({
          date,
          payee: detail.payee,
          expense: isExpense ? value : '',
          income: !isExpense ? value : '',
        })
      }
    } else {
      parsed.push({
        date,
        payee,
        expense: isExpense ? value : '',
        income: !isExpense ? value : '',
      })
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
