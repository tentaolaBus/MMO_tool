'use client';

import type { SubtitleStyle } from '@/lib/types';

interface SubtitleStylePanelProps {
    style: SubtitleStyle;
    onChange: (style: SubtitleStyle) => void;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
}

function Slider({ label, value, min, max, step, unit, onChange }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {value}{unit || ''}
                </span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
        </div>
    );
}

function ColorPicker({ label, value, onChange }: {
    label: string; value: string; onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground">{value}</span>
                <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
                    className="w-7 h-7 rounded border border-border cursor-pointer p-0" />
            </div>
        </div>
    );
}

export default function SubtitleStylePanel({ style, onChange, enabled, onEnabledChange }: SubtitleStylePanelProps) {
    const patch = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
        onChange({ ...style, [key]: value });
    };

    return (
        <div className="space-y-5">
            {/* Master Toggle */}
            <label className="flex items-center justify-between cursor-pointer p-3 rounded-xl border border-border bg-muted/30">
                <span className="text-sm font-medium text-foreground">Subtitles Enabled</span>
                <div className="relative">
                    <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="sr-only" />
                    <div className={`w-10 h-5.5 rounded-full transition-colors ${enabled ? 'bg-amber-500' : 'bg-muted'}`} />
                    <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-[18px]' : ''}`} />
                </div>
            </label>

            <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
                {/* Typography */}
                <div className="space-y-3 mb-5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Typography</h4>
                    <Slider label="Font Size" value={style.fontSize} min={14} max={48} step={1} unit="px" onChange={(v) => patch('fontSize', v)} />
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Weight</label>
                        <div className="grid grid-cols-4 gap-1">
                            {[400, 600, 700, 900].map((w) => (
                                <button key={w} onClick={() => patch('fontWeight', w)}
                                    className={`px-2 py-1.5 text-[11px] rounded-lg border transition-all ${style.fontWeight === w
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'border-border text-muted-foreground hover:border-amber-400/40'
                                    }`}>{w}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Colors */}
                <div className="space-y-3 mb-5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Colors</h4>
                    <ColorPicker label="Text Color" value={style.textColor} onChange={(v) => patch('textColor', v)} />
                    <ColorPicker label="Background" value={style.backgroundColor} onChange={(v) => patch('backgroundColor', v)} />
                    <Slider label="BG Opacity" value={style.backgroundOpacity} min={0} max={1} step={0.05} onChange={(v) => patch('backgroundOpacity', v)} />
                </div>

                {/* Effects */}
                <div className="space-y-3 mb-5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Effects</h4>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-muted-foreground">Text Shadow</span>
                        <div className="relative">
                            <input type="checkbox" checked={style.textShadow} onChange={(e) => patch('textShadow', e.target.checked)} className="sr-only" />
                            <div className={`w-9 h-5 rounded-full transition-colors ${style.textShadow ? 'bg-amber-500' : 'bg-muted'}`} />
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${style.textShadow ? 'translate-x-4' : ''}`} />
                        </div>
                    </label>
                </div>

                {/* Position */}
                <div className="space-y-3 mb-5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Position</h4>
                    <div className="grid grid-cols-3 gap-1.5">
                        {(['top', 'middle', 'bottom'] as const).map((pos) => (
                            <button key={pos} onClick={() => patch('position', pos as any)}
                                className={`px-2 py-2 text-xs font-medium rounded-lg border transition-all capitalize ${style.position === pos
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : 'border-border text-muted-foreground hover:border-amber-400/40'
                                }`}>{pos}</button>
                        ))}
                    </div>
                </div>

                {/* Presets */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quick Presets</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onChange({
                            fontSize: 24, fontWeight: 700, textColor: '#ffffff', backgroundColor: '#000000',
                            backgroundOpacity: 0.5, position: 'bottom', textShadow: true, borderRadius: 6,
                            padding: 8, letterSpacing: 0.5, lineHeight: 1.3,
                        })} className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:border-amber-400/40 transition">
                            🎬 Classic
                        </button>
                        <button onClick={() => onChange({
                            fontSize: 28, fontWeight: 900, textColor: '#ffffff', backgroundColor: '#000000',
                            backgroundOpacity: 0, position: 'middle', textShadow: true, borderRadius: 0,
                            padding: 0, letterSpacing: 1, lineHeight: 1.2,
                        })} className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:border-amber-400/40 transition">
                            🔥 Bold
                        </button>
                        <button onClick={() => onChange({
                            fontSize: 22, fontWeight: 600, textColor: '#f0f0f0', backgroundColor: '#1a1a2e',
                            backgroundOpacity: 0.7, position: 'bottom', textShadow: false, borderRadius: 12,
                            padding: 10, letterSpacing: 0.3, lineHeight: 1.4,
                        })} className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:border-amber-400/40 transition">
                            🌙 Dark
                        </button>
                        <button onClick={() => onChange({
                            fontSize: 20, fontWeight: 500, textColor: '#ffffff', backgroundColor: '#ff4757',
                            backgroundOpacity: 0.85, position: 'bottom', textShadow: false, borderRadius: 4,
                            padding: 6, letterSpacing: 0.2, lineHeight: 1.3,
                        })} className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:border-amber-400/40 transition">
                            ❤️ Accent
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
