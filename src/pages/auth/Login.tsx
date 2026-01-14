import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  isAuthMFARequired,
  isAuthSuccess,
  loginWithPassword,
  resendVerificationEmail,
} from '../../services/auth';
import styles from './Login.module.css';
import { Button } from '../../components/common/Button/Button';
import { AuthErrorAction } from '../../types/auth';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  // DEV: Autopopulate for easier debugging
  const [email, setEmail] = useState('michael.a.jay82@gmail.com');
  const [password, setPassword] = useState('myPW123!@#');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<AuthErrorAction | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const outcome = await loginWithPassword(email, password, 'password');

      if (isAuthSuccess(outcome)) {
        login(outcome.sessionId, outcome.subjectId);

        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      } else if (isAuthMFARequired(outcome)) {
        navigate('/auth/mfa', { state: { mfaToken: outcome.mfaToken } });
      } else {
        // Display error to use
        setError(outcome.message);
        setErrorAction(outcome.action || null);

        // TODO: Handle specific actions based on outcome.action
        // - SHOW_REGISTRATION_FORM: render signup link
        // - SHOW_EMAIL_VERIFICATION_PROMPT: render resend button - complete
        // - CONTACT_SUPPORT: show support email
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendVerification() {
    try {
      await resendVerificationEmail(email);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleOAuthClick(provider: 'google' | 'facebook') {
    console.log(`OAuth login clicked: ${provider}`);
    // TODO
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div id="main-content" tabIndex={-1} className={styles['login-container']}>
        <div className={styles['login-card']}>
          <div className={styles['login-header']}>
            <h2>Sign in to your account</h2>
          </div>

          <form className={styles['login-form']} onSubmit={handleSubmit} aria-busy={isLoading}>
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                id="login-error"
                className={styles['error-message']}
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {error && errorAction && (
              <div className={styles['action-prompt']}>
                {errorAction === 'SHOW_EMAIL_VERIFICATION_PROMPT' && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className={styles['action-link']}
                  >
                    Resend verification email
                  </button>
                )}
              </div>
            )}

            <div className={styles['form-group']}>
              <label htmlFor="email" className={styles['form-label']}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles['form-input']}
                disabled={isLoading}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {/** todo - add password view toggle */}
            <div className={styles['form-group']}>
              <label htmlFor="password" className={styles['form-label']}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles['form-input']}
                disabled={isLoading}
              />
            </div>

            <Button type="submit" disabled={isLoading} block aria-live="polite">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>

            <div className={styles['divider']}>
              <span className={styles['divider-text']}>Or continue with</span>
            </div>

            <div className={styles['oauth-buttons']}>
              <button
                type="button"
                onClick={() => handleOAuthClick('google')}
                disabled={isLoading}
                className={styles['oauth-button']}
                aria-label="Sign in with Google"
              >
                Google
              </button>

              <button
                type="button"
                onClick={() => handleOAuthClick('facebook')}
                disabled={isLoading}
                className={styles['oauth-button']}
                aria-label="Sign in with Facebook"
              >
                Facebook
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
