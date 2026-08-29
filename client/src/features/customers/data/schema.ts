import { z } from 'zod';

// Define a schema for a single customer
export const customerSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // optional, for existing customers (not required when adding)
  name: z.string().min(1, { message: 'Customer name is required.' }), // customer name is required
  nameUrdu: z.string().optional(),
  picture: z
    .object({
      url: z.string().optional(),
      publicId: z.string().optional(),
    })
    .optional()
    .nullable(),
  idCardFront: z
    .object({
      url: z.string().optional(),
      publicId: z.string().optional(),
    })
    .optional()
    .nullable(),
  idCardBack: z
    .object({
      url: z.string().optional(),
      publicId: z.string().optional(),
    })
    .optional()
    .nullable(),
  email: z.string().email({ message: 'Invalid email address.' }).optional(), // customer email is optional
  phone: z.string().optional(), // customer phone number is optional
  whatsapp: z.string().optional(),
  balance: z.number().optional(),
  address: z.string().optional(), // customer address is optional
  customerType: z.enum(['retail', 'wholesale', 'vip', 'corporate']).optional(),
  creditLimit: z.number().optional(),
  paymentTerms: z.enum(['cash', 'due_on_receipt', 'net_15', 'net_30', 'net_60']).optional(),
  taxNumber: z.string().optional(),
  notes: z.string().optional(),
  isEmployeeAccount: z.boolean().optional(), // hidden shadow account for billing an employee as a customer
  linkedEmployeeId: z.string().optional(),
  isSupplierAccount: z.boolean().optional(), // hidden shadow account for billing a supplier as a customer
  linkedSupplierId: z.string().optional(),
  // Defaults true; deactivating hides the customer from Invoice/POS pickers without
  // deleting the record or its ledger history — see server customer.service.js.
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(), // timestamp of when the customer was created (optional)
  updatedAt: z.string().optional(), // timestamp of when the customer was last updated (optional)
});

// Define a schema for a list of customers
export const customerListSchema = z.array(customerSchema);

export type Customer = z.infer<typeof customerSchema>;
export type User = z.infer<typeof customerSchema>;
export type CustomerList = z.infer<typeof customerListSchema>;
