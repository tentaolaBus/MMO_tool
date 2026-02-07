"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateText = translateText;
exports.translateSegments = translateSegments;
exports.getLanguageName = getLanguageName;
const google_translate_api_x_1 = __importDefault(require("google-translate-api-x"));
/**
 * Language code mapping
 * User-facing codes -> Google Translate API codes
 */
const LANG_CODE_MAP = {
    en: 'en',
    vi: 'vi',
    jp: 'ja', // Japanese
    kr: 'ko', // Korean
    cn: 'zh-CN', // Chinese Simplified
};
/**
 * Translate text to target language
 */
async function translateText(text, targetLang) {
    // English is the original language, no translation needed
    if (targetLang === 'en') {
        return text;
    }
    // Map user-facing language code to Google Translate code
    const googleLangCode = LANG_CODE_MAP[targetLang] || targetLang;
    try {
        const result = await (0, google_translate_api_x_1.default)(text, { to: googleLangCode });
        return result.text;
    }
    catch (error) {
        console.error(`Translation error for "${text}" to ${targetLang}:`, error);
        // Fallback to original text if translation fails
        return text;
    }
}
/**
 * Translate multiple segments
 */
async function translateSegments(segments, targetLang) {
    // Translate all segments in parallel
    const translationPromises = segments.map((seg) => translateText(seg.text, targetLang));
    return Promise.all(translationPromises);
}
/**
 * Get language name for display
 */
function getLanguageName(langCode) {
    const names = {
        en: 'English',
        vi: 'Vietnamese',
        jp: 'Japanese',
        kr: 'Korean',
        cn: 'Chinese',
    };
    return names[langCode] || langCode;
}
