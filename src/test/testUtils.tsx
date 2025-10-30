import { ReactElement, ReactNode } from 'react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, RenderOptions } from '@testing-library/react';

type WrapperProps = {
  children: ReactNode;
};

type ExtendedRenderOptions = RenderOptions & {
  routeEntries?: MemoryRouterProps['initialEntries'];
  queryClient?: QueryClient;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    routeEntries = ['/'],
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: ExtendedRenderOptions = {},
) {
  function AllProviders({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={routeEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: AllProviders, ...renderOptions }),
  };
}
