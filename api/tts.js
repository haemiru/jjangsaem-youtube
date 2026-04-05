import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, stylePrompt, speedRate, voiceName } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const prompt = stylePrompt ||
      '따뜻하고 친근한 목소리로, 육아에 지친 부모님께 말하듯 천천히 또렷하게 읽어주세요.';

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro-preview-tts',
    });

    const selectedVoice = voiceName || 'Kore';

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `${prompt}\n\n${text}` }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice }
          }
        }
      }
    });

    const audioData = result.response.candidates[0]
      .content.parts[0].inlineData.data; // base64 PCM

    const rate = Math.max(0.5, Math.min(3.0, parseFloat(speedRate) || 1.0));
    const wavBase64 = pcmToWav(audioData, rate);

    res.status(200).json({ audioContent: wavBase64, encoding: 'WAV' });

  } catch (e) {
    console.error('Gemini TTS error:', e);
    const status = e.message?.includes('429') || e.message?.includes('Too Many Requests') ? 429 : 500;
    res.status(status).json({ error: e.message });
  }
}

// PCM 16bit 24kHz → WAV 변환 (speedRate로 재생 속도 조절)
function pcmToWav(base64Pcm, speedRate = 1.0) {
  const pcmBuffer = Buffer.from(base64Pcm, 'base64');

  // 샘플레이트를 높이면 같은 데이터가 빠르게 재생됨 (피치도 살짝 올라감)
  const sampleRate = Math.round(24000 * speedRate);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const wav = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);

  return wav.toString('base64');
}
