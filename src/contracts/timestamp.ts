import { z } from 'zod';

/** Zod's offset syntax alone accepts impossible hours/minutes; comparisons require a finite instant. */
export const isoTimestampSchema=z.string().max(40).datetime({offset:true}).refine(value=>
 /(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/.test(value)&&Number.isFinite(Date.parse(value)));
