import { createBrowserRouter } from 'react-router-dom';
import AuthenticatedLayout from './layout/AuthenticatedLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import AcceptInvite from './pages/auth/AcceptInvite';
import ResetPassword from './pages/auth/ResetPassword';
import Signup from './pages/auth/Signup';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/signup', element: <Signup /> },
  { path: '/login', element: <Login /> },
  { path: '/invite/accept', element: <AcceptInvite /> },
  { path: '/password/reset', element: <ResetPassword /> },
  {
    element: <AuthenticatedLayout />,
    children: [{ path: '/dashboard', element: <Dashboard /> }],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
