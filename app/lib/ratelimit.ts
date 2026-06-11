import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 10 transcription requests per user per minute (sliding window).
// Prevents a single account from spamming the OpenAI API.
export const transcribeRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:transcribe',
});
