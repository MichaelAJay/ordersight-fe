import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingDashboardPage } from './BillingDashboardPage';
import { renderWithProviders } from '@/test/testUtils';
import { getBillingSubscription } from '@/services/billing';

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
    getBillingSubscription: vi.fn(),
  };
});

const mockedGetBillingSubscription = vi.mocked(getBillingSubscription);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BillingDashboardPage', () => {
  it('renders current plan, status, period info, and seat usage', async () => {
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'year',
        status: 'active',
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

    await user.click(screen.getByRole('button', { name: 'View Pricing' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/billing');
  });
});
