import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPage } from './BillingPage';
import { renderWithProviders } from '@/test/testUtils';
import {
  createCheckoutSession,
  getBillingSubscription,
  listBillingPlans,
  redirectToExternalURL,
} from '@/services/billing';

vi.mock('@/services/billing', async () => {
  const actual = await vi.importActual<typeof import('@/services/billing')>('@/services/billing');
  return {
    ...actual,
    listBillingPlans: vi.fn(),
    getBillingSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    redirectToExternalURL: vi.fn(),
  };
});

const mockedListBillingPlans = vi.mocked(listBillingPlans);
const mockedGetBillingSubscription = vi.mocked(getBillingSubscription);
const mockedCreateCheckoutSession = vi.mocked(createCheckoutSession);
const mockedRedirectToExternalURL = vi.mocked(redirectToExternalURL);

const plansResponse = {
  plans: [
    {
      id: 'plan-basic',
      code: 'basic',
      name: 'Basic',
      trial_length: 14,
      prices: [
        {
          id: 'price-basic-month',
          billing_interval: 'month',
          currency: 'USD',
          amount_atomic: 1900,
          seat_limit: 5,
        },
        {
          id: 'price-basic-year',
          billing_interval: 'year',
          currency: 'USD',
          amount_atomic: 19000,
          seat_limit: 5,
        },
      ],
    },
    {
      id: 'plan-pro',
      code: 'pro',
      name: 'Pro',
      trial_length: 0,
      prices: [
        {
          id: 'price-pro-month',
          billing_interval: 'month',
          currency: 'USD',
          amount_atomic: 4900,
          seat_limit: 20,
        },
        {
          id: 'price-pro-year',
          billing_interval: 'year',
          currency: 'USD',
          amount_atomic: 49000,
          seat_limit: 20,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedListBillingPlans.mockResolvedValue(plansResponse);
  mockedGetBillingSubscription.mockResolvedValue({
    subscription: {
      plan_code: 'basic',
      plan_name: 'Basic',
      billing_interval: 'month',
      status: 'active',
      current_period_end: null,
      cancel_at_period_end: false,
      seat_limit: 5,
      seats_used: 3,
    },
  });
  mockedCreateCheckoutSession.mockResolvedValue({
    checkout_url: 'https://polar.sh/checkout/test-session',
  });
});

describe('BillingPage', () => {
  it('renders active plans and marks the current plan as disabled', async () => {
    renderWithProviders(<BillingPage />);

    expect(await screen.findByRole('heading', { name: 'Basic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByText('Current Subscription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.getAllByText('Current plan')).toHaveLength(2);
  });

  it('switches the displayed prices when the billing interval changes', async () => {
    const user = userEvent.setup();

    renderWithProviders(<BillingPage />);

    expect(await screen.findByText('$19.00')).toBeInTheDocument();
    expect(screen.getByText('$49.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    expect(await screen.findByText('$190.00')).toBeInTheDocument();
    expect(screen.getByText('$490.00')).toBeInTheDocument();
  });

  it('starts checkout for a selected plan and redirects to Polar', async () => {
    const user = userEvent.setup();

    renderWithProviders(<BillingPage />);

    await screen.findByRole('heading', { name: 'Pro' });
    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => {
      expect(mockedCreateCheckoutSession).toHaveBeenCalled();
      expect(mockedCreateCheckoutSession.mock.calls[0]?.[0]).toEqual({
        plan_price_id: 'price-pro-month',
      });
    });
    await waitFor(() => {
      expect(mockedRedirectToExternalURL).toHaveBeenCalledWith(
        'https://polar.sh/checkout/test-session',
      );
    });
  });

  it('shows a subscription conflict message when checkout returns 409', async () => {
    const user = userEvent.setup();
    mockedCreateCheckoutSession.mockRejectedValue({
      status: 409,
      message: 'already subscribed',
    });

    renderWithProviders(<BillingPage />);

    await screen.findByRole('heading', { name: 'Pro' });
    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already has a provider-managed subscription/i,
    );
  });

  it('shows loading and error states for billing data', async () => {
    let resolvePlans: ((value: typeof plansResponse) => void) | null = null;
    mockedListBillingPlans.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlans = resolve;
        }),
    );
    mockedGetBillingSubscription.mockRejectedValueOnce(new Error('boom'));

    renderWithProviders(<BillingPage />);

    expect(screen.getByText('Loading pricing')).toBeInTheDocument();

    resolvePlans?.(plansResponse);

    expect(await screen.findByText('Billing data is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
