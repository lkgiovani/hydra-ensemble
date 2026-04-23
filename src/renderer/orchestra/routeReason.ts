/**
 * Route.reason is a machine-readable tag set by the main-side router:
 *   - `fallback:no-match` — no trigger matched, fell back to main agent
 *   - `explicit:user`     — user picked the agent manually
 *   - `delegation:<from>` — a parent agent delegated via the tool
 *   - `scored`            — trigger scoring found a positive match
 *
 * Anywhere we surface this to the user (TaskRow subtitle, etc) we want a
 * friendly humanised label — "fallback:no-match" scared users into
 * thinking something was broken when the task was in fact routed fine
 * to the team lead.
 */
export function humanReason(reason: string): string {
  if (reason === 'fallback:no-match') return 'Auto-routed to team lead'
  if (reason === 'explicit:user') return 'Assigned by you'
  if (reason.startsWith('delegation:')) return 'Delegated'
  if (reason === 'scored') return 'Matched by trigger'
  return reason
}
