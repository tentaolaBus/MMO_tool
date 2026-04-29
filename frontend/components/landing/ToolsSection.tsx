import { Scissors, Music, Type, ShieldCheck, Layers, Workflow, SquareBottomDashedScissorsIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

const tools = [
    {
        icon: Scissors,
        iconColor: 'text-purple-500',
        iconBg: 'bg-purple-500/10',
        title: 'AI Video Clipping',
        description:
            'Drop a long video — AI finds the viral moments, scores each clip by engagement potential, and delivers ready-to-post shorts in minutes.',
        badge: 'Core',
        href: '/ai_clipping',
    },
    {
        icon: SquareBottomDashedScissorsIcon,
        iconColor: 'text-blue-500',
        iconBg: 'bg-blue-500/10',
        title: 'Smart Reframing',
        description:
            'Automatically tracks faces and action. Your content stays perfectly framed for any platform — 9:16, 1:1, or 16:9.',
        badge: 'New',
        href: '/reframe',
    },
    {
        icon: Type,
        iconColor: 'text-green-500',
        iconBg: 'bg-green-500/10',
        title: 'Auto Subtitles & Captions',
        description:
            'One click generates perfectly timed captions with trendy animations — the #1 engagement booster for short-form content.',
        badge: 'New',
        href: '/subtitles',
    },
    {
        icon: ShieldCheck,
        iconColor: 'text-pink-500',
        iconBg: 'bg-pink-500/10',
        title: 'Content Safety Scanner',
        description:
            'AI scans for copyrighted music, banned visuals, and flagged content before you post. No more surprise takedowns.',
    },
    {
        icon: Layers,
        iconColor: 'text-orange-500',
        iconBg: 'bg-orange-500/10',
        title: 'Viral Template Library',
        description:
            'Browse 500+ proven viral formats updated daily. Pick a template, drop in your footage, and publish in seconds.',
    },
    {
        icon: Workflow,
        iconColor: 'text-cyan-500',
        iconBg: 'bg-cyan-500/10',
        title: 'Workflow Automation',
        description:
            'Chain tools into custom pipelines. Upload once → clip + caption + reframe + export. Your hands-free content factory.',
    },
];

export default function ToolsSection() {
    return (
        <section id="tools" className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">
                {/* Section Header */}
                <div className="text-center mb-14">
                    <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                        Powerful Tools for Every Creator
                    </h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                        Everything you need to create, edit, and share stunning short-form videos — all in one place
                    </p>
                </div>

                {/* Tool Cards Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    {tools.map((tool) => {
                        const Icon = tool.icon;
                        const cardContent = (
                            <Card
                                key={tool.title}
                                className={`p-6 hover:shadow-lg hover:border-purple-500/20 transition-all duration-300 group relative ${'href' in tool ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
                            >
                                {/* Badge */}
                                {tool.badge && (
                                    <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                                        {tool.badge}
                                    </span>
                                )}

                                {/* Icon */}
                                <div
                                    className={`size-12 ${tool.iconBg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                                >
                                    <Icon className={`size-6 ${tool.iconColor}`} />
                                </div>

                                {/* Content */}
                                <h3 className="font-semibold text-foreground mb-2 text-lg">
                                    {tool.title}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {tool.description}
                                </p>
                            </Card>
                        );

                        return 'href' in tool ? (
                            <Link key={tool.title} href={tool.href!}>
                                {cardContent}
                            </Link>
                        ) : (
                            <div key={tool.title}>{cardContent}</div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
