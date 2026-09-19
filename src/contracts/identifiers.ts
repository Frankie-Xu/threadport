import { z } from 'zod';

export const idSchema = z.string().min(1).max(512);
export const taskRevisionSchema = z.number().int().positive().safe();

export type Id = z.infer<typeof idSchema>;
