import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'ghost' | 'outline';
    size?: 'default' | 'lg';
    children: React.ReactNode;
}

export function Button({
    variant = 'default',
    size = 'default',
    className = '',
    children,
    ...props
}: ButtonProps) {
    const base =
        'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none';

    const variants: Record<string, string> = {
        default: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm',
        ghost: 'text-foreground hover:bg-muted',
        outline: 'border border-border text-foreground hover:bg-muted',
    };

    const sizes: Record<string, string> = {
        default: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    return (
        <button
            className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
