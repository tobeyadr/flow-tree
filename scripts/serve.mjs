/**
 * A static server for the demo, `npm run demo`, then open http://localhost:5173/demo/
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT ?? 5173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js'  : 'text/javascript; charset=utf-8',
  '.mjs' : 'text/javascript; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map' : 'application/json; charset=utf-8',
}

createServer(async (req, res) => {

  const url = new URL(req.url, 'http://localhost')
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')

  if (path === '' || path.endsWith('/') || path.endsWith('\\')) {
    path = join(path, 'index.html')
  }

  // stay inside the project
  if (path.split(/[/\\]/).includes('..')) {
    res.writeHead(403).end()
    return
  }

  try {
    const body = await readFile(join(root, path))
    res.writeHead(200, {
      'content-type' : types[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body)
  }
  catch (err) {
    res.writeHead(404).end('Not found')
  }
}).listen(port, () => console.log(`http://localhost:${ port }/demo/`))
