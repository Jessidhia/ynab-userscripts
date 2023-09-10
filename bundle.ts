import * as esbuild from 'https://deno.land/x/esbuild@v0.19.2/mod.js'

await runBuild({
  'rakuten_card.user.ts': {
    name: 'Rakuten Card QIF generator',
    match:
      'https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml',
  },
})
Deno.exit()

/** @see https://violentmonkey.github.io/api/metadata-block/ */
interface MetadataBlock {
  name: string
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

async function runBuild(scripts: Record<string, MetadataBlock>) {
  // run esbuild configuration
  try {
    await Promise.all(
      Object.entries(scripts).map(([entrypoint, metadata]) =>
        esbuild.build({
          banner: {
            js: metadataToComment(metadata) +
              '\n// deno-lint-ignore-file\n// deno-fmt-ignore-file\n',
          },
          entryPoints: [entrypoint],
          bundle: true,
          legalComments: 'inline',
          outdir: 'bundles',
          charset: 'utf8',
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
