import { z } from 'zod';

export const transactionSchema = z.object({
  _id: z.string().optional(),
  account: z.string().min(1, { message: 'Account ID is required' }),
  amount: z.number().min(0, { message: 'Amount must be positive' }),
  transactionType: z.enum(['cashReceived', 'expenseVoucher']),
  transactionDate: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'completed']).optional(),
});

export const transactionListSchema = z.array(transactionSchema);

export type Transaction = z.infer<typeof transactionSchema>;
export type sale = z.infer<typeof transactionSchema>;
export type User = z.infer<typeof transactionSchema>;
export type Supplier = z.infer<typeof transactionSchema>;
export type TransactionList = z.infer<typeof transactionListSchema>;
