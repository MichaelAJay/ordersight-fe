import { renderWithProviders } from './test/testUtils';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { router as appRouter } from './routes';
import { screen } from '@testing-library/react';

test('renders standalone auth pages without layout nav', async () => {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/signup'] });

  renderWithProviders(<RouterProvider router={router} />, { routeEntries: ['/signup'] });

  expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('renders dashboard under AppLayout with nav links', async () => {
  renderWithProviders(<RouterProvider router={appRouter} />, { routeEntries: ['/dashboard'] });

  expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('href', '/orders');
});
