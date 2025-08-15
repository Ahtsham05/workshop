import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { fetchAccounts } from '@/stores/account.slice';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { ThemeSwitch } from '@/components/theme-switch';
import AccountsProvider from './context/users-context';
import AccountPrimaryButtons from './components/users-primary-buttons'; // analogous to CustomerPrimaryButtons
import AccountTable from './components/users-table'; // analogous to CustomerTable
import AccountsDialogs from './components/users-dialogs'; // analogous to CustomerDialogs
import { columns } from './components/users-columns';
import { Search } from '@/components/search';

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalPage, setTotalPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const dispatch = useDispatch<AppDispatch>();
  const [fetch, setFetch] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = {
      page: currentPage,
      limit,
      sortBy: 'createdAt:desc',
      populate: 'supplier,customer',
      ...(search && { search }),
      ...(search && { fieldName: 'name' }),
    };
    dispatch(fetchAccounts(params)).then((data) => {
      setAccounts(data.payload?.results ?? []); // default to empty array
      setTotalPage(data.payload?.totalPages ?? 1);
      setLimit(data.payload?.limit ?? 10);
      setLoading(false);
    });
  }, [currentPage, limit, search, dispatch, fetch]);

  return (
    <AccountsProvider>
      <Header fixed>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="mb-2 flex flex-wrap items-center justify-between space-y-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Accounts List</h2>
            <p className="text-muted-foreground">Manage your Accounts here.</p>
          </div>
          <AccountPrimaryButtons />
        </div>
        <Input
          placeholder="Search accounts..."
          className="h-8 w-[150px] lg:w-[250px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12">
          {loading ? (
            <div className="flex h-[50vh] items-center justify-center">
              <Loader2 className="animate-spin size-8" />
            </div>
          ) : (
            <AccountTable
              data={accounts ?? []} // safe fallback
              columns={columns}
              paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
            />
          )}
        </div>
      </Main>
      <AccountsDialogs setFetch={setFetch} />
    </AccountsProvider>
  );
}
