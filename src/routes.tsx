import { createBrowserRouter } from 'react-router-dom';
import AuthenticatedLayout from './layout/AuthenticatedLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import AcceptInvite from './pages/auth/AcceptInvite';
import ResetPassword from './pages/auth/ResetPassword';
import { SignIn, SignUp } from '@clerk/clerk-react';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/sign-up', element: <SignUp routing="path" path="/sign-up" /> },
  { path: '/sign-in', element: <SignIn routing="path" path="/sign-in" /> },
  { path: '/invite/accept', element: <AcceptInvite /> },
  { path: '/password/reset', element: <ResetPassword /> },
  {
    element: <AuthenticatedLayout />,
    children: [{ path: '/dashboard', element: <Dashboard /> }],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
