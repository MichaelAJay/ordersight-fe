import { createBrowserRouter } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { AuthenticatedLayout } from './layout/AuthenticatedLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => {
      const mod = await import('./pages/Home');
      return { Component: mod.Home };
    },
  },
  {
    path: '/sign-up/*',
    lazy: async () => {
      const mod = await import('./pages/auth/SignUpPage');
      return { Component: mod.SignUpPage };
    },
  },
  { path: '/sign-in/*', element: <SignIn routing="path" path="/sign-in" /> },
  {
    path: '/create-organization/*',
    lazy: async () => {
      const mod = await import('./pages/auth/CreateOrganizationPage');
      return { Component: mod.CreateOrganizationPage };
    },
  },
  {
    path: '/onboarding/bootstrap',
    lazy: async () => {
      const mod = await import('./pages/auth/OnboardingBootstrapPage');
      return { Component: mod.OnboardingBootstrapPage };
    },
  },
  {
    element: <AuthenticatedLayout />,
    children: [
      {
        path: '/dashboard',
        lazy: async () => {
          const mod = await import('./pages/Dashboard');
          return { Component: mod.Dashboard };
        },
      },
      {
        path: '/members',
        lazy: async () => {
          const mod = await import('./pages/MembersPage');
          return { Component: mod.MembersPage };
        },
      },
      {
        path: '/billing',
        lazy: async () => {
          const mod = await import('./pages/BillingPage');
          return { Component: mod.BillingPage };
        },
      },
      {
        path: '/billing/success',
        lazy: async () => {
          const mod = await import('./pages/BillingSuccessPage');
          return { Component: mod.BillingSuccessPage };
        },
      },
      {
        path: '/stores',
        lazy: async () => {
          const mod = await import('./pages/StoresPage');
          return { Component: mod.StoresPage };
        },
      },
      {
        path: '/menus',
        lazy: async () => {
          const mod = await import('./pages/MenusPage');
          return { Component: mod.MenusPage };
        },
      },
      {
        path: '/menus/import',
        lazy: async () => {
          const mod = await import('./pages/MenuImportWizardPage');
          return { Component: mod.MenuImportWizardPage };
        },
      },
      {
        path: '/menus/quick-entry',
        lazy: async () => {
          const mod = await import('./pages/MenuQuickEntryPage');
          return { Component: mod.MenuQuickEntryPage };
        },
      },
      {
        path: '/stores/:storeId',
        lazy: async () => {
          const mod = await import('./pages/stores/StoreShell');
          return { Component: mod.StoreShell };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const mod = await import('./pages/stores/StoreIndexRedirect');
              return { Component: mod.StoreIndexRedirect };
            },
          },
          {
            path: 'orders',
            lazy: async () => {
              const mod = await import('./pages/stores/StoreOrdersPage');
              return { Component: mod.StoreOrdersPage };
            },
          },
          {
            path: 'menus',
            lazy: async () => {
              const mod = await import('./pages/stores/StoreMenusPage');
              return { Component: mod.StoreMenusPage };
            },
          },
          {
            path: 'team',
            lazy: async () => {
              const mod = await import('./pages/stores/StoreTeamPage');
              return { Component: mod.StoreTeamPage };
            },
          },
          {
            path: 'activity',
            lazy: async () => {
              const mod = await import('./pages/stores/StoreActivityPage');
              return { Component: mod.StoreActivityPage };
            },
          },
          {
            path: 'settings',
            lazy: async () => {
              const mod = await import('./pages/stores/StoreSettingsPage');
              return { Component: mod.StoreSettingsPage };
            },
          },
        ],
      },
    ],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
