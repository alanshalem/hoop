import { z } from 'zod';

/**
 * =============================================================================
 * HOOP OS - RIVAL ROSTERS (S14)
 * The teams the club plays against, per division, with their players. A match
 * is not linked by id: its roster is the rival team of the match division whose
 * name matches the match rival name (see `findRivalTeam`). Synced as whole
 * records (last-write-wins).
 * =============================================================================
 */

export const RIVAL_TEAM_NAME_MAX_LENGTH = 60;
export const RIVAL_PLAYER_NAME_MAX_LENGTH = 40;

export const RivalTeamNameSchema = z.string().trim().min(1).max(RIVAL_TEAM_NAME_MAX_LENGTH);
export const RivalPlayerNameSchema = z.string().trim().min(1).max(RIVAL_PLAYER_NAME_MAX_LENGTH);
export const RivalDorsalSchema = z.number().int().min(0).max(99);

export const RivalPlayerSchema = z.object({
  id: z.string().min(1, 'Rival player ID is required'),
  dorsal: RivalDorsalSchema,
  firstName: RivalPlayerNameSchema,
  lastName: RivalPlayerNameSchema,
});
export type RivalPlayer = z.infer<typeof RivalPlayerSchema>;

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;

export const RivalTeamSchema = z
  .object({
    id: z.string().min(1, 'Rival team ID is required'),
    clubId: z.string().min(1, 'Club ID is required'),
    divisionId: z.string().min(1, 'Division ID is required'),
    name: RivalTeamNameSchema,
    players: z.array(RivalPlayerSchema),
  })
  .refine((team) => isUnique(team.players.map((player) => player.id)), {
    message: 'Rival player ids must be unique within a team',
  })
  .refine((team) => isUnique(team.players.map((player) => player.dorsal)), {
    message: 'Rival player dorsals must be unique within a team',
  });
export type RivalTeam = z.infer<typeof RivalTeamSchema>;
