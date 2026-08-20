/**
 * Business name shown on prints/receipts. Combines the organization name with the
 * active branch's name (e.g. "Logix Plus Solutions - New Branch") so a multi-branch
 * org can tell which branch a document was issued from, instead of printing only the
 * organization name and silently dropping the branch.
 */
export function resolveBranchCompanyName(orgName?: string | null, branchName?: string | null): string | undefined {
  const org = orgName?.trim();
  const branch = branchName?.trim();
  if (org && branch) return org === branch ? org : `${org} - ${branch}`;
  return org || branch || undefined;
}
