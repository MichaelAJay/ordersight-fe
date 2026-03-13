import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingDashboardPage } from './BillingDashboardPage';
import { renderWithProviders } from '@/test/testUtils';
import {
  CreatePortalSessionResponse,
  createPortalSession,
  getBillingSubscription,
  openExternalURLInNewTab,
} from '@/services/billing';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock('@/services/billing', async () => {
  const actual = await vi.importActual<typeof import('@/services/billing')>('@/services/billing');
  return {
    ...actual,
    createPortalSession: vi.fn(),
    getBillingSubscription: vi.fn(),
    openExternalURLInNewTab: vi.fn(),
  };
});

const mockedCreatePortalSession = vi.mocked(createPortalSession);
const mockedGetBillingSubscription = vi.mocked(getBillingSubscription);
const mockedOpenExternalURLInNewTab = vi.mocked(openExternalURLInNewTab);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreatePortalSession.mockResolvedValue({
    portal_url: 'https://polar.sh/portal/session',
  });
});

describe('BillingDashboardPage', () => {
  it('renders current plan, status, period info, and seat usage', async () => {
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'year',
        status: 'active',
        portal_available: true,
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: false,
        seat_limit: 20,
        seats_used: 6,
      },
    });

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    expect(await screen.findByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Yearly')).toBeInTheDocument();
    expect(screen.getByText('6 / 20')).toBeInTheDocument();
    expect(screen.getByText(/Current period ends Apr/i)).toBeInTheDocument();
  });

  it('shows the cancellation pending banner', async () => {
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'month',
        status: 'canceled',
        portal_available: true,
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: true,
        seat_limit: 20,
        seats_used: 6,
      },
    });

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/your subscription will end on/i);
  });

  it('shows an upgrade CTA when there is no subscription', async () => {
    const user = userEvent.setup();
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: null,
    });

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    expect(await screen.findByText('No active subscription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage Subscription' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'View Pricing' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/billing');
  });

  it('routes bootstrap trial subscriptions to pricing instead of the portal', async () => {
    const user = userEvent.setup();
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'basic',
        plan_name: 'Basic',
        billing_interval: 'month',
        status: 'trial',
        portal_available: false,
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: false,
        seat_limit: 5,
        seats_used: 1,
      },
    });

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    await user.click(await screen.findByRole('button', { name: 'Choose Plan' }));

    expect(mockedCreatePortalSession).not.toHaveBeenCalled();
    expect(mockedNavigate).toHaveBeenCalledWith('/billing');
  });

  it('opens the billing portal for a manageable subscription', async () => {
    const user = userEvent.setup();
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'month',
        status: 'active',
        portal_available: true,
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: false,
        seat_limit: 20,
        seats_used: 6,
      },
    });

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    await user.click(await screen.findByRole('button', { name: 'Manage Subscription' }));

    expect(mockedCreatePortalSession).toHaveBeenCalledTimes(1);
    expect(mockedOpenExternalURLInNewTab).toHaveBeenCalledWith('https://polar.sh/portal/session');
  });

  it('shows a loading state while the portal session is created', async () => {
    const user = userEvent.setup();
    let resolvePortal: ((value: CreatePortalSessionResponse) => void) | undefined;
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'month',
        status: 'active',
        portal_available: true,
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: false,
        seat_limit: 20,
        seats_used: 6,
      },
    });
    mockedCreatePortalSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePortal = resolve;
        }),
    );

    renderWithProviders(<BillingDashboardPage />, {
      routeEntries: ['/settings/billing'],
    });

    await user.click(await screen.findByRole('button', { name: 'Manage Subscription' }));

    expect(await screen.findByRole('button', { name: 'Opening portal...' })).toBeDisabled();

    resolvePortal?.({ portal_url: 'https://polar.sh/portal/session' });
  });
});
