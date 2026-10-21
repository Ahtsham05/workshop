import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Role, Permission, useUpdateRolePermissionsMutation } from '@/stores/roles.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import type { RootState } from '@/stores/store';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/context/language-context';
import { useManufacturingAccess } from '@/hooks/use-manufacturing-access';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Shield,
  Search,
  Lock,
  ShoppingCart,
  Truck,
  Boxes,
  Landmark,
  Smartphone,
  Factory,
  GraduationCap,
  BarChart3,
  Users,
  MessageSquare,
  Handshake,
  Settings2,
  Eye,
  CheckCheck,
  Eraser,
  Building2,
  SearchX,
  type LucideIcon,
} from 'lucide-react';
import {
  getPermissionCategories,
  buildPermissionsState,
  buildPermissionsPayload,
  applyPermissionChange,
  formatPermissionLabel,
  PERMISSION_HINTS,
  type PermissionCategoryId,
  type PermissionGroupDef,
  type PermissionKey,
} from '@/lib/permission-registry';
import {
  BUSINESS_TYPE_OPTIONS,
  ONBOARDING_BUSINESS_TYPES,
  normalizeBusinessType,
} from '@/lib/business-types';

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSuccess: () => void;
}

const CATEGORY_ICONS: Record<PermissionCategoryId, LucideIcon> = {
  sales: ShoppingCart,
  purchasing: Truck,
  inventory: Boxes,
  finance: Landmark,
  mobile_shop: Smartphone,
  manufacturing: Factory,
  school: GraduationCap,
  reports: BarChart3,
  hr: Users,
  communication: MessageSquare,
  team: Handshake,
  administration: Settings2,
};

type ActionKind = 'view' | 'create' | 'edit' | 'delete' | 'manage' | 'action';

const ACTION_STYLES: Record<ActionKind, { label: string; className: string }> = {
  view: { label: 'View', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  create: { label: 'Create', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  edit: { label: 'Edit', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  delete: { label: 'Delete', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  manage: { label: 'Manage', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  action: { label: 'Action', className: 'bg-muted text-muted-foreground' },
};

function actionKind(key: PermissionKey): ActionKind {
  if (/^(view|get)/.test(key)) return 'view';
  if (/^(create|buy)/.test(key)) return 'create';
  if (/^edit/.test(key)) return 'edit';
  if (/^delete/.test(key)) return 'delete';
  if (/^manage/.test(key)) return 'manage';
  return 'action';
}

function businessTypeLabel(type: string) {
  return (
    ONBOARDING_BUSINESS_TYPES.find((bt) => bt.value === type)?.label ||
    BUSINESS_TYPE_OPTIONS.find((bt) => bt.value === type)?.label ||
    'General'
  );
}

export function PermissionsDialog({ open, onOpenChange, role, onSuccess }: PermissionsDialogProps) {
  const { t } = useLanguage();
  const [permissions, setPermissions] = useState<Permission>({});
  const [initial, setInitial] = useState<Permission>({});
  const [search, setSearch] = useState('');
  const [showAllModules, setShowAllModules] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PermissionCategoryId | null>(null);
  const [updatePermissions, { isLoading }] = useUpdateRolePermissionsMutation();

  const user = useSelector((state: RootState) => state.auth.data?.user);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const businessType = normalizeBusinessType(org?.businessType || user?.businessType);
  const { available: manufacturingOn } = useManufacturingAccess();

  const readOnly = !!role?.isSystemRole;

  useEffect(() => {
    if (role) {
      const state = buildPermissionsState(role.permissions || {});
      setPermissions(state);
      setInitial(state);
    }
  }, [role]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setShowAllModules(false);
      setActiveCategory(null);
    }
  }, [open]);

  // Only the modules this business uses; everything else keeps its stored value on save.
  const categories = useMemo(
    () => getPermissionCategories(showAllModules ? null : businessType, manufacturingOn ? ['manufacturing'] : []),
    [showAllModules, businessType, manufacturingOn],
  );

  const visibleKeys = useMemo(
    () => [...new Set(categories.flatMap((c) => c.groupDefs.flatMap((g) => g.permissions)))],
    [categories],
  );

  const current = categories.find((c) => c.id === activeCategory) ?? categories[0];

  const query = search.trim().toLowerCase();
  const matches = (group: PermissionGroupDef, perm: PermissionKey) =>
    formatPermissionLabel(perm, t).toLowerCase().includes(query) ||
    (PERMISSION_HINTS[perm] ? t(PERMISSION_HINTS[perm]!).toLowerCase().includes(query) : false) ||
    perm.toLowerCase().includes(query) ||
    t(group.label).toLowerCase().includes(query);

  const searchResults = useMemo(() => {
    if (!query) return [];
    return categories
      .map((category) => ({
        ...category,
        groupDefs: category.groupDefs
          .map((group) => ({ ...group, permissions: group.permissions.filter((p) => matches(group, p)) }))
          .filter((group) => group.permissions.length > 0),
      }))
      .filter((category) => category.groupDefs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categories, t]);

  const countOn = (keys: PermissionKey[]) => keys.filter((k) => permissions[k] === true).length;
  const keysOf = (groups: PermissionGroupDef[]) => groups.flatMap((g) => g.permissions);

  const setMany = (keys: PermissionKey[], value: boolean | ((k: PermissionKey) => boolean)) => {
    if (readOnly) return;
    // Granting a task also grants the key it needs (e.g. View manufacturing) — see PERMISSION_REQUIRES.
    setPermissions((prev) =>
      applyPermissionChange(prev, Object.fromEntries(keys.map((k) => [k, typeof value === 'function' ? value(k) : value]))),
    );
  };

  const enabledCount = countOn(visibleKeys);
  const enabledPct = visibleKeys.length ? Math.round((enabledCount / visibleKeys.length) * 100) : 0;
  const changedCount = useMemo(
    () => Object.keys(permissions).filter((k) => permissions[k as PermissionKey] !== initial[k as PermissionKey]).length,
    [permissions, initial],
  );

  const handleSave = async () => {
    if (!role) return;
    try {
      await updatePermissions({ id: role.id, permissions: buildPermissionsPayload(permissions) }).unwrap();
      toast.success(t('permissions_updated_successfully') || 'Permissions updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to update permissions'));
    }
  };

  if (!role) return null;

  const renderGroupCard = (group: PermissionGroupDef) => {
    const on = countOn(group.permissions);
    const all = on === group.permissions.length;
    return (
      <div
        key={group.id}
        className={cn(
          'rounded-xl border bg-card transition-colors',
          on > 0 && 'border-primary/30',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-sm font-semibold">{t(group.label)}</h4>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                on > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {on}/{group.permissions.length}
            </span>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            {t('All')}
            <Switch
              checked={all}
              disabled={readOnly}
              onCheckedChange={(checked) => setMany(group.permissions, checked)}
              aria-label={`${t('Select all')} ${t(group.label)}`}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.permissions.map((perm) => {
            const checked = permissions[perm] === true;
            const action = ACTION_STYLES[actionKind(perm)];
            const id = `${role.id}-${perm}`;
            return (
              <label
                key={perm}
                htmlFor={id}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  readOnly ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/60',
                  checked ? 'border-primary/40 bg-primary/5' : 'border-transparent bg-muted/30',
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={readOnly}
                  onCheckedChange={(value) => setMany([perm], value === true)}
                />
                <span className="min-w-0 flex-1" title={PERMISSION_HINTS[perm] ? t(PERMISSION_HINTS[perm]!) : formatPermissionLabel(perm, t)}>
                  <span className="block truncate">{formatPermissionLabel(perm, t)}</span>
                  {PERMISSION_HINTS[perm] && (
                    <span className="block truncate text-[11px] leading-tight text-muted-foreground">{t(PERMISSION_HINTS[perm]!)}</span>
                  )}
                </span>
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', action.className)}>
                  {t(action.label)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCategoryHeader = (category: (typeof categories)[number], compact = false) => {
    const Icon = CATEGORY_ICONS[category.id];
    const keys = keysOf(category.groupDefs);
    const on = countOn(keys);
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-3', compact ? 'mb-3' : 'mb-5')}>
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary', compact ? 'size-8' : 'size-10')}>
            <Icon className={compact ? 'size-4' : 'size-5'} />
          </div>
          <div className="min-w-0">
            <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{t(category.label)}</h3>
            {!compact && <p className="text-xs text-muted-foreground">{t(category.description)}</p>}
          </div>
        </div>
        {!readOnly && !compact && (
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {on}/{keys.length}
            </span>
            <Button variant="outline" size="sm" onClick={() => setMany(keys, on !== keys.length)}>
              {on === keys.length ? t('Deselect all') : t('Select all')}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,900px)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1240px,calc(100vw-2rem))]">
        {/* Header */}
        <div className="border-b px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Shield className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-lg">
                {t('manage_permissions') || 'Manage Permissions'}
                <span className="text-muted-foreground"> · </span>
                {role.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {readOnly
                  ? t('This is a built-in system role — its permissions are fixed and cannot be changed.')
                  : t('Choose exactly what people with this role can see and do.')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
                <Building2 className="size-3.5 text-primary" />
                {showAllModules ? t('All modules') : t(businessTypeLabel(businessType))}
              </span>
              <div className="flex items-center gap-2">
                <Progress value={enabledPct} className="h-1.5 w-28 sm:w-40" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('{{n}} of {{total}} enabled', { n: enabledCount, total: visibleKeys.length })}
                </span>
              </div>
              {readOnly && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <Lock className="size-3.5" />
                  {t('Read only')}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setMany(visibleKeys, true)}>
                  <CheckCheck className="size-4" />
                  {t('Full access')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMany(visibleKeys, (k) => actionKind(k) === 'view')}>
                  <Eye className="size-4" />
                  {t('View only')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMany(visibleKeys, false)}>
                  <Eraser className="size-4" />
                  {t('Clear all')}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Category rail */}
          <aside className="flex shrink-0 flex-col border-b bg-muted/30 md:w-64 md:border-b-0 md:border-r lg:w-72">
            <div className="p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search_permissions') || 'Search permissions...'}
                  className="bg-background pl-8"
                />
              </div>
            </div>
            <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3 md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
              {categories.map((category) => {
                const Icon = CATEGORY_ICONS[category.id];
                const keys = keysOf(category.groupDefs);
                const on = countOn(keys);
                const active = !query && current?.id === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id);
                      setSearch('');
                    }}
                    className={cn(
                      'group flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors md:w-full',
                      active
                        ? 'bg-background font-medium shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground ring-1 ring-border',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 whitespace-nowrap md:truncate">{t(category.label)}</span>
                    <span
                      className={cn(
                        'hidden shrink-0 rounded-full px-1.5 text-[11px] font-medium tabular-nums md:inline',
                        on === keys.length && on > 0
                          ? 'bg-primary text-primary-foreground'
                          : on > 0
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground',
                      )}
                    >
                      {on}/{keys.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Permissions */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 sm:p-6">
              {query ? (
                searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
                    <SearchX className="size-8 opacity-50" />
                    {t('no_permissions_found') || 'No permissions match your search'}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {searchResults.map((category) => (
                      <section key={category.id}>
                        {renderCategoryHeader(category, true)}
                        <div className="space-y-4">
                          {category.groupDefs.map(renderGroupCard)}
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : current ? (
                <>
                  {renderCategoryHeader(current)}
                  <div className="space-y-4">
                    {current.groupDefs.map(renderGroupCard)}
                  </div>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showAllModules} onCheckedChange={setShowAllModules} />
            {t('Show modules for all business types')}
          </label>
          <div className="flex items-center justify-end gap-2">
            {!readOnly && changedCount > 0 && (
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {t('{{n}} unsaved changes', { n: changedCount })}
              </span>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? t('Close') : t('cancel') || 'Cancel'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={isLoading || changedCount === 0}>
                {isLoading ? t('saving') || 'Saving...' : t('save_changes') || 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
