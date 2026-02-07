'use client';

import { useState } from 'react';
import VideoUpload from '@/components/VideoUpload';
import JobStatus from '@/components/JobStatus';

export default function Home() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleUploadSuccess = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  const handleNewUpload = () => {
    setCurrentJobId(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            MMO Video Clipper
          </h1>
          <p className="text-gray-600">
            Transform long videos into viral short clips with AI-powered transcription
          </p>
        </div>

        {!currentJobId ? (
          <VideoUpload />
        ) : (
          <div className="space-y-4">
            <JobStatus jobId={currentJobId} />

            <div className="text-center">
              <button
                onClick={handleNewUpload}
                className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-md
                  hover:bg-gray-700 transition-colors duration-200"
              >
                Upload Another Video
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
