import { z } from 'zod';
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { ExtractionCandidateSchema, type ExtractionCandidate } from './extractionSchema';

const MODEL = 'gemini-3.5-flash';

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set. Add it to a .env file at the project root (gitignored) and re-run.');
  }
  return key;
}

export function makeClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: requireApiKey() });
}

export async function uploadPdf(ai: GoogleGenAI, filePath: string) {
  const file = await withRetries(() => ai.files.upload({ file: filePath, config: { mimeType: 'application/pdf' } }));
  let current = file;
  while (current.state === 'PROCESSING') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    current = await withRetries(() => ai.files.get({ name: current.name! }));
  }
  if (current.state !== 'ACTIVE') {
    throw new Error(`File ${filePath} failed to process (state: ${current.state})`);
  }
  return current;
}

// zod v4 ships its own JSON Schema converter — the third-party zod-to-json-schema
// package doesn't understand zod v4's internals and silently produces an empty schema.
const emitEntriesParams = z.toJSONSchema(z.object({ entries: ExtractionCandidateSchema.array() }));

const EXTRACTION_PROMPT = (bookLabel: string, firstPage: number, lastPage: number) => `
You are helping extract Dungeons & Dragons 5th edition rules content from a scanned rulebook PDF for a personal character-tracking app. This excerpt is pages ${firstPage}-${lastPage} of "${bookLabel}".

Identify every distinct game-mechanical entry that appears on these pages: spells, magic items (and mundane equipment with real stats), feats, class/subclass features, background features, and species/racial traits.

For EACH entry, call emit_entries with:
- name: the entry's exact title as printed
- kind: one of spell, item, feat, feature, background, species
- page: the page number it starts on (within this excerpt's actual page numbers, ${firstPage}-${lastPage})
- verbatimQuote: a short (1-2 sentence) exact quote from the entry, for human review
- confidence: 0-1, how sure you are this is a real, complete, correctly-typed entry
- description: the full rules text, verbatim, preserving all mechanical detail (do not summarize or paraphrase)
- kind-specific fields where applicable (level/school/castingTime/range/components/duration/concentration/ritual/classLists/higherLevels for spells; category/rarity/costGp/weight/attunement for items; prerequisite for feats)

Do NOT include: flavor/lore text with no mechanics, art callouts, table of contents, running headers/footers, index entries, or duplicate entries you've already emitted.
Do NOT invent numeric effect formulas — just transcribe the rules text faithfully into the description field.

Call emit_entries exactly once with every entry found on these pages (an empty array if none).
`;

async function withRetries<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === attempts) throw err;
      const delayMs = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s...
      console.warn(`  Transient error (attempt ${attempt}/${attempts}), retrying in ${delayMs / 1000}s: ${err instanceof Error ? err.message : err}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

export async function extractChunk(
  ai: GoogleGenAI,
  fileUri: string,
  mimeType: string,
  bookLabel: string,
  firstPage: number,
  lastPage: number,
): Promise<ExtractionCandidate[]> {
  const response = await withRetries(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ fileData: { fileUri, mimeType } }, { text: EXTRACTION_PROMPT(bookLabel, firstPage, lastPage) }],
        },
      ],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'emit_entries',
                description: 'Emit every extracted content entry found in this PDF excerpt.',
                parametersJsonSchema: emitEntriesParams,
              },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: ['emit_entries'] } },
      },
    }),
  );

  const call = response.functionCalls?.[0];
  if (!call || call.name !== 'emit_entries') {
    console.warn(`No emit_entries call for pages ${firstPage}-${lastPage} — model may have found nothing.`);
    return [];
  }
  const parsed = (call.args as { entries: unknown[] }).entries;
  return parsed.map((e) => ExtractionCandidateSchema.parse(e));
}
