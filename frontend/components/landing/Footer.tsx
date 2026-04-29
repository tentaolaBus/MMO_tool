import Link from 'next/link';
import { Video } from 'lucide-react';

const footerLinks = {
    Product: [
        { label: 'Features', href: '#features' },
        { label: 'Templates', href: '#' },
        { label: 'Pricing', href: '#' },
        { label: 'Resources', href: '#' },
    ],
    Company: [
        { label: 'About', href: '#' },
        { label: 'Blog', href: '#' },
        { label: 'Careers', href: '#' },
        { label: 'Contact', href: '#' },
    ],
    Legal: [
        { label: 'Privacy', href: '#' },
        { label: 'Terms', href: '#' },
        { label: 'Security', href: '#' },
    ],
};

export default function Footer() {
    return (
        <footer className="border-t border-border mt-20">
            <div className="container mx-auto px-4 py-12">
                <div className="grid md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div>
                        <Link href="/" className="flex items-center gap-2 mb-4">
                            <div className="size-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                <Video className="size-5 text-white" />
                            </div>
                            <span className="font-semibold text-foreground">VideoCreator</span>
                        </Link>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Create viral videos in minutes with professional AI-powered tools.
                        </p>
                    </div>

                    {/* Link Columns */}
                    {Object.entries(footerLinks).map(([category, links]) => (
                        <div key={category}>
                            <h4 className="font-semibold text-foreground mb-4">{category}</h4>
                            <ul className="space-y-2">
                                {links.map((link) => (
                                    <li key={link.label}>
                                        <a
                                            href={link.href}
                                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Copyright */}
                <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
                    © {new Date().getFullYear()} VideoCreator. All rights reserved.
                </div>
            </div>
        </footer>
    );
}
