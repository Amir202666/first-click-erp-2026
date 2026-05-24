export type PrintDocumentType =
  | 'invoice'
  | 'receipt'
  | 'payment'
  | 'journal'
  | 'purchase'
  | 'inventory'
  | 'pos'

export type PrintPaperSize = 'A4' | 'A5' | 'thermal_80' | 'thermal_58'

export type PrintOrientation = 'portrait' | 'landscape'

export interface PrintMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PrintTemplate {
  id: number
  tenant_id: number
  name: string
  document_type: PrintDocumentType
  layout?: string | null
  paper_size: PrintPaperSize
  orientation: PrintOrientation
  margins: PrintMargins | null
  settings: Record<string, unknown> | null
  sections: Record<string, boolean> | null
  html_content: string | null
  blocks_json?: string | null
  is_default: boolean
  is_system: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface PrintTemplatesIndexResponse {
  data: PrintTemplate[]
  types: Record<string, string>
  paper_sizes: Record<string, { width: number; height: number | null; label: string }>
}
