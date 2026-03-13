import { getJSON, postJSON } from './http';

export type BillingInterval = 'month' | 'year' | string;
export type BillingState = 'trial' | 'active' | 'grace_period' | 'suspended' | 'canceled' | string;

export interface CatalogPlanPrice {
  id: string;
  billing_interval: BillingInterval;
  currency: string;
  amount_atomic: number;
  seat_limit: number;
}

export interface CatalogPlan {
  id: string;
  code: string;
  name: string;
  trial_length: number;
  prices: CatalogPlanPrice[];
}

export interface ListBillingPlansResponse {
  plans: CatalogPlan[];
}

export interface CurrentSubscription {
  plan_code: string;
  plan_name: string;
  billing_interval: BillingInterval;
  status: BillingState;
  portal_available: boolean;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  seat_limit: number;
  seats_used: number;
}

export interface GetBillingSubscriptionResponse {
  subscription: CurrentSubscription | null;
}

export interface CreateCheckoutSessionRequest {
  plan_price_id: string;
}

export interface CreateCheckoutSessionResponse {
  checkout_url: string;
}

export interface CreatePortalSessionResponse {
  portal_url: string;
}

export async function listBillingPlans(): Promise<ListBillingPlansResponse> {
  return getJSON<ListBillingPlansResponse>('/billing/plans');
}

export async function getBillingSubscription(): Promise<GetBillingSubscriptionResponse> {
  return getJSON<GetBillingSubscriptionResponse>('/billing/subscription');
}

export async function createCheckoutSession(
  payload: CreateCheckoutSessionRequest,
): Promise<CreateCheckoutSessionResponse> {
  return postJSON<CreateCheckoutSessionRequest, CreateCheckoutSessionResponse>(
    '/billing/checkout',
    payload,
  );
}

export async function createPortalSession(): Promise<CreatePortalSessionResponse> {
  return postJSON<undefined, CreatePortalSessionResponse>('/billing/portal');
}

export function redirectToExternalURL(url: string) {
  window.location.assign(url);
}

export function openExternalURLInNewTab(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.assign(url);
  }
}
