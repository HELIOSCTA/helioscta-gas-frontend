/**
 * Watchlist type definition.
 * Watchlists are now fetched from the API (/api/watchlists) and stored in PostgreSQL.
 */

export interface Watchlist {
  id: string;
  name: string;
  locationRoleIds: readonly number[];
}
