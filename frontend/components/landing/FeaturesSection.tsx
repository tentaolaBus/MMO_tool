import { Zap, Download, Share2, TrendingUp, Video } from 'lucide-react';

const features = [
    {
        icon: Zap,
        iconColor: 'text-purple-500',
        iconBg: 'bg-purple-500/10',
        title: 'Lightning Fast',
        description: 'Cloud-powered rendering means your videos are ready in seconds, not minutes.',
    },
    {
        icon: Download,
        iconColor: 'text-blue-500',
        iconBg: 'bg-blue-500/10',
        title: 'Export Anywhere',
        description: 'Download in any format or share directly to TikTok, Instagram, and YouTube.',
    },
    {
        icon: Share2,
        iconColor: 'text-green-500',
        iconBg: 'bg-green-500/10',
        title: 'Collaboration Made Easy',
        description: 'Share projects with your team and work together in real-time.',
    },
    {
        icon: TrendingUp,
        iconColor: 'text-pink-500',
        iconBg: 'bg-pink-500/10',
        title: 'Trending Templates',
        description: 'Access thousands of viral templates updated daily to match current trends.',
    },
];

export default function FeaturesSection() {
    return (
        <section id="features" className="container mx-auto px-4 py-20">
            <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Left: Feature List */}
                <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                        Why Creators Love Us
                    </h2>
                    <div className="space-y-6">
                        {features.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <div key={feature.title} className="flex gap-4 group">
                                    <div
                                        className={`size-10 ${feature.iconBg} rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}
                                    >
                                        <Icon className={`size-5 ${feature.iconColor}`} />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-foreground mb-1">{feature.title}</h4>
                                        <p className="text-muted-foreground text-sm leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Visual */}
                <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 h-[500px] flex items-center justify-center">
                    <div className="text-center">
                        <div className="size-32 bg-background rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                            <Video className="size-16 text-purple-500" />
                        </div>
                        <p className="text-muted-foreground text-sm">Video Preview</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
