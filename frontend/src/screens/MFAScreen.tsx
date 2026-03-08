import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

/**
 * MFAScreen — S-02
 * TOTP verification after password login.
 */
export const MFAScreen: React.FC = () => {
    const navigate = useNavigate();
    const { setAccessToken, setRequiresMfa } = useAuthStore();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const factors = await supabase.auth.mfa.listFactors();
            if (factors.error) {
                setError(factors.error.message);
                setLoading(false);
                return;
            }

            const totpFactor = factors.data.totp[0];
            if (!totpFactor) {
                setError('No authenticator app enrolled on this account.');
                setLoading(false);
                return;
            }

            const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
            if (challenge.error) {
                setError(challenge.error.message);
                setLoading(false);
                return;
            }

            const verify = await supabase.auth.mfa.verify({
                factorId: totpFactor.id,
                challengeId: challenge.data.id,
                code,
            });

            if (verify.error) {
                setError(verify.error.message);
            } else {
                // Verification successful, update Zustand so App shell drops the MFA gate
                await useAuthStore.getState().checkMfa();
                navigate('/');
            }
        } catch {
            setError('Verification failed due to an unexpected error.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in">
                <div className="flex flex-col items-center mb-8">
                    <Shield className="w-12 h-12 text-forensic-amber mb-4" />
                    <h1 className="text-xl font-bold text-white">Two-Factor Authentication</h1>
                    <p className="text-navy-300 text-sm mt-1">Enter the code from your authenticator app</p>
                </div>

                <div className="bg-white rounded-xl shadow-2xl p-8">
                    <div className="flex items-center gap-3 mb-6 p-3 bg-blue-50 rounded-md border border-blue-200">
                        <KeyRound className="w-5 h-5 text-blue-600" />
                        <p className="text-sm text-blue-700">
                            MFA is required for investigators and admins.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Verification Code
                            </label>
                            <input
                                id="mfa-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                className="aria-input text-center text-2xl font-mono tracking-[0.5em]"
                                placeholder="000000"
                                required
                                autoFocus
                            />
                        </div>

                        <button
                            id="mfa-submit"
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="aria-btn-primary w-full py-2.5"
                        >
                            {loading ? 'Verifying...' : 'Verify Code'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
