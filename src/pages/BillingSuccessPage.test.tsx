import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingSuccessPage } from './BillingSuccessPage';
import { renderWithProviders } from '@/test/testUtils';
import { getBillingSubscription } from '@/services/billing';

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

describe('BillingSuccessPage', () => {
  it('renders the success confirmation and main app CTA', async () => {
    mockedGetBillingSubscription.mockResolvedValue({
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        billing_interval: 'month',
        status: 'active',
        current_period_end: '2026-04-12T12:00:00Z',
        cancel_at_period_end: false,
        seat_limit: 20,
        seats_used: 6,
      },
    });

    renderWithProviders(<BillingSuccessPage />, {
      routeEntries: ['/billing/success?checkout_id=chk_123'],
    });

    expect(await screen.findByRole('heading', { name: 'Payment successful.' })).toBeInTheDocument();
    expect(await screen.findByText('Subscription active')).toBeInTheDocument();
    expect(screen.getByText('chk_123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue To Dashboard' })).toBeInTheDocument();
  });

  it('polls until the subscription becomes active', async () => {
    mockedGetBillingSubscription
      .mockResolvedValueOnce({
        subscription: {
          plan_code: 'pro',
          plan_name: 'Pro',
          billing_interval: 'month',
          status: 'trial',
          current_period_end: null,
          cancel_at_period_end: false,
          seat_limit: 20,
          seats_used: 6,
        },
      })
      .mockResolvedValueOnce({
        subscription: {
          plan_code: 'pro',
          plan_name: 'Pro',
          billing_interval: 'month',
          status: 'active',
          current_period_end: '2026-04-12T12:00:00Z',
          cancel_at_period_end: false,
          seat_limit: 20,
          seats_used: 6,
        },
      });

    renderWithProviders(<BillingSuccessPage />, {
      routeEntries: ['/billing/success?checkout_id=chk_456'],
    });

    expect(await screen.findByText(/confirming your subscription/i)).toBeInTheDocument();
    expect(
      screen.getByText(/polling for an active subscription every 1.5 seconds/i),
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByText('Subscription active')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(mockedGetBillingSubscription).toHaveBeenCalledTimes(2);
  });
});
