import { z } from 'zod';
import {
  BasketballPositionSchema,
  DominantHandSchema,
  LICENSE_MAX_LENGTH,
  PlayerPhysicalStatusSchema,
  type Player,
} from '@/core/domain/entities/club.types';

export const MEDICAL_NOTE_MAX = 240;

/** Height, position and license may be left empty (S4). */
export const PlayerFormSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio'),
  dorsal: z
    .number({ message: 'Ingresa un número' })
    .int('Debe ser un número entero')
    .min(0, 'Mínimo 0')
    .max(99, 'Máximo 99'),
  heightCm: z
    .number({ message: 'Ingresa la altura en cm' })
    .int('Debe ser un número entero')
    .min(120, 'Mínimo 120 cm')
    .max(240, 'Máximo 240 cm')
    .optional(),
  weightKg: z.number({ message: 'Ingresa el peso en kg' }).positive('Debe ser positivo').optional(),
  /** Empty string = no position. */
  position: z.union([BasketballPositionSchema, z.literal('')]),
  /** Empty string = no license. */
  license: z.string().trim().max(LICENSE_MAX_LENGTH, `Máximo ${LICENSE_MAX_LENGTH} caracteres`),
  dominantHand: DominantHandSchema,
  status: PlayerPhysicalStatusSchema,
  /** Empty string = no team. */
  teamId: z.string(),
  medicalNote: z.string().trim().max(MEDICAL_NOTE_MAX, `Máximo ${MEDICAL_NOTE_MAX} caracteres`),
});

export type PlayerFormData = z.infer<typeof PlayerFormSchema>;

/** Empty number inputs become `undefined` instead of NaN. */
export const optionalNumber = (value: unknown): number | undefined =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

export const toPlayerFormData = (player: Player | null | undefined, teamId: string): PlayerFormData =>
  player
    ? {
        firstName: player.firstName,
        lastName: player.lastName,
        dorsal: player.dorsal,
        heightCm: player.heightCm,
        weightKg: player.weightKg,
        position: player.position ?? '',
        license: player.license ?? '',
        dominantHand: player.dominantHand,
        status: player.status,
        teamId: player.teamId ?? '',
        medicalNote: player.medicalNote ?? '',
      }
    : {
        firstName: '',
        lastName: '',
        dorsal: 0,
        heightCm: undefined,
        weightKg: undefined,
        position: '',
        license: '',
        dominantHand: 'RIGHT',
        status: 'ACTIVE',
        teamId,
        medicalNote: '',
      };

/** Form values as player fields: empty optional fields are stored as absent. */
export const toPlayerInput = (data: PlayerFormData, clubId: string): Omit<Player, 'id'> => ({
  ...data,
  position: data.position || undefined,
  license: data.license || undefined,
  teamId: data.teamId || undefined,
  medicalNote: data.medicalNote || undefined,
  clubId,
});
