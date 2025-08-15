import { z } from 'zod'

// Define a schema for a single product
export const productSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(), // optional, for existing products (not required when adding)
  name: z.string().min(1, { message: 'Product name is required.' }), // product name is required
  description: z.string().optional(), // product description is required
  price: z.string().min(1, { message: 'Price is required.' }), // product price is required
  cost: z.string().min(1, { message: 'Cost is required.' }), // product cost is required
  stockQuantity: z.number().min(0, { message: 'Stock quantity cannot be negative.' }), // stock quantity cannot be negative
})

// Define a schema for a list of products
export const productListSchema = z.array(productSchema)

export type Product = z.infer<typeof productSchema>
export type User = z.infer<typeof productSchema>
export type ProductList = z.infer<typeof productListSchema>
