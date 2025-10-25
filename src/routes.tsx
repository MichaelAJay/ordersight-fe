import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import Dashboard from './pages/Dashboard';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/dashboard', element: <Dashboard /> },
    ],
    // add Stores/Menus/Orders etc progressively per spec
  },
]);
