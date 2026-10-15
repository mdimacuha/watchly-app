export class TmdbError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public code?: number,
    message?: string
  ) {
    super(message || `TMDB API Error: ${status} ${statusText}`);
    this.name = "TmdbError";
  }
}
