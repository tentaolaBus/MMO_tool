import AppHeader from '@/components/AppHeader';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Reframe Video — Convert Horizontal to Vertical | VideoCreator',
    description:
        'Instantly convert horizontal (16:9) videos to vertical (9:16) format optimized for TikTok, Instagram Reels, and YouTube Shorts. Smart center crop with manual adjustment.',
};

export default function ReframeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <AppHeader />
            {children}
        </>
    );
}
