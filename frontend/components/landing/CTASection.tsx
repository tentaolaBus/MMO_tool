'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function CTASection() {
    return (
        <section className="container mx-auto px-4 py-20">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 md:p-12 text-center text-white relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute -top-20 -right-20 size-64 bg-white rounded-full" />
                    <div className="absolute -bottom-20 -left-20 size-48 bg-white rounded-full" />
                </div>

                <div className="relative z-10">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Go Viral?</h2>
                    <p className="text-lg mb-8 opacity-90 max-w-2xl mx-auto">
                        Join hundreds of thousands of creators making amazing content every day
                    </p>
                    <Link href="/ai_clipping">
                        <Button
                            size="lg"
                            className="bg-white text-purple-600 hover:bg-white/90 shadow-lg font-semibold"
                        >
                            Start Creating for Free
                        </Button>
                    </Link>
                    <p className="text-sm mt-4 opacity-75">No credit card required • Free forever plan</p>
                </div>
            </div>
        </section>
    );
}
