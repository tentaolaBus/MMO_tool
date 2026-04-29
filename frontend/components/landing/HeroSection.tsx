'use client';


import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function HeroSection() {
    return (
        <section className="container mx-auto px-4 py-20 md:py-32">
            <div className="text-center max-w-4xl mx-auto">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-6">
                    <Sparkles className="size-4" />
                    <span className="text-sm font-medium">All-in-one video creation platform</span>
                </div>

                {/* Heading */}
                <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight tracking-tight">
                    Create Viral Short Videos{' '}
                    <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                        in Minutes
                    </span>
                </h1>

                {/* Subtitle */}
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
                    Professional video editing tools for TikTok, Instagram Reels, and YouTube Shorts.
                    No experience needed.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button
                        size="lg"
                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 w-full sm:w-auto shadow-lg shadow-purple-500/25"
                        onClick={() => {
                            document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                    >
                        Start Creating Free
                    </Button>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto" disabled>
                        Watch Demo
                    </Button>
                </div>

                {/* Stats */}
                <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
                    {[
                        { value: '10M+', label: 'Videos Created' },
                        { value: '500K+', label: 'Active Creators' },
                        { value: '4.9/5', label: 'User Rating' },
                    ].map((stat) => (
                        <div key={stat.label}>
                            <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                            <div className="text-sm text-muted-foreground">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
