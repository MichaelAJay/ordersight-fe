// ordersight-fe/src/pages/auth/__tests__/Signup.test.tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import Signup from '../Signup';
import { renderWithProviders } from '../../../test/testUtils';
import { SignupPayload } from '../../../features/auth/types';
import { makeSignupPayload } from '@/test/fixtures/auth';

const API_BASE = 'http://localhost:8080/api/v1';

const server = setupServer(
  // Handle CSRF requests
  http.get(`${API_BASE}/auth/csrf`, () => {
    return HttpResponse.json({ token: 'test-csrf-token' });
  }),
  // Handle signup requests
  http.post(`${API_BASE}/auth/signup/account`, async ({ request }) => {
    const body = (await request.json()) as SignupPayload;
    if (!body.email.includes('@')) {
      return HttpResponse.json({ message: 'Email invalid' }, { status: 400 });
    }
    return HttpResponse.json({ account_id: 'acc_123' }, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('submits form and clears fields on success', async () => {
  renderWithProviders(<Signup />);
  await userEvent.type(screen.getByLabelText(/account name/i), 'Acme LLC');
  await userEvent.type(screen.getByLabelText(/email/i), 'owner@acme.test');
  await userEvent.type(screen.getByLabelText(/^password/i), 'Password1!');
  await userEvent.type(screen.getByLabelText(/first name/i), 'Ada');
  await userEvent.type(screen.getByLabelText(/last name/i), 'Lovelace');
  await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /sign up/i })).toHaveTextContent('Sign up'),
  );
  expect(screen.getByLabelText(/account name/i)).toHaveValue('');
});

test('shows client-side validation errors', async () => {
  renderWithProviders(<Signup />);
  await userEvent.type(screen.getByLabelText(/^password/i), 'short');
  await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

  expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
});

test('surfaces API errors when signup fails', async () => {
  server.use(
    http.post(`${API_BASE}/auth/signup/account`, () => {
      return HttpResponse.json({ message: 'Email already exists' }, { status: 400 });
    }),
  );

  const payload = makeSignupPayload();

  renderWithProviders(<Signup />);
  await userEvent.type(screen.getByLabelText(/account name/i), payload.account_name);
  await userEvent.type(screen.getByLabelText(/email/i), payload.email);
  await userEvent.type(screen.getByLabelText(/^password/i), payload.password);
  await userEvent.type(screen.getByLabelText(/first name/i), payload.first_name);
  await userEvent.type(screen.getByLabelText(/last name/i), payload.last_name);
  await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

  expect(await screen.findByText(/email already exists/i)).toBeInTheDocument();
});
