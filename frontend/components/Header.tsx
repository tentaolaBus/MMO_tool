import Link from 'next/link';
import AuthButton from './AuthButton';

export default function Header() {
    return (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
            <div className="container mx-auto px-4 h-14 flex items-center justify-between">
                <Link
                    href="/"
                    className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                >
                    MMO Video Clipper
                </Link>
                <AuthButton />
            </div>
        </header>
    );
}
