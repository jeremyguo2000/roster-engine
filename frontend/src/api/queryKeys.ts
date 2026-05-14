/** Centralised TanStack Query key factory. */
export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
    users: ["auth", "users"] as const,
  },
  skills: {
    all: ["skills"] as const,
    types: () => ["skills", "types"] as const,
  },
  shifts: {
    all: ["shifts"] as const,
    list: (groupId?: number) => ["shifts", "list", { groupId }] as const,
    detail: (id: number) => ["shifts", "detail", id] as const,
    groups: () => ["shifts", "groups"] as const,
  },
  staff: {
    all: ["staff"] as const,
    list: (filters: { groupId?: number; includeDeleted?: boolean }) =>
      ["staff", "list", filters] as const,
    detail: (id: number) => ["staff", "detail", id] as const,
    skills: (id: number) => ["staff", id, "skills"] as const,
    permittedShifts: (id: number) => ["staff", id, "permitted-shifts"] as const,
    groups: () => ["staff", "groups"] as const,
    leaves: (filters: { staffId?: number; from?: string; to?: string }) =>
      ["staff", "leaves", filters] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    list: () => ["profiles", "list"] as const,
    detail: (id: number) => ["profiles", "detail", id] as const,
    staff: (id: number) => ["profiles", id, "staff"] as const,
    shifts: (id: number) => ["profiles", id, "shifts"] as const,
  },
  demands: {
    all: ["demands"] as const,
    list: (filters: { from?: string; to?: string; skillValueId?: number }) =>
      ["demands", "list", filters] as const,
    detail: (id: number) => ["demands", "detail", id] as const,
  },
  rosters: {
    all: ["rosters"] as const,
    list: (filters: { status?: string; profileId?: number }) =>
      ["rosters", "list", filters] as const,
    detail: (id: number) => ["rosters", "detail", id] as const,
    demands: (id: number) => ["rosters", id, "demands"] as const,
    leaves: (id: number) => ["rosters", id, "leaves"] as const,
  },
};
