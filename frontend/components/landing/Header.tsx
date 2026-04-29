'use client';

import Link from 'next/link';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import AuthButton from '@/components/AuthButton';

export default function LandingHeader() {
    return (
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="size-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Video className="size-5 text-white" />
                    </div>
                    <span className="font-semibold text-foreground">VideoCreator</span>
                </Link>

                {/* Navigation */}
                <nav className="hidden md:flex items-center gap-6">
                    <a href="#tools" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                        Tools
                    </a>
                    <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                        Features
                    </a>
                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                        Pricing
                    </a>
                </nav>

                {/* Auth */}
                <div className="flex items-center gap-3">
                    <AuthButton />
                </div>
            </div>
        </header>
    );
}
