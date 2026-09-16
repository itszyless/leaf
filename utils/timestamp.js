const chrono = require('chrono-node');
const { DateTime, FixedOffsetZone } = require('luxon');
const { resolveZone } = require('./timezones');

const STYLES = { t: 'Short time', T: 'Time with seconds', d: 'Short date', D: 'Long date',
  f: 'Date and time', F: 'Full date and time', R: 'Relative time' };
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, sixty: 60, ninety: 90 };

function normalizeInput(value) {
  return String(value || '').trim().toLowerCase().replace(/\u00a0/g, ' ')
    .replace(/([ap])\s*\.?\s*m\.?(?=\s|$)/g, '$1m')
    .replace(/\bat\s+([01]\d|2[0-3])([0-5]\d)\b/g, 'at $1:$2')
    .replace(/\b(a couple of|a couple|couple of|couple)\b/g, '2')
    .replace(/\b(a few|few)\b/g, '3')
    .replace(/\b(an?|one)\s+(hour|day|week|minute)\s+and\s+a\s+half\b/g, '1.5 $2')
    .replace(/\bhalf\s+(?:an?\s+)?(hour|day|minute)\b/g, '0.5 $1')
    .replace(/\b(?:a\s+)?quarter\s+(?:of\s+)?(?:an?\s+)?hour\b/g, '15 minutes')
    .replace(/\b(an?)\s+(second|minute|hour|day|week|month|year)s?\b/g, '1 $2')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty|ninety)\b/g, word => WORD_NUMBERS[word])
    .replace(/\s+/g, ' ');
}

function durationFromText(input) {
  const raw = input.replace(/^in\s+|^after\s+|^\+\s*/, '').replace(/\s+(from now|later)$/, '');
  const units = { s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds',
    m: 'minutes', min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes',
    h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
    d: 'days', day: 'days', days: 'days', w: 'weeks', wk: 'weeks', wks: 'weeks', week: 'weeks', weeks: 'weeks',
    mo: 'months', month: 'months', months: 'months', y: 'years', yr: 'years', yrs: 'years', year: 'years', years: 'years' };
  const regex = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mo|years?|yrs?|[smhdwy])(?![a-z])/g;
  const values = {};
  let end = 0, count = 0;
  for (const match of raw.matchAll(regex)) {
    if (!/^(?:\s|,|and)*$/.test(raw.slice(end, match.index))) return null;
    const unit = units[match[2]];
    values[unit] = (values[unit] || 0) + Number(match[1]);
    end = match.index + match[0].length;
    count++;
  }
  return count && !raw.slice(end).trim() ? values : null;
}

function makeLocal(parts, zone, occurrence, notes) {
  const date = DateTime.fromObject(parts, { zone });
  if (!date.isValid) throw new Error('That date or time is invalid. Check the day, month and clock time.');
  // Luxon otherwise silently shifts a clock time forward through a DST gap.
  if (Object.entries(parts).some(([key, value]) => date[key] !== value)) {
    throw new Error(`That local time does not exist in ${zone} because the clocks move forward. Choose a time before or after the change.`);
  }
  const possible = date.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
  if (possible.length > 1) {
    notes.push(`This clock time occurs twice when daylight saving ends. Using the ${occurrence} occurrence; change the occurrence option to choose the other one.`);
    return occurrence === 'later' ? possible.at(-1) : possible[0];
  }
  return date;
}

function result(dateTime, notes, normalized) {
  if (!dateTime.isValid || dateTime.year < 1 || dateTime.year > 9999) throw new Error('Choose a date between the years 1 and 9999.');
  return { dateTime, unix: Math.floor(dateTime.toSeconds()), zone: dateTime.zoneName, notes, normalized };
}

function parseTimestamp(input, { timezone = 'UTC', now = Date.now(), dateOrder = 'dmy', occurrence = 'earlier' } = {}) {
  const zone = resolveZone(timezone);
  const reference = DateTime.fromMillis(Number(now), { zone });
  if (!reference.isValid) throw new Error('Invalid reference time.');
  const text = normalizeInput(input);
  if (!text || text.length > 200) throw new Error('Enter a time, for example 23:12, tomorrow at 7pm, or in 2 hours.');
  const notes = [];
  if (/\bfew\b/i.test(input)) notes.push('“A few” means 3; enter a number for an exact duration.');
  if (text === 'now') return result(reference, notes, text);
  const duration = /^(?:[01]\d|2[0-3])[0-5]\d\s*(?:h|hrs|hours)$/.test(text) ? null : durationFromText(text);
  if (duration) return result(reference.plus(duration), notes, text);

  // ISO dates with explicit offsets identify an instant, regardless of the selected zone.
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const iso = DateTime.fromISO(text.toUpperCase(), { setZone: true });
    if (!iso.isValid) throw new Error('Invalid ISO date/time.');
    notes.push('The explicit offset in your input determines the instant.');
    return result(iso.setZone(zone), notes, text);
  }

  // Numeric dates are deliberately unambiguous: ISO or the selected day/month order.
  let numeric = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s]+(?:at\s+)?(.+))?$/);
  let parts, clock;
  if (numeric) {
    parts = { year: +numeric[1], month: +numeric[2], day: +numeric[3] };
    clock = numeric[4];
  } else {
    numeric = text.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?:\s+(?:at\s+)?(.+))?$/);
    if (numeric) {
      parts = { year: +numeric[4], month: +(dateOrder === 'mdy' ? numeric[1] : numeric[3]), day: +(dateOrder === 'mdy' ? numeric[3] : numeric[1]) };
      clock = numeric[5];
      notes.push(`Numeric date order: ${dateOrder === 'mdy' ? 'month/day/year' : 'day/month/year'}.`);
    }
  }
  if (parts) {
    let time = { hour: 0, minute: 0, second: 0, millisecond: 0 };
    if (clock) {
      const parsed = parseClock(clock);
      if (!parsed) throw new Error('Use a clock time such as 23:12 or 11:12 PM after the date.');
      time = { ...time, ...parsed };
    } else notes.push('No clock time supplied; using midnight in the selected timezone.');
    return result(makeLocal({ ...parts, ...time }, zone, occurrence, notes), notes, text);
  }

  // Bare clock times mean the next occurrence, including tomorrow after today's time passed.
  const time = parseClock(text.replace(/^at\s+/, ''));
  if (time) {
    let day = reference;
    let localParts = { year: day.year, month: day.month, day: day.day, ...time, millisecond: 0 };
    const candidateNotes = [];
    const candidate = makeLocal(localParts, zone, occurrence, candidateNotes);
    if (candidate.toMillis() < reference.toMillis()) day = reference.plus({ days: 1 });
    localParts = { ...localParts, year: day.year, month: day.month, day: day.day };
    const dt = makeLocal(localParts, zone, occurrence, notes);
    notes.push('A time without a date means its next occurrence in the selected timezone.');
    return result(dt, notes, text);
  }

  // GB handles day-first numeric dates; the standard English parser correctly reads
  // both “September 20” and “20 September” without treating 20 as a two-digit year.
  const parser = dateOrder === 'dmy' && /^\d{1,2}[/.]/.test(text) ? chrono.en.GB : chrono.en.casual;
  const parsed = parser.parse(text, { instant: reference.toJSDate(), timezone: reference.offset }, { forwardDate: true });
  if (parsed.length !== 1 || parsed[0].end || !/^(?:at|on|the)?\s*$/.test(text.slice(0, parsed[0].index)) || text.slice(parsed[0].index + parsed[0].text.length).trim()) {
    throw new Error('I could not read the entire time. Try “in 2 hours”, “tomorrow at 7pm”, “next Friday at 23:12”, or “2027-04-20 11:12 PM”.');
  }
  const start = parsed[0].start;
  const parsedParts = Object.fromEntries(['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'].map(key => [key, start.get(key) ?? 0]));
  if (!start.isCertain('hour') && !/\b(morning|afternoon|evening|tonight|night|noon|midnight|midday)\b/.test(text)) {
    parsedParts.hour = 0; parsedParts.minute = 0; parsedParts.second = 0;
    notes.push('No clock time supplied; using midnight in the selected timezone.');
  }
  let parsedZone = zone;
  if (start.isCertain('timezoneOffset')) {
    parsedZone = FixedOffsetZone.instance(start.get('timezoneOffset')).name;
    notes.push('Using the timezone offset written in the input; select a city for automatic daylight-saving rules.');
  }
  return result(makeLocal(parsedParts, parsedZone, occurrence, notes), notes, text);
}

function parseClock(text) {
  if (text === 'noon' || text === 'midday') return { hour: 12, minute: 0, second: 0 };
  if (text === 'midnight') return { hour: 0, minute: 0, second: 0 };
  const match = text.match(/^(\d{1,2})(?:[:.](\d{2})(?::(\d{2}))?)?\s*(am|pm)?$/);
  const military = text.match(/^(\d{2})(\d{2})\s*(?:h|hrs|hours)?$/);
  if (!match && !military) return null;
  let hour = Number((match || military)[1]), minute = Number((match || military)[2] || 0), second = Number(match?.[3] || 0);
  if (match?.[4]) {
    if (hour < 1 || hour > 12) throw new Error('AM/PM hours must be 1–12.');
    hour = hour % 12 + (match[4] === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || second > 59) throw new Error('Use hours 0–23 and minutes/seconds 0–59.');
  return { hour, minute, second };
}

module.exports = { parseTimestamp, parseClock, normalizeInput, durationFromText, STYLES };
