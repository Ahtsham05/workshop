import { z } from 'zod';

// Define a schema for a single supplier
export const supplierSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // optional, for existing suppliers (not required when adding)
  name: z.string().min(1, { message: 'Supplier name is required.' }), // supplier name is required
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
  email: z.string().email({ message: 'Invalid email address.' }).optional(), // supplier email is optional
  phone: z.string().optional(), // supplier phone number is optional
  whatsapp: z.string().optional(),
  address: z.string().optional(), // supplier address is optional
  balance: z.number().optional(),
  createdAt: z.string().optional(), // timestamp of when the supplier was created (optional)
  updatedAt: z.string().optional(), // timestamp of when the supplier was last updated (optional)
});

// Define a schema for a list of suppliers
export const supplierListSchema = z.array(supplierSchema);

export type Supplier = z.infer<typeof supplierSchema>;
export type User = z.infer<typeof supplierSchema>;
export type SupplierList = z.infer<typeof supplierListSchema>;
