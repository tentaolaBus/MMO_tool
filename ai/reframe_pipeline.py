import argparse
import json
import math
import os
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import cv2
import numpy as np
import ffmpeg
from ultralytics import YOLO


# ──────────────────────────────────────────────────────────────────────────────
#  Progress + logging
# ──────────────────────────────────────────────────────────────────────────────

def _now_ms() -> int:
    return int(time.time() * 1000)


class ProgressEmitter:
    def __init__(self, emit_json: bool):
        self.emit_json = emit_json
        self.last_percent = -1
        self.started_ms = _now_ms()

    def log(self, msg: str) -> None:
        print(f"[REFRAME] {msg}", flush=True)

    def progress(self, percent: int, stage: str, message: str) -> None:
        percent = int(max(0, min(100, percent)))
        if percent == self.last_percent and self.emit_json:
            return
        self.last_percent = percent
        if self.emit_json:
            print(json.dumps({"type": "progress", "percent": percent, "stage": stage, "message": message}), flush=True)
        else:
            elapsed = (_now_ms() - self.started_ms) / 1000.0
            self.log(f"{percent:3d}% [{stage}] {message} (t={elapsed:.1f}s)")

    def result(self, payload: Dict) -> None:
        if self.emit_json:
            print(json.dumps({"type": "result", **payload}), flush=True)
        else:
            self.log(f"RESULT {payload}")


# ──────────────────────────────────────────────────────────────────────────────
#  Geometry / tracking utils
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Box:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float = 0.0
    cls: str = "person"

    @property
    def w(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def h(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.w * self.h

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0

    def clamp(self, W: int, H: int) -> "Box":
        return Box(
            x1=float(max(0, min(W - 1, self.x1))),
            y1=float(max(0, min(H - 1, self.y1))),
            x2=float(max(0, min(W - 1, self.x2))),
            y2=float(max(0, min(H - 1, self.y2))),
            score=self.score,
            cls=self.cls,
        )


def iou(a: Box, b: Box) -> float:
    inter_x1 = max(a.x1, b.x1)
    inter_y1 = max(a.y1, b.y1)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)
    iw = max(0.0, inter_x2 - inter_x1)
    ih = max(0.0, inter_y2 - inter_y1)
    inter = iw * ih
    union = a.area + b.area - inter
    return float(inter / union) if union > 1e-9 else 0.0


def parse_aspect_ratio(s: str) -> float:
    # Returns width/height
    parts = s.split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid aspect ratio: {s}")
    w = float(parts[0])
    h = float(parts[1])
    if w <= 0 or h <= 0:
        raise ValueError(f"Invalid aspect ratio: {s}")
    return w / h


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def exp_smooth(prev: float, curr: float, alpha: float) -> float:
    return alpha * curr + (1.0 - alpha) * prev


# ──────────────────────────────────────────────────────────────────────────────
#  Detection / selection
# ──────────────────────────────────────────────────────────────────────────────

class SubjectDetector:
    def __init__(
        self,
        person_model: str = "yolov8n.pt",
        face_model: Optional[str] = None,
        conf: float = 0.35,
        iou_thres: float = 0.5,
        device: Optional[str] = None,
        emitter: Optional[ProgressEmitter] = None,
    ):
        self.emitter = emitter
        self.person = YOLO(person_model)
        self.face = None
        if face_model:
            try:
                self.face = YOLO(face_model)
            except Exception as e:
                if self.emitter:
                    self.emitter.log(f"Face model load failed, continuing without face priority: {e}")
                self.face = None
        self.conf = conf
        self.iou_thres = iou_thres
        self.device = device

    def detect_people(self, frame_bgr: np.ndarray) -> List[Box]:
        res = self.person.predict(
            source=frame_bgr,
            conf=self.conf,
            iou=self.iou_thres,
            verbose=False,
            device=self.device,
        )[0]
        boxes: List[Box] = []
        if res.boxes is None or len(res.boxes) == 0:
            return boxes
        # COCO class 0 = person
        for b in res.boxes:
            cls_id = int(b.cls.item()) if b.cls is not None else -1
            if cls_id != 0:
                continue
            x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
            score = float(b.conf.item()) if b.conf is not None else 0.0
            boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, score=score, cls="person"))
        return boxes

    def detect_faces(self, frame_bgr: np.ndarray) -> List[Box]:
        if self.face is None:
            return []
        res = self.face.predict(
            source=frame_bgr,
            conf=max(0.25, self.conf - 0.1),
            iou=self.iou_thres,
            verbose=False,
            device=self.device,
        )[0]
        boxes: List[Box] = []
        if res.boxes is None or len(res.boxes) == 0:
            return boxes
        for b in res.boxes:
            x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
            score = float(b.conf.item()) if b.conf is not None else 0.0
            boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, score=score, cls="face"))
        return boxes


def choose_focus(
    people: List[Box],
    faces: List[Box],
    W: int,
    H: int,
    face_priority: bool = True,
) -> Optional[Box]:
    if face_priority and faces:
        # Prefer best face (largest area, then center proximity)
        cx0, cy0 = W / 2.0, H / 2.0

        def face_key(b: Box) -> Tuple[float, float, float]:
            dist = math.hypot(b.cx - cx0, b.cy - cy0)
            return (b.area, -dist, b.score)

        return sorted(faces, key=face_key, reverse=True)[0]

    if not people:
        return None

    cx0, cy0 = W / 2.0, H / 2.0

    def person_key(b: Box) -> Tuple[float, float, float]:
        dist = math.hypot(b.cx - cx0, b.cy - cy0)
        return (b.area, -dist, b.score)

    return sorted(people, key=person_key, reverse=True)[0]


# ──────────────────────────────────────────────────────────────────────────────
#  Viewport computation + smoothing
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Crop:
    frame: int
    x: int
    y: int
    width: int
    height: int


def compute_crop_for_subject(
    subj: Box,
    W: int,
    H: int,
    target_ar: float,
    zoom: str = "auto",
) -> Tuple[float, float, float, float]:
    """
    Returns crop box as (x, y, w, h) float.
    Crop is clamped to frame bounds.
    """
    # Base: choose the largest crop that matches target aspect and fits frame.
    # target_ar = crop_w / crop_h
    max_h = float(H)
    max_w = float(W)

    # start with full height crop
    crop_h = max_h
    crop_w = crop_h * target_ar
    if crop_w > max_w:
        crop_w = max_w
        crop_h = crop_w / target_ar

    # Auto zoom: if subject is small, reduce crop to zoom in (while respecting bounds)
    if zoom == "auto":
        # Use subject height as anchor; aim subject height ~ 55% of crop height
        desired_crop_h = float(subj.h / 0.55) if subj.h > 1 else crop_h
        desired_crop_h = max(min(desired_crop_h, max_h), max_h * 0.55)  # don't zoom too aggressively
        desired_crop_w = desired_crop_h * target_ar
        if desired_crop_w <= max_w and desired_crop_h <= max_h:
            crop_w, crop_h = desired_crop_w, desired_crop_h

    # Center on subject
    cx, cy = subj.cx, subj.cy
    x = cx - crop_w / 2.0
    y = cy - crop_h / 2.0

    # Clamp
    x = max(0.0, min(x, max_w - crop_w))
    y = max(0.0, min(y, max_h - crop_h))
    return x, y, crop_w, crop_h


def smooth_crops(
    crops: List[Tuple[float, float, float, float]],
    alpha: float,
) -> List[Tuple[float, float, float, float]]:
    if not crops:
        return crops
    out: List[Tuple[float, float, float, float]] = [crops[0]]
    px, py, pw, ph = crops[0]
    for (x, y, w, h) in crops[1:]:
        sx = exp_smooth(px, x, alpha)
        sy = exp_smooth(py, y, alpha)
        sw = exp_smooth(pw, w, alpha)
        sh = exp_smooth(ph, h, alpha)
        out.append((sx, sy, sw, sh))
        px, py, pw, ph = sx, sy, sw, sh
    return out


def interpolate_keyframes(
    keyframes: Dict[int, Tuple[float, float, float, float]],
    total_frames: int,
) -> List[Tuple[float, float, float, float]]:
    """
    Fill missing frames by linear interpolation between nearest known keyframes.
    """
    if total_frames <= 0:
        return []
    if not keyframes:
        # fallback: centered crop will be set by caller
        return [(0.0, 0.0, 0.0, 0.0) for _ in range(total_frames)]

    known = sorted(keyframes.items(), key=lambda kv: kv[0])
    out = [known[0][1] for _ in range(total_frames)]

    # fill before first
    first_i, first_v = known[0]
    for i in range(0, min(first_i, total_frames)):
        out[i] = first_v

    # fill between
    for (i0, v0), (i1, v1) in zip(known, known[1:]):
        if i0 >= total_frames:
            break
        j0 = max(0, i0)
        j1 = min(total_frames - 1, i1)
        if j1 <= j0:
            continue
        for i in range(j0, j1 + 1):
            t = (i - i0) / float(i1 - i0) if i1 != i0 else 0.0
            out[i] = (
                lerp(v0[0], v1[0], t),
                lerp(v0[1], v1[1], t),
                lerp(v0[2], v1[2], t),
                lerp(v0[3], v1[3], t),
            )

    # fill after last
    last_i, last_v = known[-1]
    for i in range(max(0, last_i), total_frames):
        out[i] = last_v

    return out


# ──────────────────────────────────────────────────────────────────────────────
#  Core pipeline
# ──────────────────────────────────────────────────────────────────────────────

def probe_video(input_path: str) -> Tuple[int, int, float, float, int]:
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {input_path}")
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = (frames / fps) if fps > 0 and frames > 0 else 0.0
    cap.release()
    return W, H, fps, duration, frames


def iter_frames(cap: cv2.VideoCapture) -> Iterable[Tuple[int, np.ndarray]]:
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        yield idx, frame
        idx += 1


def resize_for_detection(frame: np.ndarray, max_side: int) -> Tuple[np.ndarray, float]:
    H, W = frame.shape[:2]
    scale = 1.0
    m = max(H, W)
    if m > max_side:
        scale = max_side / float(m)
        frame = cv2.resize(frame, (int(W * scale), int(H * scale)), interpolation=cv2.INTER_AREA)
    return frame, scale


def scale_box(b: Box, inv_scale: float) -> Box:
    return Box(
        x1=b.x1 * inv_scale,
        y1=b.y1 * inv_scale,
        x2=b.x2 * inv_scale,
        y2=b.y2 * inv_scale,
        score=b.score,
        cls=b.cls,
    )


def build_crops(
    input_path: str,
    clip_id: str,
    target_ar_s: str,
    detect_fps: float,
    max_side: int,
    alpha: float,
    face_priority: bool,
    zoom: str,
    emitter: ProgressEmitter,
) -> Tuple[List[Crop], Dict]:
    W, H, fps, duration, total_frames = probe_video(input_path)
    if fps <= 0:
        fps = 30.0
    target_ar = parse_aspect_ratio(target_ar_s)

    emitter.log(f"Input: {input_path}")
    emitter.log(f"Video: {W}x{H} fps={fps:.3f} frames={total_frames} duration={duration:.2f}s")
    emitter.progress(10, "extracting_frames", "Reading frames...")

    detector = SubjectDetector(
        person_model=os.environ.get("REFRAME_PERSON_MODEL", "yolov8n.pt"),
        face_model=os.environ.get("REFRAME_FACE_MODEL", None),
        conf=float(os.environ.get("REFRAME_CONF", "0.35")),
        emitter=emitter,
    )

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {input_path}")

    # We detect at reduced FPS by skipping frames.
    detect_stride = max(1, int(round(fps / max(1.0, detect_fps))))

    keyframes: Dict[int, Box] = {}
    prev_subj: Optional[Box] = None
    iou_match_thres = 0.2

    t0 = time.time()
    for idx, frame in iter_frames(cap):
        if idx % detect_stride != 0:
            continue

        # Detection
        frame_small, scale = resize_for_detection(frame, max_side=max_side)
        inv_scale = 1.0 / scale

        people = [scale_box(b, inv_scale) for b in detector.detect_people(frame_small)]
        faces = [scale_box(b, inv_scale) for b in detector.detect_faces(frame_small)]

        focus = choose_focus(people, faces, W=W, H=H, face_priority=face_priority)

        # Simple tracking: keep consistent subject when possible (IoU match)
        if prev_subj is not None and focus is not None and people:
            # Find the best match in this frame to previous subject among people boxes.
            best = None
            best_i = 0.0
            for b in people:
                ii = iou(prev_subj, b)
                if ii > best_i:
                    best_i = ii
                    best = b
            if best is not None and best_i >= iou_match_thres:
                focus = best

        if focus is not None:
            keyframes[idx] = focus.clamp(W, H)
            prev_subj = keyframes[idx]

        # Progress: roughly map detection pass to 10..55
        if total_frames > 0:
            pct = 10 + int(45 * (idx / float(total_frames)))
            emitter.progress(min(55, pct), "detecting_subject", "Detecting person/face and tracking...")

    cap.release()
    emitter.log(f"Detection done: {len(keyframes)} keyframes (stride={detect_stride}) in {time.time() - t0:.1f}s")

    # Convert keyframe subjects to keyframe crops
    crop_keyframes: Dict[int, Tuple[float, float, float, float]] = {}
    for fidx, subj in keyframes.items():
        crop_keyframes[fidx] = compute_crop_for_subject(subj, W=W, H=H, target_ar=target_ar, zoom=zoom)

    # Fallback if nothing detected: center crop
    if not crop_keyframes:
        emitter.log("No subject detected. Falling back to center crop.")
        # center crop at best-fit aspect
        crop_h = float(H)
        crop_w = crop_h * target_ar
        if crop_w > W:
            crop_w = float(W)
            crop_h = crop_w / target_ar
        crop_keyframes[0] = ((W - crop_w) / 2.0, (H - crop_h) / 2.0, crop_w, crop_h)

    emitter.progress(60, "computing_viewport", "Computing viewport per frame...")
    per_frame = interpolate_keyframes(crop_keyframes, total_frames=total_frames if total_frames > 0 else 0)

    # Smooth camera motion (critical)
    emitter.progress(70, "smoothing", "Smoothing camera motion...")
    smoothed = smooth_crops(per_frame, alpha=alpha)

    # Clamp and quantize to ints
    emitter.progress(75, "crop_instructions", "Generating crop instructions...")
    crops: List[Crop] = []
    for i, (x, y, w, h) in enumerate(smoothed):
        if w <= 0 or h <= 0:
            # if video frame count unknown, we won't get here; but be safe
            continue
        x = max(0.0, min(x, W - w))
        y = max(0.0, min(y, H - h))
        crops.append(Crop(frame=i, x=int(round(x)), y=int(round(y)), width=int(round(w)), height=int(round(h))))

    meta = {
        "clipId": clip_id,
        "input": input_path,
        "width": W,
        "height": H,
        "fps": fps,
        "duration": duration,
        "frames": total_frames,
        "detect_stride": detect_stride,
        "detect_fps": detect_fps,
        "target_aspect": target_ar_s,
        "alpha": alpha,
        "zoom": zoom,
        "face_priority": face_priority,
    }
    return crops, meta


def render_video_opencv_then_ffmpeg_audio(
    input_path: str,
    output_path: str,
    crops: List[Crop],
    target_ar_s: str,
    emitter: ProgressEmitter,
) -> Tuple[str, str]:
    """
    Render with OpenCV (frame-accurate dynamic crop) and then mux audio from source via ffmpeg.
    Produces:
      - output_path (final mp4)
      - crops_json_path
    """
    W, H, fps, duration, total_frames = probe_video(input_path)
    if fps <= 0:
        fps = 30.0
    target_ar = parse_aspect_ratio(target_ar_s)

    if total_frames <= 0 and crops:
        total_frames = crops[-1].frame + 1

    # Determine output dimensions (9:16) at crop resolution, then scale to a sane size
    # We'll output at 1080x1920 if possible, else scale based on crop height.
    out_h = 1920
    out_w = int(round(out_h * target_ar))
    if out_w <= 0:
        out_w = 1080
        out_h = int(round(out_w / target_ar))

    # Intermediate (no audio) video
    tmp_dir = tempfile.mkdtemp(prefix="reframe_")
    tmp_no_audio = os.path.join(tmp_dir, "no_audio.mp4")

    emitter.progress(78, "rendering", "Rendering cropped frames...")
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {input_path}")

    # OpenCV VideoWriter (H.264) may depend on system codecs; use mp4v for compatibility.
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_no_audio, fourcc, fps, (out_w, out_h))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("OpenCV VideoWriter could not be opened. Ensure codecs are available.")

    crop_by_frame: Dict[int, Crop] = {c.frame: c for c in crops}
    last_crop = crops[0] if crops else Crop(frame=0, x=0, y=0, width=W, height=H)

    for idx, frame in iter_frames(cap):
        c = crop_by_frame.get(idx, last_crop)
        last_crop = c
        x, y, w, h = c.x, c.y, c.width, c.height
        x = max(0, min(x, W - 1))
        y = max(0, min(y, H - 1))
        w = max(2, min(w, W - x))
        h = max(2, min(h, H - y))

        cropped = frame[y:y + h, x:x + w]
        resized = cv2.resize(cropped, (out_w, out_h), interpolation=cv2.INTER_AREA)
        writer.write(resized)

        if total_frames > 0 and idx % max(1, int(fps)) == 0:
            # Every ~1s, update progress 78..92
            pct = 78 + int(14 * (idx / float(total_frames)))
            emitter.progress(min(92, pct), "rendering", "Rendering cropped frames...")

    cap.release()
    writer.release()

    emitter.progress(93, "encoding", "Muxing audio and finalizing output (ffmpeg)...")

    # ffmpeg: mux audio from input (if present) into tmp_no_audio
    # - If input has no audio, this will still produce a valid mp4.
    try:
        in_v = ffmpeg.input(tmp_no_audio)
        in_a = ffmpeg.input(input_path)
        # Map video from rendered; audio from original, re-encode to AAC for compatibility.
        (
            ffmpeg
            .output(
                in_v.video,
                in_a.audio,
                output_path,
                vcodec="libx264",
                acodec="aac",
                audio_bitrate="192k",
                movflags="+faststart",
                pix_fmt="yuv420p",
                r=fps,
            )
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as e:
        # Fallback: output video only (no audio)
        emitter.log("ffmpeg audio mux failed; falling back to video-only output.")
        emitter.log((e.stderr or b"").decode("utf-8", errors="ignore")[-1500:])
        (
            ffmpeg
            .input(tmp_no_audio)
            .output(output_path, vcodec="libx264", movflags="+faststart", pix_fmt="yuv420p", r=fps)
            .overwrite_output()
            .run(quiet=True)
        )

    shutil.rmtree(tmp_dir, ignore_errors=True)

    crops_json_path = os.path.splitext(output_path)[0] + ".crops.json"
    return output_path, crops_json_path


def main() -> int:
    ap = argparse.ArgumentParser(description="AI Reframe pipeline (YOLOv8 + tracking + smoothing).")
    ap.add_argument("--input", required=True, help="Input video path")
    ap.add_argument("--output", required=True, help="Output mp4 path")
    ap.add_argument("--clip-id", required=True, help="Clip id (used for metadata)")
    ap.add_argument("--aspect", default="9:16", help="Target aspect ratio like 9:16")
    ap.add_argument("--detect-fps", type=float, default=8.0, help="Detection FPS (reduce for speed)")
    ap.add_argument("--max-side", type=int, default=960, help="Resize max side for detection")
    ap.add_argument("--alpha", type=float, default=0.25, help="Exponential smoothing alpha (0-1)")
    ap.add_argument("--zoom", choices=["auto", "none"], default="auto", help="Auto zoom when subject is small")
    ap.add_argument("--face-priority", action="store_true", help="If face model is available, prefer faces")
    ap.add_argument("--emit-progress-json", action="store_true", help="Emit JSON progress events to stdout")
    args = ap.parse_args()

    emitter = ProgressEmitter(emit_json=bool(args.emit_progress_json))

    if not os.path.exists(args.input):
        emitter.progress(0, "failed", f"Input not found: {args.input}")
        return 2

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    emitter.progress(5, "initializing", "Loading models...")
    try:
        crops, meta = build_crops(
            input_path=args.input,
            clip_id=args.clip_id,
            target_ar_s=args.aspect,
            detect_fps=args.detect_fps,
            max_side=args.max_side,
            alpha=max(0.01, min(0.95, args.alpha)),
            face_priority=bool(args.face_priority),
            zoom=args.zoom,
            emitter=emitter,
        )
    except Exception as e:
        emitter.progress(0, "failed", f"Detection/tracking failed: {e}")
        return 3

    # Write crop instructions JSON (required output artifact)
    crops_json_path = os.path.splitext(args.output)[0] + ".crops.json"
    try:
        with open(crops_json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "meta": meta,
                    "crops": [c.__dict__ for c in crops],
                },
                f,
                indent=2,
            )
    except Exception as e:
        emitter.log(f"Failed to write crops json: {e}")

    emitter.progress(77, "rendering", "Rendering output video...")
    try:
        out_path, crops_json_path2 = render_video_opencv_then_ffmpeg_audio(
            input_path=args.input,
            output_path=args.output,
            crops=crops,
            target_ar_s=args.aspect,
            emitter=emitter,
        )
        if crops_json_path2 != crops_json_path and os.path.exists(crops_json_path):
            # Keep path stable with output basename
            pass
    except Exception as e:
        emitter.progress(0, "failed", f"Render failed: {e}")
        return 4

    emitter.progress(100, "completed", "Reframe complete")
    emitter.result(
        {
            "clipId": args.clip_id,
            "outputPath": os.path.abspath(args.output),
            "cropsPath": os.path.abspath(crops_json_path),
            "status": "completed",
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

