import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { router as appRouter } from './routes';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

test('renders standalone auth pages without layout nav', async () => {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/signup'] });
  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('renders dashboard under AppLayout with nav links', async () => {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/dashboard'] });
  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('href', '/orders');
});
