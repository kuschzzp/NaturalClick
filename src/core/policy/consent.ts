export interface ConsentScope {
  id?: string;
  taskId: string;
  origin: string;
  pageIdentity: string;
  commandTypes: string[];
  dataCategories: string[];
  expiresAt: number;
}

export interface ConsentMatchContext {
  origin: string;
  pageIdentity: string;
}

export function scopeAllows(
  scope: ConsentScope | undefined,
  commandType: string,
  context?: ConsentMatchContext,
  now = Date.now()
): boolean {
  if (!scope || scope.expiresAt <= now || !scope.commandTypes.includes(commandType)) return false;
  if (context && scope.origin !== context.origin) return false;
  if (context && scope.pageIdentity !== context.pageIdentity) return false;
  return true;
}
