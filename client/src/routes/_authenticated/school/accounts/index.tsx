import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AccountsSystem from '@/features/school/accounts/accounts-system';

const accountsSystemSearchSchema = z.object({
  tab: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/school/accounts/')({
  component: AccountsSystem,
  validateSearch: accountsSystemSearchSchema,
});
