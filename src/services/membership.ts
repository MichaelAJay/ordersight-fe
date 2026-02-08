import { api, delJSON, getJSON, patchJSON, postJSON } from './http';

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
  image_url?: string | null;
  last_active_at?: string | null;
  disabled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberWithUser {
  membership: MembershipRecord;
  user: MemberUser;
}

export interface MemberStoreAssignment {
  store_id: string;
  store_name: string;
  assigned_at?: string | null;
}

export interface MemberDetail extends MemberWithUser {
  store_assignments?: MemberStoreAssignment[];
  is_self?: boolean;
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

export interface MemberSummaryResponse {
  members: ListMembersResponse;
  pending_invite_ct: number;
}

export async function getMemberSummary(params?: ListMembersParams): Promise<MemberSummaryResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params?.offset !== undefined) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString();
  return getJSON<MemberSummaryResponse>(`/members/summary${suffix ? `?${suffix}` : ''}`);
}

export async function getMemberDetail(memberId: string): Promise<MemberDetail> {
  return getJSON<MemberDetail>(`/members/${memberId}`);
}

export type AuditCategory = 'security' | 'orders' | 'settings' | 'membership' | 'store' | string;

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor_type: string;
  actor_id?: string | null;
  actor_name: string;
  target_type: string;
  target_id?: string | null;
  target_name: string;
  category: AuditCategory;
  metadata?: Record<string, unknown>;
}

export interface MemberAuditResponse {
  data: AuditEntry[];
  next_cursor?: string | null;
}

export interface MemberAuditParams {
  category?: string;
  after?: string;
  before?: string;
  limit?: number;
  cursor?: string;
}

export async function getMemberAudit(
  memberId: string,
  params?: MemberAuditParams,
): Promise<MemberAuditResponse> {
  const query = new URLSearchParams();
  if (params?.category) {
    query.set('category', params.category);
  }
  if (params?.after) {
    query.set('after', params.after);
  }
  if (params?.before) {
    query.set('before', params.before);
  }
  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params?.cursor) {
    query.set('cursor', params.cursor);
  }

  const suffix = query.toString();
  return getJSON<MemberAuditResponse>(`/members/${memberId}/audit${suffix ? `?${suffix}` : ''}`);
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

export interface SeatAvailability {
  seat_limit: number;
  seat_usage: number;
  available: number;
}

export interface ListInvitesResponse {
  invites: InviteWithDecrypted[];
  pagination: Pagination;
}

export interface InviteSummaryResponse {
  invites: ListInvitesResponse;
  availability: SeatAvailability;
}

export async function getInviteSummary(params?: ListMembersParams): Promise<InviteSummaryResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  if (params?.offset !== undefined) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString();
  return getJSON<InviteSummaryResponse>(`/members/invites${suffix ? `?${suffix}` : ''}`);
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

export async function resendInvite(inviteId: string): Promise<InviteWithDecrypted> {
  return postJSON<undefined, InviteWithDecrypted>(`/members/invites/${inviteId}/resend`);
}

export async function uninviteInvite(inviteId: string): Promise<void> {
  await delJSON<void>(`/members/invites/${inviteId}`);
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

export interface UpdateMemberEmailRequest {
  email: string;
}

export async function updateMemberEmail(memberId: string, email: string): Promise<MemberDetail> {
  return patchJSON<UpdateMemberEmailRequest, MemberDetail>(`/members/${memberId}/email`, {
    email,
  });
}

export async function listMemberStoreAssignments(
  memberId: string,
): Promise<MemberStoreAssignment[]> {
  return getJSON<MemberStoreAssignment[]>(`/members/${memberId}/store-assignments`);
}

export interface AddMemberStoreAssignmentRequest {
  store_id: string;
}

export async function addMemberStoreAssignment(
  memberId: string,
  storeId: string,
): Promise<MemberStoreAssignment> {
  return postJSON<AddMemberStoreAssignmentRequest, MemberStoreAssignment>(
    `/members/${memberId}/store-assignments`,
    { store_id: storeId },
  );
}

export async function removeMemberStoreAssignment(
  memberId: string,
  storeId: string,
): Promise<void> {
  await delJSON<void>(`/members/${memberId}/store-assignments/${storeId}`);
}

export async function removeMember(memberId: string): Promise<void> {
  await delJSON<void>(`/members/${memberId}`);
}

export interface SendNotificationRequest {
  recipient_ids: string[];
  subject: string;
  body: string;
  channel: 'email';
}

export interface SendNotificationResponse {
  sent_count: number;
  failed: string[];
}

export async function sendNotification(
  payload: SendNotificationRequest,
): Promise<SendNotificationResponse> {
  return postJSON<SendNotificationRequest, SendNotificationResponse>(
    '/notifications/send',
    payload,
  );
}

export interface ExportMembersRequest {
  member_ids: string[] | null;
  filters?: {
    status?: string;
    role?: string[];
    search?: string;
  };
}

export interface ExportMembersResponse {
  blob: Blob;
  filename: string | null;
}

export async function exportMembers(payload: ExportMembersRequest): Promise<ExportMembersResponse> {
  const response = await api.post('/members/export', payload, { responseType: 'blob' });
  const header = response.headers?.['content-disposition'] as string | undefined;
  const match = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  return {
    blob: response.data as Blob,
    filename: match?.[1] ?? null,
  };
}
