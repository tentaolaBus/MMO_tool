import translate from 'google-translate-api-x';

/**
 * Language code mapping
 * User-facing codes -> Google Translate API codes
 */
const LANG_CODE_MAP: { [key: string]: string } = {
    en: 'en',
    vi: 'vi',
    jp: 'ja',  // Japanese
    kr: 'ko',  // Korean
    cn: 'zh-CN', // Chinese Simplified
};

/**
 * Translate text to target language
 */
export async function translateText(
    text: string,
    targetLang: string
): Promise<string> {
    // English is the original language, no translation needed
    if (targetLang === 'en') {
        return text;
    }

    // Map user-facing language code to Google Translate code
    const googleLangCode = LANG_CODE_MAP[targetLang] || targetLang;

    try {
        const result = await translate(text, { to: googleLangCode });
        return result.text;
    } catch (error: any) {
        console.error(`Translation error for "${text}" to ${targetLang}:`, error);
        // Fallback to original text if translation fails
        return text;
    }
}

/**
 * Translate multiple segments
 */
export async function translateSegments(
    segments: Array<{ text: string }>,
    targetLang: string
): Promise<string[]> {
    // Translate all segments in parallel
    const translationPromises = segments.map((seg) =>
        translateText(seg.text, targetLang)
    );

    return Promise.all(translationPromises);
}

/**
 * Get language name for display
 */
export function getLanguageName(langCode: string): string {
    const names: { [key: string]: string } = {
        en: 'English',
        vi: 'Vietnamese',
        jp: 'Japanese',
        kr: 'Korean',
        cn: 'Chinese',
    };

    return names[langCode] || langCode;
}
