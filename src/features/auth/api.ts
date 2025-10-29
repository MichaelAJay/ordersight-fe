import { postJSON } from '../../services/http';
import { SignupPayload, SignupResponse } from './types';

export async function signup(payload: SignupPayload) {
  return postJSON<SignupPayload, SignupResponse>('/auth/signup/account', payload);
}
