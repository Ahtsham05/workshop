import type { Permission, PermissionKey } from '@/lib/permission-registry';

export function resolvePermission(
  permissions: Permission | null | undefined,
  permission: PermissionKey,
): boolean {
  return permissions?.[permission] === true;
}

/** Strict flag — no fallbacks (use for create/edit/delete). */
export function hasExplicitPermission(
  permissions: Permission | null | undefined,
  permission: PermissionKey,
): boolean {
  return permissions?.[permission] === true;
}

export function hasAnyPermission(
  permissions: Permission | null | undefined,
  keys: PermissionKey[],
): boolean {
  return keys.some((key) => resolvePermission(permissions, key));
}
