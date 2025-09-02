import { useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Package,
  Search,
  Filter,
  Eye,
  AlertCircle,
  // Plus,
} from 'lucide-react'
import { useGetReturnsQuery, useApproveReturnMutation, useRejectReturnMutation, useProcessReturnMutation } from '@/stores/return.api'
import { Return, ReturnFilters } from '../types'
import { ReturnForm } from './return-form'
import { useLanguage } from '@/context/language-context'

const statusColors: Record<Return['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  processed: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-800',
}

const returnTypeColors: Record<Return['returnType'], string> = {
  full_refund: 'bg-purple-100 text-purple-800',
  partial_refund: 'bg-orange-100 text-orange-800',
  exchange: 'bg-cyan-100 text-cyan-800',
  store_credit: 'bg-indigo-100 text-indigo-800',
}

interface ReturnListProps {
  onBack?: () => void
}

export function ReturnList({ onBack }: ReturnListProps) {
  const { t } = useLanguage()
  const [filters, setFilters] = useState<ReturnFilters>({})
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  const { data: returns, isLoading, refetch } = useGetReturnsQuery(filters)
  const [approveReturn] = useApproveReturnMutation()
  const [rejectReturn] = useRejectReturnMutation()
  const [processReturn] = useProcessReturnMutation()

  const handleApprove = async (returnId: string) => {
    try {
      await approveReturn(returnId).unwrap()
    } catch (error) {
      console.error('Failed to approve return:', error)
    }
  }

  const handleReject = async (returnId: string) => {
    try {
      await rejectReturn({ id: returnId, reason: rejectionReason }).unwrap()
      setRejectionReason('')
    } catch (error) {
      console.error('Failed to reject return:', error)
    }
  }

  const handleProcess = async (returnId: string) => {
    try {
      await processReturn(returnId).unwrap()
    } catch (error) {
      console.error('Failed to process return:', error)
    }
  }

  const handleCreateSuccess = () => {
    setShowCreateForm(false)
    refetch() // Refresh the returns list
  }

  const filteredReturns = returns?.filter((returnItem: Return) =>
    returnItem.returnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    returnItem.originalInvoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    returnItem.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    returnItem.walkInCustomerName?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  if (showCreateForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('create_return')}</h1>
            <p className="text-muted-foreground">{t('new_return_request')}</p>
          </div>
        </div>
        <ReturnForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setShowCreateForm(false)}
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('loading_returns')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{t('returns_management')}</h1>
            <p className="text-muted-foreground mt-2">{t('manage_returns')}</p>
          </div>
        </div>
        {/* <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('create_return')}
        </Button> */}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">{t('search')}</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={`${t('return_number')}, ${t('original_invoice')}, ${t('customer')}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>{t('return_status')}</Label>
              <Select value={filters.status || 'all'} onValueChange={(value) =>
                setFilters(prev => ({ ...prev, status: value === 'all' ? undefined : value as any }))
              }>
                <SelectTrigger className='mt-2 w-full'>
                  <SelectValue placeholder={t('return_all_statuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('return_all_statuses')}</SelectItem>
                  <SelectItem value="pending">{t('return_pending')}</SelectItem>
                  <SelectItem value="approved">{t('return_approved')}</SelectItem>
                  <SelectItem value="rejected">{t('return_rejected')}</SelectItem>
                  <SelectItem value="processed">{t('return_processed')}</SelectItem>
                  <SelectItem value="completed">{t('return_completed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('return_type')}</Label>
              <Select value={filters.returnType || 'all'} onValueChange={(value) =>
                setFilters(prev => ({ ...prev, returnType: value === 'all' ? undefined : value as any }))
              }>
                <SelectTrigger className='mt-2 w-full'>
                  <SelectValue placeholder={t('return_all_types')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('return_all_types')}</SelectItem>
                  <SelectItem value="full_refund">{t('full_refund')}</SelectItem>
                  <SelectItem value="partial_refund">{t('partial_refund')}</SelectItem>
                  <SelectItem value="exchange">{t('exchange')}</SelectItem>
                  <SelectItem value="store_credit">{t('store_credit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setFilters({})}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('return_clear_filters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('returns_list')} ({filteredReturns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('return_number')}</TableHead>
                  <TableHead>{t('original_invoice')}</TableHead>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead>{t('return_date')}</TableHead>
                  <TableHead>{t('return_type')}</TableHead>
                  <TableHead>{t('refund_amount')}</TableHead>
                  <TableHead>{t('return_status')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((returnItem: Return) => (
                  <TableRow key={returnItem._id}>
                    <TableCell className="font-medium">
                      {returnItem.returnNumber}
                    </TableCell>
                    <TableCell>{returnItem.originalInvoiceNumber}</TableCell>
                    <TableCell>
                      {returnItem.customerName || returnItem.walkInCustomerName || t('walk_in_customer')}
                    </TableCell>
                    <TableCell>
                      {format(new Date(returnItem.returnDate), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge className={returnTypeColors[returnItem.returnType]}>
                        {t(returnItem.returnType)}
                      </Badge>
                    </TableCell>
                    <TableCell>Rs{returnItem.totalReturnAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[returnItem.status]}>
                        {t(`return_${returnItem.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedReturn(returnItem)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] w-[95vw] max-w-none overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{t('return_details')} - {returnItem.returnNumber}</DialogTitle>
                            </DialogHeader>
                            {selectedReturn && <ReturnDetails returnItem={selectedReturn} />}
                          </DialogContent>
                        </Dialog>

                        {returnItem.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApprove(returnItem._id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>{t('reject_return')}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="reason">{t('rejection_reason')}</Label>
                                    <Textarea
                                      id="reason"
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      placeholder={t('enter_rejection_reason')}
                                      rows={3}
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline">{t('cancel')}</Button>
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleReject(returnItem._id)}
                                      disabled={!rejectionReason.trim()}
                                    >
                                      {t('reject_return')}
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}

                        {returnItem.status === 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleProcess(returnItem._id)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredReturns.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('no_returns_found')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReturnDetails({ returnItem }: { returnItem: Return }) {
  const { t, language } = useLanguage()
  
  return (
    <div className={`space-y-6 ${language === 'ur' ? 'rtl' : 'ltr'}`}>
      {/* Return Info - Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">{t('return_number')}</Label>
          <p className="font-medium text-sm">{returnItem.returnNumber}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t('original_invoice')}</Label>
          <p className="font-medium text-sm">{returnItem.originalInvoiceNumber}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t('customer')}</Label>
          <p className="font-medium text-sm">
            {returnItem.customerName || returnItem.walkInCustomerName || t('walk_in_customer')}
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t('return_date')}</Label>
          <p className="font-medium text-sm">
            {format(new Date(returnItem.returnDate), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t('return_status')}</Label>
          <div className="mt-1">
            <Badge className={statusColors[returnItem.status]}>
              {t(`return_${returnItem.status}`)}
            </Badge>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t('return_type')}</Label>
          <div className="mt-1">
            <Badge className={returnTypeColors[returnItem.returnType]}>
              {t(returnItem.returnType)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Return Items - Mobile Responsive */}
      <div>
        <Label className="text-sm font-medium">{t('return_items')}</Label>
        
        {/* Mobile View - Card Layout */}
        <div className="block lg:hidden space-y-3 mt-3">
          {returnItem.items.map((item, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-3">
                {item.image && (
                  <img
                    src={item.image.url}
                    alt={item.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t('original_qty')}:</span>
                      <span className="ml-1 font-medium">{item.originalQuantity}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('return_qty')}:</span>
                      <span className="ml-1 font-medium">{item.returnedQuantity}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('unit_price')}:</span>
                      <span className="ml-1 font-medium">Rs{item.unitPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('return_amount')}:</span>
                      <span className="ml-1 font-medium">Rs{item.returnAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t(item.reason === 'defective' ? 'reason_defective' :
                        item.reason === 'wrong_item' ? 'wrong_item' :
                        item.reason === 'customer_request' ? 'customer_request' :
                        item.reason === 'damaged' ? 'reason_damaged' :
                        item.reason === 'expired' ? 'reason_expired' :
                        item.reason === 'other' ? 'reason_other' : item.reason)}
                    </Badge>
                    <Badge variant={item.condition === 'new' ? 'default' : 'secondary'} className="text-xs">
                      {t(item.condition === 'new' ? 'condition_new' :
                        item.condition === 'used' ? 'condition_used' :
                        item.condition === 'damaged' ? 'condition_damaged' :
                        item.condition === 'defective' ? 'condition_defective' : item.condition)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View - Table Layout */}
        <div className="hidden lg:block">
          <Table className={`mt-3 ${language === 'ur' ? 'rtl' : 'ltr'}`}>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">{t('product')}</TableHead>
                <TableHead className="text-center w-[70px]">{t('original_qty')}</TableHead>
                <TableHead className="text-center w-[70px]">{t('return_qty')}</TableHead>
                <TableHead className={`w-[80px] ${language === 'ur' ? 'text-left' : 'text-right'}`}>{t('unit_price')}</TableHead>
                <TableHead className={`w-[80px] ${language === 'ur' ? 'text-left' : 'text-right'}`}>{t('return_amount')}</TableHead>
                {/* <TableHead className="text-center w-[110px]">Reason</TableHead> */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnItem.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="min-w-[150px]">
                    <div className="flex items-center gap-2">
                      {item.image && (
                        <img
                          src={item.image.url}
                          alt={item.name}
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm block truncate" title={item.name}>{item.name}</span>
                        {/* <Badge variant={item.condition === 'new' ? 'default' : 'secondary'} className="text-xs mt-1">
                          {t(item.condition === 'new' ? 'condition_new' :
                            item.condition === 'used' ? 'condition_used' :
                            item.condition === 'damaged' ? 'condition_damaged' :
                            item.condition === 'defective' ? 'condition_defective' : item.condition)}
                        </Badge> */}
                      </div>
                    </div>
                    <div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {t(item.reason === 'defective' ? 'reason_defective' :
                          item.reason === 'wrong_item' ? 'wrong_item' :
                          item.reason === 'customer_request' ? 'customer_request' :
                          item.reason === 'damaged' ? 'reason_damaged' :
                          item.reason === 'expired' ? 'reason_expired' :
                          item.reason === 'other' ? 'reason_other' : item.reason)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{item.originalQuantity}</TableCell>
                  <TableCell className="text-center">{item.returnedQuantity}</TableCell>
                  <TableCell className={`${language === 'ur' ? 'text-left' : 'text-right'}`}>Rs{item.unitPrice.toFixed(2)}</TableCell>
                  <TableCell className={`${language === 'ur' ? 'text-left' : 'text-right'}`}>Rs{item.returnAmount.toFixed(2)}</TableCell>
                  {/* <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {item.reason.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </TableCell> */}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Financial Summary - Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
        <div className="text-center sm:text-left">
          <Label className="text-sm text-muted-foreground">{t('total_return_amount')}</Label>
          <p className="text-lg font-bold text-blue-600">Rs{returnItem.totalReturnAmount.toFixed(2)}</p>
        </div>
        <div className={`text-center ${language === 'ur' ? 'sm:text-left' : 'sm:text-right'}`}>
          <Label className="text-sm text-muted-foreground">{t('refund_amount')}</Label>
          <p className="text-lg font-bold text-green-600">Rs{returnItem.refundAmount.toFixed(2)}</p>
        </div>
        {returnItem.restockingFee > 0 && (
          <div className={`text-center ${language === 'ur' ? 'sm:text-right' : 'sm:text-left'}`}>
            <Label className="text-sm text-muted-foreground">{t('restocking_fee')}</Label>
            <p className="text-lg font-bold text-red-600">-Rs{returnItem.restockingFee.toFixed(2)}</p>
          </div>
        )}
        {returnItem.processingFee > 0 && (
          <div className={`text-center ${language === 'ur' ? 'sm:text-left' : 'sm:text-right'}`}>
            <Label className="text-sm text-muted-foreground">{t('processing_fee')}</Label>
            <p className="text-lg font-bold text-red-600">-Rs{returnItem.processingFee.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Notes and Reason */}
      {returnItem.returnReason && (
        <div>
          <Label className="text-sm font-medium">{t('return_reason')}</Label>
          <p className={`text-sm text-muted-foreground mt-1 p-3 bg-muted rounded ${language === 'ur' ? 'text-right' : 'text-left'}`}>{returnItem.returnReason}</p>
        </div>
      )}

      {returnItem.notes && (
        <div>
          <Label className="text-sm font-medium">{t('additional_notes')}</Label>
          <p className={`text-sm text-muted-foreground mt-1 p-3 bg-muted rounded ${language === 'ur' ? 'text-right' : 'text-left'}`}>{returnItem.notes}</p>
        </div>
      )}

      {returnItem.rejectionReason && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className={`flex items-center gap-2 mb-2 ${language === 'ur' ? 'flex-row-reverse' : 'flex-row'}`}>
            <AlertCircle className="h-4 w-4 text-red-500" />
            <Label className="text-red-700 text-sm font-medium">{t('rejection_reason')}</Label>
          </div>
          <p className={`text-sm text-red-600 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{returnItem.rejectionReason}</p>
        </div>
      )}
    </div>
  )
}
