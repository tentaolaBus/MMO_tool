import AppHeader from '@/components/AppHeader';

export default function JobLayout({
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
