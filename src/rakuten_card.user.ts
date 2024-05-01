import type {} from 'npm:@types/tampermonkey'

import triggerDownload from './download.ts'
import generateQif, { QifType } from './generate.ts'
import parseRakuten from './parse_rakuten.ts'

const container = document.querySelector<HTMLDivElement>('.stmt-c-ttl__side')
if (container) {
  // Shrink the size of the original button
  // It's a bizarre button that's made from a spritesheet instead of a real button
  const csvButton = document.querySelector<HTMLAnchorElement>('.stmt-csv-btn')
  if (csvButton) {
    // the sprite is applied using :nth-child so need to override it
    csvButton.style.fontSize = 'inherit'
    csvButton.style.backgroundImage = 'none'
    csvButton.style.width = 'auto'
    csvButton.style.height = 'auto'
    // make it look like a normal button again
    csvButton.classList.add('stmt-c-btn-normal')
    ;(csvButton.children[0] as HTMLSpanElement).style.display = 'inline-block'
  }

  // Create our button
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.add('stmt-c-btn-normal')
  button.style.appearance = 'none'
  button.style.marginLeft = '5px'
  button.style.verticalAlign = 'middle'
  button.style.fontSize = 'inherit'

  //! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc.
  button.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" height="1.2em" style="margin: 0 4px -0.2em 0;"><path fill="currentColor" d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM80 64h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16s7.2-16 16-16zm16 96H288c17.7 0 32 14.3 32 32v64c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V256c0-17.7 14.3-32 32-32zm0 32v64H288V256H96zM240 416h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H240c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>` +
    'YNAB (QIF)'
  container.appendChild(button)

  button.addEventListener('click', async (e) => {
    e.stopPropagation()
    e.preventDefault()

    // the specific month to be fetched seems to be tracked by cookie or server-side state
    const csv = await (await fetch(
      '/e-navi/members/statement/index.xhtml?downloadAsCsv=1',
    )).text()

    const result = generateQif(
      { type: QifType.CCard },
      parseRakuten(csv).map((tx) => ({
        date: tx.date,
        payee: tx.payee,
        amount: -tx.totalAmount,
        memo: tx.countryCode
          ? `${codeToFlag(tx.countryCode)}${tx.notes ? ` ${tx.notes}` : ''}`
          : tx.notes,
        splits: tx.transactionFee > 0
          ? [{ amount: -tx.baseAmount }, {
            amount: -tx.transactionFee,
            memo: 'Transaction Fee',
          }]
          : undefined,
      })),
    )

    const cardNoEl = document.querySelector('.stmt-head-regist-card__num > *')
    const cardNo = cardNoEl?.textContent?.trim().slice(-4)

    const dateEl = document.querySelector('.stmt-head-calendar__now > span')
    const match = dateEl?.textContent?.match(/(\d{4})年(\d{2})月(以降)?分/u)
    let date: string | undefined
    if (match) {
      const [, year, month, plus] = match
      date = `${year}-${month}` + (plus ? '~' : '')
    }

    triggerDownload(
      `${['rakuten', cardNo, date].filter(Boolean).join('-')}.qif`,
      'application/qif',
      result,
    )
  })
}

function codeToFlag(cc: string) {
  switch (cc) {
    case 'DEU':
    case 'FRA':
    case 'GBR':
    case 'NLD':
    case 'SGP':
    case 'USA':
      return toFlag(cc.slice(0, 2))
    case 'IRL':
      return toFlag('IE')
    case 'SWE':
      return toFlag('SE')

    // GUESSES
    case 'LND':
      return toFlag('GB')
    case 'TOK':
      return toFlag('JP')
    case 'HH':
      return toFlag('HK')
  }

  return `cc:${cc}`

  function toFlag(cc: string) {
    // rotate UPPERCASE latin to regional symbols
    return String.fromCodePoint(
      ...cc.split('').map((letter) =>
        letter.codePointAt(0)! + (0x1f1e5 - 0x40)
      ),
    )
  }
}
