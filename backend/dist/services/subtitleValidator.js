"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSubtitles = validateSubtitles;
exports.autoFixSubtitles = autoFixSubtitles;
/**
 * Validate subtitle segments for correctness
 */
function validateSubtitles(segments) {
    const errors = [];
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        // Check if text is empty
        if (!segment.text || segment.text.trim() === '') {
            errors.push({
                index: i,
                field: 'text',
                message: 'Subtitle text cannot be empty',
            });
        }
        // Check if start time is valid
        if (segment.start < 0) {
            errors.push({
                index: i,
                field: 'start',
                message: 'Start time cannot be negative',
            });
        }
        // Check if end time is valid
        if (segment.end < 0) {
            errors.push({
                index: i,
                field: 'end',
                message: 'End time cannot be negative',
            });
        }
        // Check if start < end
        if (segment.start >= segment.end) {
            errors.push({
                index: i,
                field: 'start',
                message: 'Start time must be less than end time',
            });
        }
        // Check for overlaps with next segment
        if (i < segments.length - 1) {
            const nextSegment = segments[i + 1];
            if (segment.end > nextSegment.start) {
                errors.push({
                    index: i,
                    field: 'end',
                    message: `Overlaps with next subtitle (ends at ${segment.end.toFixed(2)}s, next starts at ${nextSegment.start.toFixed(2)}s)`,
                });
            }
        }
    }
    return errors;
}
/**
 * Auto-fix small gaps and overlaps in subtitle timing
 */
function autoFixSubtitles(segments) {
    const fixed = [...segments];
    const GAP_THRESHOLD = 0.1; // 100ms
    for (let i = 0; i < fixed.length - 1; i++) {
        const current = fixed[i];
        const next = fixed[i + 1];
        // Fix overlaps - move next start to current end
        if (current.end > next.start) {
            next.start = current.end + 0.01; // Add 10ms gap
        }
        // Fix small gaps - extend current end to next start
        const gap = next.start - current.end;
        if (gap > 0 && gap < GAP_THRESHOLD) {
            current.end = next.start - 0.01; // Leave 10ms gap
        }
    }
    return fixed;
}
