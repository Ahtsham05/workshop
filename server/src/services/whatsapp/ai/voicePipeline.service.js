const config = require('../../../config/config');
const logger = require('../../../config/logger');
const mediaService = require('../media.service');
const messagingService = require('../messaging.service');
const queryResolver = require('./queryResolver.service');

async function transcribeAudio(mediaUrl, buffer) {
  if (!config.gemini.apiKey) return null;
  try {
    const audioBuffer = buffer || (mediaUrl ? Buffer.from(await (await fetch(mediaUrl)).arrayBuffer()) : null);
    if (!audioBuffer) return null;

    const base64 = audioBuffer.toString('base64');
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.gemini.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: 'Transcribe this voice message. Return only the transcribed text in the original language (English, Urdu, Punjabi, or Roman Urdu).' },
                { inline_data: { mime_type: 'audio/ogg', data: base64 } },
              ],
            },
          ],
        }),
      },
    );
    const body = await res.json();
    return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn('Voice transcription failed:', err.message);
    return null;
  }
}

async function synthesizeSpeech(text, language = 'en') {
  // Architecture hook for Google Cloud TTS / ElevenLabs — optional phase
  return { audioUrl: null, supported: false, language, textPreview: text.slice(0, 100) };
}

module.exports = { transcribeAudio, synthesizeSpeech };
