'use client'

import { Button } from '@/components/ui/button';
import { fetchSaleById } from '@/stores/sale.slice';  // Changed to sale.slice
import { AppDispatch } from '@/stores/store';
import { useLocation } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import SalesProvider from './context/users-context';  // Updated to sale-context
import { Main } from '@/components/layout/main';
import { Header } from '@/components/layout/header';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { getCustomerSalesAndTransactions } from '@/stores/customer.slice';
import { ReturnForm } from '@/features/returns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RotateCcw } from 'lucide-react';

const SaleInvoice = () => {

  const [data, setData] = React.useState({
    _id: '',
    customer: {
      name: '',
      phone: '',
      id: '',
    },
    customerName: '',
    walkInCustomerName: '',
    invoiceNumber: '',
    saleDate: '',
    items: [
      {
        productId: '',
        product: {
          name: '',
        },
        quantity: 0,
        priceAtSale: 0,
        total: 0,
      },
    ],
    totalAmount: 0,
  });

  const [previousBalance, setPreviousBalance] = useState(0);
  const [showReturnDialog, setShowReturnDialog] = useState(false);

  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const id = urlParams.get('id');

  const startDate = new Date().toLocaleDateString()

  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    if (!!id) {
      const loadData = async () => {
        const saleAction = await dispatch(fetchSaleById(id));
        setData(saleAction.payload);

        const params = {
          startDate: startDate,
          endDate: startDate,
          customerId: saleAction.payload?.customer?.id, // use data from the response
        };

        await dispatch(getCustomerSalesAndTransactions(params)).then((action) => {
          // Process the payload directly in this effect
          const customerDetails = action.payload;

          // Calculate previous balance from previous sales and transactions
          let previousSaleTotal = 0;
          let previousTransactionsTotal = 0;

          customerDetails?.previousSale?.forEach((sale: any) => {
            previousSaleTotal += sale.totalAmount;
          });

          customerDetails?.previousTransactions?.forEach((transaction: any) => {
            if (transaction.transactionType === "cashReceived") {
              previousTransactionsTotal += transaction.amount;
            } else {
              previousTransactionsTotal -= transaction.amount;
            }
          });

          const previousBalance = previousSaleTotal - previousTransactionsTotal;
          setPreviousBalance(previousBalance);
        });

      };

      loadData();
    }
  }, [id]);

  // Function to trigger print of the invoice
  const printInvoice = () => {
    window?.print(); // Trigger print dialog
  };

  return (
    <SalesProvider>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="bg-white rounded-lg shadow-lg px-8 py-10 max-w-xl mx-auto">
          {/* Action buttons */}
          <div className="flex justify-end gap-2 mb-8">
            <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Create Return
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Return for Invoice #{data.invoiceNumber}</DialogTitle>
                </DialogHeader>
                <ReturnForm
                  invoice={{
                    _id: data._id,
                    invoiceNumber: data.invoiceNumber,
                    customerId: data.customer?.id,
                    customerName: data.customer?.name || data.customerName,
                    walkInCustomerName: data.walkInCustomerName,
                    items: data.items?.map(item => ({
                      productId: item.productId || 'unknown',
                      name: item.product?.name || '',
                      quantity: item.quantity,
                      price: item.priceAtSale,
                      cost: 0, // Default cost
                    })),
                  }}
                  onSuccess={() => {
                    setShowReturnDialog(false)
                    // You can add success notification here
                  }}
                  onCancel={() => setShowReturnDialog(false)}
                />
              </DialogContent>
            </Dialog>
            <Button onClick={printInvoice}>
              Print Invoice
            </Button>
          </div>

          {/* Invoice content to be printed */}
          <div id="invoice-to-print" className="invoice">
            <div className="flex items-center justify-center mb-8">
              {/* <img
                  className="h-8 w-8 mr-2"
                  src="https://tailwindflex.com/public/images/logos/favicon-32x32.png"
                  alt="Logo"
                /> */}
              <div className="text-gray-700 text-center font-bold text-3xl uppercase">786 Engineering Works</div>
            </div>
            <div className='flex items-center justify-between border-b-2 border-gray-300 pb-8 mb-8'>
              <div className="">
                <h2 className="text-2xl font-bold mb-4">BILL TO:</h2>
                <div className="text-gray-700 mb-2">{data?.customer?.name}</div>
                <div className="text-gray-700">Phone: {data?.customer?.phone}</div>
              </div>
              <div className="text-gray-700">
                <div className="font-bold text-xl mb-2">SALE</div>
                <div className="text-sm">Date: {
                  new Date(data.saleDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="text-sm">Invoice #: {data.invoiceNumber}</div>
              </div>
            </div>
            <table className="w-full text-left mb-8">
              <thead>
                <tr>
                  <th className="text-gray-700 font-bold uppercase py-2">Description</th>
                  <th className="text-gray-700 font-bold uppercase py-2">Quantity</th>
                  <th className="text-gray-700 font-bold uppercase py-2">Price</th>
                  <th className="text-gray-700 font-bold uppercase py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {
                  data?.items?.map((item, index) => (
                    <tr key={index}>
                      <td className="py-2">{item?.product?.name || ''}</td>
                      <td className="py-2">{item?.quantity}</td>
                      <td className="py-2">Rs.{item?.priceAtSale}</td>
                      <td className="py-2">Rs.{item?.priceAtSale * item?.quantity}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            <div className="flex justify-end mb-8">
              <div className="text-gray-700 mr-2">Subtotal:</div>
              <div className="text-gray-700">Rs. {data.totalAmount}</div>
            </div>
            <div className="flex justify-end mb-8">
              <div className="text-gray-700 mr-2">PrevBal:</div>
              <div className="text-gray-700">Rs. {previousBalance - data.totalAmount}</div>
            </div>
            <div className="flex justify-end mb-4">
              <div className="text-gray-700 mr-2">Net Total:</div>
              <div className="text-gray-700 font-bold text-xl">Rs. {previousBalance}</div>
            </div>
            <p className='text-center text-gray-700 my-2 mb-4'>Thank you for your purchase!</p>
            <div className="border-t-2 border-gray-300 pt-2 mb-2">
              {/* <div className="text-gray-700 mb-2 text-center">Nalka Kohala stop Sargodha road, Faisalabad.</div> */}
              <div className="text-gray-700 mb-2 text-center">Nalka Kohala stop Sargodha road, Faisalabad.</div>
              <div className="text-gray-700 text-center">03457005071,03217005071</div>
            </div>
          </div>
        </div>
      </Main>
    </SalesProvider>
  );
};

export default SaleInvoice;
