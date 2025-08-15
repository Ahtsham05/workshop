import { z } from 'zod';

export const mobileRepairSchema = z.object({
  id: z.string().optional(),
  _id: z.string().optional(),
  name: z.string().min(1, { message: 'Name is required.' }),
  phone: z.string().optional(),
  mobileModel: z.string().optional(),
  mobileFault: z.string().optional(),
  totalAmount: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const mobileRepairListSchema = z.array(mobileRepairSchema);

export type MobileRepair = z.infer<typeof mobileRepairSchema>;
export type User = z.infer<typeof mobileRepairSchema>;
export type MobileRepairList = z.infer<typeof mobileRepairListSchema>;
