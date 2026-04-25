import React, { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { signIn, signUp, confirmSignUp, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import Dashboard from './Dashboard';

// ==========================================
// TIPOS LOCALES
// ==========================================

type AuthView = 'signIn' | 'signUp' | 'confirmSignUp' | 'forgotPassword' | 'confirmReset';

// ==========================================
// FORMULARIO DE LOGIN PERSONALIZADO
// ==========================================

const CustomLoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [view, setView] = useState<AuthView>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(''); setInfo(''); };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await signUp({ username: email, password, options: { userAttributes: { email } } });
      setInfo('Check your email for a confirmation code.');
      setView('confirmSignUp');
    } catch (err: any) {
      setError(err.message || 'Sign up failed.');
    } finally { setLoading(false); }
  };

  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setInfo('Account confirmed! You can now sign in.');
      setView('signIn');
    } catch (err: any) {
      setError(err.message || 'Confirmation failed.');
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await resetPassword({ username: email });
      setInfo('Reset code sent to your email.');
      setView('confirmReset');
    } catch (err: any) {
      setError(err.message || 'Could not send reset code.');
    } finally { setLoading(false); }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessages(); setLoading(true);
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      setInfo('Password updated. Sign in now.');
      setView('signIn');
    } catch (err: any) {
      setError(err.message || 'Reset failed.');
    } finally { setLoading(false); }
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-400 focus:bg-white transition-all duration-150";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider";
  const btnPrimary = "w-full bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-sm font-bold py-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60";
  const btnGhost = "text-sm text-green-600 hover:text-green-500 font-semibold transition underline-offset-2 hover:underline";

  const titles: Record<AuthView, { heading: string; sub: string }> = {
    signIn:        { heading: 'Welcome back',     sub: 'Sign in to your financial dashboard' },
    signUp:        { heading: 'Create account',   sub: 'Start growing your wealth today' },
    confirmSignUp: { heading: 'Check your email', sub: `We sent a code to ${email || 'you'}` },
    forgotPassword:{ heading: 'Reset password',   sub: 'Enter your email to get a reset code' },
    confirmReset:  { heading: 'New password',     sub: `Enter the code sent to ${email || 'you'}` },
  };

  return (
    <div className="w-full space-y-5">
      {/* Heading */}
      <div>
        <h2 className="text-2xl font-black text-gray-900 leading-tight" style={{ letterSpacing: '-0.03em' }}>
          {titles[view].heading}
        </h2>
        <p className="text-sm text-gray-400 mt-1">{titles[view].sub}</p>
      </div>

      {/* Tab toggle for signIn / signUp */}
      {(view === 'signIn' || view === 'signUp') && (
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['signIn', 'signUp'] as AuthView[]).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); clearMessages(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {v === 'signIn' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
      )}

      {/* Error / Info banners */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-3 rounded-xl flex items-start gap-2">
          <span className="mt-0.5">⚠</span> {error}
        </div>
      )}
      {info && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs font-medium px-4 py-3 rounded-xl flex items-start gap-2">
          <span className="mt-0.5">✓</span> {info}
        </div>
      )}

      {/* SIGN IN */}
      {view === 'signIn' && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="text-right -mt-2">
            <button type="button" onClick={() => { setView('forgotPassword'); clearMessages(); }} className={btnGhost}>
              Forgot password?
            </button>
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Signing in...</> : 'Sign In →'}
          </button>
        </form>
      )}

      {/* SIGN UP */}
      {view === 'signUp' && (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} required placeholder="Repeat your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Creating account...</> : 'Create Account →'}
          </button>
        </form>
      )}

      {/* CONFIRM SIGN UP */}
      {view === 'confirmSignUp' && (
        <form onSubmit={handleConfirmSignUp} className="space-y-4">
          <div>
            <label className={labelClass}>Confirmation Code</label>
            <input type="text" required placeholder="Enter 6-digit code" value={code} onChange={e => setCode(e.target.value)} className={inputClass} maxLength={6} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Confirming...</> : 'Confirm Account →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}

      {/* FORGOT PASSWORD */}
      {view === 'forgotPassword' && (
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Sending code...</> : 'Send Reset Code →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}

      {/* CONFIRM RESET */}
      {view === 'confirmReset' && (
        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div>
            <label className={labelClass}>Reset Code</label>
            <input type="text" required placeholder="Enter code from email" value={code} onChange={e => setCode(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>New Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs font-semibold select-none">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className={btnPrimary}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Updating...</> : 'Set New Password →'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setView('signIn'); clearMessages(); }} className={btnGhost}>← Back to Sign In</button>
          </div>
        </form>
      )}
    </div>
  );
};

// ==========================================
// PANTALLA DE LOGIN — StartGround Style
// ==========================================

const CustomAuthWrapper = () => {
  const { authStatus } = useAuthenticator((context) => [context.authStatus, context.user]);

  if (authStatus === 'authenticated') return <Dashboard />;

  // Force re-check after our custom sign-in
  const handleSuccess = () => window.location.reload();

  return (
    <div className="flex min-h-screen font-sans" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── LEFT: Branding panel ── */}
      <div className="hidden lg:flex w-[55%] bg-gray-950 relative overflow-hidden flex-col justify-between p-16">

        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}></div>

        {/* Floating green glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(74,222,128,0.10) 0%, transparent 70%)'
        }}></div>

        {/* Logo top-left */}
        <div className="relative z-10">
          <span className="font-black text-2xl text-white" style={{ letterSpacing: '-0.03em' }}>
            FinAI<span className="text-green-400">.Agent</span>
          </span>
        </div>

        {/* Center illustration + copy */}
        <div className="relative z-10 max-w-md">

          {/* Illustrated card mock */}
          <div className="mb-10 relative">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-72 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Financial Score</span>
                <span className="bg-green-500/10 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/20">↑ 12%</span>
              </div>
              <div className="text-5xl font-black text-white mb-1" style={{ letterSpacing: '-0.05em' }}>87</div>
              <div className="text-xs text-green-400 font-semibold mb-4">Excellent</div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: '87%' }}></div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1.5">
                <span>0</span><span>100</span>
              </div>
            </div>
            {/* Floating spend badge */}
            <div className="absolute -right-4 top-4 bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Monthly</p>
              <p className="text-base font-black text-gray-900" style={{ letterSpacing: '-0.02em' }}>€1,240</p>
            </div>
            {/* Floating streak badge */}
            <div className="absolute -left-3 -bottom-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
              <span className="text-orange-400 text-base">🔥</span>
              <div>
                <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Streak</p>
                <p className="text-sm font-black text-gray-900">14 days</p>
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ letterSpacing: '-0.04em' }}>
            Your money,<br/>
            <span className="text-green-400">ruthlessly</span> optimized.
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            AI-powered financial analysis that tells you the truth about your spending — and helps you do something about it.
          </p>

          {/* Social proof row */}
          <div className="flex items-center gap-4 mt-8 pt-8 border-t border-gray-800">
            <div className="flex -space-x-2">
              {['#4ade80','#60a5fa','#f472b6','#facc15'].map((c,i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-gray-950 flex items-center justify-center text-xs font-bold text-white" style={{ background: c }}>
                  {['A','B','C','D'][i]}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Joined by <span className="text-gray-300 font-semibold">2,400+ users</span> tracking their finances</p>
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-xs text-gray-600 font-medium">Powered by AWS · Secured by Cognito</p>
        </div>
      </div>

      {/* ── RIGHT: Auth form ── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <span className="font-black text-2xl text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              FinAI<span className="text-green-500">.Agent</span>
            </span>
          </div>

          <CustomLoginForm onSuccess={handleSuccess} />

          {/* Footer */}
          <p className="text-xs text-gray-300 text-center mt-8">
            By signing in you agree to our Terms & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomAuthWrapper;
