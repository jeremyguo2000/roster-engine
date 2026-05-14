import { z } from "zod";

/**
 * Profile.config JSONB shape used by the solver. See `app/worker/tasks.py`
 * and `solver/solver.py`. All weights / time_limit are tunable; conditional
 * constraints are an array of records describing cross-day rules.
 */

export const conditionalConstraintSchema = z.object({
  trigger: z.string(),
  trigger_val: z.number(),
  offset: z.number().int(),
  enforce: z.string(),
  enforce_val: z.number(),
});

export const profileConfigSchema = z.object({
  weight_overstaff: z.number().default(20),
  weight_consec: z.number().default(100),
  weight_burden: z.number().default(10),
  weight_night: z.number().default(2),
  weight_weekend: z.number().default(1),
  time_limit: z.number().int().default(600),
  conditional_constraints: z.array(conditionalConstraintSchema).default([]),
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type ConditionalConstraint = z.infer<typeof conditionalConstraintSchema>;

export const DEFAULT_CONFIG: ProfileConfig = {
  weight_overstaff: 20,
  weight_consec: 100,
  weight_burden: 10,
  weight_night: 2,
  weight_weekend: 1,
  time_limit: 600,
  conditional_constraints: [],
};

/** Parse the loose `config: dict` from the API into a typed `ProfileConfig`. */
export function parseProfileConfig(raw: unknown): ProfileConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CONFIG;
  const result = profileConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  // Be forgiving: merge known fields into the default, drop unknown.
  return { ...DEFAULT_CONFIG, ...(raw as Partial<ProfileConfig>) };
}
