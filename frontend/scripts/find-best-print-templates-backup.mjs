import fs from 'fs'
import path from 'path'

const dir = 'C:/Users/Amir/.cursor/projects/d-erp-projects-first-click/agent-transcripts'
let best = { len: 0, content: '', file: '' }

function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const full = path.join(d, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (name.endsWith('.jsonl')) scan(full)
  }
}

function scan(p) {
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  for (const line of lines) {
    if (!line.includes('PrintTemplates.tsx')) continue
    try {
      const o = JSON.parse(line)
      for (const c of o.message?.content ?? []) {
        const contents = c.input?.contents
        if (
          typeof contents === 'string' &&
          contents.startsWith('import ') &&
          contents.includes('export default function PrintTemplates') &&
          contents.length > best.len
        ) {
          best = { len: contents.length, content: contents, file: p }
        }
      }
    } catch {
      /* skip */
    }
  }
}

walk(dir)
if (best.len < 10000) {
  console.error('No good backup', best.len)
  process.exit(1)
}
const out = new URL('../src/pages/settings/PrintTemplates.tsx', import.meta.url)
fs.writeFileSync(out, best.content, 'utf8')
console.log('Wrote', best.len, 'from', best.file)
