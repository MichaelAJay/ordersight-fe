import { createBrowserRouter } from 'react-router-dom';
import AuthenticatedLayout from './layout/AuthenticatedLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import { SignIn } from '@clerk/clerk-react';
import SignUpPage from './pages/auth/SignUpPage';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/sign-up/*', element: <SignUpPage /> },
  { path: '/sign-in', element: <SignIn routing="path" path="/sign-in" /> },
  {
    element: <AuthenticatedLayout />,
    children: [{ path: '/dashboard', element: <Dashboard /> }],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
