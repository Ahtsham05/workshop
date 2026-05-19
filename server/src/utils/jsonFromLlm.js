/**
 * Parse JSON from LLM vision responses (markdown fences, trailing commas, etc.).
 */

function repairJsonString(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/[\u201C\u201D\u2018\u2019]/g, '"');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function tryParse(candidate) {
  const repaired = repairJsonString(candidate);
  return JSON.parse(repaired);
}

function extractJsonCandidate(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  const arrStart = trimmed.indexOf('[');
  const arrEnd = trimmed.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    return trimmed.slice(arrStart, arrEnd + 1);
  }

  return trimmed;
}

/**
 * @param {string} content - Raw model text
 * @param {(parsed: unknown) => unknown} [normalize] - Optional shape normalizer
 * @returns {unknown}
 */
function parseJsonFromLlmContent(content, normalize) {
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    throw new Error('Empty model response');
  }

  const attempts = [candidate, repairJsonString(candidate)];

  for (const attempt of attempts) {
    try {
      let parsed = tryParse(attempt);
      if (Array.isArray(parsed)) {
        parsed = { items: parsed };
      }
      if (normalize) {
        parsed = normalize(parsed);
      }
      return parsed;
    } catch {
      // try next
    }
  }

  throw new Error('Could not parse JSON from model response');
}

module.exports = {
  parseJsonFromLlmContent,
  extractJsonCandidate,
};
