import * as esbuild from 'https://deno.land/x/esbuild@v0.20.2/mod.js'
import * as cli from '@std/cli/mod.ts'

// paths relative to ./src
const ctx = await makeContexts({
  'rakuten_card.user.ts': {
    name: 'Rakuten Card QIF generator',
    match:
      'https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml',
    icon: 'https://www.rakuten-card.co.jp/favicon.ico',
    noframes: true,
    version: '0.0.2',
    author: 'Jessidhia',
  },
  'jnb.user.ts': {
    name: 'PayPay Bank QIF Export',
    match: [
      'https://login.paypay-bank.co.jp/wctx/*',
      'https://login.japannetbank.co.jp/wctx/*',
    ],
    icon: 'https://login.paypay-bank.co.jp/favicon.ico',
    grant: ['GM.setValue', 'GM.getValue'],
    noframes: true,
    version: '2.6',
    author: 'Jessidhia',
  },
  'suica.user.ts': {
    name: 'Export Suica/Pasmo transactions to QIF',
    match: [
      'https://www.mobilesuica.com/iq/ir/SuicaDisp.aspx',
      'https://www.mobile.pasmo.jp/iq/ir/SuicaDisp.aspx',
    ],
    icon: 'https://www.jreast.co.jp/favicon.ico',
    noframes: true,
    version: '0.3',
    author: 'Jessidhia',
  },
})

const { watch } = cli.parseArgs(Deno.args, { boolean: ['watch'] })

if (watch) {
  await Promise.all(ctx.map((ctx) => ctx.watch()))
  Deno.addSignalListener('SIGINT', async () => {
    await Promise.all(ctx.map((ctx) => ctx.dispose()))
    Deno.exit()
  })
} else {
  await Promise.all(ctx.map((ctx) => ctx.rebuild()))
  await Promise.all(ctx.map((ctx) => ctx.dispose()))
  Deno.exit()
}

/** @see https://violentmonkey.github.io/api/metadata-block/ */
interface MetadataBlock {
  name: string
  author?: string
  description?: string | string[]
  /**
   * @see https://violentmonkey.github.io/api/matching/
   */
  match: string | string[]
  /**
   * @see https://violentmonkey.github.io/api/matching/
   */
  // exclude-match
  excludeMatch?: string | string[]
  version?: string
  /** Public URL */
  icon?: string
  /** Public URL — global scripts that execute beforehand */
  require?: string | string[]
  /**
   * - `'document-end'` - executes as a `DOMContentLoaded` handler
   * - `'document-start'` - executes as soon as possible
   * - `'document-idle'` - executes after other `DOMContentLoaded` handlers
   * @default 'document-end'
   */
  // run-at
  runAt?: 'document-end' | 'document-start' | 'document-idle'
  noframes?: boolean
  /**
   * - `'page'` - executes as an ordinary inline script
   * - `'content'` - executes as a content script, like extensions
   * - `'auto'` - tries page, falls back to content
   * @default 'page'
   */
  // inject-into
  injectInto?: 'page' | 'content' | 'auto'
  grant?: string[]
  downloadURL?: string
}

async function makeContexts(scripts: Record<string, MetadataBlock>) {
  // run esbuild configuration
  try {
    return await Promise.all(
      Object.entries(scripts).map(([entrypoint, metadata]) =>
        esbuild.context({
          banner: {
            js: metadataToComment(metadata) + '\n',
          },
          entryPoints: [`src/${entrypoint}`],
          bundle: true,
          legalComments: 'inline',
          outdir: 'bundles',
          charset: 'utf8',
          logLevel: 'info',
        })
      ),
    )
  } catch (e) {
    console.error(e)
    Deno.exit(1)
  }
}

function metadataToComment(metadata: MetadataBlock) {
  const pairs = Object.entries(metadata).flatMap(
    ([keyParam, value]): [string, string | boolean][] => {
      const key = keyParam === 'runAt'
        ? 'run-at'
        : keyParam === 'injectInto'
        ? 'inject-into'
        : keyParam === 'excludeMatch'
        ? 'exclude-match'
        : keyParam

      return Array.isArray(value)
        ? value.map((entry) => [key, entry])
        : [[key, value]]
    },
  )

  return [
    '// ==UserScript==',
    pairs.map(([key, value]) =>
      `// @${key}${typeof value === 'boolean' ? '' : ` ${value}`}`
    ).join('\n'),
    '// ==/UserScript==',
  ].join('\n')
}
