import { CreateOrganization } from '@clerk/clerk-react';

export default function CreateOrganizationPage() {
  return (
    <div className="auth-shell">
      <div className="auth-copy">
        <h1>Create your organization</h1>
        <p>Almost done - set up your organization to continue.</p>
        <p>Organization name is required, logo is optional and can be added later</p>
      </div>

      <div className="auth-card">
        <CreateOrganization
          routing="path"
          path="/create-organization"
          afterCreateOrganizationUrl="/onboarding/bootstrap"
          skipInvitationScreen={true}
        />
      </div>
    </div>
  );
}
