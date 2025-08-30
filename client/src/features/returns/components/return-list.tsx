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
  Plus,
} from 'lucide-react'
import { useGetReturnsQuery, useApproveReturnMutation, useRejectReturnMutation, useProcessReturnMutation } from '@/stores/return.api'
import { Return, ReturnFilters } from '../types'
import { ReturnForm } from './return-form'

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
            <h1 className="text-2xl font-bold">Create Return</h1>
            <p className="text-muted-foreground">Create a new return request</p>
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
          <p className="mt-4 text-muted-foreground">Loading returns...</p>
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
            <h1 className="text-2xl font-bold">Returns Management</h1>
            <p className="text-muted-foreground">Manage customer returns and refunds</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Return
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Return #, Invoice #, Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label>Status</Label>
              <Select value={filters.status || 'all'} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, status: value === 'all' ? undefined : value as any }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Return Type</Label>
              <Select value={filters.returnType || 'all'} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, returnType: value === 'all' ? undefined : value as any }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="full_refund">Full Refund</SelectItem>
                  <SelectItem value="partial_refund">Partial Refund</SelectItem>
                  <SelectItem value="exchange">Exchange</SelectItem>
                  <SelectItem value="store_credit">Store Credit</SelectItem>
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
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Returns List ({filteredReturns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Return Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
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
                      {returnItem.customerName || returnItem.walkInCustomerName || 'Walk-in Customer'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(returnItem.returnDate), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge className={returnTypeColors[returnItem.returnType]}>
                        {returnItem.returnType.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>${returnItem.totalReturnAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[returnItem.status]}>
                        {returnItem.status.toUpperCase()}
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
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Return Details - {returnItem.returnNumber}</DialogTitle>
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
                                  <DialogTitle>Reject Return</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="reason">Rejection Reason</Label>
                                    <Textarea
                                      id="reason"
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      placeholder="Enter reason for rejection..."
                                      rows={3}
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline">Cancel</Button>
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleReject(returnItem._id)}
                                      disabled={!rejectionReason.trim()}
                                    >
                                      Reject Return
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
              <p className="text-muted-foreground">No returns found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReturnDetails({ returnItem }: { returnItem: Return }) {
  return (
    <div className="space-y-6">
      {/* Return Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Return Number</Label>
          <p className="font-medium">{returnItem.returnNumber}</p>
        </div>
        <div>
          <Label>Original Invoice</Label>
          <p className="font-medium">{returnItem.originalInvoiceNumber}</p>
        </div>
        <div>
          <Label>Customer</Label>
          <p className="font-medium">
            {returnItem.customerName || returnItem.walkInCustomerName || 'Walk-in Customer'}
          </p>
        </div>
        <div>
          <Label>Return Date</Label>
          <p className="font-medium">
            {format(new Date(returnItem.returnDate), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label>Status</Label>
          <Badge className={statusColors[returnItem.status]}>
            {returnItem.status.toUpperCase()}
          </Badge>
        </div>
        <div>
          <Label>Return Type</Label>
          <Badge className={returnTypeColors[returnItem.returnType]}>
            {returnItem.returnType.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Return Items */}
      <div>
        <Label>Return Items</Label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Original Qty</TableHead>
              <TableHead>Return Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Return Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Condition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returnItem.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {item.image && (
                      <img 
                        src={item.image.url} 
                        alt={item.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    {item.name}
                  </div>
                </TableCell>
                <TableCell>{item.originalQuantity}</TableCell>
                <TableCell>{item.returnedQuantity}</TableCell>
                <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                <TableCell>${item.returnAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {item.reason.replace('_', ' ').toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={item.condition === 'new' ? 'default' : 'secondary'}>
                    {item.condition.toUpperCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
        <div>
          <Label>Total Return Amount</Label>
          <p className="text-lg font-bold">${returnItem.totalReturnAmount.toFixed(2)}</p>
        </div>
        <div>
          <Label>Refund Amount</Label>
          <p className="text-lg font-bold text-green-600">${returnItem.refundAmount.toFixed(2)}</p>
        </div>
        {returnItem.restockingFee > 0 && (
          <div>
            <Label>Restocking Fee</Label>
            <p className="text-lg font-bold text-red-600">-${returnItem.restockingFee.toFixed(2)}</p>
          </div>
        )}
        {returnItem.processingFee > 0 && (
          <div>
            <Label>Processing Fee</Label>
            <p className="text-lg font-bold text-red-600">-${returnItem.processingFee.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Notes and Reason */}
      {returnItem.returnReason && (
        <div>
          <Label>Return Reason</Label>
          <p className="text-sm">{returnItem.returnReason}</p>
        </div>
      )}

      {returnItem.notes && (
        <div>
          <Label>Notes</Label>
          <p className="text-sm">{returnItem.notes}</p>
        </div>
      )}

      {returnItem.rejectionReason && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <Label className="text-red-700">Rejection Reason</Label>
          </div>
          <p className="text-sm text-red-600">{returnItem.rejectionReason}</p>
        </div>
      )}
    </div>
  )
}
