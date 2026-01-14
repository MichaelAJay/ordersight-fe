import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button/Button';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <h1>Welcome to Ordersight</h1>
        <p>The amazing application that does amazing things</p>
      </header>

      <section className="landing-cta">
        <SignedOut>
          <Button variant="primary" size="lg" onClick={() => navigate('/sign-up')}>
            Sign Up
          </Button>

          <Button variant="outline" size="lg" onClick={() => navigate('/sign-in')}>
            Sign In
          </Button>
        </SignedOut>
        <SignedIn>
          <Button variant="primary" size="lg" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </SignedIn>
      </section>

      <section className="landing-features">
        <h2>Why OrderSight?</h2>
        <ul>
          <li>Manage your stores effortlessly</li>
          <li>Track orders in real-time</li>
          <li>Grow your business with insights</li>
        </ul>
      </section>
    </div>
  );
}
