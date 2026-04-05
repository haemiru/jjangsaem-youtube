import { GoogleGenerativeAI, FileState } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

export const config = {
  maxDuration: 120,
  api: { bodyParser: { sizeLimit: '50mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audioBase64, mimeType, sections } = req.body;

  if (!audioBase64) {
    return res.status(400).json({ error: 'audioBase64 is required' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const fileManager = new GoogleAIFileManager(apiKey);

    // Write audio to temp file for File API upload
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmpFile = path.join(os.tmpdir(), `stt_audio_${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, audioBuffer);

    // Upload via File API (no size limit issues)
    const uploadResult = await fileManager.uploadFile(tmpFile, {
      mimeType: mimeType || 'audio/wav',
      displayName: 'narration_audio',
    });

    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch {}

    // Wait for file processing
    let file = uploadResult.file;
    while (file.state === FileState.PROCESSING) {
      await new Promise(r => setTimeout(r, 2000));
      const getResult = await fileManager.getFile(file.name);
      file = getResult;
    }

    if (file.state === FileState.FAILED) {
      throw new Error('Audio file processing failed');
    }

    // Build section list for alignment prompt
    const sectionList = sections.map((s, i) => `${i + 1}. "${s}"`).join('\n');

    const prompt = `다음 오디오는 한국어 나레이션입니다. 이 오디오를 듣고 아래 대본 섹션들이 오디오에서 각각 몇 초에 시작하고 끝나는지 분석해주세요.

대본 섹션:
${sectionList}

중요: 각 섹션의 시작 시간과 끝 시간을 초 단위(소수점 1자리)로 정확히 알려주세요.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

[{"section":1,"startTime":0.0,"endTime":5.2},{"section":2,"startTime":5.2,"endTime":10.8}]`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { fileData: { mimeType: file.mimeType, fileUri: file.uri } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    });

    const responseText = result.response.candidates[0].content.parts
      .filter(p => p.text).map(p => p.text).join('');

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse STT alignment response: ' + responseText.substring(0, 200));
    }

    const segments = JSON.parse(jsonMatch[0]);

    // Clean up uploaded file
    try { await fileManager.deleteFile(file.name); } catch {}

    res.status(200).json({ segments });

  } catch (e) {
    console.error('STT alignment error:', e);
    const status = e.message?.includes('429') || e.message?.includes('Too Many Requests') ? 429 : 500;
    res.status(status).json({ error: e.message });
  }
}
