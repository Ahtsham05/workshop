import type {
  Bom,
  BomExplosion,
  BomTrackingInfo,
  BomTreeNode,
} from '@/stores/manufacturing.api'
import { formatTotalsByUnit } from '@/lib/units'
import { fmtDate, fmtQty } from './constants'
import type { DocRow, ReportDoc } from './report-doc'

const minutes = (m: number) => {
  const v = Math.max(0, Math.round(m))
  const h = Math.floor(v / 60)
  return h ? `${h}h ${String(v % 60).padStart(2, '0')}m` : `${v}m`
}

/**
 * A BOM as a printable document in the house report style (generateReportHTML): masthead,
 * info panel, summary strip, the exploded material list for the chosen quantity —
 * sub-assemblies indented under their parent — then the routing and sign-off lines.
 */
export function buildBomPrintDoc(
  bom: Bom & BomTrackingInfo,
  explosion: BomExplosion,
  quantity: number,
  t: (s: string) => string
): Omit<ReportDoc, 'key'> {
  const notesById = new Map(
    bom.components
      .filter((c) => c._id && c.notes)
      .map((c) => [c._id!, c.notes!])
  )
  const top = explosion.tree.children
  const ops = bom.operations || []

  const subOf = (node: BomTreeNode) => {
    const track = bom.tracking?.[node.productId]
    return [
      node.sku,
      node.isOptional ? t('Optional') : '',
      track?.trackExpiry
        ? t('Batch + expiry tracked')
        : track?.trackBatch
          ? t('Batch tracked')
          : '',
      node.childBom
        ? `${t('Sub-assembly')} ${node.childBom.bomNumber} v${node.childBom.version}`
        : '',
      node.alternatives.length
        ? `${t('Alternatives')}: ${node.alternatives.map((a) => a.productName).join(', ')}`
        : '',
      node.componentId ? notesById.get(node.componentId) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const rows: DocRow[] = []
  const walk = (nodes: BomTreeNode[], prefix: string, depth: number) =>
    nodes.forEach((node, i) => {
      const no = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      rows.push({
        groupStart: depth === 0 && node.children.length > 0,
        cells: {
          no,
          name: {
            text: `${'   '.repeat(depth)}${depth ? '↳ ' : ''}${node.productName}`,
            sub: subOf(node) || undefined,
            strong: depth === 0,
          },
          base: fmtQty(node.baseQuantity),
          scrap: node.scrapPercent ? `${fmtQty(node.scrapPercent)}%` : '—',
          required: { text: fmtQty(node.requiredQuantity), strong: true },
          unit: node.unit,
        },
      })
      walk(node.children, no, depth + 1)
    })
  walk(top, '', 0)
  if (top.length) {
    const total = (pick: (n: BomTreeNode) => number) =>
      formatTotalsByUnit(top.map((n) => ({ quantity: pick(n), unit: n.unit })))
    rows.push({
      kind: 'total',
      label: `${t('Total')} (${t('for')} ${fmtQty(quantity)} ${bom.unit})`,
      labelSpan: 2,
      cells: {
        base: total((n) => n.baseQuantity),
        scrap: '',
        required: total((n) => n.requiredQuantity),
        unit: '',
      },
    })
  }

  const planned = (op: (typeof ops)[number]) =>
    (op.setupMinutes || 0) + (op.runMinutesPerUnit || 0) * quantity
  const showCost = ops.some((op) => op.costPerHour)
  const routingRows: DocRow[] = ops.map((op, i) => ({
    cells: {
      no: String((i + 1) * 10),
      step: { text: op.name, sub: op.instructions || undefined, strong: true },
      center: op.workCenter || '—',
      setup: op.setupMinutes ? minutes(op.setupMinutes) : '—',
      run: op.runMinutesPerUnit ? `${fmtQty(op.runMinutesPerUnit)} min` : '—',
      planned: minutes(planned(op)),
      ...(showCost
        ? { cost: op.costPerHour ? fmtQty(op.costPerHour) : '—' }
        : {}),
    },
  }))
  const totalMinutes = ops.reduce((s, op) => s + planned(op), 0)
  if (ops.length) {
    routingRows.push({
      kind: 'total',
      label: t('Total planned time'),
      labelSpan: 5,
      cells: {
        planned: minutes(totalMinutes),
        ...(showCost ? { cost: '' } : {}),
      },
    })
  }

  const status = bom.deletedAt
    ? t('Deleted')
    : [
        bom.isActive ? t('Active') : t('Inactive'),
        bom.isDefault ? t('Default') : '',
        bom.isLocked ? t('Locked (released to production)') : '',
      ]
        .filter(Boolean)
        .join(' · ')
  const scaled = quantity !== bom.quantity

  return {
    title: t('Bill of Materials'),
    subtitle: `${bom.bomNumber} · v${bom.version}`,
    orientation: 'portrait',
    info: [
      { label: t('Product'), value: bom.productName },
      ...(bom.name && bom.name !== bom.productName
        ? [{ label: t('BOM name'), value: bom.name }]
        : []),
      {
        label: t('Standard batch'),
        value: `${fmtQty(bom.quantity)} ${bom.unit}`,
      },
      { label: t('Status'), value: status },
      {
        label: t('Effective'),
        value: bom.effectiveFrom
          ? `${fmtDate(bom.effectiveFrom)} — ${bom.effectiveTo ? fmtDate(bom.effectiveTo) : t('open')}`
          : t('Always'),
      },
      { label: t('Last updated'), value: fmtDate(bom.updatedAt) },
      ...(bom.notes ? [{ label: t('Notes'), value: bom.notes }] : []),
    ],
    summary: [
      {
        label: scaled ? t('Printed for') : t('Builds'),
        value: `${fmtQty(quantity)} ${bom.unit}`,
        hint: scaled
          ? `${t('Standard batch')} ${fmtQty(bom.quantity)} ${bom.unit}`
          : undefined,
      },
      { label: t('Components'), value: String(top.length) },
      {
        label: t('Total materials'),
        value: formatTotalsByUnit(
          top.map((n) => ({ quantity: n.requiredQuantity, unit: n.unit }))
        ),
        hint: t('incl. scrap'),
        emphasis: true,
      },
      {
        label: t('Routing'),
        value: ops.length ? `${ops.length} ${t('steps')}` : '—',
        hint: ops.length ? minutes(totalMinutes) : undefined,
      },
    ],
    sections: [
      {
        id: 'materials',
        title: t('Materials'),
        columns: [
          { key: 'no', label: '#', width: '6%', nowrap: true },
          { key: 'name', label: t('Material / component') },
          { key: 'base', label: t('Quantity'), align: 'right', width: '13%' },
          { key: 'scrap', label: t('Scrap'), align: 'right', width: '8%' },
          {
            key: 'required',
            label: t('Required'),
            align: 'right',
            width: '14%',
          },
          { key: 'unit', label: t('Unit'), width: '8%' },
        ],
        rows,
        empty: t('This BOM has no components.'),
        note: t('Required = quantity plus each line’s scrap allowance.'),
      },
      ...(ops.length
        ? [
            {
              id: 'routing',
              title: t('Routing'),
              columns: [
                { key: 'no', label: t('Op'), width: '6%', nowrap: true },
                { key: 'step', label: t('Step') },
                { key: 'center', label: t('Work center'), width: '16%' },
                {
                  key: 'setup',
                  label: t('Setup'),
                  align: 'right' as const,
                  width: '10%',
                },
                {
                  key: 'run',
                  label: t('Run / unit'),
                  align: 'right' as const,
                  width: '11%',
                },
                {
                  key: 'planned',
                  label: t('Planned'),
                  align: 'right' as const,
                  width: '11%',
                },
                ...(showCost
                  ? [
                      {
                        key: 'cost',
                        label: t('Rate / hour'),
                        align: 'right' as const,
                        width: '11%',
                      },
                    ]
                  : []),
              ],
              rows: routingRows,
            },
          ]
        : []),
    ],
  }
}
