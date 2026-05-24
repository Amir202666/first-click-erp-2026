import React, { useEffect, useRef, useState } from 'react'
import { loyaltyApi } from '../../api/loyalty'

interface Props {
  tenantId: number
  customerId: number | null
  invoiceTotal: number
  onRedeemChange: (points: number, discount: number) => void
  onProgramChange?: (programId: number | null) => void
  module?: 'invoices' | 'pos' | 'restaurant' | 'delivery'
}

export const LoyaltyInvoiceSection: React.FC<Props> = ({
  tenantId,
  customerId,
  invoiceTotal,
  onRedeemChange,
  onProgramChange,
  module = 'invoices',
}) => {
  const onRedeemChangeRef = useRef(onRedeemChange)
  const onProgramChangeRef = useRef(onProgramChange)
  onRedeemChangeRef.current = onRedeemChange
  onProgramChangeRef.current = onProgramChange

  const [programs, setPrograms] = useState<any[]>([])
  // keep as string for <select /> control; '' = no loyalty
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const [calcResult, setCalcResult] = useState<any>(null)
  const [redeemEnabled, setRedeemEnabled] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState(0)

  useEffect(() => {
    if (!customerId) {
      setPrograms([])
      setSelectedProgramId('')
      setCalcResult(null)
      setRedeemEnabled(false)
      setRedeemPoints(0)
      onRedeemChangeRef.current(0, 0)
      onProgramChangeRef.current?.(null)
      return
    }

    let cancelled = false
    loyaltyApi
      .listPrograms(tenantId)
      .then((r) => {
        if (cancelled) return
        const all = (r as any)?.data?.data ?? []
        const active = Array.isArray(all)
          ? all.filter((p: any) => p?.is_active && Boolean(p?.[`apply_on_${module}`]))
          : []
        setPrograms(active)
        if (active.length === 1) {
          const id = String(active[0].id)
          setSelectedProgramId(id)
          onProgramChangeRef.current?.(Number(id))
        } else {
          setSelectedProgramId('')
          onProgramChangeRef.current?.(null)
        }
        setRedeemEnabled(false)
        setRedeemPoints(0)
        setCalcResult(null)
        onRedeemChangeRef.current(0, 0)
      })
      .catch(() => {
        if (cancelled) return
        setPrograms([])
        setSelectedProgramId('')
        setCalcResult(null)
        setRedeemEnabled(false)
        setRedeemPoints(0)
        onRedeemChangeRef.current(0, 0)
        onProgramChangeRef.current?.(null)
      })

    return () => {
      cancelled = true
    }
  }, [tenantId, customerId, module])

  useEffect(() => {
    if (!selectedProgramId || !customerId || invoiceTotal <= 0) {
      setCalcResult(null)
      onRedeemChangeRef.current(0, 0)
      return
    }

    let cancelled = false
    loyaltyApi
      .calculateForProgram(tenantId, Number(selectedProgramId), {
        customer_id: customerId,
        amount: invoiceTotal,
        redeem_points: redeemEnabled ? redeemPoints : 0,
      })
      .then((r) => {
        if (cancelled) return
        setCalcResult((r as any)?.data?.data ?? null)
        const discount = Number((r as any)?.data?.data?.redeem_discount ?? 0)
        onRedeemChangeRef.current(redeemEnabled ? redeemPoints : 0, discount)
      })
      .catch(() => {
        if (cancelled) return
        setCalcResult(null)
        onRedeemChangeRef.current(0, 0)
      })

    return () => {
      cancelled = true
    }
  }, [tenantId, customerId, invoiceTotal, redeemEnabled, redeemPoints, selectedProgramId])

  if (!customerId) return null

  return (
    <div
      className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-2xl p-4 mt-4"
      dir="rtl"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-base">⭐</span>
        <span className="text-sm font-bold text-amber-800">نقاط الولاء</span>

        {programs.length === 0 ? (
          <span className="text-xs text-gray-400 mr-auto">لا توجد برامج ولاء مفعّلة</span>
        ) : (
          <select
            value={selectedProgramId}
            onChange={(e) => {
              const v = e.target.value || ''
              setSelectedProgramId(v)
              onProgramChange?.(v ? Number(v) : null)
              setRedeemEnabled(false)
              setRedeemPoints(0)
              setCalcResult(null)
              onRedeemChangeRef.current(0, 0)
            }}
            className="mr-auto border border-amber-300 rounded-xl px-3 py-1.5 text-sm bg-white text-amber-800 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer min-w-[180px]"
          >
            <option value="">— بدون ولاء —</option>
            {programs.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedProgramId && calcResult && (
        <>
          <div className="flex justify-between items-center px-3 py-2 bg-white rounded-xl border border-amber-200 mb-2">
            <span className="text-xs text-gray-500">رصيد النقاط الحالي</span>
            <div className="text-left">
              <span className="text-sm font-bold text-amber-600">
                {calcResult.current_balance?.balance?.toFixed?.(0) ?? 0} نقطة
              </span>
              <span className="text-xs text-gray-400 mr-1">
                ={' '}
                {(
                  (calcResult.current_balance?.balance ?? 0) *
                  (calcResult.max_redeem?.point_value ?? 0.01)
                ).toFixed(3)}{' '}
                KWD
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center px-3 py-2 bg-white rounded-xl border border-amber-200 mb-2">
            <div>
              <span className="text-xs text-gray-500">✨ ستكتسب من هذه العملية</span>
              <div className="text-[10px] text-gray-400">
                مضاعف {calcResult.points_to_earn?.multiplier ?? 1}×
                {calcResult.points_to_earn?.tier
                  ? ` (${calcResult.points_to_earn.tier.icon} ${calcResult.points_to_earn.tier.name})`
                  : ''}
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-600">
              + {calcResult.points_to_earn?.points?.toFixed?.(0) ?? 0} نقطة
            </span>
          </div>

          {(calcResult.max_redeem?.max_points ?? 0) > 0 ? (
            <div className="bg-white rounded-xl border border-amber-200 p-3">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={redeemEnabled}
                  onChange={(e) => {
                    setRedeemEnabled(e.target.checked)
                    if (!e.target.checked) {
                      setRedeemPoints(0)
                      onRedeemChangeRef.current(0, 0)
                    }
                  }}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-amber-800">💸 استرداد نقاط كخصم</span>
                <span className="text-[10px] text-amber-600 mr-auto">
                  متاح: حتى {calcResult.max_redeem.max_points} نقطة = {calcResult.max_redeem.max_value?.toFixed?.(3)} KWD
                </span>
              </label>

              {redeemEnabled && (
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">النقاط</p>
                    <input
                      type="number"
                      min={0}
                      max={calcResult.max_redeem.max_points}
                      value={redeemPoints || ''}
                      onChange={(e) => {
                        const pts = Math.min(parseFloat(e.target.value) || 0, calcResult.max_redeem.max_points)
                        setRedeemPoints(pts)
                        const discount = parseFloat((pts * (calcResult.max_redeem.point_value ?? 0.01)).toFixed(3))
                        onRedeemChangeRef.current(pts, discount)
                      }}
                      className="w-24 border-2 border-amber-300 rounded-xl px-2 py-1.5 text-sm font-bold text-center text-amber-700 focus:outline-none bg-white"
                      placeholder="0"
                    />
                  </div>
                  <span className="text-gray-300 text-lg">=</span>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">الخصم</p>
                    <div className="text-sm font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-xl">
                      - {(redeemPoints * (calcResult.max_redeem.point_value ?? 0.01)).toFixed(3)} KWD
                    </div>
                  </div>
                  <span className="text-gray-300 text-lg">|</span>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">الصافي</p>
                    <div className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
                      {(invoiceTotal - redeemPoints * (calcResult.max_redeem.point_value ?? 0.01)).toFixed(3)} KWD
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-amber-500 text-center py-1">
              {calcResult.max_redeem?.reason === 'below_minimum'
                ? `⚠️ الحد الأدنى للاسترداد ${programs.find((p: any) => p.id === selectedProgramId)?.min_redeem_points ?? 100} نقطة`
                : '⚠️ لا يوجد رصيد كافٍ للاسترداد'}
            </div>
          )}
        </>
      )}
    </div>
  )
}

