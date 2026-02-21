import { SubtitleSegment } from '../models/subtitle';

/**
 * Frontend SubtitleStyle (received from client)
 */
export interface FrontendSubtitleStyle {
    fontSize: number;
    fontWeight: number;
    textColor: string;
    backgroundColor: string;
    backgroundOpacity: number;
    position: 'bottom' | 'middle';
    textShadow: boolean;
    borderRadius: number;
    padding: number;
    letterSpacing: number;
    lineHeight: number;
}

/**
 * Internal ASS style used for generation
 */
export interface ASSStyle {
    name?: string;
    fontName?: string;
    fontSize?: number;
    primaryColor?: string;
    outlineColor?: string;
    backColor?: string;
    outline?: number;
    shadow?: number;
    bold?: boolean;
    spacing?: number;
    alignment?: number;
    marginV?: number;
    borderStyle?: number;
}

/**
 * Convert hex color (#RRGGBB) to ASS color (&HAABBGGRR)
 * ASS format: &H<alpha><blue><green><red>
 */
function hexToASSColor(hex: string, opacity: number = 1): string {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0').toUpperCase();
    return `&H${alpha}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

/**
 * Convert frontend SubtitleStyle → ASSStyle
 */
export function frontendStyleToASS(style: FrontendSubtitleStyle): ASSStyle {
    return {
        name: 'Default',
        fontName: 'Arial',
        fontSize: style.fontSize,
        primaryColor: hexToASSColor(style.textColor, 1),
        outlineColor: style.textShadow ? '&H00000000' : '&H00000000',
        backColor: hexToASSColor(style.backgroundColor, style.backgroundOpacity),
        outline: style.textShadow ? 2 : 0,
        shadow: style.textShadow ? 1 : 0,
        bold: style.fontWeight >= 700,
        spacing: style.letterSpacing,
        alignment: style.position === 'middle' ? 5 : 2,
        marginV: style.padding * 2,
        borderStyle: style.backgroundOpacity > 0.01 ? 3 : 1,
    };
}

/**
 * Generate ASS subtitle content from segments + style
 */
export function generateASS(segments: SubtitleSegment[], style?: ASSStyle): string {
    const defaultStyle: ASSStyle = {
        name: 'Default',
        fontName: 'Arial',
        fontSize: 52,
        primaryColor: '&H00FFFFFF',
        outlineColor: '&H00000000',
        backColor: '&H80000000',
        outline: 2,
        shadow: 1,
        bold: true,
        spacing: 0,
        alignment: 2,
        marginV: 20,
        borderStyle: 1,
    };

    const s = { ...defaultStyle, ...style };

    const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${s.name},${s.fontName},${s.fontSize},${s.primaryColor},&H000000FF,${s.outlineColor},${s.backColor},${s.bold ? -1 : 0},0,0,0,100,100,${s.spacing ?? 0},0,${s.borderStyle ?? 1},${s.outline},${s.shadow},${s.alignment},10,10,${s.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = segments.map((seg) => {
        const start = formatASSTime(seg.start);
        const end = formatASSTime(seg.end);
        const text = escapeASSText(seg.text);
        return `Dialogue: 0,${start},${end},${s.name},,0,0,0,,${text}`;
    }).join('\n');

    return header + events;
}

/**
 * Format seconds to ASS time (H:MM:SS.CC)
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
