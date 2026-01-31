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

        <div className="mt-12 max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 1 & 2 - MVP Features</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Video upload and storage</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Audio extraction from video</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>AI-powered transcription with Whisper</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Smart clip detection with scoring</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Clip preview and selection UI</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">○</span>
                <span className="text-gray-400">Subtitle generation (Phase 3)</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">○</span>
                <span className="text-gray-400">Subtitle editor (Phase 4)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
