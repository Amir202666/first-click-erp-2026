import * as XLSX from 'xlsx'

export function downloadCustomerTemplate() {
  const headers = [
    'اسم العميل *',
    'اسم الشركة',
    'الرقم الضريبي',
    'الهاتف',
    'الجوال',
    'البريد الإلكتروني',
    'العنوان',
    'المدينة',
    'الدولة',
    'العملة',
    'حد الائتمان',
    'أيام السداد',
    'الرصيد الافتتاحي',
    'تاريخ الرصيد الافتتاحي',
    'ملاحظات',
  ]

  const example = [
    'شركة الأمل للتجارة',
    'الأمل',
    '300012345600003',
    '0112345678',
    '0501234567',
    'info@amal.com',
    'شارع الملك فهد',
    'الرياض',
    'SA',
    'SAR',
    '50000',
    '30',
    '5000',
    '2025-01-01',
    'عميل مميز',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'العملاء')
  XLSX.writeFile(wb, 'نموذج-استيراد-العملاء.xlsx')
}
