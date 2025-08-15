import { z } from 'zod';
import { supplierSchema } from '../../suppliers/data/schema'; // adjust path if needed

// Item schema reused from earlier
const itemSchema = z.object({
  product: z.string().min(1, { message: 'Product is required' }),
  quantity: z.number().positive({ message: 'Quantity must be greater than 0' }),
  priceAtPurchase: z.number().positive({ message: 'Price must be greater than 0' }),
  total: z.number().positive({ message: 'Total must be greater than 0' }),
});

// Purchase schema
export const purchaseSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // for existing purchases
  supplier: supplierSchema, // full supplier object
  invoiceNumber: z.string().optional(),
  items: z.array(itemSchema).min(1, { message: 'At least one item is required' }),
  purchaseDate: z.union([z.date(), z.string()]).optional(), // allow ISO string or Date
  totalAmount: z.number().positive({ message: 'Total amount is required' }),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// List of purchases
export const purchaseListSchema = z.array(purchaseSchema);

  export type purchase = z.infer<typeof purchaseSchema>;
  export type User = z.infer<typeof purchaseSchema>;
  export type purchaseList = z.infer<typeof purchaseListSchema>;
