import { getJSON } from './http';

export interface Store {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function listStores(): Promise<Store[]> {
  return getJSON<Store[]>('/stores');
}
