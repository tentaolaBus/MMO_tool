'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import type { ReframeProgress as ProgressT } from '@/features/video-reframing/types';

type Status = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

const STAGE_LABELS: Record<string, string> = {
  uploading: 'Uploading…',
  queued: 'Queued…',
  initializing: 'Warming up models…',
  resolving_input: 'Resolving input…',
  downloading: 'Downloading…',
  extracting_frames: 'Extracting frames…',
  detecting_subject: 'Tracking subject…',
  computing_viewport: 'Computing camera path…',
  smoothing: 'Smoothing motion…',
  crop_instructions: 'Generating crop plan…',
  rendering: 'Rendering…',
  encoding: 'Encoding…',
  saving: 'Saving…',
  completed: 'Completed',
  failed: 'Failed',
};

function stageToLabel(stage?: string): string {
  if (!stage) return 'Working…';
  return STAGE_LABELS[stage] || stage.replace(/_/g, ' ');
}

export default function ReframeProgress(props: {
  status: Status;
  progress: ProgressT | null;
  error: string | null;
  logs: Array<{ t: number; stage: string; message: string; percent: number }>;
}) {
  const pct = props.progress?.percent ?? (props.status === 'completed' ? 100 : 0);
  const stage = props.progress?.stage ?? props.status;
  const message = props.progress?.message ?? '';

  const header = useMemo(() => {
    if (props.status === 'failed') return { icon: AlertCircle, text: 'Reframe failed', color: 'text-red-400' };
    if (props.status === 'completed') return { icon: CheckCircle2, text: 'Reframe complete', color: 'text-green-500' };
    if (props.status === 'idle') return { icon: Sparkles, text: 'Ready to reframe', color: 'text-purple-500' };
    return { icon: Loader2, text: stageToLabel(stage), color: 'text-purple-500' };
  }, [props.status, stage]);

  const HeaderIcon = header.icon;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="p-5 flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 text-sm font-semibold ${header.color}`}>
          <HeaderIcon className={`size-4 ${props.status === 'uploading' || props.status === 'processing' ? 'animate-spin' : ''}`} />
          {header.text}
        </div>
        <div className="text-sm font-bold text-foreground tabular-nums">
          {Math.max(0, Math.min(100, Math.round(pct)))}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-5">
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 22 }}
            className={`h-3 rounded-full ${
              props.status === 'failed'
                ? 'bg-red-500'
                : 'bg-gradient-to-r from-purple-500 to-pink-500'
            }`}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {message || stageToLabel(stage)}
        </div>

        <AnimatePresence>
          {props.error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3"
            >
              {props.error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stage logs */}
      <div className="border-t border-border bg-muted/20">
        <div className="px-5 py-3 text-xs font-semibold text-muted-foreground">
          Stage log
        </div>
        <div className="px-5 pb-5 space-y-2">
          {props.logs.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No events yet.
            </div>
          ) : (
            props.logs.map((l) => (
              <div key={l.t} className="flex items-center justify-between gap-3 text-xs">
                <div className="text-foreground/90">
                  <span className="font-semibold">{stageToLabel(l.stage)}</span>
                  <span className="text-muted-foreground"> — {l.message}</span>
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {Math.round(l.percent)}%
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

