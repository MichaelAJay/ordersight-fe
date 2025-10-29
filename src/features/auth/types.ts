import { User } from '../user/types';

export interface SignupPayload {
  account_name: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface SignupResponse {
  account_id: string;
  user_id: string;
  session_id: string;
  expires_at: number;
  user: User;
}
