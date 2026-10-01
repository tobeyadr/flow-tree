import { build, context } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'

const watch = process.argv.includes('--watch')

const common = {
  entryPoints: ['src/index.js'],
  bundle     : true,
  sourcemap  : true,
  target     : 'es2020',
  logLevel   : 'info',
}

const targets = [
  {
    ...common,
    format   : 'esm',
    outfile  : 'dist/flow-tree.esm.js',
  },
  {
    ...common,
    format   : 'cjs',
    outfile  : 'dist/flow-tree.cjs',
  },
  // for <script> tags: window.FlowTree.mount(...)
  {
    ...common,
    format    : 'iife',
    globalName: 'FlowTree',
    outfile   : 'dist/flow-tree.js',
  },
  {
    ...common,
    format    : 'iife',
    globalName: 'FlowTree',
    minify    : true,
    outfile   : 'dist/flow-tree.min.js',
  },
]

await mkdir('dist', { recursive: true })

const css = () => copyFile('src/flow-tree.css', 'dist/flow-tree.css')

if (watch) {

  await css()

  for (const target of targets) {
    await ( await context(target) ).watch()
  }

  console.log('watching src/')
}
else {
  await Promise.all([css(), ...targets.map(target => build(target))])
}
