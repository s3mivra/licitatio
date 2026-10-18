import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { env } from '../config/env';
import { AppError } from '../shared/errors';

/** Off unless AI_DRAFTING=on and the API key is set. */
export const aiEnabled = (): boolean => env.AI_DRAFTING === 'on' && Boolean(env.ANTHROPIC_API_KEY);

const DraftSchema = z.object({
  paragraphs: z.array(z.string()).describe('2 to 6 paragraphs of proposal prose, plain text, no markdown'),
});
export type Draft = z.infer<typeof DraftSchema>;

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 }));

const SYSTEM = [
  'You draft sections of technical proposals for Philippine construction firms bidding on public and private projects.',
  'Write in clear, formal English suited to a procuring entity\'s evaluators. Use only the facts provided about the company, its projects, people and the bid.',
  'Never invent certifications, project names, amounts, dates or people. Where a fact is missing, write the sentence so it stays true without it.',
  'Return plain paragraphs with no markdown, headings or bullet characters.',
].join(' ');

/**
 * One structured call: Claude Opus 5.5 with medium effort, server-side refusal fallbacks enabled,
 * and the output parsed against a schema. The caller decides what context is safe to send.
 */
export async function draftSection(prompt: string): Promise<Draft> {
  try {
    const response = await getClient().beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(DraftSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'ai_declined', 'The assistant could not draft this section. Rephrase the instructions or write it manually.');
    }
    const parsed = response.parsed_output;
    if (!parsed || parsed.paragraphs.length === 0) throw new AppError(502, 'service_unavailable', 'The assistant returned no draft. Try again.');
    return { paragraphs: parsed.paragraphs.map((p) => p.trim()).filter(Boolean).slice(0, 8) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'rate_limited', 'The assistant is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) throw new AppError(503, 'service_unavailable', 'The assistant is unavailable right now. Try again later.');
    throw err;
  }
}

const ScanSchema = z.object({
  docTypeCode: z.string().nullable().describe('One of the listed type codes, or null if none fits'),
  title: z.string().nullable().describe('Short title as printed, e.g. "Mayor\'s Permit 2026"'),
  referenceNumber: z.string().nullable().describe('Permit, license, certificate or OR number as printed'),
  issuedAt: z.string().nullable().describe('Issue date as YYYY-MM-DD'),
  expiresAt: z.string().nullable().describe('Expiry or valid-until date as YYYY-MM-DD; null if none is printed'),
});
export type ScanResult = z.infer<typeof ScanSchema>;

export type ScanMime = 'application/pdf' | 'image/png' | 'image/jpeg';

/**
 * Reads a scanned permit, license or certificate and returns the fields for the vault form.
 * The caller validates every value; nothing here is trusted or saved automatically.
 */
export async function readDocument(bytes: Uint8Array, mime: ScanMime, types: ReadonlyArray<{ code: string; name: string }>, today: string): Promise<ScanResult> {
  const data = Buffer.from(bytes).toString('base64');
  const file = mime === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: mime, data } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mime, data } };
  try {
    const response = await getClient().beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ScanSchema) },
      system: 'You read scanned Philippine business documents (permits, licenses, certificates, clearances) and extract fields exactly as printed. Never guess: return null for anything not clearly printed. Convert dates to YYYY-MM-DD.',
      messages: [{
        role: 'user',
        content: [
          file,
          { type: 'text', text: `Today is ${today}. Document type codes:\n${types.map((t) => `${t.code}: ${t.name}`).join('\n')}\n\nExtract the fields from this document.` },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') throw new AppError(422, 'ai_declined', 'The assistant could not read this document. Fill in the details manually.');
    if (!response.parsed_output) throw new AppError(502, 'service_unavailable', 'The assistant returned nothing. Try again or fill in the details manually.');
    return response.parsed_output;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'rate_limited', 'The assistant is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) throw new AppError(503, 'service_unavailable', 'The assistant is unavailable right now. Fill in the details manually.');
    throw err;
  }
}
