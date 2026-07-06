import { api } from "./client";

export interface Demand {
  id: number;
  date: string;
  start_min: number;
  end_min: number;
  headcount: number;
  skill_value_id: number | null;
}

export interface DemandInput {
  date: string;
  start_min: number;
  end_min: number;
  headcount: number;
  skill_value_id?: number | null;
}

export const listDemands = (params?: {
  from_date?: string;
  to_date?: string;
  skill_value_id?: number;
}) => api.get<Demand[]>("/demands", { params }).then((r) => r.data);

export const getDemand = (id: number) =>
  api.get<Demand>(`/demands/${id}`).then((r) => r.data);

export const createDemand = (body: DemandInput) =>
  api.post<Demand>("/demands", body).then((r) => r.data);
