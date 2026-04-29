# Subtitle Styling Feature

> ⚠️ **Status: TEMPORARILY DISABLED**

## What This Feature Does

Provides a full subtitle editing interface for video clips:
- Auto-generated subtitles from Whisper transcription
- Manual text editing with timing controls (start/end time per line)
- Multiple styling options: font size, weight, color, background, position
- Real-time video overlay preview
- Final video rendering with burned-in subtitles via FFmpeg

## Why It's Disabled

The subtitle styling feature is being decoupled from the core video clipping workflow to:
1. Simplify the initial user experience
2. Allow independent development and testing
3. Reduce complexity in the clip rendering pipeline

## Components

| Component | Description |
|---|---|
| `SubtitleEditor.tsx` | Full editing interface with style controls |
| `SubtitleLineItem.tsx` | Single subtitle line with timing inputs |
| `SubtitleOverlay.tsx` | Renders subtitles over video player |
| `SubtitleToggle.tsx` | Toggle switch for subtitle visibility |

## How to Re-Enable

1. In `features/subtitle-styling/index.ts`, set `FEATURE_ENABLED = true`
2. Import components into the clip edit page:
   ```tsx
   import { FEATURE_ENABLED, SubtitleEditor } from '@/features/subtitle-styling';

   {FEATURE_ENABLED && <SubtitleEditor clipId={clipId} />}
   ```
3. Ensure the backend `/clips/:id/subtitles` endpoint is active
4. Test the full flow: generate → edit → preview → render with subtitles
