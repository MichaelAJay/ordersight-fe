import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import AcceptInvite from './pages/auth/AcceptInvite';
import ResetPassword from './pages/auth/ResetPassword';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/invite/accept', element: <AcceptInvite /> },
  { path: '/password/reset', element: <ResetPassword /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/dashboard', element: <Dashboard /> },
    ],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
