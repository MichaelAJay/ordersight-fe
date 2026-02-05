import { createBrowserRouter } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import AuthenticatedLayout from './layout/AuthenticatedLayout';

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
    ],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
