/**
 * Update the URL's query for display-only UI state (a view toggle, a filter
 * the page already has the data for) without a server round-trip.
 *
 * `router.replace` re-renders the route on the server before anything moves,
 * which made toggles feel slow. The native History API is integrated with the
 * App Router: `useSearchParams` updates immediately and nothing is fetched.
 * Only use it when the server page doesn't read these params.
 */
export function replaceQuery(params: URLSearchParams): void {
  const qs = params.toString();
  // `null` state, as Next documents: passing the router's own state along
  // makes it treat the update as its own and skip syncing useSearchParams.
  window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}
