import { Button } from '@/components/ui/button';
import { fetchPurchaseById } from '@/stores/purchase.slice';
import { AppDispatch } from '@/stores/store';
import { useLocation } from '@tanstack/react-router';
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import SuppliersProvider from './context/users-context'
import { Main } from '@/components/layout/main'
import { Header } from '@/components/layout/header'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'



const Invoice = () => {

  const [data, setData] = React.useState({
    supplier: {
      name: '',
      phone: '',
    },
    invoiceNumber: '',
    purchaseDate: '',
    items: [
      {
        product: {
          name: '',
        },
        quantity: 0,
        priceAtPurchase: 0,
        total: 0,
      },
    ],
    totalAmount: 0
  });

  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const id = urlParams.get('id');

  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    if(!!id){
      const loadData = async () => {
      await dispatch(fetchPurchaseById(id)).then((action) => {
        setData(action.payload)
      })
    }
    loadData()
    }
  }, [id])
  // Function to trigger print of the invoice only
  const printInvoice = () => {
    window?.print(); // Trigger print dialog
  };

  return (
    <SuppliersProvider>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="bg-white rounded-lg shadow-lg px-8 py-10 max-w-xl mx-auto">
          {/* Print button */}
          <div className="flex justify-end mb-8">
            <Button
              onClick={printInvoice}
            >
              Print Invoice
            </Button>
          </div>

          {/* Invoice content to be printed */}
          <div id="invoice-to-print" className="invoice">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center">
                <img
                  className="h-8 w-8 mr-2"
                  src="https://tailwindflex.com/public/images/logos/favicon-32x32.png"
                  alt="Logo"
                />
                <div className="text-gray-700 font-semibold text-lg">Your Company Name</div>
              </div>
              <div className="text-gray-700">
                <div className="font-bold text-xl mb-2">PURCHASE</div>
                <div className="text-sm">Date: {
                  new Date(data.purchaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="text-sm">Invoice #: {data.invoiceNumber}</div>
              </div>
            </div>
            <div className="border-b-2 border-gray-300 pb-8 mb-8">
              <h2 className="text-2xl font-bold mb-4">Bill FROM:</h2>
              <div className="text-gray-700 mb-2">{data?.supplier?.name}</div>
              {/* <div className="text-gray-700 mb-2">123 Main St.</div> */}
              {/* <div className="text-gray-700 mb-2">Anytown, USA 12345</div> */}
              <div className="text-gray-700">Phone: {data?.supplier?.phone}</div>
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
                      <td className="py-2">Rs.{item?.priceAtPurchase}</td>
                      <td className="py-2">Rs.{item?.priceAtPurchase * item?.quantity}</td>
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
              <div className="text-gray-700">Rs. 0</div>
            </div>
            <div className="flex justify-end mb-8">
              <div className="text-gray-700 mr-2">Net Total:</div>
              <div className="text-gray-700 font-bold text-xl">Rs. {data.totalAmount}</div>
            </div>
            <div className="border-t-2 border-gray-300 pt-8 mb-8">
              <div className="text-gray-700 mb-2">Payment is due within 30 days. Late payments are subject to fees.</div>
              <div className="text-gray-700 mb-2">Please make checks payable to Your Company Name and mail to:</div>
              <div className="text-gray-700">123 Main St., Anytown, USA 12345</div>
            </div>
          </div>
        </div>
      </Main>
    </SuppliersProvider>
  );
};

export default Invoice;
