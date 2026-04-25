import { useMemo, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { MobilePageShell } from '../components/mobile-page-shell'
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  useGetServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useDeleteServiceMutation,
  useGetServiceInvoicesQuery,
  useCreateServiceInvoiceMutation,
  useDeleteServiceInvoiceMutation,
  type ServiceCatalogRecord,
} from '@/stores/mobile-shop.api'

type CatalogForm = {
  serviceName: string
  price: string
  details: string
}

type InvoiceLine = {
  serviceId: string
  serviceName: string
  unitPrice: number
  quantity: number
  total: number
}

type InvoiceForm = {
  customerName: string
  customerPhone: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank' | 'card'
  notes: string
  date: string
}

const toDateTimeLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

const fmtAmt = (v?: number) => `Rs ${(v ?? 0).toLocaleString()}`

const initialCatalogForm = (): CatalogForm => ({
  serviceName: '',
  price: '',
  details: '',
})

const initialInvoiceForm = (): InvoiceForm => ({
  customerName: '',
  customerPhone: '',
  paymentMethod: 'cash',
  notes: '',
  date: toDateTimeLocal(new Date()),
})

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'invoices'>('catalog')
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(initialCatalogForm)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(initialInvoiceForm)
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([])
  const [serviceSearch, setServiceSearch] = useState('')

  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogLimit, setCatalogLimit] = useState(10)
  const [invoicePage, setInvoicePage] = useState(1)
  const [invoiceLimit, setInvoiceLimit] = useState(10)

  const { data: catalogData } = useGetServicesQuery({ page: catalogPage, limit: catalogLimit })
  const { data: invoiceData } = useGetServiceInvoicesQuery({ page: invoicePage, limit: invoiceLimit })

  const [createService, { isLoading: isCreatingCatalog }] = useCreateServiceMutation()
  const [updateService] = useUpdateServiceMutation()
  const [deleteService] = useDeleteServiceMutation()

  const [createInvoice, { isLoading: isCreatingInvoice }] = useCreateServiceInvoiceMutation()
  const [deleteInvoice] = useDeleteServiceInvoiceMutation()

  const services = catalogData?.results ?? []
  const invoices = invoiceData?.results ?? []

  // Memoized filtered active services for invoice creation
  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) {
      return services.filter((s) => s.isActive)
    }
    const query = serviceSearch.toLowerCase()
    return services.filter(
      (s) =>
        s.isActive &&
        (s.serviceName.toLowerCase().includes(query) ||
          s.details?.toLowerCase().includes(query))
    )
  }, [services, serviceSearch])

  const invoiceTotal = useMemo(
    () => invoiceLines.reduce((sum, item) => sum + Number(item.total || 0), 0),
    [invoiceLines]
  )

  const setCatalogField = <K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) => {
    setCatalogForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreateCatalog = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catalogForm.serviceName.trim()) {
      toast.error('Service name is required')
      return
    }

    const price = Number(catalogForm.price)
    if (Number.isNaN(price) || price < 0) {
      toast.error('Service price must be valid')
      return
    }

    try {
      await createService({
        serviceName: catalogForm.serviceName.trim(),
        price,
        details: catalogForm.details.trim(),
      }).unwrap()
      toast.success('Service saved in catalog')
      setCatalogForm(initialCatalogForm())
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save service')
    }
  }

  const handleToggleService = async (service: ServiceCatalogRecord) => {
    try {
      await updateService({ id: service.id, body: { isActive: !service.isActive } }).unwrap()
      toast.success(service.isActive ? 'Service deactivated' : 'Service activated')
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update service')
    }
  }

  const handleDeleteService = async (service: ServiceCatalogRecord) => {
    const ok = window.confirm(`Delete service ${service.serviceName}?`)
    if (!ok) return

    try {
      await deleteService(service.id).unwrap()
      toast.success('Service deleted')
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete service')
    }
  }

  const addInvoiceLine = useCallback((service: ServiceCatalogRecord) => {
    if (!service.isActive) {
      toast.error('Selected service is inactive')
      return
    }

    setInvoiceLines((prev) => {
      const existing = prev.find((line) => line.serviceId === service.id)
      if (existing) {
        return prev.map((line) =>
          line.serviceId === service.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                total: line.unitPrice * (line.quantity + 1),
              }
            : line
        )
      }

      return [
        ...prev,
        {
          serviceId: service.id,
          serviceName: service.serviceName,
          unitPrice: Number(service.price || 0),
          quantity: 1,
          total: Number(service.price || 0),
        },
      ]
    })
  }, [])

  const removeInvoiceLine = (serviceId: string) => {
    setInvoiceLines((prev) => prev.filter((line) => line.serviceId !== serviceId))
  }

  const saveInvoice = async () => {
    if (invoiceLines.length === 0) {
      toast.error('Add at least one service to invoice')
      return
    }

    try {
      await createInvoice({
        customerName: invoiceForm.customerName.trim(),
        customerPhone: invoiceForm.customerPhone.trim(),
        paymentMethod: invoiceForm.paymentMethod,
        date: invoiceForm.date ? new Date(invoiceForm.date).toISOString() : new Date().toISOString(),
        notes: invoiceForm.notes.trim(),
        items: invoiceLines.map((line) => ({
          serviceId: line.serviceId,
          quantity: line.quantity,
        })),
      }).unwrap()

      toast.success('Service invoice saved successfully')
      setInvoiceLines([])
      setInvoiceForm(initialInvoiceForm())
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save invoice')
    }
  }

  const handleDeleteInvoice = async (id: string) => {
    const ok = window.confirm('Delete this invoice?')
    if (!ok) return

    try {
      await deleteInvoice(id).unwrap()
      toast.success('Invoice deleted')
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete invoice')
    }
  }

  return (
    <MobilePageShell
      title='Services Management'
      description='Save services with fixed prices, then create service invoices by selecting saved services only.'
    >
      <div className='space-y-4'>
        <div className='flex gap-2'>
          <Button variant={activeTab === 'catalog' ? 'default' : 'outline'} onClick={() => setActiveTab('catalog')}>
            Service Catalog
          </Button>
          <Button variant={activeTab === 'invoices' ? 'default' : 'outline'} onClick={() => setActiveTab('invoices')}>
            Service Invoices
          </Button>
        </div>

        {activeTab === 'catalog' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Create Service Catalog Item</CardTitle>
              </CardHeader>
              <CardContent>
                <form className='space-y-3' onSubmit={handleCreateCatalog}>
                  <div className='grid gap-3 md:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label>Service Name</Label>
                      <Input
                        value={catalogForm.serviceName}
                        onChange={(e) => setCatalogField('serviceName', e.target.value)}
                        placeholder='Screen replacement'
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label>Price</Label>
                      <Input
                        type='number'
                        min={0}
                        value={catalogForm.price}
                        onChange={(e) => setCatalogField('price', e.target.value)}
                        placeholder='0'
                      />
                    </div>
                  </div>
                  <div className='space-y-1.5'>
                    <Label>Details</Label>
                    <Textarea
                      rows={2}
                      value={catalogForm.details}
                      onChange={(e) => setCatalogField('details', e.target.value)}
                      placeholder='Optional notes for this service'
                    />
                  </div>
                  <Button type='submit' disabled={isCreatingCatalog}>
                    {isCreatingCatalog ? 'Saving...' : 'Save Service'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saved Services</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='rounded-md border overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className='text-center py-8 text-muted-foreground'>
                            No saved services
                          </TableCell>
                        </TableRow>
                      )}
                      {services.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>
                            <p className='font-medium'>{service.serviceName}</p>
                            {service.details && <p className='text-xs text-muted-foreground'>{service.details}</p>}
                          </TableCell>
                          <TableCell className='font-semibold'>{fmtAmt(service.price)}</TableCell>
                          <TableCell>
                            <Badge variant={service.isActive ? 'default' : 'secondary'}>
                              {service.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='flex justify-end gap-2'>
                              <Button variant='outline' size='sm' onClick={() => handleToggleService(service)}>
                                {service.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button variant='destructive' size='sm' onClick={() => handleDeleteService(service)}>
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <SimplePagination
                  page={catalogData?.page ?? catalogPage}
                  totalPages={catalogData?.totalPages ?? 1}
                  totalResults={catalogData?.totalResults ?? 0}
                  limit={catalogLimit}
                  setLimit={(value) => {
                    setCatalogLimit(value)
                    setCatalogPage(1)
                  }}
                  onPageChange={setCatalogPage}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className='space-y-4'>
            {/* Invoice Header Form */}
            <Card>
              <CardHeader>
                <CardTitle>Create Service Invoice</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label>Customer Name</Label>
                    <Input value={invoiceForm.customerName} onChange={(e) => setInvoiceForm({ ...invoiceForm, customerName: e.target.value })} />
                  </div>
                  <div className='space-y-1.5'>
                    <Label>Customer Phone</Label>
                    <Input value={invoiceForm.customerPhone} onChange={(e) => setInvoiceForm({ ...invoiceForm, customerPhone: e.target.value })} />
                  </div>
                  <div className='space-y-1.5'>
                    <Label>Payment Method</Label>
                    <Select value={invoiceForm.paymentMethod} onValueChange={(value: any) => setInvoiceForm({ ...invoiceForm, paymentMethod: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='cash'>Cash</SelectItem>
                        <SelectItem value='jazzcash'>JazzCash</SelectItem>
                        <SelectItem value='easypaisa'>EasyPaisa</SelectItem>
                        <SelectItem value='bank'>Bank</SelectItem>
                        <SelectItem value='card'>Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-1.5'>
                    <Label>Date</Label>
                    <Input type='datetime-local' value={invoiceForm.date} onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })} />
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
                </div>
              </CardContent>
            </Card>

            {/* Main Invoice Builder with Services Grid */}
            <div className='grid gap-4 lg:grid-cols-3'>
              {/* Invoice Items Column */}
              <div className='lg:col-span-2 space-y-4'>
                {/* Invoice Items Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Invoice Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='rounded-md border overflow-x-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead className='text-right'>Price</TableHead>
                            <TableHead className='text-center'>Qty</TableHead>
                            <TableHead className='text-right'>Total</TableHead>
                            <TableHead className='text-right'>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoiceLines.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className='text-center py-8 text-muted-foreground'>
                                Select services from the catalog
                              </TableCell>
                            </TableRow>
                          )}
                          {invoiceLines.map((line) => (
                            <TableRow key={line.serviceId}>
                              <TableCell className='font-medium'>{line.serviceName}</TableCell>
                              <TableCell className='text-right'>{fmtAmt(line.unitPrice)}</TableCell>
                              <TableCell className='text-center'>
                                <div className='flex items-center justify-center gap-2'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    className='h-6 w-6 p-0'
                                    onClick={() =>
                                      setInvoiceLines((prev) =>
                                        prev.map((l) =>
                                          l.serviceId === line.serviceId && l.quantity > 1
                                            ? { ...l, quantity: l.quantity - 1, total: l.unitPrice * (l.quantity - 1) }
                                            : l
                                        )
                                      )
                                    }
                                  >
                                    −
                                  </Button>
                                  <span className='w-8 text-center font-medium'>{line.quantity}</span>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    className='h-6 w-6 p-0'
                                    onClick={() =>
                                      setInvoiceLines((prev) =>
                                        prev.map((l) =>
                                          l.serviceId === line.serviceId
                                            ? { ...l, quantity: l.quantity + 1, total: l.unitPrice * (l.quantity + 1) }
                                            : l
                                        )
                                      )
                                    }
                                  >
                                    +
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className='text-right font-semibold'>{fmtAmt(line.total)}</TableCell>
                              <TableCell className='text-right'>
                                <Button
                                  type='button'
                                  variant='destructive'
                                  size='sm'
                                  onClick={() => removeInvoiceLine(line.serviceId)}
                                >
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className='mt-4 flex items-center justify-between rounded-md border p-3 bg-green-50'>
                      <p className='font-semibold'>Invoice Total</p>
                      <p className='text-2xl font-bold text-green-600'>{fmtAmt(invoiceTotal)}</p>
                    </div>

                    <Button
                      onClick={saveInvoice}
                      disabled={isCreatingInvoice || invoiceLines.length === 0}
                      className='w-full mt-4'
                      size='lg'
                    >
                      {isCreatingInvoice ? 'Saving Invoice...' : 'Save Service Invoice'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Services Catalog Column */}
              <div className='space-y-3'>
                <Card className='sticky top-4'>
                  <CardHeader className='pb-3'>
                    <CardTitle className='text-base'>Services</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <Input
                      placeholder='Search services...'
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      className='w-full'
                    />

                    {filteredServices.length === 0 && (
                      <div className='text-center py-8 text-muted-foreground'>
                        <p className='text-sm'>No services found</p>
                      </div>
                    )}

                    <div className='space-y-2 max-h-96 overflow-y-auto'>
                      {filteredServices.map((service) => (
                        <button
                          key={service.id}
                          onClick={() => addInvoiceLine(service)}
                          className='w-full p-3 text-left border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors'
                        >
                          <p className='font-medium text-sm'>{service.serviceName}</p>
                          <p className='text-xs text-muted-foreground line-clamp-1'>{service.details}</p>
                          <p className='text-sm font-semibold text-blue-600 mt-1'>{fmtAmt(service.price)}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Invoices History */}
            <Card>
              <CardHeader>
                <CardTitle>Service Invoices History</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='rounded-md border overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className='text-right'>Items</TableHead>
                        <TableHead className='text-right'>Total</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className='text-right'>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className='text-center py-8 text-muted-foreground'>
                            No service invoices found
                          </TableCell>
                        </TableRow>
                      )}
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className='font-medium'>{invoice.invoiceNumber}</TableCell>
                          <TableCell>{fmtDate(invoice.date)}</TableCell>
                          <TableCell>
                            <p>{invoice.customerName || '-'}</p>
                            {invoice.customerPhone && <p className='text-xs text-muted-foreground'>{invoice.customerPhone}</p>}
                          </TableCell>
                          <TableCell className='text-right'>{invoice.items?.length ?? 0}</TableCell>
                          <TableCell className='text-right font-semibold'>{fmtAmt(invoice.totalAmount)}</TableCell>
                          <TableCell className='capitalize'>{invoice.paymentMethod}</TableCell>
                          <TableCell className='text-right'>
                            <Button variant='destructive' size='sm' onClick={() => handleDeleteInvoice(invoice.id)}>
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <SimplePagination
                  page={invoiceData?.page ?? invoicePage}
                  totalPages={invoiceData?.totalPages ?? 1}
                  totalResults={invoiceData?.totalResults ?? 0}
                  limit={invoiceLimit}
                  setLimit={(value) => {
                    setInvoiceLimit(value)
                    setInvoicePage(1)
                  }}
                  onPageChange={setInvoicePage}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MobilePageShell>
  )
}
