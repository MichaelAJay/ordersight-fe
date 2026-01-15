import { SignUp } from '@clerk/clerk-react';

export default function SignUpPage() {
  return (
    <div className="auth-shell">
      <div className="auth-copy">
        <h1>Create your account</h1>
        <p>
          This sign-up creates your user account and then guides you to create a new organization,
          where you'll be the admin.
        </p>
        <p>
          If you're trying to join an existing organization, ask that organization's admin to invite
          you instead.
        </p>
        <p>
          DEV TODO: The UI should have some user step which ensures that users aren't created if
          this isn't a "Create New Organization" flow. Otherwise, we'll have to deal with users
          existing who were supposed to be invited instead.
        </p>
      </div>

      <div className="auth-card">
        <SignUp routing="path" path="/sign-up" />
      </div>
    </div>
  );
}
