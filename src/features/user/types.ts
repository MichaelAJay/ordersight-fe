export interface User {
  subject_id: string;
  email?: string; // probably shouldn't regularly send this
  first_name: string;
  last_name: string;
  role: 'admin' | 'staff' | 'accountant'; // todo: probably type literal somewhere
  is_owner: boolean;
}
