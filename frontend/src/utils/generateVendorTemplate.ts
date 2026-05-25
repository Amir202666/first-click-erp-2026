import * as XLSX from 'xlsx'

export function downloadVendorTemplate() {
  const headers = [
    'اسم المورد *',
    'الاسم بالإنجليزية',
    'اسم الشركة',
    'الرقم الضريبي',
    'الهاتف',
    'الجوال',
    'البريد الإلكتروني',
    'العنوان',
    'المدينة',
    'الدولة',
    'رمز الدولة',
    'العملة',
    'شروط السداد',
    'ملاحظات',
  ]

  const example = [
    'شركة التوريد المتحدة',
    'United Supply Co.',
    'التوريد',
    '300098765400003',
    '0119876543',
    '0559876543',
    'info@supply.com',
    'شارع العليا',
    'الرياض',
    'SA',
    '+966',
    'SAR',
    '30',
    'مورد رئيسي',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الموردين')
  XLSX.writeFile(wb, 'نموذج-استيراد-الموردين.xlsx')
}
