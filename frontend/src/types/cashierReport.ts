export interface ShiftInfo {
  id: number
  user_id?: number
  branch_id?: number
  number: string
  status: 'open' | 'closed'
  cashier: string
  branch: string
  opened_at: string
  /** Y-m-d في تقويم الكويت — للمزامنة مع فلاتر الصفحة */
  opened_date?: string
  closed_at: string | null
  duration: string
  opening_balance: number
}

/** صف في قائمة اختيار الوردية (من API الفلتر) */
export interface CashierDailyReportShiftOption {
  id: number
  number: string
  status: string
  user_id: number
  branch_id?: number
  cashier_name: string
  branch: string
  opened_time: string
  closed_time: string | null
  opened_date: string
  total_sales: number
}

export interface ReportKPIs {
  total_sales: number
  total_invoices: number
  avg_invoice: number
  opening_balance: number
}

export interface PaymentBreakdownRow {
  amount: number
  count: number
  label?: string
}

export type PaymentBreakdown = Record<string, PaymentBreakdownRow>

export interface Reconciliation {
  opening_balance: number
  cash_sales: number
  cash_returns: number
  cash_discounts: number
  total_expenses?: number
  expected_in_drawer: number
  actual_in_drawer: number | null
  difference: number | null
}

export interface ShiftInvoice {
  id: number
  number: string
  time: string
  date?: string
  customer_name: string
  items_summary: string
  total: number
  payment_method: string
  payment_method_label?: string
  balance: number
  status: string
}

export interface CashierDailyReport {
  shift: ShiftInfo
  kpis: ReportKPIs
  payment_breakdown: PaymentBreakdown
  reconciliation: Reconciliation
  invoices: ShiftInvoice[]
}
