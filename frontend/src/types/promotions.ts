export type PromotionType = 'percentage' | 'fixed' | 'bogo' | 'min_purchase'
export type PromotionStatus = 'active' | 'inactive' | 'draft'
export type PromotionChannel = 'invoice' | 'pos' | 'restaurant' | 'delivery'

export interface Promotion {
  id: number
  tenant_id: number
  name: string
  code: string | null
  description: string | null
  type: PromotionType
  value: number
  min_purchase_amount: number
  max_discount_amount: number | null
  buy_quantity: number | null
  get_quantity: number | null
  get_discount_percent: number
  channels: PromotionChannel[]
  customer_tiers: string[] | null
  customer_ids: number[] | null
  item_ids: number[] | null
  category_ids: number[] | null
  max_uses: number | null
  max_uses_per_day: number | null
  max_uses_per_customer: number | null
  current_uses: number
  start_date: string | null
  end_date: string | null
  active_days: number[] | null
  active_from: string | null
  active_to: string | null
  status: PromotionStatus
  is_combinable: boolean
  priority: number
  created_by?: number
  created_at?: string
  total_discount_given?: number
  usage_count?: number
}

export interface PromotionCalculateResult {
  promotion_id: number
  promotion_name: string
  type: PromotionType
  discount_amount: number
  final_amount: number
}

export interface PromotionsSummary {
  active_count: number
  total_discount: number
  invoices_count: number
  upcoming_count: number
}

export interface PromotionUsageRow {
  id: number
  promotion_id: number
  channel: string
  original_amount: number
  discount_amount: number
  final_amount: number
  used_at: string
  promotion?: { id: number; name: string; type: string }
  customer?: { id: number; name: string }
  used_by_user?: { id: number; name: string }
}
