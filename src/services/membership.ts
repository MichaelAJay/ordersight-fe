import { delJSON, getJSON, patchJSON, postJSON } from './http';

export type MemberRole = 'super_admin' | 'admin' | 'staff' | 'accountant' | string;
export type MemberStatus = 'active' | 'disabled' | string;

export interface MembershipRecord {
  org_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface MemberUser {
  id: string;
  clerk_user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  disabled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberWithUser {
  membership: MembershipRecord;
  user: MemberUser;
}

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface ListMembersResponse {
  members: MemberWithUser[];
  pagination: Pagination;
}

export interface ListMembersParams {
  limit?: number;
  offset?: number;
}

export async function listMembers(params?: ListMembersParams): Promise<ListMembersResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params?.offset !== undefined) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString();
  return getJSON<ListMembersResponse>(`/members${suffix ? `?${suffix}` : ''}`);
}

export interface InviteRequest {
  email: string;
  role: MemberRole;
}

export interface InviteError {
  code: string;
  message: string;
}

export interface InviteWithDecrypted {
  id: string;
  org_id: string;
  inviter_user_id: string;
  email: string;
  role: MemberRole;
  status: string;
  clerk_invitation_id?: string;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteResult {
  email: string;
  role: MemberRole;
  invite?: InviteWithDecrypted;
  error?: InviteError;
}

export type InvitePayload = InviteRequest | InviteRequest[];
export type InviteResponse = InviteResult | InviteResult[];

export async function inviteMembers(payload: InvitePayload): Promise<InviteResponse> {
  return postJSON<InvitePayload, InviteResponse>('/members/invite', payload);
}

export interface UpdateRoleRequest {
  role: MemberRole;
}

export async function updateMemberRole(
  memberId: string,
  role: MemberRole,
): Promise<MembershipRecord> {
  return patchJSON<UpdateRoleRequest, MembershipRecord>(`/members/${memberId}/role`, { role });
}

export async function removeMember(memberId: string): Promise<void> {
  await delJSON<void>(`/members/${memberId}`);
}
