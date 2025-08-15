import { z } from 'zod';
import { customerSchema } from '../../customers/data/schema'; // Adjust path if needed

// Item schema reused from earlier
const itemSchema = z.object({
  product: z.string().min(1, { message: 'Product is required' }),
  quantity: z.number().positive({ message: 'Quantity must be greater than 0' }),
  priceAtSale: z.number().positive({ message: 'Price must be greater than 0' }), // Sale price
  purchasePrice: z.number().positive({ message: 'Purchase price must be greater than 0' }), // Purchase price to calculate profit
  total: z.number().positive({ message: 'Total must be greater than 0' }), // Total price at sale
  profit: z.number().positive({ message: 'Profit must be greater than 0' }), // Profit for each item
});

// Sale schema
export const saleSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // For existing sales
  customer: customerSchema, // Full customer object
  invoiceNumber: z.string().optional(),
  items: z.array(itemSchema).min(1, { message: 'At least one item is required' }),
  saleDate: z.union([z.date(), z.string()]).optional(), // Allow ISO string or Date
  totalAmount: z.number().positive({ message: 'Total amount is required' }),
  totalProfit: z.number().positive({ message: 'Total profit is required' }), // Total profit from all items
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// List of sales
export const saleListSchema = z.array(saleSchema);

export type sale = z.infer<typeof saleSchema>;
export type User = z.infer<typeof saleSchema>;
export type saleList = z.infer<typeof saleListSchema>;
