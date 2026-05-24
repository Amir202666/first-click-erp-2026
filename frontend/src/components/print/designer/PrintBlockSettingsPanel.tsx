import type { PrintBlock } from '../../../utils/printTemplateBlocks'

type Props = {
  block: PrintBlock
  langAr: boolean
  onChange: (updated: PrintBlock) => void
}

export default function PrintBlockSettingsPanel({ block, langAr: L, onChange }: Props) {
  const s = block.settings
  const update = (key: string, value: unknown) =>
    onChange({ ...block, settings: { ...block.settings, [key]: value } })

  return (
    <div className="p-4" dir={L ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-sm font-bold text-gray-800 truncate">{block.label}</h3>
        <button
          type="button"
          onClick={() => onChange({ ...block, visible: !block.visible })}
          className={`shrink-0 text-xs px-2 py-1 rounded ${block.visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
        >
          {block.visible ? (L ? '👁 ظاهر' : '👁 Visible') : L ? '👁 مخفي' : '👁 Hidden'}
        </button>
      </div>

      {block.type === 'header' && (
        <div className="space-y-3">
          <label className="text-xs text-gray-500 block">{L ? 'نمط الرأس' : 'Header style'}</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(['banner', 'split', 'minimal', 'centered'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => update('style', style)}
                className={`py-2 rounded-lg border text-xs font-medium ${
                  s.style === style ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {style === 'banner' ? (L ? 'بانر' : 'Banner') : style === 'split' ? (L ? 'منقسم' : 'Split') : style === 'minimal' ? (L ? 'مينيمال' : 'Minimal') : L ? 'مركزي' : 'Centered'}
              </button>
            ))}
          </div>
          <label className="text-xs text-gray-500 block mt-3">{L ? 'عنوان الفاتورة' : 'Invoice title'}</label>
          <input
            value={typeof s.invoiceLabel === 'string' ? s.invoiceLabel : 'فاتورة ضريبية'}
            onChange={(e) => update('invoiceLabel', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="space-y-2 mt-2">
            {(
              [
                ['showLogo', L ? 'إظهار الشعار' : 'Show logo'],
                ['showCompanyName', L ? 'اسم الشركة' : 'Company name'],
                ['showAddress', L ? 'العنوان' : 'Address'],
                ['showPhone', L ? 'الهاتف' : 'Phone'],
                ['showVat', L ? 'الرقم الضريبي' : 'VAT no.'],
                ['showInvoiceNumber', L ? 'رقم الفاتورة' : 'Invoice #'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                  onChange={(e) => update(key, e.target.checked)}
                  className="rounded accent-teal-600 shrink-0"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {block.type === 'items_table' && (
        <div className="space-y-3">
          <label className="text-xs text-gray-500 block">{L ? 'الأعمدة المرئية' : 'Visible columns'}</label>
          {(
            [
              ['index', '#'],
              ['name', L ? 'البند' : 'Item'],
              ['qty', L ? 'الكمية' : 'Qty'],
              ['price', L ? 'السعر' : 'Price'],
              ['vat', L ? 'الضريبة' : 'VAT'],
              ['total', L ? 'الإجمالي' : 'Total'],
            ] as const
          ).map(([col, label]) => {
            const cols = (Array.isArray(s.columns) ? s.columns : ['index', 'name', 'qty', 'price', 'vat', 'total']) as string[]
            return (
              <label key={col} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={cols.includes(col)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...cols, col] : cols.filter((c) => c !== col)
                    update('columns', next.length ? next : ['name'])
                  }}
                  className="rounded accent-teal-600 shrink-0"
                />
              </label>
            )
          })}
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer mt-2 gap-2">
            <span>{L ? 'صفوف متناوبة الألوان' : 'Striped rows'}</span>
            <input
              type="checkbox"
              checked={typeof s.stripedRows === 'boolean' ? s.stripedRows : true}
              onChange={(e) => update('stripedRows', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
        </div>
      )}

      {block.type === 'totals' && (
        <div className="space-y-2">
          {(
            [
              ['showSubtotal', L ? 'المجموع الفرعي' : 'Subtotal'],
              ['showDiscount', L ? 'الخصم' : 'Discount'],
              ['showVat', L ? 'الضريبة' : 'VAT'],
              ['showTotal', L ? 'الإجمالي' : 'Total'],
              ['showPaid', L ? 'المدفوع' : 'Paid'],
              ['showChange', L ? 'الباقي' : 'Change'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : key === 'showPaid' || key === 'showChange' ? false : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
          <div className="mt-3">
            <label className="text-xs text-gray-500 block mb-1">{L ? 'تسمية الضريبة' : 'VAT label'}</label>
            <input
              value={typeof s.vatLabel === 'string' ? s.vatLabel : 'ضريبة القيمة المضافة (15%)'}
              onChange={(e) => update('vatLabel', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
            />
          </div>
        </div>
      )}

      {block.type === 'footer' && (
        <div className="space-y-2">
          {(
            [
              ['showCompanyName', L ? 'اسم الشركة' : 'Company name'],
              ['showPhone', L ? 'الهاتف' : 'Phone'],
              ['showEmail', L ? 'البريد الإلكتروني' : 'Email'],
              ['showVat', L ? 'الرقم الضريبي' : 'VAT'],
              ['borderTop', L ? 'خط فاصل علوي' : 'Top border'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'info_row' && (
        <div className="space-y-2">
          {(
            [
              ['showCustomerName', L ? 'اسم العميل' : 'Customer name'],
              ['showCustomerPhone', L ? 'هاتف العميل' : 'Customer phone'],
              ['showCustomerAddress', L ? 'عنوان العميل' : 'Customer address'],
              ['showCustomerVat', L ? 'ر.ض العميل' : 'Customer VAT'],
              ['showDate', L ? 'تاريخ الإصدار' : 'Issue date'],
              ['showDueDate', L ? 'تاريخ الاستحقاق' : 'Due date'],
              ['showPaymentMethod', L ? 'طريقة الدفع' : 'Payment method'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2 mt-2">
            <span>{L ? 'شريط تمييز' : 'Accent border'}</span>
            <input
              type="checkbox"
              checked={typeof s.borderAccent === 'boolean' ? s.borderAccent : true}
              onChange={(e) => update('borderAccent', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
        </div>
      )}

      {block.type === 'notes' && (
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
            <span>{L ? 'إظهار الملاحظات' : 'Show notes'}</span>
            <input
              type="checkbox"
              checked={typeof s.showNotes === 'boolean' ? s.showNotes : true}
              onChange={(e) => update('showNotes', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
            <span>{L ? 'إظهار التوقيع' : 'Show signature'}</span>
            <input
              type="checkbox"
              checked={typeof s.showSignature === 'boolean' ? s.showSignature : true}
              onChange={(e) => update('showSignature', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
          <label className="text-xs text-gray-500 block mt-2">{L ? 'عنوان الملاحظات' : 'Notes heading'}</label>
          <input
            value={typeof s.label === 'string' ? s.label : 'ملاحظات:'}
            onChange={(e) => update('label', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {block.type === 'text' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'المحتوى (يدعم Handlebars)' : 'Content (Handlebars)'}</label>
          <textarea
            value={typeof s.content === 'string' ? s.content : ''}
            onChange={(e) => update('content', e.target.value)}
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono"
          />
        </div>
      )}

      {block.type === 'divider' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'السماكة (px)' : 'Thickness (px)'}</label>
          <input
            type="number"
            value={typeof s.thickness === 'number' ? s.thickness : 1}
            onChange={(e) => update('thickness', Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {block.type === 'spacer' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'الارتفاع (مثلاً 16px)' : 'Height (e.g. 16px)'}</label>
          <input
            value={typeof s.height === 'string' ? s.height : '16px'}
            onChange={(e) => update('height', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {block.type === 'image' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">URL</label>
          <input
            value={typeof s.src === 'string' ? s.src : ''}
            onChange={(e) => update('src', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {(block.type === 'qr_code' || block.type === 'barcode') && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'المقاس' : 'Size'}</label>
          <input
            type="number"
            value={typeof s.size === 'number' ? s.size : 80}
            onChange={(e) => update('size', Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {block.type === 'receipt_header' && (
        <div className="space-y-3">
          <label className="text-xs text-gray-500 block">{L ? 'عنوان السند' : 'Voucher title'}</label>
          <input
            value={typeof s.title === 'string' ? s.title : 'سند قبض'}
            onChange={(e) => update('title', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <label className="text-xs text-gray-500 block">{L ? 'لون الخلفية' : 'Background color'}</label>
          <input
            value={typeof s.bgColor === 'string' ? s.bgColor : '{{accent_color}}'}
            onChange={(e) => update('bgColor', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono"
            placeholder="#059669"
          />
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
            <span>{L ? 'إظهار رقم السند والتاريخ' : 'Show number & date'}</span>
            <input
              type="checkbox"
              checked={typeof s.showNumber === 'boolean' ? s.showNumber : true}
              onChange={(e) => update('showNumber', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
        </div>
      )}

      {block.type === 'receipt_body' && (
        <div className="space-y-2">
          {(
            [
              ['showCustomerName', L ? 'المستفيد' : 'Beneficiary'],
              ['showAmount', L ? 'المبلغ' : 'Amount'],
              ['showAmountText', L ? 'المبلغ كتابة' : 'Amount in words'],
              ['showPaymentMethod', L ? 'طريقة الدفع' : 'Payment method'],
              ['showDate', L ? 'التاريخ' : 'Date'],
              ['showNotes', L ? 'ملاحظات' : 'Notes'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
          <label className="text-xs text-gray-500 block mt-2">{L ? 'تسمية المبلغ' : 'Amount label'}</label>
          <input
            value={typeof s.amountLabel === 'string' ? s.amountLabel : 'المبلغ المستلم'}
            onChange={(e) => update('amountLabel', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
        </div>
      )}

      {block.type === 'signature_row' && (
        <div className="space-y-2">
          {(
            [
              ['showReceiverSignature', L ? 'توقيع المستلم' : 'Receiver signature'],
              ['showPayerSignature', L ? 'توقيع الدافع' : 'Payer signature'],
              ['showManagerSignature', L ? 'توقيع المدير' : 'Manager signature'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : key !== 'showManagerSignature'}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'journal_info' && (
        <div className="space-y-2">
          {(
            [
              ['showNumber', L ? 'رقم القيد' : 'Entry number'],
              ['showDate', L ? 'التاريخ' : 'Date'],
              ['showDescription', L ? 'البيان' : 'Description'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'journal_table' && (
        <div className="space-y-2">
          {(
            [
              ['showAccount', L ? 'الحساب' : 'Account'],
              ['showDebit', L ? 'مدين' : 'Debit'],
              ['showCredit', L ? 'دائن' : 'Credit'],
              ['showNotes', L ? 'ملاحظات' : 'Notes'],
              ['showTotalsRow', L ? 'صف الإجمالي' : 'Totals row'],
              ['stripedRows', L ? 'صفوف متناوبة' : 'Striped rows'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : key !== 'stripedRows'}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'supplier_info' && (
        <div className="space-y-2">
          {(
            [
              ['showSupplierName', L ? 'اسم المورد' : 'Supplier name'],
              ['showSupplierPhone', L ? 'هاتف المورد' : 'Supplier phone'],
              ['showSupplierAddress', L ? 'عنوان المورد' : 'Supplier address'],
              ['showSupplierVat', L ? 'ر.ض المورد' : 'Supplier VAT'],
              ['showDate', L ? 'التاريخ' : 'Date'],
              ['showDueDate', L ? 'الاستحقاق' : 'Due date'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'inventory_info' && (
        <div className="space-y-2">
          {(
            [
              ['showNumber', L ? 'رقم التسوية' : 'Adjustment #'],
              ['showDate', L ? 'التاريخ' : 'Date'],
              ['showWarehouse', L ? 'المستودع' : 'Warehouse'],
              ['showReason', L ? 'سبب التسوية' : 'Reason'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'inventory_table' && (
        <div className="space-y-2">
          {(
            [
              ['showName', L ? 'الصنف' : 'Item'],
              ['showBefore', L ? 'قبل' : 'Before'],
              ['showAfter', L ? 'بعد' : 'After'],
              ['showDiff', L ? 'الفرق' : 'Difference'],
              ['showType', L ? 'النوع' : 'Type'],
              ['stripedRows', L ? 'صفوف متناوبة' : 'Striped rows'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'inventory_summary' && (
        <div className="space-y-2">
          {(
            [
              ['showTotalIncrease', L ? 'إجمالي الزيادة' : 'Total increase'],
              ['showTotalDecrease', L ? 'إجمالي النقص' : 'Total decrease'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'pos_header' && (
        <div className="space-y-2">
          {(
            [
              ['showCompanyName', L ? 'اسم الشركة' : 'Company name'],
              ['showAddress', L ? 'العنوان' : 'Address'],
              ['showPhone', L ? 'الهاتف' : 'Phone'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'pos_info' && (
        <div className="space-y-2">
          {(
            [
              ['showNumber', L ? 'رقم الفاتورة' : 'Receipt #'],
              ['showDate', L ? 'التاريخ' : 'Date'],
              ['showCashier', L ? 'الكاشير' : 'Cashier'],
              ['showTable', L ? 'الطاولة' : 'Table'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : key !== 'showTable'}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'pos_divider' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'نمط الفاصل' : 'Divider style'}</label>
          <select
            value={typeof s.style === 'string' ? s.style : 'dashed'}
            onChange={(e) => update('style', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          >
            <option value="dashed">{L ? 'متقطع' : 'Dashed'}</option>
            <option value="solid">{L ? 'متصل' : 'Solid'}</option>
          </select>
        </div>
      )}

      {block.type === 'pos_items' && (
        <div className="space-y-2">
          {(
            [
              ['showQty', L ? 'الكمية' : 'Qty'],
              ['showPrice', L ? 'السعر' : 'Price'],
              ['showTotal', L ? 'الإجمالي' : 'Total'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'pos_totals' && (
        <div className="space-y-2">
          {(
            [
              ['showSubtotal', L ? 'المجموع' : 'Subtotal'],
              ['showVat', L ? 'الضريبة' : 'VAT'],
              ['showTotal', L ? 'الإجمالي' : 'Total'],
              ['showPaid', L ? 'المدفوع' : 'Paid'],
              ['showChange', L ? 'الباقي' : 'Change'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={typeof s[key] === 'boolean' ? (s[key] as boolean) : true}
                onChange={(e) => update(key, e.target.checked)}
                className="rounded accent-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      )}

      {block.type === 'pos_footer' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">{L ? 'رسالة التذييل' : 'Footer message'}</label>
          <input
            value={typeof s.message === 'string' ? s.message : 'شكراً لزيارتكم'}
            onChange={(e) => update('message', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
          />
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer gap-2">
            <span>{L ? 'إظهار QR' : 'Show QR'}</span>
            <input
              type="checkbox"
              checked={typeof s.showQr === 'boolean' ? s.showQr : true}
              onChange={(e) => update('showQr', e.target.checked)}
              className="rounded accent-teal-600 shrink-0"
            />
          </label>
        </div>
      )}
    </div>
  )
}
