import React, { useEffect, useRef, useState } from 'react'
import { loyaltyApi } from '../../api/loyalty'

export interface LoyaltyPOSSectionProps {
  tenantId: number
  customerId: number | null
  orderTotal: number
  onRedeemChange: (programId: number | null, points: number, discount: number) => void
  onProgramChange?: (programId: number | null) => void
  module?: 'pos' | 'restaurant' | 'delivery'
}

function programAppliesForModule(p: any, module: LoyaltyPOSSectionProps['module']): boolean {
  if (module === 'restaurant') return Boolean(p?.apply_on_pos || p?.apply_on_delivery)
  if (module === 'delivery') return Boolean(p?.apply_on_delivery)
  return Boolean(p?.apply_on_pos)
}

export const LoyaltyPOSSection: React.FC<LoyaltyPOSSectionProps> = ({
  tenantId,
  customerId,
  orderTotal,
  onRedeemChange,
  onProgramChange,
  module = 'pos',
}) => {
  const onRedeemChangeRef = useRef(onRedeemChange)
  const onProgramChangeRef = useRef(onProgramChange)
  onRedeemChangeRef.current = onRedeemChange
  onProgramChangeRef.current = onProgramChange

  const [programs, setPrograms] = useState<any[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [customerBalance, setCustomerBalance] = useState<any>(null)
  const [redeemEnabled, setRedeemEnabled] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState(0)
  const [loadingBalance, setLoadingBalance] = useState(false)

  useEffect(() => {
    if (!tenantId || !customerId) {
      setPrograms([])
      setSelectedProgramId(null)
      setCustomerBalance(null)
      setRedeemEnabled(false)
      setRedeemPoints(0)
      onProgramChangeRef.current?.(null)
      onRedeemChangeRef.current(null, 0, 0)
      return
    }

    let cancelled = false
    loyaltyApi
      .listPrograms(tenantId)
      .then((r) => {
        if (cancelled) return
        const all = (r as any)?.data?.data ?? []
        const active = Array.isArray(all)
          ? all.filter((p: any) => p?.is_active && programAppliesForModule(p, module))
          : []
        setPrograms(active)
        if (active.length === 1) {
          const id = active[0].id as number
          setSelectedProgramId(id)
          onProgramChangeRef.current?.(id)
        } else {
          setSelectedProgramId(null)
          onProgramChangeRef.current?.(null)
        }
        setRedeemEnabled(false)
        setRedeemPoints(0)
        setCustomerBalance(null)
        onRedeemChangeRef.current(null, 0, 0)
      })
      .catch(() => {
        if (cancelled) return
        setPrograms([])
        setSelectedProgramId(null)
        setCustomerBalance(null)
        setRedeemEnabled(false)
        setRedeemPoints(0)
        onProgramChangeRef.current?.(null)
        onRedeemChangeRef.current(null, 0, 0)
      })

    return () => {
      cancelled = true
    }
  }, [tenantId, customerId, module])

  useEffect(() => {
    if (!selectedProgramId || !customerId) {
      setCustomerBalance(null)
      setRedeemEnabled(false)
      setRedeemPoints(0)
      return
    }
    setLoadingBalance(true)
    let cancelled = false
    loyaltyApi
      .calculateForProgram(tenantId, selectedProgramId, {
        customer_id: customerId,
        amount: orderTotal,
      })
      .then((r) => {
        if (cancelled) return
        setCustomerBalance((r as any)?.data?.data ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setCustomerBalance(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingBalance(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProgramId, customerId, orderTotal, tenantId])

  useEffect(() => {
    if (redeemEnabled && redeemPoints > 0 && customerBalance) {
      const pv = customerBalance.max_redeem?.point_value ?? 0.01
      onRedeemChangeRef.current(
        selectedProgramId,
        redeemPoints,
        parseFloat((redeemPoints * pv).toFixed(3)),
      )
    } else {
      onRedeemChangeRef.current(null, 0, 0)
    }
  }, [redeemEnabled, redeemPoints, selectedProgramId, customerBalance])

  const maxRedeemPoints = customerBalance?.max_redeem?.max_points ?? 0
  const pointValue = customerBalance?.max_redeem?.point_value ?? 0.01
  const currentBalance = customerBalance?.current_balance?.balance ?? 0
  const pointsToEarn = customerBalance?.points_to_earn?.points ?? 0
  const redeemDiscount = parseFloat((redeemPoints * pointValue).toFixed(3))
  const minRedeemPts = customerBalance?.max_redeem?.min_redeem_points ?? 100
  const canRedeem = maxRedeemPoints > 0

  useEffect(() => {
    if (!canRedeem && redeemEnabled) {
      setRedeemEnabled(false)
      setRedeemPoints(0)
    }
  }, [canRedeem, redeemEnabled])

  return (
    <>
      {programs.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 mb-3" dir="rtl">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-base flex-shrink-0">⭐</span>
            <span className="text-sm font-bold text-amber-800 flex-shrink-0">نقاط الولاء</span>
            <select
              value={selectedProgramId ?? ''}
              onChange={(e) => {
                const val = e.target.value
                setSelectedProgramId(val ? parseInt(val, 10) : null)
                onProgramChangeRef.current?.(val ? parseInt(val, 10) : null)
                setRedeemEnabled(false)
                setRedeemPoints(0)
              }}
              className="flex-1 border border-amber-300 rounded-xl px-3 py-1.5 text-sm bg-white text-gray-800 font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">— بدون برنامج —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProgramId &&
            (loadingBalance ? (
              <div className="text-center py-2 text-xs text-amber-600">⏳ جاري التحميل...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-white rounded-lg px-2.5 py-2 border border-amber-100 text-center">
                    <p className="text-[9px] text-gray-400 mb-0.5">الرصيد الحالي</p>
                    <p className="text-sm font-bold text-amber-600">{currentBalance.toFixed(0)} نقطة</p>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2 border border-amber-100 text-center">
                    <p className="text-[9px] text-gray-400 mb-0.5">ستكتسب</p>
                    <p className="text-sm font-bold text-emerald-600">+{pointsToEarn.toFixed(0)} نقطة</p>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-amber-200 p-2">
                  <label
                    className={`flex items-center gap-2 mb-1 ${canRedeem ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!canRedeem}
                      checked={canRedeem && redeemEnabled}
                      onChange={(e) => {
                        if (!canRedeem) return
                        setRedeemEnabled(e.target.checked)
                        if (!e.target.checked) setRedeemPoints(0)
                      }}
                      className="w-3.5 h-3.5 accent-amber-500 disabled:opacity-50"
                    />
                    <span className="text-xs font-bold text-amber-800">💸 استرداد نقاط كخصم</span>
                    {canRedeem ? (
                      <span className="text-[10px] text-amber-500 mr-auto">حتى {maxRedeemPoints} نقطة</span>
                    ) : (
                      <span className="text-[10px] text-gray-400 mr-auto">غير متاح حالياً</span>
                    )}
                  </label>

                  {!canRedeem && (
                    <p className="text-[10px] text-amber-600 text-center leading-relaxed px-1">
                      {customerBalance?.max_redeem?.reason === 'below_minimum' || currentBalance < minRedeemPts
                        ? `⚠️ الحد الأدنى للاسترداد ${minRedeemPts} نقطة`
                        : '⚠️ لا يوجد رصيد كافٍ للاسترداد'}
                    </p>
                  )}

                  {redeemEnabled && canRedeem && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <input
                        type="number"
                        min={0}
                        max={maxRedeemPoints}
                        step={1}
                        value={redeemPoints || ''}
                        onChange={(e) =>
                          setRedeemPoints(
                            Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), maxRedeemPoints),
                          )
                        }
                        placeholder="0"
                        className="w-20 border border-amber-300 rounded-lg px-2 py-1 text-sm font-bold text-center text-amber-700 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-gray-400 text-xs">=</span>
                      <span className="text-sm font-bold text-red-500">- {redeemDiscount.toFixed(3)} KWD</span>
                      {redeemPoints > 0 && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="text-xs font-bold text-emerald-600">
                            {(orderTotal - redeemDiscount).toFixed(3)} KWD
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ))}
        </div>
      )}
    </>
  )
}
