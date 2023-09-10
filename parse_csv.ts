export default function parseCSV(raw: string, hasHeader?: false): string[][]
// NOTE: there is no guarantee that <K> are present in the parsed format
export default function parseCSV<K extends string>(
  raw: string,
  hasHeader: true,
): Record<K, string>[]
// NOTE: there is no guarantee that <T> matches the parsed format
export default function parseCSV<T extends object = Record<string, string>>(
  raw: string,
  hasHeader: true,
): T[]

export default function parseCSV(raw: string, hasHeader = false) {
  const rows = tokenizeCSV(raw)

  if (rows.length === 0 || !hasHeader) {
    return rows
  }

  const nameMap = rows.shift()!

  return rows.map((cols) =>
    Object.fromEntries(cols.map((val, i) => [nameMap[i], val]))
  )
}

function tokenizeCSV(raw: string) {
  const rows: string[][] = []
  let cols: string[] = []

  const sep = ','
  const quote = '"'

  let token = ''
  let escaped = false
  let inEscape = false
  for (let c = 0; c < raw.length;) {
    if (inEscape) {
      if (raw[c] === quote) {
        if (raw[c + 1] === quote) {
          // quote followed by quote = quote
          token += quote
          c += 2
        } else {
          // ending quote
          inEscape = false
          c += 1
        }
      } else if (raw[c] === '\r' && raw[c + 1] === '\n') {
        token += '\n'
        c += 2
      } else {
        token += raw[c++]
      }
    } else if (raw[c] === sep) {
      c += 1
      finishToken()
    } else if (raw[c] === '\n' || raw[c] === '\r' && raw[c + 1] === '\n') {
      c += 1
      if (raw[c] === '\r') {
        c += 1
      }
      finishToken()
      finishRow()
    } else if (escaped) {
      throw new Error('Invalid CSV with mixed escaped-unescaped column')
    } else {
      if (raw[c] === quote) {
        if (token.length > 0) {
          throw new Error('Invalid CSV with mixed escaped-unescaped column')
        } else {
          c += 1
          escaped = true
          inEscape = true
          continue
        }
      } else {
        token += raw[c++]
      }
    }
  }

  if (token.length > 0 || cols.length > 0) {
    finishToken()
    finishRow()
  }

  return rows

  function finishToken() {
    cols.push(token)
    token = ''
    escaped = false
  }

  function finishRow() {
    rows.push(cols)
    cols = []
  }
}
