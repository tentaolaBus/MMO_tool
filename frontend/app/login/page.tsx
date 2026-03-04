'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = useMemo(() => {
        if (
            typeof window === 'undefined' &&
            (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        ) {
            return null;
        }
        return createClient();
    }, []);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push('/');
        router.refresh();
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        if (!supabase) return;
        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        setMessage('Account created! You can now sign in.');
        setIsSignUp(false);
        setLoading(false);
    };

    const handleSubmit = isSignUp ? handleSignUp : handleSignIn;

    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            {isSignUp ? 'Create Account' : 'Welcome Back'}
                        </h1>
                        <p className="text-gray-500">
                            {isSignUp
                                ? 'Sign up to start using MMO Video Clipper'
                                : 'Sign in to your account'}
                        </p>
                    </div>

                    {/* Error / Success Messages */}
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                            {message}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2
                  focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all
                  text-gray-900 placeholder-gray-400"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2
                  focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all
                  text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 rounded-lg font-semibold text-white
                bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading
                                ? 'Please wait...'
                                : isSignUp
                                    ? 'Sign Up'
                                    : 'Sign In'}
                        </button>
                    </form>

                    {/* Toggle Sign In / Sign Up */}
                    <div className="mt-6 text-center text-sm text-gray-500">
                        {isSignUp ? (
                            <>
                                Already have an account?{' '}
                                <button
                                    onClick={() => {
                                        setIsSignUp(false);
                                        setError(null);
                                        setMessage(null);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    Sign In
                                </button>
                            </>
                        ) : (
                            <>
                                Don&apos;t have an account?{' '}
                                <button
                                    onClick={() => {
                                        setIsSignUp(true);
                                        setError(null);
                                        setMessage(null);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    Sign Up
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
