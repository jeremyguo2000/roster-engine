import { api } from "./client";

export interface SkillValue {
  id: number;
  skill_type_id: number;
  value: string;
}

export interface SkillType {
  id: number;
  name: string;
  description: string | null;
  values: SkillValue[];
}

export interface SkillTypeInput {
  name: string;
  description?: string | null;
}

export const listSkillTypes = () =>
  api.get<SkillType[]>("/skills/types").then((r) => r.data);

export const createSkillType = (body: SkillTypeInput) =>
  api.post<SkillType>("/skills/types", body).then((r) => r.data);

export const updateSkillType = (id: number, body: Partial<SkillTypeInput>) =>
  api.patch<SkillType>(`/skills/types/${id}`, body).then((r) => r.data);

export const deleteSkillType = (id: number) =>
  api.delete(`/skills/types/${id}`).then(() => undefined);

export const addSkillValue = (type_id: number, value: string) =>
  api.post<SkillValue>(`/skills/types/${type_id}/values`, { value }).then((r) => r.data);

export const deleteSkillValue = (type_id: number, value_id: number) =>
  api.delete(`/skills/types/${type_id}/values/${value_id}`).then(() => undefined);
