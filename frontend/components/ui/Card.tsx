import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export function Card({ className = '', children, ...props }: CardProps) {
    return (
        <div
            className={`bg-card text-card-foreground rounded-xl border border-border ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}
