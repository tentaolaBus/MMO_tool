'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function AuthButton() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Memoize the client so it's created once per component mount.
    // createClient() uses createBrowserClient which is safe to call
    // multiple times — it returns a singleton internally.
    const supabase = useMemo(() => {
        // During SSR prerender, env vars may be missing — return null
        if (
            typeof window === 'undefined' &&
            (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        ) {
            return null;
        }
        return createClient();
    }, []);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        // Get initial session
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            setLoading(false);
        });

        // Listen for auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    const handleSignOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    if (loading) {
        return (
            <div className="h-9 w-24 bg-gray-200 animate-pulse rounded-lg" />
        );
    }

    if (user) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700 hidden sm:inline-block max-w-[200px] truncate">
                    {user.email}
                </span>
                <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100
            hover:bg-gray-200 rounded-lg transition-colors duration-200"
                >
                    Logout
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600
        hover:bg-indigo-700 rounded-lg transition-colors duration-200"
        >
            Login / Sign Up
        </button>
    );
}
