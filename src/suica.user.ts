import type {} from 'npm:@types/tampermonkey'

import triggerDownload from './download.ts'
import generateQif, { QifType } from './generate.ts'

// Could be "JR East", but the card can be used anywhere so use a generic name.
// It's in a const here so it can be changed.
const TransportationPayee = 'Suica Transport'

inject()

function inject() {
  const buttonRow = document.querySelector(
    // first selector: modern suica page, second selector: pasmo's old table
    ['.historyBox .grybg01 tr .rightElm', '.grybg01[align=right] tr'].join(','),
  )
  if (!buttonRow || !buttonRow.children[0]) {
    return
  }

  // Must use two separate queries as the old query still matches on the new table format
  const titleRow = document.querySelector(
    '.historyTable tr.NoLine',
  ) || document.querySelector('.grybg01:not([align]) tr')
  if (!titleRow) {
    return
  }
  const titleData = Array.from(titleRow.children, (td) => td.textContent)
  const columnListSerialized = JSON.stringify(titleData)
  const isNewTable = columnListSerialized ===
    `["","月日","種別","利用場所","種別","利用場所","残高","入金・利用額"]`
  if (
    !isNewTable &&
    columnListSerialized !==
      `["月/日","種別","利用場所","種別","利用場所","残額","差額"]`
  ) {
    alert('Suica table format changed; aborting')
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Export to QIF'

  if (isNewTable) {
    button.className = 'list_title'
    button.style.marginRight = '0.5em'
  } else {
    button.style.display = 'block'
    button.style.margin = '0.5em auto'
  }

  // NOTE: untested on pasmo's table
  // (my card has no recent transactions so table won't load at all)
  const yearMonthSelect = document.querySelector<HTMLSelectElement>(
    'select[name=specifyYearMonth]',
  )
  const daySelect = document.querySelector<HTMLSelectElement>(
    'select[name=specifyDay]',
  )

  if (isNewTable) {
    buttonRow.insertBefore(button, buttonRow.children[0])
  } else {
    buttonRow.parentElement!.insertBefore(
      (() => {
        const tr = document.createElement('tr')
        const td = tr.appendChild(document.createElement('td'))
        td.setAttribute('colspan', '3')
        td.appendChild(button)
        return tr
      })(),
      buttonRow,
    )
  }

  button.addEventListener('click', handleExport)

  function handleExport() {
    const rawDataRows = Array.from(
      // .NoLine is the titleRow we just validated before starting
      // :last-child is just an initial balance value and not useful to us
      //
      // the second selector is for the old table format and is similar,
      // but also has a useless :first-child
      document.querySelectorAll(
        [
          '.historyTable tr:not(.NoLine):not(:last-child)',
          '.grybg01:not([align]) tr:not(:first-child):not(:last-child)',
        ].join(','),
      ),
      (tr) =>
        Array.from(tr.children, (td) =>
          // Replace full-width spaces with half-width, trim the excess
          (td.textContent!).replace(/　/g, ' ').trim()),
    )

    const now = new Date()
    const yearMonth = yearMonthSelect?.value?.replace('/', '-')
    const day = daySelect?.value ?? now.getDate()

    const [year, month] = yearMonth?.split('-').map((s) => parseInt(s, 10)) ??
      [now.getFullYear(), now.getMonth() + 1]

    const basename = (location.origin || '').includes('pasmo')
      ? 'pasmo'
      : 'suica'

    triggerDownload(
      yearMonth && day
        ? `${basename}-${yearMonth}-${day}.qif`
        : `${basename}.qif`,
      'application/qif',
      generateQif(
        { type: QifType.Cash },
        rawDataRows.map(
          (rawDataRow) => {
            const [rawDate, type, location, kind, exitLocation, , amountStr] =
              isNewTable ? rawDataRow.slice(1) : rawDataRow

            const [txMonth, txDay] = rawDate.split('/').map((s) =>
              parseInt(s, 10)
            )
            // suica only keeps records for 26 weeks (6 months)
            // even attempting to get older records either fails or gets truncated,
            // so it's safe to do this math:
            // if the transaction month happens at or before the table's month, assume current year
            // otherwise (e.g. txMonth is 12 but month is 1), assume last year
            const txYear = txMonth <= month ? year : year - 1

            const date = `${txYear}-${txMonth}-${txDay}`

            const amount = amountStr.replace(/,/g, '')
            if (!location) {
              // We just know it was a transaction but no idea from where or what
              return {
                date,
                amount,
              }
            }

            if (!kind) {
              // Probably a charge from credit card
              if (amount.startsWith('+')) {
                // keep type + location in the same field for use with payee renaming feature
                return {
                  date,
                  payee: `Charge ${type} ${location}`,
                  amount: amount.slice(1),
                }
              } else {
                return { date, payee: `${type} ${location}`, amount }
              }
            }

            if (kind) {
              // A transportation fare
              return {
                date,
                payee: TransportationPayee,
                memo: `${type} ${location} ${kind} ${exitLocation}`,
                amount,
              }
            }
            return { date, payee: 'Format Error', memo: 'Unknown', amount }
          },
        ),
      ),
    )
  }
}
