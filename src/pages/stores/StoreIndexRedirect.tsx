import { Navigate } from 'react-router-dom';

export function StoreIndexRedirect() {
  return <Navigate to="orders" replace />;
}
