/** Resolve Mongo/API id from documents that may use `id` or `_id`. */
export function getEntityId(entity: { id?: string; _id?: string } | string | null | undefined): string {
  if (!entity) return '';
  if (typeof entity === 'string') return entity;
  return String(entity.id || entity._id || '');
}
