import { z } from 'zod';

// Define a schema for a single account
export const accountSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // existing account ID
  name: z.string().min(1, { message: 'Account name is required.' }),
  type: z.enum(['receivable', 'payable']),
  balance: z.number().optional().default(0),
  customer: z.string().optional(), // customer ID if receivable
  supplier: z.string().optional(), // supplier ID if payable
  transactionType: z.enum(['cashReceived', 'expenseVoucher', 'generalLedger']),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for list of accounts
export const accountListSchema = z.array(accountSchema);

export type Account = z.infer<typeof accountSchema>;
export type User = z.infer<typeof accountSchema>;
export type AccountList = z.infer<typeof accountListSchema>;
