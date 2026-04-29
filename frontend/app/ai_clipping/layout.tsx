import AppHeader from '@/components/AppHeader';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'AI Video Clipper — Generate Viral Clips | VideoCreator',
    description:
        'Upload long-form content and let AI extract the most engaging clips. Perfect for TikTok, Instagram Reels, and YouTube Shorts.',
};

export default function AIClippingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppHeader />
            {children}
        </>
    );
}
