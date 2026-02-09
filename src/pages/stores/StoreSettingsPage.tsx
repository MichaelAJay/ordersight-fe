import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import { StoreTabContent } from './StoreTabContent';

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '');
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

export function StoreSettingsPage() {
  const { orgRole } = useAuth();
  const navigate = useNavigate();
  const { storeId } = useParams();
  const isAdmin = isAdminRole(normalizeRole(orgRole ?? null));

  if (!isAdmin) {
    return (
      <StoreTabContent
        title="Not allowed"
        description="Settings are only available to admins."
        actions={
          <Button
            variant="outline"
            size="sm"
            onPress={() => navigate(storeId ? `/stores/${storeId}/orders` : '/stores')}
          >
            Back to Orders
          </Button>
        }
      />
    );
  }

  return <StoreTabContent title="Settings" description="Store settings will be available here." />;
}
