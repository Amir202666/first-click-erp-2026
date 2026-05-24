/**
 * صفحة تحكم كاملة لإدارة قوالب الفواتير
 * — سحب وإفلات، لوحة خصائص، محرر جداول، معاينة حية، تصدير HTML/CSS
 * — اختصارات لوحة المفاتيح، تكبير/تصغير، طبقات، نسخ/لصق، معاينة ببيانات نموذجية
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchDocumentTemplate,
  createDocumentTemplate,
  updateDocumentTemplate,
  fetchSettings,
} from '../../api/tenant'
import type { TenantSettings } from '../../types'
import type {
  TemplateDesignData,
  DesignElement,
  VariableElement,
  TextElement,
  TableElement,
  PageSettings,
  FontSettings,
  ImageElement,
  LineElement,
  SpacerElement,
  RectangleElement,
} from '../../types/templateDesign'
import {
  DEFAULT_PAGE,
  DEFAULT_FONT,
  PAGE_PRESETS,
  VARIABLE_KEYS,
  VARIABLE_GROUPS,
  PRODUCT_TABLE_COLUMN_KEYS,
  FONT_FAMILIES,
} from '../../types/templateDesign'
import { templateDesignToHtml } from '../../utils/templateDesignToHtml'
import Toast, { type ToastType } from '../../components/ui/Toast'
import {
  ArrowLeft,
  Save,
  Type,
  Image,
  Layout,
  Square,
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Eye,
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Layers,
  Undo2,
  Redo2,
  Italic,
  Underline,
  Bold,
  SeparatorHorizontal,
  X,
  Group,
  Ungroup,
} from 'lucide-react'

const MM_TO_PX = 3.78 // تقريبي للعرض على الشاشة
const GRID_COLS = 12
const GRID_ROW_MM = 5
const MAX_UNDO = 40

/** محاذاة العناصر بشبكة 12 عمود — Snap to Grid بدقة بكسل */
function snapToGrid(xMm: number, yMm: number, contentWidthMm: number): { xMm: number; yMm: number } {
  const colMm = contentWidthMm / GRID_COLS
  return {
    xMm: Math.round(xMm / colMm) * colMm,
    yMm: Math.round(yMm / GRID_ROW_MM) * GRID_ROW_MM,
  }
}

function createId(): string {
  return 'el-' + Math.random().toString(36).slice(2, 10)
}

interface DragState {
  id: string
  startMouseX: number
  startMouseY: number
  startXMm: number
  startYMm: number
}

type ResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface ResizeState {
  id: string
  edge: ResizeEdge
  startMouseX: number
  startMouseY: number
  startXMm: number
  startYMm: number
  startWidthMm: number
  startHeightMm: number
}

interface MarqueeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

/** ألوان مميزة للمجموعات على الكانفاس */
const GROUP_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e', '#84cc16']
function groupColor(groupId: string): string {
  let hash = 0
  for (let i = 0; i < groupId.length; i++) hash = ((hash << 5) - hash + groupId.charCodeAt(i)) | 0
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]
}

/** عنصر التسمية لكل نوع */
function elementTypeLabel(type: string): string {
  const map: Record<string, string> = {
    variable: 'متغير',
    text: 'نص',
    table: 'جدول',
    image: 'صورة',
    line: 'خط فاصل',
    spacer: 'مسافة',
    rectangle: 'مستطيل',
  }
  return map[type] ?? type
}

function defaultDesign(name: string): TemplateDesignData {
  return {
    name,
    docType: 'invoice',
    page: { ...DEFAULT_PAGE },
    globalFont: { ...DEFAULT_FONT },
    elements: [],
    logo: { enabled: false, url: '{{logo}}', xMm: 0, yMm: 0, widthMm: 25, heightMm: 15 },
    stamp: { label: 'الختم', xMm: 140, yMm: 250, widthMm: 40, heightMm: 25 },
    signature: { label: 'التوقيع', xMm: 80, yMm: 250, widthMm: 40, heightMm: 25 },
    frame: { enabled: true, borderWidthMm: 0.5, borderColor: '#e2e8f0' },
  }
}

/** قوالب جاهزة للاختيار */
const TEMPLATE_PRESETS: { id: string; label: string; build: (name: string) => TemplateDesignData }[] = [
  { id: 'empty', label: 'فارغ (حراري 80مم)', build: (name) => defaultDesign(name) },
  {
    id: 'thermal-80-simple',
    label: 'فاتورة حرارية 80مم بسيطة',
    build: (name) => {
      const d = defaultDesign(name)
      return {
        ...d,
        page: { ...PAGE_PRESETS['80mm'], preset: '80mm', marginTopMm: 3, marginRightMm: 3, marginBottomMm: 3, marginLeftMm: 3 },
        elements: [
          { id: 'el-company', type: 'variable', variableKey: 'company.name', xMm: 2, yMm: 2, widthMm: 76, heightMm: 6, font: { sizePt: 10, bold: true } },
          { id: 'el-inv-num', type: 'variable', variableKey: 'invoice.number', xMm: 2, yMm: 10, widthMm: 40, heightMm: 5 },
          { id: 'el-inv-date', type: 'variable', variableKey: 'invoice.date', xMm: 42, yMm: 10, widthMm: 36, heightMm: 5 },
          { id: 'el-customer', type: 'variable', variableKey: 'customer.name', xMm: 2, yMm: 16, widthMm: 76, heightMm: 5 },
          { id: 'el-line1', type: 'line', xMm: 2, yMm: 21, widthMm: 74, heightMm: 0.3, thicknessMm: 0.3, color: '#999', horizontal: true },
          { id: 'el-table', type: 'table', xMm: 2, yMm: 22, widthMm: 76, heightMm: 80, columns: [{ key: 'description', label: 'البيان' }, { key: 'quantity', label: 'الكمية' }, { key: 'unit_price', label: 'السعر' }, { key: 'total', label: 'المبلغ' }] },
          { id: 'el-line2', type: 'line', xMm: 2, yMm: 103, widthMm: 74, heightMm: 0.3, thicknessMm: 0.3, color: '#999', horizontal: true },
          { id: 'el-total', type: 'variable', variableKey: 'total', xMm: 40, yMm: 105, widthMm: 38, heightMm: 6, font: { sizePt: 10, bold: true } },
        ] as DesignElement[],
      }
    },
  },
  {
    id: 'a4-simple',
    label: 'فاتورة A4 بسيطة',
    build: (name) => {
      const d = defaultDesign(name)
      return {
        ...d,
        page: { ...PAGE_PRESETS.a4, preset: 'a4', marginTopMm: 15, marginRightMm: 15, marginBottomMm: 15, marginLeftMm: 15 },
        elements: [
          { id: 'el-logo', type: 'image', src: '{{logo}}', xMm: 15, yMm: 12, widthMm: 35, heightMm: 18 },
          { id: 'el-company', type: 'variable', variableKey: 'company.name', xMm: 55, yMm: 15, widthMm: 80, heightMm: 8, font: { sizePt: 14, bold: true } },
          { id: 'el-inv-num', type: 'variable', variableKey: 'invoice.number', xMm: 150, yMm: 28, widthMm: 40, heightMm: 6 },
          { id: 'el-inv-date', type: 'variable', variableKey: 'invoice.date', xMm: 150, yMm: 35, widthMm: 40, heightMm: 6 },
          { id: 'el-customer', type: 'variable', variableKey: 'customer.name', xMm: 15, yMm: 50, widthMm: 90, heightMm: 6 },
          { id: 'el-table', type: 'table', xMm: 15, yMm: 65, widthMm: 180, heightMm: 100, columns: [{ key: 'description', label: 'البيان' }, { key: 'quantity', label: 'الكمية' }, { key: 'unit_price', label: 'السعر' }, { key: 'total', label: 'المبلغ' }] },
          { id: 'el-total', type: 'variable', variableKey: 'total', xMm: 120, yMm: 175, widthMm: 75, heightMm: 8, font: { sizePt: 12, bold: true } },
        ] as DesignElement[],
        logo: { enabled: true, url: '{{logo}}', xMm: 15, yMm: 12, widthMm: 35, heightMm: 18 },
      }
    },
  },
  {
    id: 'a4-professional',
    label: 'فاتورة A4 احترافية',
    build: (name) => {
      const d = defaultDesign(name)
      return {
        ...d,
        page: { ...PAGE_PRESETS.a4, preset: 'a4', marginTopMm: 12, marginRightMm: 12, marginBottomMm: 12, marginLeftMm: 12 },
        globalFont: { ...DEFAULT_FONT, sizePt: 9, color: '#334155' },
        frame: { enabled: true, borderWidthMm: 0.3, borderColor: '#1e3a5f' },
        elements: [
          // خلفية مستطيل للهيدر
          { id: 'el-header-bg', type: 'rectangle', xMm: 0, yMm: 0, widthMm: 186, heightMm: 35, style: { backgroundColor: '#1e3a5f', borderRadiusMm: 0 }, zIndex: 0 },
          { id: 'el-logo', type: 'image', src: '{{logo}}', xMm: 5, yMm: 5, widthMm: 30, heightMm: 25, zIndex: 1 },
          { id: 'el-company', type: 'variable', variableKey: 'company.name', xMm: 40, yMm: 8, widthMm: 100, heightMm: 8, font: { sizePt: 16, bold: true, color: '#ffffff' }, zIndex: 1 },
          { id: 'el-company-addr', type: 'variable', variableKey: 'company.address', xMm: 40, yMm: 18, widthMm: 100, heightMm: 5, font: { sizePt: 8, color: '#e2e8f0' }, zIndex: 1 },
          { id: 'el-company-phone', type: 'variable', variableKey: 'company.phone', xMm: 40, yMm: 24, widthMm: 60, heightMm: 5, font: { sizePt: 8, color: '#e2e8f0' }, zIndex: 1 },
          { id: 'el-type-label', type: 'variable', variableKey: 'invoice.type_label', xMm: 145, yMm: 8, widthMm: 40, heightMm: 8, font: { sizePt: 14, bold: true, color: '#ffffff' }, style: { textAlign: 'center' }, zIndex: 1 },
          // معلومات الفاتورة
          { id: 'el-label-num', type: 'text', content: 'رقم الفاتورة:', xMm: 130, yMm: 40, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' } },
          { id: 'el-inv-num', type: 'variable', variableKey: 'invoice.number', xMm: 160, yMm: 40, widthMm: 26, heightMm: 5, font: { sizePt: 9, bold: true } },
          { id: 'el-label-date', type: 'text', content: 'التاريخ:', xMm: 130, yMm: 46, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' } },
          { id: 'el-inv-date', type: 'variable', variableKey: 'invoice.date', xMm: 160, yMm: 46, widthMm: 26, heightMm: 5, font: { sizePt: 9 } },
          { id: 'el-label-due', type: 'text', content: 'تاريخ الاستحقاق:', xMm: 130, yMm: 52, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' } },
          { id: 'el-inv-due', type: 'variable', variableKey: 'invoice.due_date', xMm: 160, yMm: 52, widthMm: 26, heightMm: 5, font: { sizePt: 9 } },
          // العميل
          { id: 'el-cust-box', type: 'rectangle', xMm: 0, yMm: 40, widthMm: 90, heightMm: 22, style: { backgroundColor: '#f8fafc', borderWidthMm: 0.2, borderStyle: 'solid', borderColor: '#e2e8f0', borderRadiusMm: 1, paddingMm: 2 }, zIndex: 0 },
          { id: 'el-label-cust', type: 'text', content: 'العميل:', xMm: 3, yMm: 42, widthMm: 20, heightMm: 5, font: { sizePt: 8, color: '#64748b', bold: true }, zIndex: 1 },
          { id: 'el-customer', type: 'variable', variableKey: 'customer.name', xMm: 22, yMm: 42, widthMm: 65, heightMm: 5, font: { sizePt: 9, bold: true }, zIndex: 1 },
          { id: 'el-cust-phone', type: 'variable', variableKey: 'customer.phone', xMm: 22, yMm: 48, widthMm: 65, heightMm: 5, font: { sizePt: 8 }, zIndex: 1 },
          { id: 'el-cust-addr', type: 'variable', variableKey: 'customer.address', xMm: 22, yMm: 54, widthMm: 65, heightMm: 5, font: { sizePt: 8 }, zIndex: 1 },
          // الجدول
          { id: 'el-table', type: 'table', xMm: 0, yMm: 68, widthMm: 186, heightMm: 100,
            columns: [{ key: 'row_num', label: '#' }, { key: 'description', label: 'الوصف' }, { key: 'quantity', label: 'الكمية' }, { key: 'unit_price', label: 'السعر' }, { key: 'discount', label: 'الخصم' }, { key: 'tax', label: 'الضريبة' }, { key: 'total', label: 'المبلغ' }],
            headerStyle: { backgroundColor: '#1e3a5f', color: '#ffffff', bold: true, fontSizePt: 9 },
            bodyStyle: { stripedColor: '#f8fafc', borderColor: '#e2e8f0' },
          },
          // الإجماليات
          { id: 'el-summary-bg', type: 'rectangle', xMm: 120, yMm: 175, widthMm: 66, heightMm: 40, style: { backgroundColor: '#f8fafc', borderWidthMm: 0.2, borderStyle: 'solid', borderColor: '#e2e8f0', borderRadiusMm: 1 }, zIndex: 0 },
          { id: 'el-sub-label', type: 'text', content: 'المجموع الفرعي:', xMm: 122, yMm: 177, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' }, zIndex: 1 },
          { id: 'el-subtotal', type: 'variable', variableKey: 'subtotal', xMm: 155, yMm: 177, widthMm: 30, heightMm: 5, font: { sizePt: 9 }, style: { textAlign: 'left' }, zIndex: 1 },
          { id: 'el-tax-label', type: 'text', content: 'الضريبة:', xMm: 122, yMm: 183, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' }, zIndex: 1 },
          { id: 'el-tax', type: 'variable', variableKey: 'tax_amount', xMm: 155, yMm: 183, widthMm: 30, heightMm: 5, font: { sizePt: 9 }, style: { textAlign: 'left' }, zIndex: 1 },
          { id: 'el-disc-label', type: 'text', content: 'الخصم:', xMm: 122, yMm: 189, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' }, zIndex: 1 },
          { id: 'el-disc', type: 'variable', variableKey: 'discount_amount', xMm: 155, yMm: 189, widthMm: 30, heightMm: 5, font: { sizePt: 9 }, style: { textAlign: 'left' }, zIndex: 1 },
          { id: 'el-total-line', type: 'line', xMm: 122, yMm: 195, widthMm: 62, heightMm: 0.3, thicknessMm: 0.3, color: '#1e3a5f', horizontal: true, zIndex: 1 },
          { id: 'el-total-label', type: 'text', content: 'الإجمالي:', xMm: 122, yMm: 197, widthMm: 30, heightMm: 7, font: { sizePt: 11, bold: true, color: '#1e3a5f' }, zIndex: 1 },
          { id: 'el-total', type: 'variable', variableKey: 'total', xMm: 155, yMm: 197, widthMm: 30, heightMm: 7, font: { sizePt: 11, bold: true, color: '#1e3a5f' }, style: { textAlign: 'left' }, zIndex: 1 },
          { id: 'el-paid-label', type: 'text', content: 'المدفوع:', xMm: 122, yMm: 205, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#64748b' }, zIndex: 1 },
          { id: 'el-paid', type: 'variable', variableKey: 'amount_paid', xMm: 155, yMm: 205, widthMm: 30, heightMm: 5, font: { sizePt: 9 }, style: { textAlign: 'left' }, zIndex: 1 },
          { id: 'el-balance-label', type: 'text', content: 'المتبقي:', xMm: 122, yMm: 211, widthMm: 30, heightMm: 5, font: { sizePt: 8, color: '#ef4444', bold: true }, zIndex: 1 },
          { id: 'el-balance', type: 'variable', variableKey: 'balance', xMm: 155, yMm: 211, widthMm: 30, heightMm: 5, font: { sizePt: 9, bold: true, color: '#ef4444' }, style: { textAlign: 'left' }, zIndex: 1 },
          // QR
          { id: 'el-qr', type: 'variable', variableKey: 'qr_code', xMm: 0, yMm: 175, widthMm: 30, heightMm: 30 },
          // ملاحظات
          { id: 'el-notes-label', type: 'text', content: 'ملاحظات:', xMm: 0, yMm: 220, widthMm: 100, heightMm: 5, font: { sizePt: 8, bold: true, color: '#64748b' } },
          { id: 'el-notes', type: 'variable', variableKey: 'invoice.notes', xMm: 0, yMm: 226, widthMm: 110, heightMm: 10, font: { sizePt: 8 } },
          // تذييل
          { id: 'el-footer-line', type: 'line', xMm: 0, yMm: 255, widthMm: 186, heightMm: 0.2, thicknessMm: 0.2, color: '#e2e8f0', horizontal: true },
          { id: 'el-terms', type: 'variable', variableKey: 'terms', xMm: 0, yMm: 257, widthMm: 186, heightMm: 8, font: { sizePt: 7, color: '#94a3b8' }, style: { textAlign: 'center' } },
        ] as DesignElement[],
        logo: { enabled: true, url: '{{logo}}', xMm: 5, yMm: 5, widthMm: 30, heightMm: 25 },
      }
    },
  },
  {
    id: 'thermal-80-detailed',
    label: 'فاتورة حرارية 80مم مفصّلة',
    build: (name) => {
      const d = defaultDesign(name)
      return {
        ...d,
        page: { ...PAGE_PRESETS['80mm'], preset: '80mm', marginTopMm: 2, marginRightMm: 2, marginBottomMm: 2, marginLeftMm: 2 },
        globalFont: { ...DEFAULT_FONT, sizePt: 8 },
        elements: [
          { id: 'el-logo', type: 'image', src: '{{logo}}', xMm: 24, yMm: 1, widthMm: 28, heightMm: 14, style: { alignItems: 'center', justifyContent: 'center' } },
          { id: 'el-company', type: 'variable', variableKey: 'company.name', xMm: 2, yMm: 16, widthMm: 72, heightMm: 6, font: { sizePt: 11, bold: true }, style: { textAlign: 'center' } },
          { id: 'el-company-phone', type: 'variable', variableKey: 'company.phone', xMm: 2, yMm: 22, widthMm: 72, heightMm: 4, font: { sizePt: 7 }, style: { textAlign: 'center' } },
          { id: 'el-tax-num', type: 'variable', variableKey: 'company.tax_number', xMm: 2, yMm: 26, widthMm: 72, heightMm: 4, font: { sizePt: 7 }, style: { textAlign: 'center' } },
          { id: 'el-sep1', type: 'line', xMm: 2, yMm: 31, widthMm: 72, heightMm: 0.2, thicknessMm: 0.2, color: '#333', horizontal: true },
          { id: 'el-type', type: 'variable', variableKey: 'invoice.type_label', xMm: 2, yMm: 33, widthMm: 72, heightMm: 5, font: { sizePt: 10, bold: true }, style: { textAlign: 'center' } },
          { id: 'el-sep2', type: 'line', xMm: 2, yMm: 39, widthMm: 72, heightMm: 0.2, thicknessMm: 0.2, color: '#333', horizontal: true },
          { id: 'el-label-inv', type: 'text', content: 'رقم الفاتورة:', xMm: 2, yMm: 41, widthMm: 25, heightMm: 4, font: { sizePt: 7, bold: true } },
          { id: 'el-inv-num', type: 'variable', variableKey: 'invoice.number', xMm: 27, yMm: 41, widthMm: 47, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-label-date', type: 'text', content: 'التاريخ:', xMm: 2, yMm: 45, widthMm: 25, heightMm: 4, font: { sizePt: 7, bold: true } },
          { id: 'el-inv-date', type: 'variable', variableKey: 'invoice.date', xMm: 27, yMm: 45, widthMm: 47, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-label-cust', type: 'text', content: 'العميل:', xMm: 2, yMm: 49, widthMm: 25, heightMm: 4, font: { sizePt: 7, bold: true } },
          { id: 'el-customer', type: 'variable', variableKey: 'customer.name', xMm: 27, yMm: 49, widthMm: 47, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-label-pay', type: 'text', content: 'طريقة الدفع:', xMm: 2, yMm: 53, widthMm: 25, heightMm: 4, font: { sizePt: 7, bold: true } },
          { id: 'el-payment', type: 'variable', variableKey: 'invoice.payment_method', xMm: 27, yMm: 53, widthMm: 47, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-sep3', type: 'line', xMm: 2, yMm: 58, widthMm: 72, heightMm: 0.2, thicknessMm: 0.2, color: '#333', horizontal: true },
          { id: 'el-table', type: 'table', xMm: 2, yMm: 60, widthMm: 72, heightMm: 70,
            columns: [{ key: 'description', label: 'الصنف' }, { key: 'quantity', label: 'كمية' }, { key: 'unit_price', label: 'سعر' }, { key: 'total', label: 'إجمالي' }],
            headerStyle: { backgroundColor: '#333', color: '#fff', bold: true, fontSizePt: 7 },
          },
          { id: 'el-sep4', type: 'line', xMm: 2, yMm: 132, widthMm: 72, heightMm: 0.2, thicknessMm: 0.2, color: '#333', horizontal: true },
          { id: 'el-sub-l', type: 'text', content: 'المجموع الفرعي:', xMm: 2, yMm: 134, widthMm: 36, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-subtotal', type: 'variable', variableKey: 'subtotal', xMm: 38, yMm: 134, widthMm: 36, heightMm: 4, font: { sizePt: 8 }, style: { textAlign: 'left' } },
          { id: 'el-tax-l', type: 'text', content: 'الضريبة:', xMm: 2, yMm: 138, widthMm: 36, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-tax', type: 'variable', variableKey: 'tax_amount', xMm: 38, yMm: 138, widthMm: 36, heightMm: 4, font: { sizePt: 8 }, style: { textAlign: 'left' } },
          { id: 'el-disc-l', type: 'text', content: 'الخصم:', xMm: 2, yMm: 142, widthMm: 36, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-disc', type: 'variable', variableKey: 'discount_amount', xMm: 38, yMm: 142, widthMm: 36, heightMm: 4, font: { sizePt: 8 }, style: { textAlign: 'left' } },
          { id: 'el-sep5', type: 'line', xMm: 2, yMm: 147, widthMm: 72, heightMm: 0.3, thicknessMm: 0.3, color: '#000', horizontal: true },
          { id: 'el-total-l', type: 'text', content: 'الإجمالي:', xMm: 2, yMm: 149, widthMm: 36, heightMm: 5, font: { sizePt: 10, bold: true } },
          { id: 'el-total', type: 'variable', variableKey: 'total', xMm: 38, yMm: 149, widthMm: 36, heightMm: 5, font: { sizePt: 10, bold: true }, style: { textAlign: 'left' } },
          { id: 'el-paid-l', type: 'text', content: 'المدفوع:', xMm: 2, yMm: 155, widthMm: 36, heightMm: 4, font: { sizePt: 8 } },
          { id: 'el-paid', type: 'variable', variableKey: 'amount_paid', xMm: 38, yMm: 155, widthMm: 36, heightMm: 4, font: { sizePt: 8 }, style: { textAlign: 'left' } },
          { id: 'el-bal-l', type: 'text', content: 'المتبقي:', xMm: 2, yMm: 159, widthMm: 36, heightMm: 4, font: { sizePt: 8, bold: true } },
          { id: 'el-balance', type: 'variable', variableKey: 'balance', xMm: 38, yMm: 159, widthMm: 36, heightMm: 4, font: { sizePt: 8, bold: true }, style: { textAlign: 'left' } },
          { id: 'el-sep6', type: 'line', xMm: 2, yMm: 165, widthMm: 72, heightMm: 0.2, thicknessMm: 0.2, color: '#999', horizontal: true },
          { id: 'el-qr', type: 'variable', variableKey: 'qr_code', xMm: 22, yMm: 167, widthMm: 30, heightMm: 30 },
          { id: 'el-thanks', type: 'text', content: 'شكراً لتعاملكم معنا', xMm: 2, yMm: 200, widthMm: 72, heightMm: 5, font: { sizePt: 8, bold: true }, style: { textAlign: 'center' } },
        ] as DesignElement[],
      }
    },
  },
]

export default function TemplateDesignerPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0

  const [design, setDesign] = useState<TemplateDesignData>(() => defaultDesign('قالب جديد'))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dragVariable, setDragVariable] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showGridLines, setShowGridLines] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [showPreview, setShowPreview] = useState(false)
  const [leftTab, setLeftTab] = useState<'elements' | 'layers'>('elements')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ company: true, invoice: true, customer: true, amounts: true, codes: true, other: false })
  const canvasRef = useRef<HTMLDivElement>(null)

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<TemplateDesignData[]>([])
  const [redoStack, setRedoStack] = useState<TemplateDesignData[]>([])

  const pushUndo = useCallback((prev: TemplateDesignData) => {
    setUndoStack((s) => [...s.slice(-MAX_UNDO), prev])
    setRedoStack([])
  }, [])

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length === 0) return s
      const prev = s[s.length - 1]
      setRedoStack((r) => [...r, design])
      setDesign(prev)
      return s.slice(0, -1)
    })
  }, [design])

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r
      const next = r[r.length - 1]
      setUndoStack((s) => [...s, design])
      setDesign(next)
      return r.slice(0, -1)
    })
  }, [design])

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: existingTemplate } = useQuery({
    queryKey: ['document-template', tenantId, id],
    queryFn: () => fetchDocumentTemplate(tenantId, Number(id)),
    enabled: !!id && !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: (payload: { name: string; content: string; meta?: Record<string, unknown>; format?: string }) =>
      createDocumentTemplate(tenantId, {
        name: payload.name,
        doc_type: 'invoice',
        format: payload.format ?? '80mm',
        content: payload.content,
        ...(payload.meta != null && { meta: payload.meta }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', type: 'success' })
      navigate('/settings/print-templates')
    },
    onError: (e: any) => setToast({ message: e?.response?.data?.message ?? 'فشل الحفظ', type: 'error' }),
  })

  const updateMut = useMutation({
    mutationFn: (payload: { name: string; content: string; meta?: Record<string, unknown>; format?: string }) =>
      updateDocumentTemplate(tenantId, Number(id), {
        name: payload.name,
        content: payload.content,
        ...(payload.meta != null && { meta: payload.meta }),
        ...(payload.format != null && { format: payload.format }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', type: 'success' })
    },
    onError: (e: any) => setToast({ message: e?.response?.data?.message ?? 'فشل الحفظ', type: 'error' }),
  })

  useEffect(() => {
    if (!existingTemplate) return
    const meta = existingTemplate.meta as Record<string, unknown> | null | undefined
    if (meta?.design && typeof meta.design === 'object') {
      setDesign(meta.design as TemplateDesignData)
    } else {
      setDesign((d) => ({ ...d, name: existingTemplate.name }))
    }
  }, [existingTemplate])

  // اختيار عنصر — الأساسي = أول عنصر محدد
  const selectedId = selectedIds.size > 0 ? Array.from(selectedIds)[0] : null
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set())
  }, [])
  const selectedElement = design.elements.find((e) => e.id === selectedId)
  const selectedElements = design.elements.filter((e) => selectedIds.has(e.id))
  const isMultiSelect = selectedIds.size > 1
  const contentWidthMm = design.page.widthMm - design.page.marginLeftMm - design.page.marginRightMm
  const contentHeightMm = design.page.heightMm - design.page.marginTopMm - design.page.marginBottomMm

  const updateDesign = useCallback((updater: (d: TemplateDesignData) => TemplateDesignData) => {
    setDesign((prev) => {
      // حفظ النسخة الحالية قبل التعديل (سيتم تطبيقه بعد الprev)
      queueMicrotask(() => pushUndo(prev))
      return updater(prev)
    })
  }, [pushUndo])

  const updatePage = useCallback((patch: Partial<PageSettings>) => {
    updateDesign((d) => ({ ...d, page: { ...d.page, ...patch } }))
  }, [updateDesign])

  const updateGlobalFont = useCallback((patch: Partial<FontSettings>) => {
    updateDesign((d) => ({ ...d, globalFont: { ...d.globalFont, ...patch } }))
  }, [updateDesign])

  const addElement = useCallback((element: DesignElement) => {
    updateDesign((d) => ({ ...d, elements: [...d.elements, element] }))
    setSelectedId(element.id)
  }, [updateDesign])

  const duplicateElement = useCallback((elementId: string) => {
    const el = design.elements.find((e) => e.id === elementId)
    if (!el) return
    const clone: DesignElement = { ...JSON.parse(JSON.stringify(el)), id: createId(), xMm: el.xMm + 5, yMm: el.yMm + 5 }
    addElement(clone)
  }, [design.elements, addElement])

  const onDropVariable = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const key = dragVariable ?? e.dataTransfer.getData('variableKey')
    if (!key) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const xMm = (e.clientX - rect.left) / (MM_TO_PX * zoom)
    const yMm = (e.clientY - rect.top) / (MM_TO_PX * zoom)
    const snapped = snapToGrid(Math.max(0, xMm), Math.max(0, yMm), contentWidthMm)
    addElement({
      id: createId(),
      type: 'variable',
      variableKey: key,
      xMm: snapped.xMm,
      yMm: snapped.yMm,
      font: { ...design.globalFont },
    } as VariableElement)
    setDragVariable(null)
  }, [addElement, design.globalFont, dragVariable, zoom])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const removeElement = useCallback((elementId: string) => {
    updateDesign((d) => ({ ...d, elements: d.elements.filter((el) => el.id !== elementId) }))
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(elementId); return next })
  }, [updateDesign])

  /** حذف جميع العناصر المحددة */
  const removeSelectedElements = useCallback(() => {
    if (selectedIds.size === 0) return
    updateDesign((d) => ({ ...d, elements: d.elements.filter((el) => !selectedIds.has(el.id)) }))
    setSelectedIds(new Set())
  }, [updateDesign, selectedIds])

  const updateElement = useCallback((elementId: string, patch: Record<string, unknown>) => {
    updateDesign((d) => ({
      ...d,
      elements: d.elements.map((el) => (el.id === elementId ? { ...el, ...patch } as typeof el : el)),
    }))
  }, [updateDesign])

  /** تطبيق خاصية على جميع العناصر المحددة مع دمج font و style */
  const updateSelectedElements = useCallback((patch: Record<string, unknown>) => {
    if (selectedIds.size === 0) return
    updateDesign((d) => ({
      ...d,
      elements: d.elements.map((el) => {
        if (!selectedIds.has(el.id)) return el
        const merged = { ...el } as unknown as Record<string, unknown>
        for (const key of Object.keys(patch)) {
          if ((key === 'font' || key === 'style') && typeof patch[key] === 'object' && patch[key] != null) {
            merged[key] = { ...((merged[key] as Record<string, unknown>) ?? {}), ...(patch[key] as Record<string, unknown>) }
          } else {
            merged[key] = patch[key]
          }
        }
        return merged as unknown as typeof el
      }),
    }))
  }, [updateDesign, selectedIds])

  /** تجميع العناصر المحددة */
  const groupSelectedElements = useCallback(() => {
    if (selectedIds.size < 2) return
    const gid = createId()
    updateDesign((d) => ({
      ...d,
      elements: d.elements.map((el) => (selectedIds.has(el.id) ? { ...el, groupId: gid } as typeof el : el)),
    }))
  }, [updateDesign, selectedIds])

  /** فك تجميع العناصر المحددة */
  const ungroupSelectedElements = useCallback(() => {
    if (selectedIds.size === 0) return
    // جمع كل groupIds للعناصر المحددة
    const groupIdsToRemove = new Set<string>()
    design.elements.forEach((el) => {
      if (selectedIds.has(el.id) && el.groupId) groupIdsToRemove.add(el.groupId)
    })
    if (groupIdsToRemove.size === 0) return
    updateDesign((d) => ({
      ...d,
      elements: d.elements.map((el) => (el.groupId && groupIdsToRemove.has(el.groupId) ? { ...el, groupId: undefined } as typeof el : el)),
    }))
  }, [updateDesign, selectedIds, design.elements])

  /** اختيار/إضافة عنصر — مع دعم Shift (تحديد متعدد) والمجموعات */
  const selectElement = useCallback((elementId: string, shiftKey: boolean) => {
    const el = design.elements.find((e) => e.id === elementId)
    if (!el) return
    if (shiftKey) {
      // Shift+Click: إضافة/إزالة من التحديد
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(elementId)) {
          next.delete(elementId)
        } else {
          next.add(elementId)
        }
        return next
      })
    } else {
      // Click عادي: إذا العنصر في مجموعة، حدد كل المجموعة
      if (el.groupId) {
        const groupMembers = design.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id)
        setSelectedIds(new Set(groupMembers))
      } else {
        setSelectedIds(new Set([elementId]))
      }
    }
  }, [design.elements])

  /** نقل العنصر لأعلى في الطبقات */
  const moveElementUp = useCallback((elementId: string) => {
    updateDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === elementId)
      if (idx < 0 || idx >= d.elements.length - 1) return d
      const els = [...d.elements]
      ;[els[idx], els[idx + 1]] = [els[idx + 1], els[idx]]
      return { ...d, elements: els }
    })
  }, [updateDesign])

  /** نقل العنصر لأسفل في الطبقات */
  const moveElementDown = useCallback((elementId: string) => {
    updateDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === elementId)
      if (idx <= 0) return d
      const els = [...d.elements]
      ;[els[idx], els[idx - 1]] = [els[idx - 1], els[idx]]
      return { ...d, elements: els }
    })
  }, [updateDesign])

  /** نقل لأعلى الطبقات */
  const moveElementToFront = useCallback((elementId: string) => {
    updateDesign((d) => {
      const el = d.elements.find((e) => e.id === elementId)
      if (!el) return d
      return { ...d, elements: [...d.elements.filter((e) => e.id !== elementId), el] }
    })
  }, [updateDesign])

  /** نقل لأسفل الطبقات */
  const moveElementToBack = useCallback((elementId: string) => {
    updateDesign((d) => {
      const el = d.elements.find((e) => e.id === elementId)
      if (!el) return d
      return { ...d, elements: [el, ...d.elements.filter((e) => e.id !== elementId)] }
    })
  }, [updateDesign])

  const handleSave = useCallback(() => {
    const html = templateDesignToHtml(design)
    const meta = { design }
    const format = design.page.preset === 'custom' ? 'a4' : design.page.preset
    if (id) {
      updateMut.mutate({ name: design.name, content: html, meta, format })
    } else {
      createMut.mutate({ name: design.name, content: html, meta, format })
    }
  }, [design, id, updateMut, createMut])

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // تجاهل الاختصارات عند الكتابة في حقول الإدخال
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // السماح فقط بـ Ctrl+S و Ctrl+Z و Ctrl+Y
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'z' || e.key === 'y')) {
          // تابع لمعالجة هذه الاختصارات
        } else {
          return
        }
      }
      // Delete: حذف العناصر المحددة
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !editingTextId) {
        e.preventDefault()
        removeSelectedElements()
        return
      }
      // Ctrl+Z: تراجع
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      // Ctrl+Shift+Z or Ctrl+Y: إعادة
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      // Ctrl+D: تكرار العنصر
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault()
        duplicateElement(selectedId)
        return
      }
      // Ctrl+G: تجميع العناصر المحددة
      if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey && selectedIds.size >= 2) {
        e.preventDefault()
        groupSelectedElements()
        return
      }
      // Ctrl+Shift+G: فك التجميع
      if ((e.ctrlKey || e.metaKey) && e.key === 'g' && e.shiftKey && selectedIds.size > 0) {
        e.preventDefault()
        ungroupSelectedElements()
        return
      }
      // Ctrl+A: تحديد الكل
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setSelectedIds(new Set(design.elements.map((el) => el.id)))
        return
      }
      // Ctrl+S: حفظ
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      // سهم للتحريك الدقيق — يحرك جميع العناصر المحددة
      if (selectedIds.size > 0 && !editingTextId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const movableEls = design.elements.filter((el) => selectedIds.has(el.id) && !el.locked)
        if (movableEls.length === 0) return
        const step = e.shiftKey ? 5 : 1
        updateDesign((d) => ({
          ...d,
          elements: d.elements.map((el) => {
            if (!selectedIds.has(el.id) || el.locked) return el
            switch (e.key) {
              case 'ArrowUp': return { ...el, yMm: Math.max(0, el.yMm - step) } as typeof el
              case 'ArrowDown': return { ...el, yMm: el.yMm + step } as typeof el
              case 'ArrowLeft': return { ...el, xMm: Math.max(0, el.xMm - step) } as typeof el
              case 'ArrowRight': return { ...el, xMm: el.xMm + step } as typeof el
              default: return el
            }
          }),
        }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, selectedIds, editingTextId, design.elements, removeSelectedElements, undo, redo, duplicateElement, groupSelectedElements, ungroupSelectedElements, handleSave, updateDesign])

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* شريط علوي */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/settings/print-templates')}
            className="p-2 rounded-app hover:bg-secondary-100 text-slate-600"
          >
            <ArrowLeft size={20} />
          </button>
          <input
            type="text"
            value={design.name}
            onChange={(e) => updateDesign((d) => ({ ...d, name: e.target.value }))}
            className="input-app text-lg font-semibold w-48 sm:w-64"
            placeholder="اسم القالب"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>قوالب جاهزة:</span>
            <select
              className="input-app w-auto min-w-[140px]"
              value=""
              onChange={(e) => {
                const preset = TEMPLATE_PRESETS.find((p) => p.id === e.target.value)
                if (preset) setDesign(preset.build(design.name))
                e.target.value = ''
              }}
            >
              <option value="">— اختر —</option>
              {TEMPLATE_PRESETS.filter((p) => p.id !== 'empty').map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Undo / Redo */}
          <button type="button" onClick={undo} disabled={undoStack.length === 0} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30" title="تراجع (Ctrl+Z)">
            <Undo2 size={18} />
          </button>
          <button type="button" onClick={redo} disabled={redoStack.length === 0} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30" title="إعادة (Ctrl+Y)">
            <Redo2 size={18} />
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          {/* عداد التحديد */}
          {selectedIds.size > 0 && (
            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
              {selectedIds.size === 1 ? 'عنصر محدد' : `${selectedIds.size} عناصر محددة`}
            </span>
          )}
          {selectedIds.size > 0 && <div className="w-px h-6 bg-slate-200 mx-1" />}
          {/* Zoom */}
          <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="تصغير">
            <ZoomOut size={18} />
          </button>
          <span className="text-xs text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="تكبير">
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="text-xs text-slate-500 hover:text-slate-700 px-1" title="إعادة تعيين التكبير">100%</button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          {/* تجميع / فك التجميع */}
          <button
            type="button"
            onClick={groupSelectedElements}
            disabled={selectedIds.size < 2}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
            title="تجميع العناصر المحددة (Ctrl+G)"
          >
            <Group size={18} />
          </button>
          <button
            type="button"
            onClick={ungroupSelectedElements}
            disabled={!selectedElements.some((el) => el.groupId)}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
            title="فك التجميع (Ctrl+Shift+G)"
          >
            <Ungroup size={18} />
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          {/* معاينة */}
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={`p-1.5 rounded flex items-center gap-1 text-sm ${showPreview ? 'bg-primary-100 text-primary-700' : 'hover:bg-slate-100 text-slate-500'}`}
            title="معاينة ببيانات نموذجية"
          >
            <Eye size={18} /> <span className="hidden sm:inline">معاينة</span>
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={18} /> حفظ القالب
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* اللوحة اليسرى: العناصر + الطبقات */}
        <aside className="w-72 bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
          {/* تبويب العناصر / الطبقات */}
          <div className="flex border-b border-slate-200">
            <button type="button" onClick={() => setLeftTab('elements')} className={`flex-1 py-2.5 text-sm font-medium ${leftTab === 'elements' ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
              العناصر
            </button>
            <button type="button" onClick={() => setLeftTab('layers')} className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1 ${leftTab === 'layers' ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
              <Layers size={14} /> الطبقات
            </button>
          </div>

          {leftTab === 'elements' ? (
            <div className="p-4 space-y-5 overflow-y-auto flex-1">
              {/* المتغيرات مجمّعة */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-sm">
                  <GripVertical size={16} /> المتغيرات
                </h3>
                <p className="text-xs text-slate-500 mb-2">اسحب وأفلت في منطقة التصميم</p>
                <div className="space-y-1.5">
                  {VARIABLE_GROUPS.map((group) => {
                    const vars = VARIABLE_KEYS.filter((v) => v.group === group.key)
                    const isOpen = expandedGroups[group.key]
                    return (
                      <div key={group.key}>
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((g) => ({ ...g, [group.key]: !g[group.key] }))}
                          className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-600"
                        >
                          {group.label} ({vars.length})
                          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="mt-1 space-y-0.5 pr-1 max-h-48 overflow-y-auto">
                            {vars.map((v) => (
                              <div
                                key={v.key}
                                draggable
                                onDragStart={(e) => {
                                  setDragVariable(v.key)
                                  e.dataTransfer.setData('variableKey', v.key)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onDragEnd={() => setDragVariable(null)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 bg-white cursor-grab hover:border-primary-300 hover:bg-primary-50/50 text-xs"
                              >
                                <GripVertical size={12} className="text-slate-400 shrink-0" />
                                {v.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* أدوات إضافة العناصر */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-sm">
                  <Plus size={16} /> إضافة عنصر
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {/* نص ثابت */}
                  <button
                    type="button"
                    onClick={() => {
                      const count = design.elements.filter((e) => e.type === 'text').length
                      const el: TextElement = { id: createId(), type: 'text', content: 'نص', xMm: 10, yMm: 10 + count * 8, widthMm: 40, heightMm: 8, font: { ...design.globalFont } }
                      addElement(el)
                      setEditingTextId(el.id)
                    }}
                    className="flex flex-col items-center gap-1 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:border-primary-300"
                  >
                    <Type size={18} /> نص ثابت
                  </button>
                  {/* خط فاصل */}
                  <button
                    type="button"
                    onClick={() => {
                      addElement({
                        id: createId(),
                        type: 'line',
                        xMm: 0,
                        yMm: 50,
                        widthMm: contentWidthMm,
                        heightMm: 0.3,
                        thicknessMm: 0.3,
                        color: '#e2e8f0',
                        horizontal: true,
                      } as LineElement)
                    }}
                    className="flex flex-col items-center gap-1 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:border-primary-300"
                  >
                    <SeparatorHorizontal size={18} /> خط فاصل
                  </button>
                  {/* مستطيل */}
                  <button
                    type="button"
                    onClick={() => {
                      addElement({
                        id: createId(),
                        type: 'rectangle',
                        xMm: 10,
                        yMm: 10,
                        widthMm: 50,
                        heightMm: 20,
                        style: { backgroundColor: '#f1f5f9', borderWidthMm: 0.2, borderStyle: 'solid', borderColor: '#cbd5e1', borderRadiusMm: 1 },
                      } as RectangleElement)
                    }}
                    className="flex flex-col items-center gap-1 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:border-primary-300"
                  >
                    <Square size={18} /> مستطيل
                  </button>
                  {/* شعار */}
                  <button
                    type="button"
                    onClick={() =>
                      addElement({
                        id: createId(),
                        type: 'image',
                        src: '{{logo}}',
                        xMm: 10,
                        yMm: 10,
                        widthMm: 30,
                        heightMm: 20,
                        style: { alignItems: 'center', justifyContent: 'center' },
                      } as ImageElement)
                    }
                    className="flex flex-col items-center gap-1 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:border-primary-300"
                  >
                    <Image size={18} /> شعار
                  </button>
                </div>
              </section>

              {/* جدول المنتجات */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-sm">
                  <Layout size={16} /> جدول المنتجات
                </h3>
                <div className="space-y-2">
                  {(design.elements.find((e) => e.type === 'table') as TableElement | undefined)?.columns?.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={col.label}
                        onChange={(e) => {
                          const tableEl = design.elements.find((e) => e.type === 'table') as TableElement | undefined
                          if (!tableEl) return
                          const next = [...tableEl.columns]
                          next[idx] = { ...next[idx], label: e.target.value }
                          updateElement(tableEl.id, { columns: next })
                        }}
                        className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs"
                      />
                      <span className="text-[10px] text-slate-400 w-14 truncate" title={col.key}>{col.key}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const tableEl = design.elements.find((e) => e.type === 'table') as TableElement | undefined
                          if (!tableEl || tableEl.columns.length <= 1) return
                          const next = tableEl.columns.filter((_, i) => i !== idx)
                          updateElement(tableEl.id, { columns: next })
                        }}
                        className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                        title="حذف العمود"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {(design.elements.find((e) => e.type === 'table') as TableElement | undefined) && (
                    <select
                      className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs"
                      value=""
                      onChange={(e) => {
                        const tableEl = design.elements.find((el) => el.type === 'table') as TableElement | undefined
                        if (!tableEl || !e.target.value) return
                        const colDef = PRODUCT_TABLE_COLUMN_KEYS.find((k) => k.key === e.target.value)
                        if (!colDef) return
                        updateElement(tableEl.id, { columns: [...tableEl.columns, { key: colDef.key, label: colDef.label }] })
                        e.target.value = ''
                      }}
                    >
                      <option value="">+ إضافة عمود...</option>
                      {PRODUCT_TABLE_COLUMN_KEYS.filter((k) => {
                        const tableEl = design.elements.find((el) => el.type === 'table') as TableElement | undefined
                        return !tableEl?.columns.some((c) => c.key === k.key)
                      }).map((k) => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                  )}
                  {!design.elements.some((e) => e.type === 'table') && (
                    <button
                      type="button"
                      onClick={() => {
                        addElement({
                          id: createId(),
                          type: 'table',
                          xMm: 0,
                          yMm: 80,
                          widthMm: contentWidthMm,
                          columns: PRODUCT_TABLE_COLUMN_KEYS.slice(2, 6).map((c) => ({ key: c.key, label: c.label })),
                          headerStyle: { backgroundColor: '#f1f5f9', color: '#1e293b', bold: true },
                        } as TableElement)
                      }}
                      className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Plus size={14} /> إضافة جدول منتجات
                    </button>
                  )}
                </div>
              </section>

              {/* إعدادات الشعار والإطار */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-2 text-sm">إعدادات إضافية</h3>
                <label className="flex items-center gap-2 text-xs mb-1.5">
                  <input
                    type="checkbox"
                    checked={design.logo.enabled}
                    onChange={(e) => updateDesign((d) => ({ ...d, logo: { ...d.logo, enabled: e.target.checked } }))}
                    className="rounded"
                  />
                  إظهار مكان الشعار (إطار إرشادي)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={design.frame.enabled}
                    onChange={(e) => updateDesign((d) => ({ ...d, frame: { ...d.frame, enabled: e.target.checked } }))}
                    className="rounded"
                  />
                  إطار حول الفاتورة
                </label>
              </section>

              {/* اختصارات */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-1 text-sm">اختصارات لوحة المفاتيح</h3>
                <div className="text-[10px] text-slate-400 space-y-0.5">
                  <div>Delete — حذف العنصر</div>
                  <div>Ctrl+Z — تراجع</div>
                  <div>Ctrl+Y — إعادة</div>
                  <div>Ctrl+D — تكرار العنصر</div>
                  <div>Ctrl+S — حفظ</div>
                  <div>Ctrl+A — تحديد الكل</div>
                  <div>Ctrl+G — تجميع العناصر المحددة</div>
                  <div>Ctrl+Shift+G — فك التجميع</div>
                  <div>Shift+Click — إضافة للتحديد</div>
                  <div>سحب على الخلفية — تحديد متعدد</div>
                  <div>أسهم — تحريك 1مم (Shift: 5مم)</div>
                </div>
              </section>
            </div>
          ) : (
            /* لوحة الطبقات */
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-slate-500 mb-2">العناصر (أعلى القائمة = أمام)</p>
              <div className="space-y-1">
                {[...design.elements].reverse().map((el) => {
                  const label = el.type === 'variable' ? VARIABLE_KEYS.find((v) => v.key === (el as VariableElement).variableKey)?.label ?? (el as VariableElement).variableKey
                    : el.type === 'text' ? `"${(el as TextElement).content.slice(0, 15)}"`
                    : elementTypeLabel(el.type)
                  const isInGroup = !!el.groupId
                  return (
                    <div
                      key={el.id}
                      onClick={(e) => selectElement(el.id, e.shiftKey)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer ${selectedIds.has(el.id) ? 'bg-primary-50 ring-1 ring-primary-300' : 'hover:bg-slate-50'} ${isInGroup ? 'border-r-2 border-indigo-400' : ''}`}
                    >
                      {isInGroup && <Group size={10} className="text-indigo-400 flex-shrink-0" />}
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-[10px] text-slate-400">{elementTypeLabel(el.type)}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); updateElement(el.id, { locked: !el.locked }) }} className="p-0.5 hover:bg-slate-200 rounded" title={el.locked ? 'إلغاء القفل' : 'قفل'}>
                        {el.locked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} className="text-slate-400" />}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElementUp(el.id) }} className="p-0.5 hover:bg-slate-200 rounded" title="تقديم">
                        <ChevronUp size={12} />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElementDown(el.id) }} className="p-0.5 hover:bg-slate-200 rounded" title="تأخير">
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  )
                })}
                {design.elements.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">لا يوجد عناصر</p>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* منطقة التصميم + المعاينة الحية */}
        <main className="flex-1 overflow-auto p-6 flex justify-center items-start">
          <div
            ref={canvasRef}
            className="bg-white shadow-lg origin-top"
            style={{
              width: design.page.widthMm * MM_TO_PX,
              minHeight: design.page.heightMm * MM_TO_PX,
              padding: `${design.page.marginTopMm * MM_TO_PX}px ${design.page.marginRightMm * MM_TO_PX}px ${design.page.marginBottomMm * MM_TO_PX}px ${design.page.marginLeftMm * MM_TO_PX}px`,
              border: design.frame.enabled ? `${design.frame.borderWidthMm * MM_TO_PX}px solid ${design.frame.borderColor}` : 'none',
              boxSizing: 'border-box',
              position: 'relative',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              fontFamily: design.globalFont.family,
              fontSize: `${design.globalFont.sizePt ?? 10}pt`,
              color: design.globalFont.color,
              direction: 'rtl',
            }}
            onDrop={onDropVariable}
            onDragOver={onDragOver}
          >
            <div
              className="relative bg-neutral-50/50"
              style={{
                width: contentWidthMm * MM_TO_PX,
                minHeight: contentHeightMm * MM_TO_PX,
              }}
              onMouseDown={(e) => {
                // بدء تحديد بالسحب (marquee) عند الضغط على الخلفية
                if (e.target === e.currentTarget) {
                  if (!e.shiftKey) setSelectedIds(new Set())
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = (e.clientX - rect.left) / zoom
                  const y = (e.clientY - rect.top) / zoom
                  setMarquee({ startX: x, startY: y, currentX: x, currentY: y })
                }
              }}
              onMouseMove={(e) => {
                // تحديث مربع التحديد
                if (marquee && !drag && !resize) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = (e.clientX - rect.left) / zoom
                  const y = (e.clientY - rect.top) / zoom
                  setMarquee((m) => m ? { ...m, currentX: x, currentY: y } : null)
                  // تحديد العناصر داخل المربع أثناء السحب
                  const mx1 = Math.min(marquee.startX, x) / MM_TO_PX
                  const my1 = Math.min(marquee.startY, y) / MM_TO_PX
                  const mx2 = Math.max(marquee.startX, x) / MM_TO_PX
                  const my2 = Math.max(marquee.startY, y) / MM_TO_PX
                  const hits = design.elements.filter((el) => {
                    const ex1 = el.xMm; const ey1 = el.yMm
                    const ex2 = el.xMm + (el.widthMm ?? 30); const ey2 = el.yMm + (el.heightMm ?? 8)
                    return ex1 < mx2 && ex2 > mx1 && ey1 < my2 && ey2 > my1
                  })
                  setSelectedIds(new Set(hits.map((el) => el.id)))
                  return
                }
                if (resize) {
                  const dxPx = (e.clientX - resize.startMouseX) / zoom
                  const dyPx = (e.clientY - resize.startMouseY) / zoom
                  const dxMm = dxPx / MM_TO_PX
                  const dyMm = dyPx / MM_TO_PX
                  const edge = resize.edge
                  const left = edge === 'left' || edge === 'top-left' || edge === 'bottom-left'
                  const right = edge === 'right' || edge === 'top-right' || edge === 'bottom-right'
                  const top = edge === 'top' || edge === 'top-left' || edge === 'top-right'
                  const bottom = edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right'
                  let nextX = resize.startXMm
                  let nextY = resize.startYMm
                  let nextWidth = resize.startWidthMm
                  let nextHeight = resize.startHeightMm
                  if (right) nextWidth = Math.max(5, resize.startWidthMm + dxMm)
                  if (left) {
                    nextWidth = Math.max(5, resize.startWidthMm - dxMm)
                    nextX = resize.startXMm + (resize.startWidthMm - nextWidth)
                  }
                  if (bottom) nextHeight = Math.max(5, resize.startHeightMm + dyMm)
                  if (top) {
                    nextHeight = Math.max(5, resize.startHeightMm - dyMm)
                    nextY = resize.startYMm + (resize.startHeightMm - nextHeight)
                  }
                  const patch: { xMm?: number; yMm?: number; widthMm?: number; heightMm?: number } = { widthMm: nextWidth, heightMm: nextHeight }
                  if (left) patch.xMm = nextX
                  if (top) patch.yMm = nextY
                  updateElement(resize.id, patch)
                  return
                }
                if (!drag) return
                const dxPx = (e.clientX - drag.startMouseX) / zoom
                const dyPx = (e.clientY - drag.startMouseY) / zoom
                const dxMm = dxPx / MM_TO_PX
                const dyMm = dyPx / MM_TO_PX
                const newX = drag.startXMm + dxMm
                const newY = drag.startYMm + dyMm
                const snapped = snapToGrid(Math.max(0, newX), Math.max(0, newY), contentWidthMm)
                const deltaXMm = snapped.xMm - drag.startXMm
                const deltaYMm = snapped.yMm - drag.startYMm
                // تحريك جميع العناصر المحددة + عناصر المجموعة
                const dragEl = design.elements.find((el) => el.id === drag.id)
                const movingIds = new Set(selectedIds)
                // إضافة عناصر المجموعة إذا كان العنصر المسحوب في مجموعة
                if (dragEl?.groupId) {
                  design.elements.forEach((el) => { if (el.groupId === dragEl.groupId) movingIds.add(el.id) })
                }
                if (movingIds.size <= 1) {
                  // عنصر واحد فقط
                  updateElement(drag.id, { xMm: snapped.xMm, yMm: snapped.yMm })
                } else {
                  // تحريك مجموعة
                  updateDesign((d) => ({
                    ...d,
                    elements: d.elements.map((el) => {
                      if (!movingIds.has(el.id) || el.locked || el.id === drag.id) {
                        if (el.id === drag.id) return { ...el, xMm: snapped.xMm, yMm: snapped.yMm } as typeof el
                        return el
                      }
                      return { ...el, xMm: Math.max(0, el.xMm + deltaXMm), yMm: Math.max(0, el.yMm + deltaYMm) } as typeof el
                    }),
                  }))
                }
              }}
              onMouseUp={() => {
                if (marquee) setMarquee(null)
                if (drag) setDrag(null)
                if (resize) setResize(null)
              }}
              onMouseLeave={() => {
                if (marquee) setMarquee(null)
                if (drag) setDrag(null)
                if (resize) setResize(null)
              }}
            >
              {/* شبكة 12 عمود — إرشاد بصري للمحاذاة (يمكن إخفاؤها من الخصائص) */}
              {showGridLines && Array.from({ length: GRID_COLS - 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-neutral-200 pointer-events-none"
                  style={{ left: ((i + 1) * (contentWidthMm / GRID_COLS)) * MM_TO_PX }}
                />
              ))}
              {design.logo.enabled && (
                <div
                  className="absolute border-2 border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 bg-white pointer-events-none"
                  style={{
                    left: design.logo.xMm * MM_TO_PX,
                    top: design.logo.yMm * MM_TO_PX,
                    width: design.logo.widthMm * MM_TO_PX,
                    height: design.logo.heightMm * MM_TO_PX,
                  }}
                >
                  شعار (إرشادي)
                </div>
              )}

              {/* مربع التحديد بالسحب (Marquee) */}
              {marquee && (
                <div
                  className="absolute border-2 border-primary-400 bg-primary-100/20 pointer-events-none"
                  style={{
                    left: Math.min(marquee.startX, marquee.currentX),
                    top: Math.min(marquee.startY, marquee.currentY),
                    width: Math.abs(marquee.currentX - marquee.startX),
                    height: Math.abs(marquee.currentY - marquee.startY),
                    zIndex: 9999,
                  }}
                />
              )}

              {design.elements.map((el) => {
                const font = el.font != null ? { ...design.globalFont, ...el.font } : design.globalFont
                const st = el.style ?? {}
                const boxStyle: React.CSSProperties = {
                  padding: (st.paddingMm ?? 0) * MM_TO_PX,
                  borderRadius: (st.borderRadiusMm ?? 0) * MM_TO_PX,
                  backgroundColor: st.backgroundTransparent ? 'transparent' : (st.backgroundColor ?? 'transparent'),
                  border: st.borderWidthMm != null && st.borderStyle && st.borderStyle !== 'none'
                    ? `${(st.borderWidthMm ?? 0) * MM_TO_PX}px ${st.borderStyle} ${st.borderTransparent ? 'transparent' : (st.borderColor ?? '#e2e8f0')}`
                    : undefined,
                  textAlign: st.textAlign ?? 'right',
                  direction: st.direction ?? 'rtl',
                  alignItems: st.alignItems ?? 'center',
                  justifyContent: st.justifyContent ?? 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  zIndex: el.zIndex ?? undefined,
                  opacity: el.locked ? 0.7 : 1,
                }
                const startDrag = (e: React.MouseEvent) => {
                  e.stopPropagation()
                  selectElement(el.id, e.shiftKey)
                  if (el.locked) return
                  setDrag({ id: el.id, startMouseX: e.clientX, startMouseY: e.clientY, startXMm: el.xMm, startYMm: el.yMm })
                }
                const startResize = (e: React.MouseEvent, edge: ResizeEdge) => {
                  e.stopPropagation()
                  if (el.locked) return
                  const baseW = el.widthMm ?? 30; const baseH = el.heightMm ?? 8
                  updateElement(el.id, { widthMm: baseW, heightMm: baseH })
                  setResize({ id: el.id, edge, startMouseX: e.clientX, startMouseY: e.clientY, startXMm: el.xMm, startYMm: el.yMm, startWidthMm: baseW, startHeightMm: baseH })
                }
                const isSelected = selectedIds.has(el.id)
                const gColor = el.groupId ? groupColor(el.groupId) : null
                // إضافة حدود لونية للمجموعات
                if (gColor && !isSelected) {
                  boxStyle.outline = `2px dashed ${gColor}`
                  boxStyle.outlineOffset = '1px'
                }
                const resizeHandles = isSelected && !el.locked && !isMultiSelect ? (
                  <>
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-6 bg-primary-500 rounded cursor-ew-resize" onMouseDown={(e) => startResize(e, 'left')} />
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-6 bg-primary-500 rounded cursor-ew-resize" onMouseDown={(e) => startResize(e, 'right')} />
                    <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-6 h-2 bg-primary-500 rounded cursor-ns-resize" onMouseDown={(e) => startResize(e, 'top')} />
                    <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-6 h-2 bg-primary-500 rounded cursor-ns-resize" onMouseDown={(e) => startResize(e, 'bottom')} />
                    <div className="absolute -left-1 -top-1 w-3 h-3 bg-primary-500 rounded cursor-nwse-resize" onMouseDown={(e) => startResize(e, 'top-left')} />
                    <div className="absolute -right-1 -top-1 w-3 h-3 bg-primary-500 rounded cursor-nesw-resize" onMouseDown={(e) => startResize(e, 'top-right')} />
                    <div className="absolute -left-1 -bottom-1 w-3 h-3 bg-primary-500 rounded cursor-nesw-resize" onMouseDown={(e) => startResize(e, 'bottom-left')} />
                    <div className="absolute -right-1 -bottom-1 w-3 h-3 bg-primary-500 rounded cursor-nwse-resize" onMouseDown={(e) => startResize(e, 'bottom-right')} />
                  </>
                ) : null
                if (el.type === 'variable') {
                  const v = el as VariableElement
                  const label = VARIABLE_KEYS.find((k) => k.key === v.variableKey)?.label ?? v.variableKey
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : 'hover:ring-2 hover:ring-primary-200'}`}
                      style={{
                        ...boxStyle,
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: el.widthMm != null ? el.widthMm * MM_TO_PX : undefined,
                        height: el.heightMm != null ? el.heightMm * MM_TO_PX : undefined,
                        fontFamily: font.family,
                        fontSize: `${font.sizePt ?? 10}pt`,
                        color: font.color,
                        fontWeight: 400,
                        fontStyle: font.italic ? 'italic' : 'normal',
                        textDecoration: font.underline ? 'underline' : 'none',
                        lineHeight: font.lineHeightPt != null ? `${font.lineHeightPt}pt` : undefined,
                        letterSpacing: font.letterSpacingPt != null ? `${font.letterSpacingPt}pt` : undefined,
                      }}
                    >
                      [{label}]
                      {resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'text') {
                  const txt = el as TextElement
                  const isEditing = editingTextId === el.id
                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => {
                        if (isEditing) return
                        startDrag(e)
                      }}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : 'hover:ring-2 hover:ring-primary-200'}`}
                      style={{
                        ...boxStyle,
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: el.widthMm != null ? el.widthMm * MM_TO_PX : undefined,
                        height: el.heightMm != null ? el.heightMm * MM_TO_PX : undefined,
                        fontFamily: font.family,
                        fontSize: `${font.sizePt ?? 10}pt`,
                        color: font.color,
                        fontWeight: 400,
                        fontStyle: font.italic ? 'italic' : 'normal',
                        textDecoration: font.underline ? 'underline' : 'none',
                        lineHeight: font.lineHeightPt != null ? `${font.lineHeightPt}pt` : undefined,
                        letterSpacing: font.letterSpacingPt != null ? `${font.letterSpacingPt}pt` : undefined,
                      }}
                    >
                      <div
                        className="w-full h-full px-1 py-0.5"
                        onDoubleClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([el.id])); setEditingTextId(el.id) }}
                        onMouseDown={(e) => { if (editingTextId) e.stopPropagation() }}
                      >
                        {isEditing ? (
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="w-full h-full outline-none"
                            onBlur={(e) => {
                              const text = e.currentTarget.textContent ?? ''
                              updateElement(el.id, { content: text || 'نص' })
                              setEditingTextId(null)
                            }}
                          >
                            {txt.content || 'نص'}
                          </div>
                        ) : (
                          (txt.content || 'نص').split(/(\{\{[^}]+\}\})/).map((part, i) => {
                            const m = part.match(/^\{\{(.+)\}\}$/)
                            if (m) {
                              const lbl = VARIABLE_KEYS.find((k) => k.key === m[1])?.label ?? m[1]
                              return <span key={i} className="inline-block bg-primary-50 text-primary-600 border border-primary-200 rounded px-0.5 text-[0.85em] mx-0.5 leading-tight">[{lbl}]</span>
                            }
                            return <span key={i}>{part}</span>
                          })
                        )}
                      </div>
                      {!isEditing && resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'table') {
                  const tb = el as TableElement
                  const hs = tb.headerStyle ?? {}
                  const bs = tb.bodyStyle ?? {}
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : ''}`}
                      style={{
                        ...boxStyle,
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: (el.widthMm ?? contentWidthMm) * MM_TO_PX,
                        fontFamily: font.family,
                        fontSize: `${font.sizePt}pt`,
                        color: font.color,
                      }}
                    >
                      <table className="w-full border-collapse" style={{ fontSize: 'inherit', fontFamily: 'inherit', color: 'inherit' }}>
                        <thead>
                          <tr style={{ backgroundColor: hs.backgroundColor ?? '#f1f5f9', color: hs.color ?? '#1e293b', height: hs.heightMm ? `${hs.heightMm * MM_TO_PX}px` : undefined }}>
                            {tb.columns.map((c, i) => (
                              <th key={i} className="border px-2" style={{ textAlign: st.textAlign ?? 'right', fontWeight: 400, fontSize: hs.fontSizePt ? `${hs.fontSizePt}pt` : undefined, borderColor: hs.borderColor ?? '#cbd5e1', verticalAlign: 'middle' }}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: bs.stripedColor || undefined }}><td colSpan={tb.columns.length} className="border p-2 text-slate-400 text-center" style={{ borderColor: bs.borderColor ?? '#e2e8f0' }}>جدول المنتجات</td></tr>
                        </tbody>
                      </table>
                      {resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'image') {
                  const imgEl = el as ImageElement
                  const isCompanyLogo = imgEl.src === '{{logo}}'
                  const logoUrl = (settings as any)?.company_logo as string | undefined
                  const previewSrc = isCompanyLogo ? logoUrl : imgEl.src
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : 'hover:ring-2 hover:ring-primary-200'}`}
                      style={{
                        ...boxStyle,
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: (el.widthMm ?? 30) * MM_TO_PX,
                        height: (el.heightMm ?? 20) * MM_TO_PX,
                      }}
                    >
                      {previewSrc ? (
                        <img src={previewSrc} alt="شعار الشركة" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-400">شعار الشركة</span>
                      )}
                      {resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'line') {
                  const lineEl = el as LineElement
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : 'hover:ring-1 hover:ring-primary-200'}`}
                      style={{
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: (el.widthMm ?? 50) * MM_TO_PX,
                        height: Math.max((lineEl.thicknessMm ?? 0.3) * MM_TO_PX, 3),
                        backgroundColor: lineEl.color ?? '#e2e8f0',
                        zIndex: el.zIndex ?? undefined,
                      }}
                    >
                      {resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'rectangle') {
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${isSelected ? 'ring-2 ring-primary-500' : 'hover:ring-1 hover:ring-primary-200'}`}
                      style={{
                        ...boxStyle,
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: (el.widthMm ?? 50) * MM_TO_PX,
                        height: (el.heightMm ?? 20) * MM_TO_PX,
                      }}
                    >
                      {resizeHandles}
                    </div>
                  )
                }
                if (el.type === 'spacer') {
                  return (
                    <div
                      key={el.id}
                      onMouseDown={startDrag}
                      className={`absolute ${isSelected ? 'ring-2 ring-primary-500 bg-amber-50/50' : 'hover:ring-1 hover:ring-primary-200'}`}
                      style={{
                        left: el.xMm * MM_TO_PX,
                        top: el.yMm * MM_TO_PX,
                        width: (el.widthMm ?? contentWidthMm) * MM_TO_PX,
                        height: ((el as SpacerElement).heightMm ?? 10) * MM_TO_PX,
                        zIndex: el.zIndex ?? undefined,
                      }}
                    >
                      {isSelected && <span className="absolute top-0 left-0 text-[9px] text-amber-500 px-1">مسافة</span>}
                      {resizeHandles}
                    </div>
                  )
                }
                return null
              })}

            </div>
          </div>
        </main>

        {/* اللوحة اليمنى: الخصائص */}
        <aside className="w-80 bg-white border-r border-slate-200 overflow-y-auto p-4 space-y-5">
          <h3 className="font-semibold text-slate-800 text-sm">الخصائص</h3>

          {isMultiSelect ? (
            <>
              {/* لوحة تحديد متعدد */}
              <div className="text-xs text-slate-500 border-b border-slate-100 pb-2">
                تم تحديد {selectedIds.size} عناصر
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={groupSelectedElements}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-medium"
                >
                  <Group size={14} /> تجميع
                </button>
                <button
                  type="button"
                  onClick={ungroupSelectedElements}
                  disabled={!selectedElements.some((el) => el.groupId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs font-medium disabled:opacity-40"
                >
                  <Ungroup size={14} /> فك التجميع
                </button>
                <button
                  type="button"
                  onClick={removeSelectedElements}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-medium"
                >
                  <Trash2 size={14} /> حذف الكل
                </button>
              </div>

              {/* الخط — لكل المجموعة */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الخط</h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400">نوع الخط</label>
                    <select
                      value={(selectedElements[0]?.font ?? design.globalFont).family}
                      onChange={(e) => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), family: e.target.value } })}
                      className="w-full border rounded px-2 py-1"
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">الحجم (pt)</label>
                      <input type="number" min={4} max={72} value={(selectedElements[0]?.font ?? design.globalFont).sizePt ?? 10} onChange={(e) => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), sizePt: Number(e.target.value) } })} className="w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">ارتفاع السطر (pt)</label>
                      <input type="number" min={0} value={(selectedElements[0]?.font ?? design.globalFont).lineHeightPt ?? ''} onChange={(e) => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), lineHeightPt: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="تلقائي" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">تباعد الأحرف (pt)</label>
                    <input type="number" step={0.1} value={(selectedElements[0]?.font ?? design.globalFont).letterSpacingPt ?? ''} onChange={(e) => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), letterSpacingPt: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), bold: !(selectedElements[0]?.font ?? design.globalFont).bold } })}
                      className={`p-1.5 rounded border ${(selectedElements[0]?.font ?? design.globalFont).bold ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="سميك (Bold)"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), italic: !(selectedElements[0]?.font ?? design.globalFont).italic } })}
                      className={`p-1.5 rounded border ${(selectedElements[0]?.font ?? design.globalFont).italic ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="مائل (Italic)"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), underline: !(selectedElements[0]?.font ?? design.globalFont).underline } })}
                      className={`p-1.5 rounded border ${(selectedElements[0]?.font ?? design.globalFont).underline ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="تحته خط (Underline)"
                    >
                      <Underline size={14} />
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-slate-400">اللون</label>
                      <input type="color" value={(selectedElements[0]?.font ?? design.globalFont).color ?? '#000'} onChange={(e) => updateSelectedElements({ font: { ...(selectedElements[0]?.font ?? {}), color: e.target.value } })} className="w-8 h-6 border rounded cursor-pointer" />
                    </div>
                  </div>
                </div>
              </section>

              {/* المحاذاة */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">المحاذاة</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة النص</label>
                      <select value={selectedElements[0]?.style?.textAlign ?? 'right'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), textAlign: e.target.value } })} className="w-full border rounded px-2 py-1">
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">اتجاه النص</label>
                      <select value={selectedElements[0]?.style?.direction ?? 'rtl'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), direction: e.target.value } })} className="w-full border rounded px-2 py-1">
                        <option value="rtl">يمين لليسار</option>
                        <option value="ltr">يسار لليمين</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة عمودي</label>
                      <select value={selectedElements[0]?.style?.alignItems ?? 'center'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), alignItems: e.target.value } })} className="w-full border rounded px-2 py-1">
                        <option value="flex-start">أعلى</option>
                        <option value="center">وسط</option>
                        <option value="flex-end">أسفل</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة أفقي</label>
                      <select value={selectedElements[0]?.style?.justifyContent ?? 'center'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), justifyContent: e.target.value } })} className="w-full border rounded px-2 py-1">
                        <option value="flex-start">يمين</option>
                        <option value="center">وسط</option>
                        <option value="flex-end">يسار</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* الحشو والحدود */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الحشو والحدود</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">الحشو (مم)</label>
                      <input type="number" min={0} value={selectedElements[0]?.style?.paddingMm ?? ''} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), paddingMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">انحناء الحواف (مم)</label>
                      <input type="number" min={0} value={selectedElements[0]?.style?.borderRadiusMm ?? ''} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), borderRadiusMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">عرض الحدود (مم)</label>
                      <input type="number" min={0} step={0.1} value={selectedElements[0]?.style?.borderWidthMm ?? ''} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), borderWidthMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">شكل الحدود</label>
                      <select value={selectedElements[0]?.style?.borderStyle ?? 'none'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), borderStyle: e.target.value } })} className="w-full border rounded px-2 py-1">
                        <option value="none">بدون</option>
                        <option value="solid">عادي</option>
                        <option value="dashed">متقطع</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* الألوان */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الألوان</h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">لون الخلفية</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedElements[0]?.style?.backgroundColor ?? '#ffffff'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), backgroundColor: e.target.value, backgroundTransparent: false } })} className="w-8 h-6 border rounded cursor-pointer" disabled={!!selectedElements[0]?.style?.backgroundTransparent} />
                      <label className="flex items-center gap-1 text-[10px]">
                        <input type="checkbox" checked={!!selectedElements[0]?.style?.backgroundTransparent} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), backgroundTransparent: e.target.checked } })} className="rounded" />
                        شفاف
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">لون الحدود</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedElements[0]?.style?.borderColor ?? '#e2e8f0'} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), borderColor: e.target.value, borderTransparent: false } })} className="w-8 h-6 border rounded cursor-pointer" disabled={!!selectedElements[0]?.style?.borderTransparent} />
                      <label className="flex items-center gap-1 text-[10px]">
                        <input type="checkbox" checked={!!selectedElements[0]?.style?.borderTransparent} onChange={(e) => updateSelectedElements({ style: { ...(selectedElements[0]?.style ?? {}), borderTransparent: e.target.checked } })} className="rounded" />
                        شفاف
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* ترتيب الطبقة */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الطبقات</h4>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[10px] text-slate-400">ترتيب الطبقة (z)</span>
                  <input type="number" value={selectedElements[0]?.zIndex ?? ''} onChange={(e) => updateSelectedElements({ zIndex: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-16 border rounded px-2 py-1" placeholder="تلقائي" />
                </div>
              </section>
            </>
          ) : selectedElement ? (
            <>
              {/* أزرار العنصر: تكرار، قفل، طبقات، حذف */}
              <div className="flex items-center gap-1 flex-wrap pb-2 border-b border-slate-100">
                <button type="button" onClick={() => duplicateElement(selectedElement.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="تكرار (Ctrl+D)">
                  <Copy size={15} />
                </button>
                <button type="button" onClick={() => updateElement(selectedElement.id, { locked: !selectedElement.locked })} className="p-1.5 rounded hover:bg-slate-100" title={selectedElement.locked ? 'إلغاء القفل' : 'قفل العنصر'}>
                  {selectedElement.locked ? <Lock size={15} className="text-amber-500" /> : <Unlock size={15} className="text-slate-400" />}
                </button>
                <div className="w-px h-5 bg-slate-200 mx-0.5" />
                <button type="button" onClick={() => moveElementToBack(selectedElement.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="نقل لأسفل الطبقات">
                  <ChevronsDown size={15} />
                </button>
                <button type="button" onClick={() => moveElementDown(selectedElement.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="تأخير طبقة">
                  <ChevronDown size={15} />
                </button>
                <button type="button" onClick={() => moveElementUp(selectedElement.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="تقديم طبقة">
                  <ChevronUp size={15} />
                </button>
                <button type="button" onClick={() => moveElementToFront(selectedElement.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="نقل لأعلى الطبقات">
                  <ChevronsUp size={15} />
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => removeElement(selectedElement.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="حذف">
                  <Trash2 size={15} />
                </button>
              </div>

              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">العنصر: {elementTypeLabel(selectedElement.type)}</h4>
                {selectedElement.type === 'variable' && (
                  <div className="text-xs text-slate-600 py-1 truncate mb-1">
                    {VARIABLE_KEYS.find((k) => k.key === (selectedElement as VariableElement).variableKey)?.label ?? (selectedElement as VariableElement).variableKey}
                  </div>
                )}
                {selectedElement.type === 'text' && (
                  <div className="mb-2 space-y-1">
                    <input
                      type="text"
                      value={(selectedElement as TextElement).content}
                      onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                      className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          const cur = (selectedElement as TextElement).content ?? ''
                          updateElement(selectedElement.id, { content: cur + `{{${e.target.value}}}` })
                          e.target.value = ''
                        }}
                        className="flex-1 border border-dashed border-primary-300 rounded px-1.5 py-1 text-[10px] text-primary-600 bg-primary-50/50 cursor-pointer"
                      >
                        <option value="">+ إدراج متغير</option>
                        {VARIABLE_GROUPS.map((g) => (
                          <optgroup key={g.key} label={g.label}>
                            {VARIABLE_KEYS.filter((v) => v.group === g.key && !['qr_code', 'ref_num_barcode', 'ref_num_qrcode'].includes(v.key)).map((v) => (
                              <option key={v.key} value={v.key}>{v.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {selectedElement.type === 'line' && (
                  <div className="space-y-2 text-xs mb-2">
                    <div className="flex justify-between items-center">
                      <span>السُمك (مم)</span>
                      <input type="number" step={0.1} min={0.1} value={(selectedElement as LineElement).thicknessMm ?? 0.3} onChange={(e) => updateElement(selectedElement.id, { thicknessMm: Number(e.target.value) })} className="w-20 border rounded px-2 py-1" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span>اللون</span>
                      <input type="color" value={(selectedElement as LineElement).color ?? '#e2e8f0'} onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })} className="w-10 h-7 border rounded cursor-pointer" />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">X (مم)</label>
                      <input type="number" value={Math.round(selectedElement.xMm * 10) / 10} onChange={(e) => updateElement(selectedElement.id, { xMm: Number(e.target.value) })} className="w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Y (مم)</label>
                      <input type="number" value={Math.round(selectedElement.yMm * 10) / 10} onChange={(e) => updateElement(selectedElement.id, { yMm: Number(e.target.value) })} className="w-full border rounded px-2 py-1" />
                    </div>
                  </div>
                  {(selectedElement.widthMm != null || ['variable', 'text', 'table', 'image', 'line', 'rectangle', 'spacer'].includes(selectedElement.type)) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">العرض (مم)</label>
                        <input type="number" min={0} value={selectedElement.widthMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { widthMm: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full border rounded px-2 py-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">الارتفاع (مم)</label>
                        <input type="number" min={0} value={selectedElement.heightMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { heightMm: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full border rounded px-2 py-1" />
                      </div>
                    </div>
                  )}
                  {/* Z-Index */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">ترتيب الطبقة (z)</span>
                    <input type="number" value={selectedElement.zIndex ?? ''} onChange={(e) => updateElement(selectedElement.id, { zIndex: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-16 border rounded px-2 py-1" placeholder="تلقائي" />
                  </div>
                </div>
              </section>

              {/* الخط — لجميع العناصر النصية */}
              {selectedElement.type !== 'image' && selectedElement.type !== 'line' && selectedElement.type !== 'rectangle' && selectedElement.type !== 'spacer' && (
                <section>
                  <h4 className="text-xs font-medium text-slate-600 mb-2">الخط</h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400">نوع الخط</label>
                      <select value={(selectedElement.font ?? design.globalFont).family} onChange={(e) => updateElement(selectedElement.id, { font: { ...selectedElement.font, family: e.target.value } })} className="w-full border rounded px-2 py-1">
                        {FONT_FAMILIES.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">الحجم (pt)</label>
                        <input type="number" min={4} max={72} value={(selectedElement.font ?? design.globalFont).sizePt ?? 10} onChange={(e) => updateElement(selectedElement.id, { font: { ...selectedElement.font, sizePt: Number(e.target.value) } })} className="w-full border rounded px-2 py-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">ارتفاع السطر (pt)</label>
                        <input type="number" min={0} value={(selectedElement.font ?? design.globalFont).lineHeightPt ?? ''} onChange={(e) => updateElement(selectedElement.id, { font: { ...selectedElement.font, lineHeightPt: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="تلقائي" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">تباعد الأحرف (pt)</label>
                      <input type="number" step={0.1} value={(selectedElement.font ?? design.globalFont).letterSpacingPt ?? ''} onChange={(e) => updateElement(selectedElement.id, { font: { ...selectedElement.font, letterSpacingPt: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                    {/* أزرار سريعة: Bold / Italic / Underline */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateElement(selectedElement.id, { font: { ...selectedElement.font, bold: !(selectedElement.font ?? design.globalFont).bold } })}
                        className={`p-1.5 rounded border ${(selectedElement.font ?? design.globalFont).bold ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        title="سميك (Bold)"
                      >
                        <Bold size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateElement(selectedElement.id, { font: { ...selectedElement.font, italic: !(selectedElement.font ?? design.globalFont).italic } })}
                        className={`p-1.5 rounded border ${(selectedElement.font ?? design.globalFont).italic ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        title="مائل (Italic)"
                      >
                        <Italic size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateElement(selectedElement.id, { font: { ...selectedElement.font, underline: !(selectedElement.font ?? design.globalFont).underline } })}
                        className={`p-1.5 rounded border ${(selectedElement.font ?? design.globalFont).underline ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        title="تحته خط (Underline)"
                      >
                        <Underline size={14} />
                      </button>
                      <div className="flex-1" />
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] text-slate-400">اللون</label>
                        <input type="color" value={(selectedElement.font ?? design.globalFont).color ?? '#000'} onChange={(e) => updateElement(selectedElement.id, { font: { ...selectedElement.font, color: e.target.value } })} className="w-8 h-6 border rounded cursor-pointer" />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* تنسيق الجدول */}
              {selectedElement.type === 'table' && (
                <section>
                  <h4 className="text-xs font-medium text-slate-600 mb-2">تنسيق الجدول</h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">لون خلفية الرأس</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={(selectedElement as TableElement).headerStyle?.backgroundColor ?? '#f1f5f9'} onChange={(e) => updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, backgroundColor: e.target.value } })} className="w-8 h-6 border rounded cursor-pointer" />
                        <span className="text-[10px] text-slate-400">{(selectedElement as TableElement).headerStyle?.backgroundColor ?? '#f1f5f9'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">لون نص الرأس</label>
                      <input type="color" value={(selectedElement as TableElement).headerStyle?.color ?? '#1e293b'} onChange={(e) => updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, color: e.target.value } })} className="w-8 h-6 border rounded cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">حجم خط الرأس (pt)</label>
                      <input type="number" min={5} max={20} value={(selectedElement as TableElement).headerStyle?.fontSizePt ?? ''} onChange={(e) => updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, fontSizePt: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="تلقائي" />
                    </div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={(selectedElement as TableElement).headerStyle?.bold !== false} onChange={(e) => updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, bold: e.target.checked } })} className="rounded" />
                      رأس الجدول سميك
                    </label>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">ارتفاع رأس الجدول (مم)</label>
                      <input type="number" min={3} max={30} step={0.5} value={(selectedElement as TableElement).headerStyle?.heightMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, heightMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="تلقائي" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">لون الصفوف المتناوبة</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={(selectedElement as TableElement).bodyStyle?.stripedColor ?? '#ffffff'} onChange={(e) => updateElement(selectedElement.id, { bodyStyle: { ...(selectedElement as TableElement).bodyStyle, stripedColor: e.target.value } })} className="w-8 h-6 border rounded cursor-pointer" />
                        <button type="button" onClick={() => updateElement(selectedElement.id, { bodyStyle: { ...(selectedElement as TableElement).bodyStyle, stripedColor: '' } })} className="text-[10px] text-red-500 hover:underline">إزالة</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">لون حدود الجدول</label>
                      <input type="color" value={(selectedElement as TableElement).headerStyle?.borderColor ?? '#ddd'} onChange={(e) => { const c = e.target.value; updateElement(selectedElement.id, { headerStyle: { ...(selectedElement as TableElement).headerStyle, borderColor: c }, bodyStyle: { ...(selectedElement as TableElement).bodyStyle, borderColor: c } }) }} className="w-8 h-6 border rounded cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">محاذاة محتوى الخلايا</label>
                      <select value={selectedElement.style?.textAlign ?? 'right'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, textAlign: e.target.value as 'left' | 'center' | 'right' } })} className="w-full border rounded px-2 py-1">
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </div>
                  </div>
                </section>
              )}

              {/* المحاذاة */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">المحاذاة</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة النص</label>
                      <select value={selectedElement.style?.textAlign ?? 'right'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, textAlign: e.target.value as 'left' | 'center' | 'right' } })} className="w-full border rounded px-2 py-1">
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">اتجاه النص</label>
                      <select value={selectedElement.style?.direction ?? 'rtl'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, direction: e.target.value as 'ltr' | 'rtl' } })} className="w-full border rounded px-2 py-1">
                        <option value="rtl">يمين لليسار</option>
                        <option value="ltr">يسار لليمين</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة عمودي</label>
                      <select value={selectedElement.style?.alignItems ?? 'center'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, alignItems: e.target.value as 'flex-start' | 'center' | 'flex-end' } })} className="w-full border rounded px-2 py-1">
                        <option value="flex-start">أعلى</option>
                        <option value="center">وسط</option>
                        <option value="flex-end">أسفل</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">محاذاة أفقي</label>
                      <select value={selectedElement.style?.justifyContent ?? 'center'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, justifyContent: e.target.value as 'flex-start' | 'center' | 'flex-end' } })} className="w-full border rounded px-2 py-1">
                        <option value="flex-start">يمين</option>
                        <option value="center">وسط</option>
                        <option value="flex-end">يسار</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* الحشو والحدود */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الحشو والحدود</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">الحشو (مم)</label>
                      <input type="number" min={0} value={selectedElement.style?.paddingMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, paddingMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">انحناء الحواف (مم)</label>
                      <input type="number" min={0} value={selectedElement.style?.borderRadiusMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, borderRadiusMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">عرض الحدود (مم)</label>
                      <input type="number" min={0} step={0.1} value={selectedElement.style?.borderWidthMm ?? ''} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, borderWidthMm: e.target.value === '' ? undefined : Number(e.target.value) } })} className="w-full border rounded px-2 py-1" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">شكل الحدود</label>
                      <select value={selectedElement.style?.borderStyle ?? 'none'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, borderStyle: e.target.value as 'solid' | 'dashed' | 'none' } })} className="w-full border rounded px-2 py-1">
                        <option value="none">بدون</option>
                        <option value="solid">عادي</option>
                        <option value="dashed">متقطع</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* الألوان */}
              <section>
                <h4 className="text-xs font-medium text-slate-600 mb-2">الألوان</h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">لون الخلفية</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedElement.style?.backgroundColor ?? '#ffffff'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, backgroundColor: e.target.value, backgroundTransparent: false } })} className="w-8 h-6 border rounded cursor-pointer" disabled={selectedElement.style?.backgroundTransparent} />
                      <label className="flex items-center gap-1 text-[10px]">
                        <input type="checkbox" checked={!!selectedElement.style?.backgroundTransparent} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, backgroundTransparent: e.target.checked } })} className="rounded" />
                        شفاف
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">لون الحدود</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedElement.style?.borderColor ?? '#e2e8f0'} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, borderColor: e.target.value, borderTransparent: false } })} className="w-8 h-6 border rounded cursor-pointer" disabled={!!selectedElement.style?.borderTransparent} />
                      <label className="flex items-center gap-1 text-[10px]">
                        <input type="checkbox" checked={!!selectedElement.style?.borderTransparent} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, borderTransparent: e.target.checked } })} className="rounded" />
                        شفاف
                      </label>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <section>
                <h4 className="text-sm font-medium text-slate-600 mb-2">مقاس الصفحة</h4>
                <select
                  value={design.page.preset}
                  onChange={(e) => {
                    const preset = e.target.value as keyof typeof PAGE_PRESETS
                    const { widthMm, heightMm } = PAGE_PRESETS[preset]
                    updatePage({ preset, widthMm, heightMm })
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="80mm">حراري 80 مم</option>
                  <option value="57mm">حراري 57 مم</option>
                  <option value="a4">A4 (210 × 297 مم)</option>
                  <option value="custom">مخصص</option>
                </select>
                {design.page.preset === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <label className="block text-xs text-slate-500">العرض (مم)</label>
                      <input
                        type="number"
                        value={design.page.widthMm}
                        onChange={(e) => updatePage({ widthMm: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">الارتفاع (مم)</label>
                      <input
                        type="number"
                        value={design.page.heightMm}
                        onChange={(e) => updatePage({ heightMm: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1"
                      />
                    </div>
                  </div>
                )}
              </section>
              <section>
                <h4 className="text-sm font-medium text-slate-600 mb-2">الهوامش (مم)</h4>
                <div className="space-y-2 text-sm">
                  {(['marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm'] as const).map((key) => (
                    <div key={key} className="flex justify-between items-center">
                      <span>{key.replace('margin', '').replace('Mm', '')}</span>
                      <input
                        type="number"
                        min={0}
                        value={design.page[key]}
                        onChange={(e) => updatePage({ [key]: Number(e.target.value) })}
                        className="w-20 border rounded px-2 py-1"
                      />
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h4 className="text-sm font-medium text-slate-600 mb-2">منطقة التصميم</h4>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showGridLines}
                    onChange={(e) => setShowGridLines(e.target.checked)}
                    className="rounded"
                  />
                  إظهار خطوط الشبكة الإرشادية
                </label>
                <p className="text-xs text-slate-500 mt-1">خطوط عمودية للمحاذاة أثناء التصميم فقط، ولا تظهر عند الطباعة.</p>
              </section>
              <section>
                <h4 className="text-sm font-medium text-slate-600 mb-2">الخط الافتراضي</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="block text-xs text-slate-500">نوع الخط</label>
                    <select
                      value={design.globalFont.family}
                      onChange={(e) => updateGlobalFont({ family: e.target.value })}
                      className="w-full border rounded px-2 py-1"
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500">الحجم (pt)</label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={design.globalFont.sizePt}
                        onChange={(e) => updateGlobalFont({ sizePt: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">اللون</label>
                      <input
                        type="color"
                        value={design.globalFont.color}
                        onChange={(e) => updateGlobalFont({ color: e.target.value })}
                        className="w-full h-8 border rounded"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateGlobalFont({ bold: !design.globalFont.bold })}
                      className={`p-1.5 rounded border ${design.globalFont.bold ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="سميك"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateGlobalFont({ italic: !design.globalFont.italic })}
                      className={`p-1.5 rounded border ${design.globalFont.italic ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="مائل"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateGlobalFont({ underline: !design.globalFont.underline })}
                      className={`p-1.5 rounded border ${design.globalFont.underline ? 'bg-primary-100 border-primary-300 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="تحته خط"
                    >
                      <Underline size={14} />
                    </button>
                  </div>
                </div>
              </section>
              <section>
                <h4 className="text-sm font-medium text-slate-600 mb-2">الإطار</h4>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={design.frame.enabled}
                    onChange={(e) => updateDesign((d) => ({ ...d, frame: { ...d.frame, enabled: e.target.checked } }))}
                    className="rounded"
                  />
                  إظهار إطار
                </label>
                {design.frame.enabled && (
                  <>
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500">سُمك الحد (مم)</label>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        value={design.frame.borderWidthMm}
                        onChange={(e) => updateDesign((d) => ({ ...d, frame: { ...d.frame, borderWidthMm: Number(e.target.value) } }))}
                        className="w-full border rounded px-2 py-1"
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500">لون الحد</label>
                      <input
                        type="color"
                        value={design.frame.borderColor}
                        onChange={(e) => updateDesign((d) => ({ ...d, frame: { ...d.frame, borderColor: e.target.value } }))}
                        className="w-full h-8 border rounded"
                      />
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </aside>
      </div>

      {/* نافذة المعاينة */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">معاينة القالب</h3>
              <button type="button" onClick={() => setShowPreview(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-100">
              <div className="mx-auto" style={{ maxWidth: design.page.widthMm * 3.78 }}>
                <iframe
                  title="preview"
                  srcDoc={templateDesignToHtml(design)}
                  className="w-full bg-white shadow-lg"
                  style={{ minHeight: Math.min(design.page.heightMm * 3.78, 800), border: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
