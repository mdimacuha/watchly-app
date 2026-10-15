// JustWatch private GraphQL endpoint. Used as a fallback when TMDB has no
// provider data for the user's region (TMDB's snapshot lags JustWatch).
import "server-only";

const JUSTWATCH_GRAPHQL_URL = "https://apis.justwatch.com/graphql";

// Requests without a UA are rejected.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_REVALIDATE_SECONDS = 60 * 60 * 24; // 24h

export class JustWatchError extends Error {
  constructor(
    public httpStatus: number,
    public statusText: string,
    public errors?: unknown,
  ) {
    super(`JustWatch error ${httpStatus} ${statusText}`);
    this.name = "JustWatchError";
  }
}

interface JustWatchRequest<V> {
  operationName: string;
  query: string;
  variables: V;
}

interface JustWatchResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

export async function justWatchFetch<TVars, TData>(
  body: JustWatchRequest<TVars>,
  opts: { revalidate?: number } = {},
): Promise<TData> {
  const response = await fetch(JUSTWATCH_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
    next: { revalidate: opts.revalidate ?? DEFAULT_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new JustWatchError(response.status, response.statusText);
  }

  const json = (await response.json()) as JustWatchResponse<TData>;

  if (json.errors && json.errors.length > 0) {
    throw new JustWatchError(200, "GraphQL error", json.errors);
  }

  if (!json.data) {
    throw new JustWatchError(200, "Empty data");
  }

  return json.data;
}
