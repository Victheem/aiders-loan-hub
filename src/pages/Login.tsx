import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Eye, EyeOff } from 'lucide-react';

type View = 'login' | 'signup' | 'forgot';

const Login = () => {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const resetForm = () => {
    setError('');
    setMessage('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Invalid email or password');
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const result = await signup(email, password, name);
    if (result.success) {
      setMessage('Check your email to confirm your account before signing in.');
      setView('login');
    } else {
      setError(result.error || 'Signup failed');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Check your email for a password reset link.');
    }
    setLoading(false);
  };

  const titles: Record<View, { heading: string; sub: string }> = {
    login: { heading: 'Welcome back', sub: 'Sign in to your account' },
    signup: { heading: 'Create account', sub: 'Get started with Aiders Global' },
    forgot: { heading: 'Forgot password?', sub: 'We\'ll send you a reset link' },
  };

  return (
    <div className="min-h-screen flex bg-primary">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-bold text-primary-foreground tracking-tight">AIDERS</h1>
              <p className="text-sm text-primary-foreground/70 tracking-[0.3em] uppercase">Global</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-primary-foreground mb-4">
            Loan Management System
          </h2>
          <p className="text-primary-foreground/60 leading-relaxed">
            Secure, scalable platform for managing loans, tracking disbursements, and monitoring financial performance across all branches.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background rounded-l-3xl lg:rounded-l-[2rem]">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <Shield className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Aiders Global</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">{titles[view].heading}</h2>
          <p className="text-muted-foreground mb-8">{titles[view].sub}</p>

          {message && (
            <p className="text-sm text-primary bg-primary/10 px-3 py-2 rounded-md mb-4">{message}</p>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@aidersglobal.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => { resetForm(); setView('forgot'); }} className="text-xs text-primary hover:underline">Forgot password?</button>
                </div>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
              <p className="text-sm text-center text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => { resetForm(); setView('signup'); }} className="text-primary hover:underline font-medium">Create account</button>
              </p>
            </form>
          )}

          {view === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@aidersglobal.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>{loading ? 'Creating account...' : 'Create Account'}</Button>
              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <button type="button" onClick={() => { resetForm(); setView('login'); }} className="text-primary hover:underline font-medium">Sign in</button>
              </p>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@aidersglobal.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</Button>
              <p className="text-sm text-center text-muted-foreground">
                Remember your password?{' '}
                <button type="button" onClick={() => { resetForm(); setView('login'); }} className="text-primary hover:underline font-medium">Sign in</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
