/**
 * GSM 03.38 / UCS-2 segment accounting — the server-side twin of the client's
 * `client/src/utils/sms-segments.ts`. Kept in both places because the composer needs it
 * live while typing, and the template catalogue needs it to quote each preset's real cost
 * without a round trip through the browser. The two implementations are covered by the
 * same expectations (see tests/unit/services/smsGatewayDispatch.test.js).
 */

const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(
    '',
  ),
);

// Escape-pair characters: two units each.
const GSM7_EXTENDED = new Set('^{}\\[~]|€'.split(''));

function analyzeBody(text) {
  const chars = Array.from(text ?? '');

  const nonGsm = [];
  for (const ch of chars) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch) && !nonGsm.includes(ch)) nonGsm.push(ch);
  }
  const encoding = nonGsm.length > 0 ? 'UCS-2' : 'GSM-7';

  const units =
    encoding === 'GSM-7'
      ? chars.reduce((sum, ch) => sum + (GSM7_EXTENDED.has(ch) ? 2 : 1), 0)
      : chars.reduce((sum, ch) => sum + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);

  const single = encoding === 'GSM-7' ? 160 : 70;
  const concatenated = encoding === 'GSM-7' ? 153 : 67;

  let segments;
  if (units === 0) segments = 0;
  else if (units <= single) segments = 1;
  else segments = Math.ceil(units / concatenated);

  return { encoding, characters: chars.length, units, segments, perSegment: segments <= 1 ? single : concatenated, nonGsmSample: nonGsm.slice(0, 6) };
}

/** Fills {placeholders} case-insensitively, the same way the send paths do. */
function renderBody(body, vars) {
  return Object.entries(vars || {}).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'gi'), value == null ? '' : String(value)),
    String(body ?? ''),
  );
}

module.exports = { analyzeBody, renderBody };
