import { createFileRoute } from '@tanstack/react-router';
import AccountsSystem from '@/features/school/accounts/accounts-system';

export const Route = createFileRoute('/_authenticated/school/accounts/')({
  component: AccountsSystem,
});
