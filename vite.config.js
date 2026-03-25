import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Anthropic Claude API proxy — injects API key server-side
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              // Inject API key from .env if browser didn't provide one
              if (!proxyReq.getHeader('x-api-key') && env.ANTHROPIC_API_KEY) {
                proxyReq.setHeader('x-api-key', env.ANTHROPIC_API_KEY);
              }
            });
          }
        },
        // YouTube Data API v3 proxy — injects API key as query param
        '/api/youtube': {
          target: 'https://www.googleapis.com/youtube/v3',
          changeOrigin: true,
          rewrite: (path) => {
            const rewritten = path.replace(/^\/api\/youtube/, '');
            // Inject API key as query parameter
            if (env.YOUTUBE_API_KEY) {
              const separator = rewritten.includes('?') ? '&' : '?';
              return `${rewritten}${separator}key=${env.YOUTUBE_API_KEY}`;
            }
            return rewritten;
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          }
        },
        // Google Cloud TTS API proxy — injects API key as query param
        '/api/tts': {
          target: 'https://texttospeech.googleapis.com/v1',
          changeOrigin: true,
          rewrite: (path) => {
            const rewritten = path.replace(/^\/api\/tts/, '');
            if (env.GOOGLE_TTS_API_KEY) {
              const separator = rewritten.includes('?') ? '&' : '?';
              return `${rewritten}${separator}key=${env.GOOGLE_TTS_API_KEY}`;
            }
            return rewritten;
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          }
        },
        // Gemini API proxy — injects API key as query param
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com/v1beta',
          changeOrigin: true,
          rewrite: (path) => {
            const rewritten = path.replace(/^\/api\/gemini/, '');
            if (env.GEMINI_API_KEY) {
              const separator = rewritten.includes('?') ? '&' : '?';
              return `${rewritten}${separator}key=${env.GEMINI_API_KEY}`;
            }
            return rewritten;
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          }
        }
      }
    }
  };
})
