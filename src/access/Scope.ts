/**
 * Tells whether a set of scopes gives a required one. A scope ending with `:*`
 * gives every scope of its family: `bundle:*` gives `bundle:cultia`.
 */
export function givesScope(scopes: readonly string[], required: string): boolean {
  return scopes.some(
    (scope) =>
      scope === required ||
      (scope.endsWith(":*") && required.startsWith(scope.slice(0, -1))),
  )
}
