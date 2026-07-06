import { z } from 'zod';
const dbProxySchema = z.object({
  table: z.string(),
  action: z.enum(['insert', 'update', 'upsert', 'delete']),
  payload: z.any().optional(),
  match: z.record(z.string()).optional(),
  neq: z.record(z.string()).optional(),
  inFilter: z.object({ column: z.string(), values: z.array(z.any()) }).optional(),
});
