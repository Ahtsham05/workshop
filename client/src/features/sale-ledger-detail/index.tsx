import { getSaleByDate } from "@/stores/sale.slice";
import { AppDispatch } from "@/stores/store";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";

const SaleLedgerDetail = () => {
  const url = new URL(window.location.href); // Get the current URL
  const searchParams = new URLSearchParams(url.search); // Extract query string parameters
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const [groupedData, setGroupedData] = useState<any[]>([]); // State for grouped data
  const [loading, setLoading] = useState(false);

  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    setLoading(true);
    const fetchTransactions = async () => {
      const params = {
        startDate,
        endDate,
      };
      await dispatch(getSaleByDate(params)).then((action) => {
        // Process the payload directly in this effect
        const saleDetails = action.payload;

        // Group sales and transactions by date and format the data
        const groupSalesAndTransactionsByDate = () => {
          const groupedData: any[] = [];

          // Helper function to format date
          const formatDate = (date: string) => {
            return new Date(date).toISOString().split('T')[0];
          };

          const allSales = [...(saleDetails || [])];

          // console.log("allSales", allSales)

          allSales.forEach((sale: any) => {
            const saleDate = formatDate(sale.saleDate);

            sale.items.forEach((item: any) => {
              groupedData.push({
                date: saleDate,
                invoiceno: sale.invoiceNumber,
                item: item?.product?.name,  // Extract item name
                qty: item.quantity,  // Extract item quantity
                price: item.priceAtSale,   // Extract item price
                debit: item.total,  // Debit from the sale
                credit: 0,  // No credit for sale items
                profit: item.profit,  // No credit for sale items
              });
            });
          });

          // Sort the data by date
          groupedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return groupedData;
        };

        const groupedData = groupSalesAndTransactionsByDate();
        setGroupedData(groupedData); // Store the grouped data in state
        setLoading(false);
      });
    };
    fetchTransactions();
  }, [startDate, endDate, dispatch]);

  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalqty = 0;
  let totalProfit = 0;

  groupedData.forEach((transaction) => {
    totalDebit += transaction.debit;
    totalCredit += transaction.credit;
    totalqty += transaction.qty;
  });
  return (
    <>
      {
        loading ? (
          <div className="w-full h-[70vh] flex items-center justify-center">
            <Loader2 className="animate-spin size-6" />
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-bold my-4">Sale Ledger </h2>
            </div>
            <table className="w-full border-collapse border border-gray-300 cursor-pointer">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left border border-black">Date</th>
                  <th className="px-2 py-1 text-left border border-black">Invoice Number</th>
                  <th className="px-2 py-1 text-left border border-black">Item</th>
                  <th className="px-2 py-1 text-left border border-black">Qty</th>
                  <th className="px-2 py-1 text-left border border-black">Price</th>
                  <th className="px-2 py-1 text-left border border-black">Debit</th>
                  <th className="px-2 py-1 text-left border border-black">Credit</th>
                  <th className="px-2 py-1 text-left border border-black">Balance</th>
                  <th className="px-2 py-1 text-left border border-black">Profit</th>
                  <th className="px-2 py-1 text-left border border-black">Total Profit</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.map((data, index) => {
                  balance += data.debit - data.credit;
                  totalProfit += data.profit;
                  return (
                    <tr className="hover:bg-gray-100" key={index}>
                      <td className="px-2 border border-black">{data.date}</td>
                      <td className="px-2 border border-black">{data.invoiceno}</td>
                      <td className="px-2 border border-black">{data.item}</td>
                      <td className="px-2 border border-black">{data.qty}</td>
                      <td className="px-2 border border-black">{data.price}</td>
                      <td className="px-2 border border-black">{data.debit}</td>
                      <td className="px-2 border border-black">{data.credit}</td>
                      <td className="px-2 border border-black">{balance}</td>
                      <td className="px-2 border border-black">{data.profit}</td>
                      <td className="px-2 border border-black">{totalProfit}</td>
                    </tr>
                  );
                })}
                <tr className="hover:bg-gray-100">
                  <td className="px-2 border border-black font-bold text-right" colSpan={3}>Grand Total:</td>
                  <td className="px-2 border border-black font-bold">{totalqty}</td>
                  <td className="px-2 border border-black font-bold"></td>
                  <td className="px-2 border border-black font-bold">{totalDebit}</td>
                  <td className="px-2 border border-black font-bold">{totalCredit}</td>
                  <td className="px-2 border border-black font-bold">{balance}</td>
                  <td className="px-2 border border-black font-bold"></td>
                  <td className="px-2 border border-black font-bold">{totalProfit}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
    </>
  );
};

export default SaleLedgerDetail;
