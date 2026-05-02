import { forwardRef } from 'react'
import type { RestaurantOrder, RestaurantTable } from '@/stores/restaurant.api'

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'PKR' })

export const KitchenTicket = forwardRef<
  HTMLDivElement,
  { order: RestaurantOrder; venueName?: string }
>(({ order, venueName }, ref) => {
  return (
    <div ref={ref} className='bg-white p-6 text-black text-sm' style={{ width: '80mm' }}>
      <div className='text-center font-bold text-base border-b border-dashed border-black pb-2 mb-2'>
        {venueName || 'Kitchen'}
      </div>
      <div className='mb-2 text-center text-xs font-bold uppercase tracking-wide'>
        {order.serviceMode === 'takeaway' ? 'Takeaway · pickup' : 'Dine-in'}
      </div>
      <div className='font-mono text-xs mb-2'>{order.orderNumber}</div>
      {order.tableLabel ? <div className='mb-2 font-semibold'>{order.tableLabel}</div> : null}
      <ul className='space-y-2 font-mono'>
        {order.lines.map((line) => (
          <li key={line._id || line.name} className='border-b border-dotted border-gray-300 pb-1'>
            <div className='flex justify-between gap-2'>
              <span>
                {line.quantity}× {line.name}
              </span>
              <span className='text-xs uppercase'>{line.station || 'kitchen'}</span>
            </div>
            {line.notes ? <div className='text-xs text-gray-600'>↳ {line.notes}</div> : null}
          </li>
        ))}
      </ul>
      <div className='mt-4 text-xs text-center text-gray-500'>Kitchen copy — fire immediately</div>
    </div>
  )
})
KitchenTicket.displayName = 'KitchenTicket'

export const CustomerReceipt = forwardRef<
  HTMLDivElement,
  { order: RestaurantOrder; venueName?: string; branchName?: string }
>(({ order, venueName, branchName }, ref) => {
  return (
    <div ref={ref} className='bg-white p-6 text-black text-sm' style={{ width: '72mm' }}>
      <div className='text-center font-bold'>{venueName || 'Receipt'}</div>
      {branchName ? <div className='text-center text-xs text-gray-600'>{branchName}</div> : null}
      <div className='text-center text-[11px] font-semibold uppercase tracking-wide text-gray-700'>
        {order.serviceMode === 'takeaway' ? 'Takeaway / pickup' : 'Dine-in'}
      </div>
      <div className='text-center text-xs font-mono mt-1'>{order.orderNumber}</div>
      <div className='text-center text-xs'>{new Date(order.createdAt || '').toLocaleString()}</div>
      <div className='my-3 border-t border-b border-dashed border-gray-400 py-2 space-y-1'>
        {order.lines.map((line) => (
          <div key={line._id || line.name} className='flex justify-between text-xs'>
            <span>
              {line.quantity}× {line.name}
            </span>
            <span>{formatMoney(line.quantity * line.unitPrice)}</span>
          </div>
        ))}
      </div>
      <div className='flex justify-between text-sm font-semibold'>
        <span>Total</span>
        <span>{formatMoney(order.total)}</span>
      </div>
      {order.prepaidAmount != null && order.prepaidAmount > 0 ? (
        <div className='mt-1 flex justify-between text-xs text-gray-700'>
          <span>Prepaid</span>
          <span>
            {formatMoney(order.prepaidAmount)}
            {order.prepaidMethod ? ` (${order.prepaidMethod})` : ''}
          </span>
        </div>
      ) : null}
      {order.paymentMethod ? (
        <div className='text-xs text-center mt-2 text-gray-600'>Paid via {order.paymentMethod}</div>
      ) : null}
    </div>
  )
})
CustomerReceipt.displayName = 'CustomerReceipt'

export const QrTableSheet = forwardRef<
  HTMLDivElement,
  { table: RestaurantTable; orderUrl: string; venueName: string; floorName?: string }
>(({ table, orderUrl, venueName, floorName }, ref) => {
  return (
    <div
      ref={ref}
      className='bg-white p-8 text-center text-black'
      style={{ width: '100mm', minHeight: '120mm' }}
    >
      <div className='text-lg font-bold'>{venueName}</div>
      {floorName ? <div className='text-sm text-gray-600'>{floorName}</div> : null}
      <div className='text-2xl font-semibold mt-4'>Table {table.label}</div>
      <div className='text-xs break-all mt-4 px-2 font-mono'>{orderUrl}</div>
      <div className='text-xs text-gray-500 mt-6'>Scan to order &amp; pay at the table</div>
    </div>
  )
})
QrTableSheet.displayName = 'QrTableSheet'

export const EndOfDaySummary = forwardRef<
  HTMLDivElement,
  { date: string; totalOrders: number; revenue: number; venueName: string }
>(({ date, totalOrders, revenue, venueName }, ref) => {
  return (
    <div ref={ref} className='bg-white p-8 text-black' style={{ width: 'A4' }}>
      <h2 className='text-xl font-bold'>{venueName}</h2>
      <p className='text-sm text-gray-600'>Z-style day sheet — {date}</p>
      <table className='mt-6 w-full text-sm border-collapse border border-gray-300'>
        <tbody>
          <tr>
            <td className='border p-2'>Covers (orders received)</td>
            <td className='border p-2 text-right'>{totalOrders}</td>
          </tr>
          <tr>
            <td className='border p-2'>Gross sales (paid)</td>
            <td className='border p-2 text-right'>{formatMoney(revenue)}</td>
          </tr>
        </tbody>
      </table>
      <p className='text-xs text-gray-500 mt-6'>Manager / owner copy — retain for records</p>
    </div>
  )
})
EndOfDaySummary.displayName = 'EndOfDaySummary'
