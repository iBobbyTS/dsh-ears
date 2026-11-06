import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

import { CLIENT_EXTERNALS } from './scripts/browser-modules.mjs'

export function clientBundle(id: string, entry: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: entry },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    define: {
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    dts: false,
    sourcemap: true,
    // Omit bundler region comments that encode a symlink's physical build path.
    minify: { mangle: false, compress: false },
    clean: false,
    deps: { onlyBundle: false, neverBundle: [...CLIENT_EXTERNALS], alwaysBundle: (specifier) => !CLIENT_EXTERNALS.includes(specifier) },
    plugins: [
      {
        name: 'dsh-css-modules-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.module.css')) return null
          const absolutePath = importer === undefined ? resolvePath(source) : resolvePath(dirname(importer), source)
          const relativePath = relative(process.cwd(), absolutePath).split('\\').join('/')
          return CSS_VIRTUAL_PREFIX + relativePath + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null

          const relativePath = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          const filePath = resolvePath(process.cwd(), relativePath)
          this.addWatchFile(filePath)
          const source = await readFile(filePath)
          const result = transform({
            filename: relativePath,
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true
          })
          const classMap: Record<string, string> = {}
          for (const [localName, exported] of Object.entries(result.exports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
            classMap[localName] = exported.name
          }

          const css = JSON.stringify(result.code.toString())
          const tagId = JSON.stringify(`${id}/${basename(filePath)}`)
          return [
            `const css = ${css};`,
            `const tagId = ${tagId};`,
            'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {',
            '  const tag = document.createElement("style");',
            `  tag.dataset.plugin = ${JSON.stringify(id)};`,
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`
          ].join('\n')
        }
      }
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: (source) => {
        const normalized = source.replaceAll('\\', '/')
        const moduleAt = normalized.lastIndexOf('/node_modules/')
        return moduleAt < 0 ? normalized : '../node_modules/' + normalized.slice(moduleAt + '/node_modules/'.length)
      },
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });'
    }
  }
}
