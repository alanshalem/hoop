/**
 * The club this installation serves. Plain configuration with no dependencies,
 * so every layer (stores, pages, the report importer and the demo seed) can use it.
 */
export const CLUB_PROFILE = {
  id: 'club-camg',
  name: 'Club Atlético Monte Grande',
  season: '2025/2026',
} as const;
