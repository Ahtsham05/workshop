import { getAccountDetailsById } from "@/stores/account.slice";
import { AppDispatch } from "@/stores/store";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";

const AccountLedgerDetail = () => {
  const url = new URL(window.location.href); // Get the current URL
  const searchParams = new URLSearchParams(url.search); // Extract query string parameters
  const accountId = searchParams.get('account');  // Get 'account' query parameter
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const [groupedData, setGroupedData] = useState<any[]>([]); // State for grouped data
  const [previousBalance, setPreviousBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<any>(null);

  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    setLoading(true);
    const fetchTransactions = async () => {
      const params = {
        accountId: accountId,
        startDate,
        endDate,
      };
      await dispatch(getAccountDetailsById(params)).then((action) => {
        // Process the payload directly in this effect
        const accountDetails = action.payload;
        // console.log("accountDetails", accountDetails);
        setAccount(accountDetails?.account[0]);
        // Calculate previous balance from previous sales and transactions
        let previousTransactionsTotal = 0;
 
        accountDetails?.previousTransactions?.forEach((transaction: any) => {
          if (transaction.transactionType === "cashReceived") {
            previousTransactionsTotal += transaction.amount;
          } else {
            previousTransactionsTotal -= transaction.amount;
          }
        });

        const previousBalance = previousTransactionsTotal;
        setPreviousBalance(previousBalance);

        // Group sales and transactions by date and format the data
        const groupGetTransactions = () => {
          const groupedData: any[] = [];

          // Helper function to format date
          const formatDate = (date: string) => {
            return new Date(date).toISOString().split('T')[0];
          };

          const allTransactions = [...(accountDetails?.transactions || [])];

          // console.log("allSales", allSales)

          allTransactions.forEach((transaction: any) => {
            const transactionDate = formatDate(transaction.transactionDate);

            if (transaction.transactionType === "cashReceived") {
              groupedData.push({
                date: transactionDate,
                invoiceno: "N/A",  // No invoice number for transactions
                item: `Transaction: ${transaction.description}`,  // Placeholder for transactions
                qty: 0,  // Extract item quantity
                price: 0,   // Extract item price
                debit: 0,  // Debit from the purchase
                credit: transaction.amount,  // No credit for purchase items
              });
            } else {
              groupedData.push({
                date: transactionDate,
                invoiceno: "N/A",  // No invoice number for transactions
                item: `Transaction: ${transaction.description}`,  // Placeholder for transactions
                qty: 0,  // No quantity for transactions
                price: 0,  // No price for transactions
                debit: transaction.amount,  // No debit for transactions, only credit
                credit: 0,
              });
            }
          });

          // Sort the data by date
          groupedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return groupedData;
        };

        const groupedData = groupGetTransactions();
        setGroupedData(groupedData); // Store the grouped data in state
        setLoading(false);
      });
    };
    fetchTransactions();
  }, [startDate, endDate, dispatch]);

  let balance = previousBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalqty = 0;

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
              <h2 className="text-xl font-bold my-4">Account Ledger : {account?.name}</h2>
              <h2 className="text-xl font-bold my-4">Previous Balance : {previousBalance}</h2>
            </div>
            <table className="w-full border-collapse border border-gray-300 cursor-pointer">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left border border-black">Date</th>
                  <th className="px-2 py-1 text-left border border-black">Description</th>
                  <th className="px-2 py-1 text-left border border-black">Debit</th>
                  <th className="px-2 py-1 text-left border border-black">Credit</th>
                  <th className="px-2 py-1 text-left border border-black">Balance</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.map((data, index) => {
                  balance +=  data.debit - data.credit;
                  return (
                    <tr className="hover:bg-gray-100" key={index}>
                      <td className="px-2 border border-black">{data.date}</td>
                      <td className="px-2 border border-black">{data.item}</td>
                      <td className="px-2 border border-black">{data.debit}</td>
                      <td className="px-2 border border-black">{data.credit}</td>
                      <td className="px-2 border border-black">{balance}</td>
                    </tr>
                  );
                })}
                <tr className="hover:bg-gray-100">
                  <td className="px-2 border border-black font-bold text-right" colSpan={2}>Grand Total:</td>
                  <td className="px-2 border border-black font-bold">{totalDebit}</td>
                  <td className="px-2 border border-black font-bold">{totalCredit}</td>
                  <td className="px-2 border border-black font-bold">{balance}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
    </>
  );
};

export default AccountLedgerDetail;
