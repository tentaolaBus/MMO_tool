'use client';

import React from 'react';

interface VideoPlayerProps {
    videoUrl: string;
    title?: string;
}

export default function VideoPlayer({ videoUrl, title }: VideoPlayerProps) {
    return (
        <div className="w-full bg-black rounded-lg overflow-hidden shadow-xl">
            {title && (
                <div className="bg-gray-900 px-4 py-3 border-b border-gray-700">
                    <h2 className="text-white font-semibold text-lg">{title}</h2>
                </div>
            )}
            <video
                controls
                className="w-full"
                style={{ maxHeight: '500px' }}
            >
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
}
