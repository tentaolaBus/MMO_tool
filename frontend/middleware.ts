import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware for the frontend application.
 *
 * Tool routes (/ai_clipping, /reframe, /subtitles) are public — no auth required.
 * Other routes pass through Supabase session management.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public tool routes — bypass auth entirely
    const publicToolRoutes = ['/ai_clipping', '/reframe', '/subtitles'];
    if (publicToolRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // For all other routes, try Supabase session (but don't crash if it fails)
    try {
        const { updateSession } = await import('@/lib/supabase/middleware');
        return await updateSession(request);
    } catch {
        // If Supabase middleware fails, just pass through
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder assets
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
