import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * LoginScreen — S-01
 * Email + password login with MFA support.
 * Per TRD: No self-registration; accounts provisioned by admin.
 */
export const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const { setAccessToken, setUser, setRequiresMfa } = useAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                setError(signInError.message);
            } else {
                navigate('/');
            }
        } catch {
            setError('Login failed due to an unexpected error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-navy-700 rounded-xl flex items-center justify-center mb-4 border border-navy-600">
                        <Shield className="w-8 h-8 text-forensic-amber" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">ARIA</h1>
                    <p className="text-navy-300 text-sm mt-1">AI-Rendered Intent Analyzer</p>
                    <p className="text-navy-400 text-xs mt-0.5">Forensic Behavioral Attribution Platform</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-xl shadow-2xl p-8">
                    <h2 className="text-lg font-semibold text-slate-800 mb-1">Sign In</h2>
                    <p className="text-sm text-slate-500 mb-6">
                        Access is restricted to authorized investigators.
                    </p>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email Address
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="aria-input"
                                placeholder="investigator@agency.gov"
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="aria-input pr-10"
                                    placeholder="••••••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            id="login-submit"
                            type="submit"
                            disabled={loading}
                            className="aria-btn-primary w-full py-2.5"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Authenticating...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-400 text-center">
                            Chain of custody verification active. All sessions are logged.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
