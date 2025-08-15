import { z } from 'zod';

// Define a schema for a single customer
export const customerSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // optional, for existing customers (not required when adding)
  name: z.string().min(1, { message: 'Customer name is required.' }), // customer name is required
  email: z.string().email({ message: 'Invalid email address.' }).optional(), // customer email is optional
  phone: z.string().optional(), // customer phone number is optional
  address: z.string().optional(), // customer address is optional
  createdAt: z.string().optional(), // timestamp of when the customer was created (optional)
  updatedAt: z.string().optional(), // timestamp of when the customer was last updated (optional)
});

// Define a schema for a list of customers
export const customerListSchema = z.array(customerSchema);

export type Customer = z.infer<typeof customerSchema>;
export type User = z.infer<typeof customerSchema>;
export type CustomerList = z.infer<typeof customerListSchema>;
