import AppHeader from '@/components/AppHeader';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Auto Subtitles — Generate & Burn-in Captions | VideoCreator',
    description:
        'Automatically generate subtitles from any video using AI. Edit text, adjust timing, customize styling, and export with burned-in captions.',
};

export default function SubtitlesLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppHeader />
            {children}
        </>
    );
}
