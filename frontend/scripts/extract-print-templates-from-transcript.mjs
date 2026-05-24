import fs from 'fs'

const transcripts = [
  'C:/Users/Amir/.cursor/projects/d-erp-projects-first-click/agent-transcripts/73fa3988-4a79-4e84-98ff-907f39433f66/73fa3988-4a79-4e84-98ff-907f39433f66.jsonl',
  'C:/Users/Amir/.cursor/projects/d-erp-projects-first-click/agent-transcripts/8c8de471-818a-4b1c-a0dc-e675bdc69f69/8c8de471-818a-4b1c-a0dc-e675bdc69f69.jsonl',
]

const out = new URL('../src/pages/settings/PrintTemplates.tsx', import.meta.url)
let best = ''

for (const p of transcripts) {
  if (!fs.existsSync(p)) continue
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  for (const line of lines) {
    if (!line.includes('PrintTemplates.tsx')) continue
    try {
      const o = JSON.parse(line)
      const blocks = o.message?.content ?? []
      for (const c of blocks) {
        const contents = c.input?.contents ?? c.input?.new_string
        if (
          typeof contents === 'string' &&
          contents.includes('export default function PrintTemplates') &&
          contents.includes('TemplateCard') &&
          contents.length > best.length
        ) {
          best = contents
        }
      }
    } catch {
      /* skip */
    }
  }
}

if (!best) {
  console.error('No backup found in transcripts')
  process.exit(1)
}

fs.writeFileSync(out, best, 'utf8')
console.log('Restored', best.length, 'chars from transcript')
