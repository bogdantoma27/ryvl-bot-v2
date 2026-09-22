import { z } from 'zod';
import { EventStatus } from '@prisma/client';
import { createEventSchema } from './create-event.dto';

export const updateEventSchema = createEventSchema.partial();

export type UpdateEventDtoType = z.infer<typeof updateEventSchema>;

export class UpdateEventDto {
  title?: string;
  description?: string;
  location?: string;
  imageUrl?: string;
  color?: string;
  channelId?: string;
  timezone?: string;
  mentionRoleIds?: string[];
  rrule?: string | null;
  duration?: number;
  startsAt?: string;
  status?: EventStatus;
}
