import { useState, useEffect, useMemo } from 'react';
import { Role, Permission, useUpdateRolePermissionsMutation } from '@/stores/roles.api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';
import { Shield, Search } from 'lucide-react';
import {
  getGroupsForTab,
  buildPermissionsState,
  buildPermissionsPayload,
  formatPermissionLabel,
  type PermissionGroupDef,
  type PermissionKey,
  type PermissionTabId,
} from '@/lib/permission-registry';

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSuccess: () => void;
}

const TAB_CONFIG: { id: PermissionTabId; labelKey: string; fallback: string }[] = [
  { id: 'business', labelKey: 'business_permissions', fallback: 'Business' },
  { id: 'mobile_shop', labelKey: 'mobile_shop_permissions', fallback: 'Mobile Shop' },
  { id: 'reports_hr', labelKey: 'reports_hr_permissions', fallback: 'Reports & HR' },
  { id: 'administration', labelKey: 'administration_permissions', fallback: 'Administration' },
];

export function PermissionsDialog({ open, onOpenChange, role, onSuccess }: PermissionsDialogProps) {
  const { t } = useLanguage();
  const [permissions, setPermissions] = useState<Permission>({});
  const [search, setSearch] = useState('');
  const [updatePermissions, { isLoading }] = useUpdateRolePermissionsMutation();

  useEffect(() => {
    if (role) {
      setPermissions(buildPermissionsState(role.permissions || {}));
    }
  }, [role]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const handlePermissionChange = (key: PermissionKey, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleSelectAll = (group: PermissionGroupDef, checked: boolean) => {
    const updates: Partial<Permission> = {};
    group.permissions.forEach((perm) => {
      updates[perm] = checked;
    });
    setPermissions((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const handleSave = async () => {
    if (!role) return;

    try {
      await updatePermissions({ id: role.id, permissions: buildPermissionsPayload(permissions) }).unwrap();
      toast.success(t('permissions_updated_successfully') || 'Permissions updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.data?.message || t('failed_to_update_permissions') || 'Failed to update permissions');
    }
  };

  const getCheckedCount = (group: PermissionGroupDef) =>
    group.permissions.filter((perm) => permissions[perm] === true).length;

  const allChecked = (group: PermissionGroupDef) =>
    group.permissions.every((perm) => permissions[perm] === true);

  const filterGroups = (groups: PermissionGroupDef[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((perm) => {
          const label = formatPermissionLabel(perm, t).toLowerCase();
          return label.includes(q) || perm.toLowerCase().includes(q) || group.label.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.permissions.length > 0);
  };

  const enabledCount = useMemo(
    () => Object.values(permissions).filter(Boolean).length,
    [permissions],
  );

  const renderGroupList = (tab: PermissionTabId) => {
    const groups = filterGroups(getGroupsForTab(tab));
    if (groups.length === 0) {
      return (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t('no_permissions_found') || 'No permissions match your search'}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-sm truncate">{group.label}</h3>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {getCheckedCount(group)}/{group.permissions.length}
                </Badge>
              </div>
              {!role?.isSystemRole && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleSelectAll(group, !allChecked(group))}
                >
                  {allChecked(group) ? t('deselect_all') || 'Deselect All' : t('select_all') || 'Select All'}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.permissions.map((perm) => (
                <div key={perm} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${role?.id}-${perm}`}
                    checked={permissions[perm] === true}
                    onCheckedChange={(checked) => handlePermissionChange(perm, checked as boolean)}
                    disabled={role?.isSystemRole}
                  />
                  <Label
                    htmlFor={`${role?.id}-${perm}`}
                    className="text-sm font-normal cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {formatPermissionLabel(perm, t)}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('manage_permissions') || 'Manage Permissions'}: {role.name}
          </DialogTitle>
          <DialogDescription>
            {role.isSystemRole
              ? t('system_role_warning') || 'This is a system role. Permissions cannot be modified.'
              : t('Manage Permission Description') || 'Configure access for every module in the system'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Badge variant="outline">{enabledCount} {t('permissions_enabled') || 'permissions enabled'}</Badge>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_permissions') || 'Search permissions...'}
              className="pl-8"
            />
          </div>
        </div>

        <Tabs defaultValue="business" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
                {t(tab.labelKey) || tab.fallback}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CONFIG.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <ScrollArea className="h-[460px] pr-4">
                {renderGroupList(tab.id)}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel') || 'Cancel'}
          </Button>
          {!role.isSystemRole && (
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? t('saving') || 'Saving...' : t('save_changes') || 'Save Changes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
