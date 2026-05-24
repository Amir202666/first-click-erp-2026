import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { renderPrintTemplatePreview } from '../src/utils/printTemplatePreviewMock'

const __dirname = dirname(fileURLToPath(import.meta.url))
const file = process.argv[2] ?? 'test-template.html'
const html = readFileSync(resolve(__dirname, '../../backend/storage/app', file), 'utf8')
const result = renderPrintTemplatePreview(html, 'invoice', {
  company: { name: 'شركة الاختبار', address: 'الكويت', phone: '999' },
  inv: { number: 'INV-99', date: '2024-05-01', due_date: '', payment_method: 'نقدي' },
  customer: { name: 'عميل تجريبي', phone: '111', address: '', vat: '' },
  items: [{ name: 'صنف 1', qty: 2, price: 150, vat: 0, total: 300 }],
  subtotal: 300,
  vat_amount: 0,
  discount: 0,
  total_amount: 300,
  paid: 300,
  balance: 0,
  currency_decimal_places: 3,
  accent_color: '#4f46e5',
})

console.log('ok:', result.ok)
if (result.ok) {
  const text = result.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('html len:', result.html.length)
  console.log('text len:', text.length)
  console.log('has company:', result.html.includes('شركة الاختبار'))
  console.log('has item:', result.html.includes('صنف 1'))
  console.log('text sample:', text.slice(0, 200))
  const withoutCompany = result.html.replace(/شركة الاختبار/g, '')
  console.log('text without company len:', withoutCompany.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length)
} else {
  console.log('error:', result.error)
}
