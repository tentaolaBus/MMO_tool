import { SubtitleSegment } from '../models/subtitle';

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle format
 * This format allows for styling and is supported by FFmpeg
 */
export function generateASS(segments: SubtitleSegment[], style?: ASSStyle): string {
    const defaultStyle: ASSStyle = {
        name: 'Default',
        fontName: 'Arial',
        fontSize: 52,
        primaryColor: '&H00FFFFFF', // White
        outlineColor: '&H00000000', // Black
        outline: 2,
        shadow: 1,
        bold: true,
        alignment: 2, // Bottom center
        marginV: 20,
    };

    const finalStyle = { ...defaultStyle, ...style };

    const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${finalStyle.name},${finalStyle.fontName},${finalStyle.fontSize},${finalStyle.primaryColor},&H000000FF,${finalStyle.outlineColor},&H00000000,${finalStyle.bold ? -1 : 0},0,0,0,100,100,0,0,1,${finalStyle.outline},${finalStyle.shadow},${finalStyle.alignment},10,10,${finalStyle.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = segments.map((seg, idx) => {
        const start = formatASSTime(seg.start);
        const end = formatASSTime(seg.end);
        const text = escapeASSText(seg.text);

        return `Dialogue: 0,${start},${end},${finalStyle.name},,0,0,0,,${text}`;
    }).join('\n');

    return header + events;
}

/**
 * Format seconds to ASS time format (H:MM:SS.CC)
 */
function formatASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Escape special characters in ASS text
 */
function escapeASSText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\N')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');
}

export interface ASSStyle {
    name?: string;
    fontName?: string;
    fontSize?: number;
    primaryColor?: string;
    outlineColor?: string;
    outline?: number;
    shadow?: number;
    bold?: boolean;
    alignment?: number;
    marginV?: number;
}
