// Caching instance
const ttsCache = new Map();

// Generate TTS from Google Translate
// Returns an ArrayBuffer of the MP3
export async function generateTTS(text, lang = 'bn') {
  if (!text || text.trim() === '') return null;

  const cacheKey = `${lang}_${text}`;
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey).slice(0); // Return a copy of ArrayBuffer
  }

  try {
    const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${lang}&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const arrayBuffer = await response.arrayBuffer();
    ttsCache.set(cacheKey, arrayBuffer);
    return arrayBuffer.slice(0);
  } catch (error) {
    console.warn("Google TTS failed, fallback to none/empty buffer handling:", error);
    // Since we are exporting a video offline, window.speechSynthesis cannot be exported to an ArrayBuffer.
    // Instead we return null so the timeline engine assigns default timing.
    return null;
  }
}

// Global offline context for decoding
let decodeContext = null;

// Decodes an ArrayBuffer into an AudioBuffer using the Web Audio API
export async function decodeAudioBuffer(arrayBuffer) {
  if (!arrayBuffer) return null;
  
  if (!decodeContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    decodeContext = new AudioContext(); // Use standard context for decoding, we don't strictly need offline context just to decode
  }
  
  try {
    // decodeAudioData consumes the arrayBuffer, so ensure we always pass a copy
    return await decodeContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("Failed to decode audio:", err);
    return null;
  }
}

export function preprocessOptionText(text) {
  // Try to remove generic "A. " "1. ", though we already store clean text from the Smart Parser.
  const clean = text.replace(/^[A-D1-4]\.\s*/i, '').trim();
  return clean;
}
