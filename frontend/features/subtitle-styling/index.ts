/**
 * Subtitle Styling Feature Module
 * ================================
 * ⚠️ TEMPORARILY DISABLED
 *
 * This feature is isolated for future use. The components and logic
 * exist here but are NOT imported by any active page.
 *
 * To re-enable:
 * 1. Set FEATURE_ENABLED = true
 * 2. Import components from this module into the edit page
 * 3. Add the subtitle styling UI back to the clip edit workflow
 *
 * Components available:
 * - SubtitleEditor: Full subtitle editing interface
 * - SubtitleLineItem: Single subtitle line with timing controls
 * - SubtitleOverlay: Video overlay renderer for subtitles
 * - SubtitleToggle: Toggle switch for subtitle visibility
 */

export const FEATURE_ENABLED = false;

// Conditional exports — consumers should check FEATURE_ENABLED first
export { default as SubtitleEditor } from './components/SubtitleEditor';
export { default as SubtitleLineItem } from './components/SubtitleLineItem';
export { default as SubtitleOverlay } from './components/SubtitleOverlay';
export { default as SubtitleToggle } from './components/SubtitleToggle';
