'use client';

import React from 'react';
import { SubtitleStyle } from '../lib/types';

/* ─── Slider Control ─────────────────────────────────────────────────────── */

function SliderControl({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">{label}</label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {value}{unit || ''}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
        </div>
    );
}

/* ─── Toggle Control ─────────────────────────────────────────────────────── */

function ToggleControl({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <div className="relative">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only"
                />
                <div
                    className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                />
                <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'
                        }`}
                />
            </div>
        </label>
    );
}

/* ─── Color Picker Control ───────────────────────────────────────────────── */

function ColorControl({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">{label}</label>
            <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500">{value}</span>
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
                />
            </div>
        </div>
    );
}

/* ─── Section Wrapper ────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h4>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface SubtitleStyleEditorProps {
    style: SubtitleStyle;
    onChange: (style: SubtitleStyle) => void;
    subtitleEnabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    subtitleCount: number;
    language: string;
}

export default function SubtitleEditor({
    style,
    onChange,
    subtitleEnabled,
    onEnabledChange,
    subtitleCount,
    language,
}: SubtitleStyleEditorProps) {
    // Helper to patch one style field
    const patch = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
        onChange({ ...style, [key]: value });
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">Subtitle Style</h3>
                <p className="text-xs text-gray-500">
                    {subtitleCount} lines • {language.toUpperCase()} • Read-only content
                </p>
            </div>

            {/* Controls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* ── Master Toggle ────────────────────────────── */}
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <ToggleControl
                        label="Subtitles Enabled"
                        checked={subtitleEnabled}
                        onChange={onEnabledChange}
                    />
                    {!subtitleEnabled && (
                        <p className="text-xs text-amber-600 mt-2">
                            ⚠️ Subtitles will not appear in the final video
                        </p>
                    )}
                </div>

                <div className={subtitleEnabled ? '' : 'opacity-40 pointer-events-none'}>
                    {/* ── Typography ──────────────────────────────── */}
                    <Section title="Typography">
                        <SliderControl
                            label="Font Size"
                            value={style.fontSize}
                            min={14}
                            max={48}
                            step={1}
                            unit="px"
                            onChange={(v) => patch('fontSize', v)}
                        />

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Font Weight</label>
                            <div className="grid grid-cols-4 gap-1">
                                {[400, 500, 600, 700, 800, 900].map((w) => (
                                    <button
                                        key={w}
                                        onClick={() => patch('fontWeight', w)}
                                        className={`px-2 py-1.5 text-xs rounded border transition-all ${style.fontWeight === w
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                            }`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <SliderControl
                            label="Letter Spacing"
                            value={style.letterSpacing}
                            min={-1}
                            max={5}
                            step={0.1}
                            unit="px"
                            onChange={(v) => patch('letterSpacing', v)}
                        />

                        <SliderControl
                            label="Line Height"
                            value={style.lineHeight}
                            min={1.0}
                            max={2.0}
                            step={0.05}
                            unit=""
                            onChange={(v) => patch('lineHeight', v)}
                        />
                    </Section>

                    {/* ── Colors ──────────────────────────────────── */}
                    <Section title="Colors">
                        <ColorControl
                            label="Text Color"
                            value={style.textColor}
                            onChange={(v) => patch('textColor', v)}
                        />

                        <ColorControl
                            label="Background Color"
                            value={style.backgroundColor}
                            onChange={(v) => patch('backgroundColor', v)}
                        />

                        <SliderControl
                            label="Background Opacity"
                            value={style.backgroundOpacity}
                            min={0}
                            max={1}
                            step={0.05}
                            unit=""
                            onChange={(v) => patch('backgroundOpacity', v)}
                        />
                    </Section>

                    {/* ── Effects ─────────────────────────────────── */}
                    <Section title="Effects">
                        <ToggleControl
                            label="Text Shadow"
                            checked={style.textShadow}
                            onChange={(v) => patch('textShadow', v)}
                        />
                    </Section>

                    {/* ── Layout ──────────────────────────────────── */}
                    <Section title="Layout">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Position</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['bottom', 'middle'] as const).map((pos) => (
                                    <button
                                        key={pos}
                                        onClick={() => patch('position', pos)}
                                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${style.position === pos
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                            }`}
                                    >
                                        {pos === 'bottom' ? '⬇ Bottom' : '⬛ Middle'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <SliderControl
                            label="Padding"
                            value={style.padding}
                            min={0}
                            max={24}
                            step={1}
                            unit="px"
                            onChange={(v) => patch('padding', v)}
                        />

                        <SliderControl
                            label="Border Radius"
                            value={style.borderRadius}
                            min={0}
                            max={20}
                            step={1}
                            unit="px"
                            onChange={(v) => patch('borderRadius', v)}
                        />
                    </Section>

                    {/* ── Presets ─────────────────────────────────── */}
                    <Section title="Quick Presets">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onChange({
                                    fontSize: 24, fontWeight: 700, textColor: '#ffffff',
                                    backgroundColor: '#000000', backgroundOpacity: 0.5,
                                    position: 'bottom', textShadow: true, borderRadius: 6,
                                    padding: 8, letterSpacing: 0.5, lineHeight: 1.3,
                                })}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                            >
                                🎬 Classic
                            </button>
                            <button
                                onClick={() => onChange({
                                    fontSize: 28, fontWeight: 900, textColor: '#ffffff',
                                    backgroundColor: '#000000', backgroundOpacity: 0,
                                    position: 'middle', textShadow: true, borderRadius: 0,
                                    padding: 0, letterSpacing: 1, lineHeight: 1.2,
                                })}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                            >
                                🔥 Bold
                            </button>
                            <button
                                onClick={() => onChange({
                                    fontSize: 22, fontWeight: 600, textColor: '#f0f0f0',
                                    backgroundColor: '#1a1a2e', backgroundOpacity: 0.7,
                                    position: 'bottom', textShadow: false, borderRadius: 12,
                                    padding: 10, letterSpacing: 0.3, lineHeight: 1.4,
                                })}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                            >
                                🌙 Dark
                            </button>
                            <button
                                onClick={() => onChange({
                                    fontSize: 20, fontWeight: 500, textColor: '#ffffff',
                                    backgroundColor: '#ff4757', backgroundOpacity: 0.85,
                                    position: 'bottom', textShadow: false, borderRadius: 4,
                                    padding: 6, letterSpacing: 0.2, lineHeight: 1.3,
                                })}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                            >
                                ❤️ Accent
                            </button>
                        </div>
                    </Section>
                </div>{/* end of disabled wrapper */}
            </div>
        </div>
    );
}
