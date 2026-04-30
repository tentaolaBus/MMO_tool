'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AIMode, OutputRatio, ReframeCropsJson, VideoMeta } from '@/features/video-reframing/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const BACKEND_URL = API_BASE_URL.replace(/\/api\/?$/, '');

function ratioToValue(r: OutputRatio): number {
  if (r === '9:16') return 9 / 16;
  if (r === '1:1') return 1;
  return 4 / 5;
}

type BoxXYWH = { x: number; y: number; w: number; h: number };

function bboxFromKeyframes(keyframes: NonNullable<ReframeCropsJson['meta']['keyframes']>, frame: number): BoxXYWH | null {
  if (!keyframes?.length) return null;
  // Find nearest (simple) – good enough for visualization
  let best = keyframes[0];
  let bestD = Math.abs(frame - best.frame);
  for (const k of keyframes) {
    const d = Math.abs(frame - k.frame);
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  }
  const [x, y, w, h] = best.bbox;
  return { x, y, w, h };
}

export default function VideoPreviewWithOverlay(props: {
  videoUrl: string;
  jobId: string | null;
  ratio: OutputRatio;
  meta: VideoMeta | null;
  aiMode: AIMode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const [cropsJson, setCropsJson] = useState<ReframeCropsJson | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  const targetAR = useMemo(() => ratioToValue(props.ratio), [props.ratio]);

  // Fetch crops json from backend storage once jobId exists (and keep retrying while processing).
  useEffect(() => {
    const jobId = props.jobId;
    if (!jobId) {
      setCropsJson(null);
      setOverlayStatus('idle');
      return;
    }

    let cancelled = false;
    let t: ReturnType<typeof setTimeout> | null = null;

    const url = `${BACKEND_URL}/storage/reframed/reframed_${jobId}.crops.json`;

    async function tick() {
      try {
        setOverlayStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ReframeCropsJson;
        if (cancelled) return;
        setCropsJson(json);
        setOverlayStatus('ready');
      } catch {
        if (cancelled) return;
        // During processing the file may not exist yet — keep retrying.
        setOverlayStatus((s) => (s === 'ready' ? 'ready' : 'unavailable'));
      } finally {
        if (!cancelled) t = setTimeout(tick, 1500);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [props.jobId]);

  // Draw overlay synced to current playback time.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return;

      const rect = v.getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width));
      const ch = Math.max(1, Math.round(rect.height));
      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }

      ctx.clearRect(0, 0, c.width, c.height);

      // Need intrinsic video dims to map coordinates
      const VW = v.videoWidth || props.meta?.width || 0;
      const VH = v.videoHeight || props.meta?.height || 0;
      if (!VW || !VH) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Compute displayed video box within the element (object-contain)
      const scale = Math.min(cw / VW, ch / VH);
      const dispW = VW * scale;
      const dispH = VH * scale;
      const offsetX = (cw - dispW) / 2;
      const offsetY = (ch - dispH) / 2;

      const fps = cropsJson?.meta?.fps || props.meta?.fps || 30;
      const frameIdx = Math.max(0, Math.floor((v.currentTime || 0) * fps));

      // Crop frame: from crops json if available; otherwise draw a "target frame" hint only.
      const crop = cropsJson?.crops?.[Math.min(frameIdx, (cropsJson.crops?.length || 1) - 1)];
      if (crop) {
        const x = offsetX + crop.x * scale;
        const y = offsetY + crop.y * scale;
        const w = crop.width * scale;
        const h = crop.height * scale;

        // Crop rectangle
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)'; // purple-500
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);

        // Center point (tracking point)
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.fillStyle = 'rgba(236, 72, 153, 0.95)'; // pink-500
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Subtle "safe area" grid
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
      } else {
        // Hint frame (centered) with correct aspect
        const hintH = VH;
        let hintW = hintH * targetAR;
        if (hintW > VW) hintW = VW;
        const hintX = (VW - hintW) / 2;
        const hintY = (VH - (hintW / targetAR)) / 2;
        const x = offsetX + hintX * scale;
        const y = offsetY + hintY * scale;
        const w = hintW * scale;
        const h = (hintW / targetAR) * scale;
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(x, y, w, h);
      }

      // Bounding box (only if backend provides real detections)
      const bbox = cropsJson?.meta?.keyframes ? bboxFromKeyframes(cropsJson.meta.keyframes, frameIdx) : null;
      if (bbox) {
        const x = offsetX + bbox.x * scale;
        const y = offsetY + bbox.y * scale;
        const w = bbox.w * scale;
        const h = bbox.h * scale;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)'; // blue-500
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cropsJson, props.meta, targetAR]);

  return (
    <div className="w-full">
      <div className="relative w-full rounded-2xl overflow-hidden border border-border bg-black shadow-lg">
        <video
          ref={videoRef}
          src={props.videoUrl}
          className="w-full h-[520px] md:h-[560px] object-contain bg-black"
          controls
          playsInline
          preload="metadata"
        />

        {/* Overlay canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Top-left badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-[11px] font-bold text-white/90 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {props.ratio} • {props.aiMode.toUpperCase()}
          </span>
          <AnimatePresence>
            {overlayStatus !== 'idle' && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-[11px] font-semibold text-white/80 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full"
              >
                {overlayStatus === 'ready' ? 'Overlay: live' : overlayStatus === 'loading' ? 'Overlay: loading…' : 'Overlay: waiting…'}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

