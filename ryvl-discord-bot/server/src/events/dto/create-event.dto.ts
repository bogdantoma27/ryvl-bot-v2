import { z } from 'zod';
import { EventStatus } from '@prisma/client';

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
  location: z.string().max(255, 'Location cannot exceed 255 characters').optional(),
  imageUrl: z.string().url('Image URL must be valid').optional().or(z.literal('')),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Color must be a valid hex color (e.g. #5865F2)').optional().default('#5865F2'),
  channelId: z.string().min(1, 'Channel ID is required'),
  timezone: z.string().optional().default('Europe/Bucharest'),
  mentionRoleIds: z.array(z.string()).optional().default([]),
  rrule: z.string().nullable().optional(),
  duration: z.coerce.number().int().positive().optional().default(60),
  startsAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'startsAt must be a valid ISO date string',
  }),
  status: z.nativeEnum(EventStatus).optional().default(EventStatus.ACTIVE),
});

export type CreateEventDtoType = z.infer<typeof createEventSchema>;

export class CreateEventDto {
  title!: string;
  description?: string;
  location?: string;
  imageUrl?: string;
  color?: string;
  channelId!: string;
  timezone?: string;
  mentionRoleIds?: string[];
  rrule?: string | null;
  duration?: number;
  startsAt!: string;
  status?: EventStatus;
}
