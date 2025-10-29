import { useForm } from 'react-hook-form';
import { SignupPayload } from '../../features/auth/types';
import { useSignup } from '../../features/auth/useSignup';

export default function Signup() {
  const { register, handleSubmit, formState, reset } = useForm<SignupPayload>({
    defaultValues: {
      account_name: '',
      email: '',
      password: '',
      first_name: '',
      last_name: '',
    },
  });
  const signupMutation = useSignup();

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signupMutation.mutateAsync(values);
      reset();
      // navigate('/dashboard') or show success toast
    } catch (err) {
      // allready handled in UI below; optionally log
      console.error(err);
    }
  });

  return (
    <div className="auth-card">
      <h1>Create your account</h1>

      {!!signupMutation.error && (
        <p className="form-error">
          {(signupMutation.error as { message?: string })?.message ?? 'Sign up failed.'}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <label>
          Account name
          <input
            type="text"
            {...register('account_name', { required: 'Account name is required' })}
            disabled={signupMutation.isPending}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            {...register('email', { required: 'Email is required' })}
            disabled={signupMutation.isPending}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Use at least 8 characters' }, // todo: this this to be more constraining
            })}
            disabled={signupMutation.isPending}
          />
          {formState.errors.password && <span>{formState.errors.password.message}</span>}
        </label>

        <label>
          First Name
          <input type="text" {...register('first_name')} disabled={signupMutation.isPending} />
        </label>

        <label>
          Last Name
          <input type="text" {...register('first_name')} disabled={signupMutation.isPending} />
        </label>

        <button type="submit" disabled={signupMutation.isPending}>
          {signupMutation.isPending ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
    </div>
  );
}

/**
 * Notes to self:
 * 
 * To sign-up, we must make a request to /auth/signup/account
 * Request body:
 * {
  "account_name": "string",
  "email": "user@example.com",
  "password": "********",
  "first_name": "string",
  "last_name": "string"
    }

    I believe that the correct approach is:
    1) Use postJSON from services/http.ts
    - notes: since this would only ever be called from the Signup screen - should we contain it all in Signup.tsx - this is a code architecture question

    2) Create the form which will map to request body

    3) Send button triggers call to postJSON
 */
