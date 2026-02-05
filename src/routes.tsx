import { createBrowserRouter } from 'react-router-dom';
import AuthenticatedLayout from './layout/AuthenticatedLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import { SignIn } from '@clerk/clerk-react';
import SignUpPage from './pages/auth/SignUpPage';
import CreateOrganizationPage from './pages/auth/CreateOrganizationPage';
import OnboardingBootstrapPage from './pages/auth/OnboardingBootstrapPage';
import MembersPage from './pages/MembersPage';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/sign-up/*', element: <SignUpPage /> },
  { path: '/sign-in/*', element: <SignIn routing="path" path="/sign-in" /> },
  { path: '/create-organization/*', element: <CreateOrganizationPage /> },
  { path: '/onboarding/bootstrap', element: <OnboardingBootstrapPage /> },
  {
    element: <AuthenticatedLayout />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/members', element: <MembersPage /> },
    ],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
