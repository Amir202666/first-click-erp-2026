import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  cancelRestaurantReservation,
  fetchBranches,
  fetchRestaurantReservations,
  fetchRestaurantSections,
  fetchRestaurantTables,
  saveRestaurantReservation,
  saveRestaurantTable,
  updateRestaurantTableStatus,
} from '../../api/tenant'
import type { Branch, RestaurantReservation, RestaurantSection, RestaurantTableFloor } from '../../types'
import Toast, { type ToastType } from '../../components/ui/Toast'
import TableCard from '../../components/restaurant/tables/TableCard'
import TableActionModal from '../../components/restaurant/tables/TableActionModal'
import ReservationFormModal, { type ReservationFormValues } from '../../components/restaurant/tables/ReservationFormModal'
import ReservationsListSection from '../../components/restaurant/tables/ReservationsListSection'
import { computeFloorStats, TABLE_STATUS_CONFIG } from '../../utils/restaurantFloorMap'
import { getLocalizedName } from '../../utils/localizedName'

type DatePreset = 'today' | 'tomorrow' | 'custom'
type ListFilter = 'all' | 'today' | 'tomorrow' | 'week'
type StatusFilter = 'all' | 'confirmed' | 'pending' | 'cancelled'

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekRange(from: string): { from: string; to: string } {
  return { from, to: addDays(from, 6) }
}

export default function TablesReservationsPage() {
  const { currentTenant } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [mapDatePreset, setMapDatePreset] = useState<DatePreset>('today')
  const [mapDate, setMapDate] = useState(today)
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [branchId, setBranchId] = useState<number | ''>('')

  const [listFilter, setListFilter] = useState<ListFilter>('today')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [activeTable, setActiveTable] = useState<RestaurantTableFloor | null>(null)
  const [reservationModalOpen, setReservationModalOpen] = useState(false)
  const [reservationEdit, setReservationEdit] = useState<Partial<ReservationFormValues> | undefined>()
  const [presetTableId, setPresetTableId] = useState<number | null>(null)
  const [editTableModal, setEditTableModal] = useState<RestaurantTableFloor | null>(null)

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  useEffect(() => {
    if (mapDatePreset === 'today') setMapDate(today)
    else if (mapDatePreset === 'tomorrow') setMapDate(addDays(today, 1))
  }, [mapDatePreset, today])

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const { data: sections = [] } = useQuery<RestaurantSection[]>({
    queryKey: ['restaurantSections', tenantId, branchId],
    queryFn: () => fetchRestaurantSections(tenantId, branchId ? { branch_id: branchId } : undefined),
    enabled: !!tenantId,
  })

  const sectionTabs = useMemo(() => {
    const names = new Set<string>()
    sections.forEach((s) => names.add(getLocalizedName(s, lang)))
    return Array.from(names)
  }, [sections, lang])

  const { data: floorTables = [], isLoading: loadingMap, refetch: refetchMap } = useQuery({
    queryKey: ['restaurantFloorMap', tenantId, mapDate, selectedSection, branchId],
    queryFn: () =>
      fetchRestaurantTables(tenantId, {
        floor_map: true,
        date: mapDate,
        section: selectedSection || undefined,
        branch_id: branchId || undefined,
      }) as Promise<RestaurantTableFloor[]>,
    enabled: !!tenantId,
    refetchInterval: 60_000,
  })

  const reservationQueryParams = useMemo(() => {
    const base: Record<string, string | number> = {}
    if (branchId) base.branch_id = branchId
    if (selectedSection) base.section = selectedSection
    if (statusFilter !== 'all') base.status = statusFilter

    if (listFilter === 'today') {
      base.date = today
    } else if (listFilter === 'tomorrow') {
      base.date = addDays(today, 1)
    } else if (listFilter === 'week') {
      const r = weekRange(today)
      base.date_from = r.from
      base.date_to = r.to
    }
    return base
  }, [branchId, selectedSection, statusFilter, listFilter, today])

  const { data: reservations = [], isLoading: loadingList, refetch: refetchList } = useQuery({
    queryKey: ['restaurantReservations', tenantId, reservationQueryParams],
    queryFn: () => fetchRestaurantReservations(tenantId, reservationQueryParams),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  })

  const stats = useMemo(() => computeFloorStats(floorTables), [floorTables])
  const todayReservationsCount = useMemo(
    () => reservations.filter((r) => r.reservation_date?.slice(0, 10) === today && r.status !== 'cancelled').length,
    [reservations, today],
  )

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['restaurantFloorMap', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['restaurantReservations', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId] })
  }

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateRestaurantTableStatus(tenantId, id, status, { date: mapDate }),
    onSuccess: () => {
      invalidateAll()
      setActiveTable(null)
      showToast(isAr ? 'تم تحديث حالة الطاولة' : 'Table status updated', 'success')
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } }
      showToast(ax?.response?.data?.message ?? (isAr ? 'تعذر التحديث' : 'Update failed'), 'error')
    },
  })

  const saveReservationMut = useMutation({
    mutationFn: (values: ReservationFormValues) =>
      saveRestaurantReservation(tenantId, {
        id: values.id,
        customer_name: values.customer_name,
        customer_phone: values.customer_phone || null,
        reservation_date: values.reservation_date,
        reservation_time: values.reservation_time,
        guests_count: values.guests_count,
        table_id: values.table_id,
        section: values.section || null,
        status: values.status,
        notes: values.notes || null,
        branch_id: branchId || null,
      }),
    onSuccess: () => {
      invalidateAll()
      setReservationModalOpen(false)
      setReservationEdit(undefined)
      setPresetTableId(null)
      showToast(isAr ? 'تم حفظ الحجز' : 'Reservation saved', 'success')
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } }
      showToast(ax?.response?.data?.message ?? (isAr ? 'تعذر الحفظ' : 'Save failed'), 'error')
    },
  })

  const cancelReservationMut = useMutation({
    mutationFn: (id: number) => cancelRestaurantReservation(tenantId, id),
    onSuccess: () => {
      invalidateAll()
      setActiveTable(null)
      showToast(isAr ? 'تم إلغاء الحجز' : 'Reservation cancelled', 'success')
    },
    onError: () => showToast(isAr ? 'تعذر الإلغاء' : 'Cancel failed', 'error'),
  })

  const confirmReservationMut = useMutation({
    mutationFn: (r: RestaurantReservation) => saveRestaurantReservation(tenantId, { id: r.id, status: 'confirmed' }),
    onSuccess: () => {
      invalidateAll()
      showToast(isAr ? 'تم تأكيد الحجز' : 'Reservation confirmed', 'success')
    },
  })

  const seatReservationMut = useMutation({
    mutationFn: (id: number) => saveRestaurantReservation(tenantId, { id, status: 'completed' }),
    onSuccess: () => {
      invalidateAll()
      setActiveTable(null)
      showToast(isAr ? 'تم تحويل الحجز لمشغول' : 'Table marked occupied', 'success')
    },
  })

  const openNewReservation = (tableId?: number | null) => {
    setReservationEdit(undefined)
    setPresetTableId(tableId ?? null)
    setReservationModalOpen(true)
  }

  const openEditReservation = (r: RestaurantReservation) => {
    setReservationEdit({
      id: r.id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone ?? '',
      reservation_date: r.reservation_date.slice(0, 10),
      reservation_time: String(r.reservation_time).slice(0, 5),
      guests_count: r.guests_count,
      table_id: r.table_id ?? null,
      section: r.section ?? '',
      status: r.status === 'pending' ? 'pending' : 'confirmed',
      notes: r.notes ?? '',
    })
    setPresetTableId(r.table_id ?? null)
    setReservationModalOpen(true)
  }

  const handleTableClick = (table: RestaurantTableFloor) => setActiveTable(table)

  const handleTableStatusFromModal = (status: string) => {
    if (!activeTable) return
    if (status === 'reserved') {
      openNewReservation(activeTable.id)
      setActiveTable(null)
      return
    }
    statusMut.mutate({ id: activeTable.id, status })
  }

  return (
    <div className="space-y-6 px-4 md:px-6 pb-8" dir={isAr ? 'rtl' : 'ltr'}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {isAr ? 'إدارة الطاولات والحجوزات' : 'Tables & Reservations'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { refetchMap(); refetchList() }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw size={16} />
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => openNewReservation()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm hover:bg-primary-500"
          >
            <Plus size={16} />
            {isAr ? 'حجز جديد' : 'New reservation'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: '🪑', label: isAr ? 'إجمالي الطاولات' : 'Total tables', value: stats.total },
          { icon: '🟢', label: isAr ? 'متاحة' : 'Available', value: stats.available },
          { icon: '🔴', label: isAr ? 'مشغولة' : 'Occupied', value: stats.occupied },
          { icon: '📋', label: isAr ? 'محجوزة اليوم' : 'Reserved today', value: todayReservationsCount },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="text-2xl">{s.icon}</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Floor map */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{isAr ? 'خريطة القاعة' : 'Floor map'}</h2>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
            >
              <option value="">{isAr ? 'كل الفروع' : 'All branches'}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSection('')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${!selectedSection ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-slate-600'}`}
            >
              {isAr ? 'الكل' : 'All'}
            </button>
            {sectionTabs.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setSelectedSection(sec)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${selectedSection === sec ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-slate-600'}`}
              >
                {sec}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(['today', 'tomorrow', 'custom'] as DatePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setMapDatePreset(p)}
                className={`rounded-lg px-3 py-1 text-xs border ${mapDatePreset === p ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900' : 'border-slate-200 dark:border-slate-600'}`}
              >
                {p === 'today' ? (isAr ? 'اليوم' : 'Today') : p === 'tomorrow' ? (isAr ? 'غداً' : 'Tomorrow') : isAr ? 'تاريخ' : 'Date'}
              </button>
            ))}
            {mapDatePreset === 'custom' && (
              <input type="date" value={mapDate} onChange={(e) => setMapDate(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-xs" />
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
            {(Object.keys(TABLE_STATUS_CONFIG) as Array<keyof typeof TABLE_STATUS_CONFIG>).map((k) => (
              <span key={k}>
                {TABLE_STATUS_CONFIG[k].icon} {isAr ? TABLE_STATUS_CONFIG[k].labelAr : TABLE_STATUS_CONFIG[k].labelEn}
              </span>
            ))}
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          {loadingMap ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : floorTables.length === 0 ? (
            <p className="text-center text-slate-500 py-8 text-sm">{isAr ? 'لا توجد طاولات. أضف طاولات من إعدادات المطعم.' : 'No tables yet.'}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 min-w-[280px]">
              {floorTables.map((t) => (
                <TableCard key={t.id} table={t} lang={lang} onClick={handleTableClick} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Reservations list */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{isAr ? 'الحجوزات' : 'Reservations'}</h2>
          <div className="flex flex-wrap gap-2">
            {(['all', 'today', 'tomorrow', 'week'] as ListFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setListFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs border ${listFilter === f ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 dark:border-slate-600'}`}
              >
                {f === 'all' ? (isAr ? 'الكل' : 'All') : f === 'today' ? (isAr ? 'اليوم' : 'Today') : f === 'tomorrow' ? (isAr ? 'غداً' : 'Tomorrow') : isAr ? 'الأسبوع' : 'Week'}
              </button>
            ))}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs"
            >
              <option value="all">{isAr ? 'كل الحالات' : 'All statuses'}</option>
              <option value="confirmed">{isAr ? 'مؤكدة' : 'Confirmed'}</option>
              <option value="pending">{isAr ? 'انتظار' : 'Pending'}</option>
              <option value="cancelled">{isAr ? 'ملغية' : 'Cancelled'}</option>
            </select>
          </div>
        </div>
        <div className="p-2 md:p-4">
          {loadingList ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : (
            <ReservationsListSection
              reservations={reservations}
              lang={lang}
              onEdit={openEditReservation}
              onConfirm={(r) => confirmReservationMut.mutate(r)}
              onCancel={(r) => cancelReservationMut.mutate(r.id)}
            />
          )}
        </div>
      </section>

      {activeTable && (
        <TableActionModal
          table={activeTable}
          lang={lang}
          loading={statusMut.isPending || cancelReservationMut.isPending || seatReservationMut.isPending}
          onClose={() => setActiveTable(null)}
          onStatusChange={handleTableStatusFromModal}
          onCancelReservation={(id) => cancelReservationMut.mutate(id)}
          onSeatReservation={(id) => seatReservationMut.mutate(id)}
          onEditTable={(t) => {
            setEditTableModal(t)
            setActiveTable(null)
          }}
        />
      )}

      <ReservationFormModal
        open={reservationModalOpen}
        lang={lang}
        sections={sections}
        availableTables={floorTables}
        initial={reservationEdit}
        presetTableId={presetTableId}
        saving={saveReservationMut.isPending}
        onClose={() => {
          setReservationModalOpen(false)
          setReservationEdit(undefined)
          setPresetTableId(null)
        }}
        onSubmit={(values) => saveReservationMut.mutate(values)}
      />

      {editTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditTableModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 max-w-sm w-full border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">{isAr ? 'تعديل الطاولة' : 'Edit table'} {editTableModal.number}</h3>
            <p className="text-sm text-slate-500 mb-4">{isAr ? 'لتعديل تفاصيل الطاولة استخدم نموذج الإعدادات الكامل.' : 'Use full table settings for detailed edits.'}</p>
            <button
              type="button"
              className="w-full rounded-lg bg-primary-600 text-white py-2 text-sm"
              onClick={async () => {
                await saveRestaurantTable(tenantId, {
                  id: editTableModal.id,
                  name: editTableModal.name,
                  code: editTableModal.code ?? '',
                  section: editTableModal.section ?? '',
                  capacity: editTableModal.capacity ?? 4,
                  status: editTableModal.status as RestaurantTableFloor['status'],
                  branch_id: editTableModal.branch_id ?? null,
                })
                invalidateAll()
                setEditTableModal(null)
                showToast(isAr ? 'تم الحفظ' : 'Saved', 'success')
              }}
            >
              {isAr ? 'حفظ سريع' : 'Quick save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
