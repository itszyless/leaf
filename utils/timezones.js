const { DateTime, IANAZone, FixedOffsetZone } = require('luxon');

// Intl supplies the runtime's IANA database, including fractional-hour zones.
const ZONES = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'),
  'Europe/Kyiv', 'Asia/Kolkata', 'Asia/Kathmandu', 'America/Nuuk'])]
  .filter(zone => zone === 'UTC' || IANAZone.isValidZone(zone));
const ALIASES = {
  'Europe/Vienna': 'austria österreich wien',
  'Europe/Berlin': 'germany deutschland german',
  'Europe/Zurich': 'switzerland swiss',
  'Europe/London': 'uk britain england british',
  'Europe/Paris': 'france french',
  'Europe/Madrid': 'spain spanish',
  'Europe/Rome': 'italy italian',
  'Europe/Amsterdam': 'netherlands dutch',
  'Europe/Warsaw': 'poland polish',
  'Europe/Kyiv': 'ukraine kiev',
  'America/New_York': 'usa us eastern et east coast',
  'America/Chicago': 'usa us central ct',
  'America/Denver': 'usa us mountain mt',
  'America/Los_Angeles': 'usa us pacific pt california',
  'America/Phoenix': 'usa us arizona',
  'America/Toronto': 'canada eastern',
  'America/Vancouver': 'canada pacific',
  'America/Sao_Paulo': 'brazil brasil',
  'Asia/Tokyo': 'japan japanese jst',
  'Asia/Seoul': 'korea korean kst',
  'Asia/Shanghai': 'china chinese beijing',
  'Asia/Kolkata': 'india indian calcutta',
  'Asia/Kathmandu': 'nepal katmandu',
  'Asia/Dubai': 'uae emirates',
  'Asia/Manila': 'philippines filipino',
  'Asia/Bangkok': 'thailand thai',
  'Asia/Jakarta': 'indonesia',
  'Australia/Sydney': 'australia nsw new south wales',
  'Australia/Melbourne': 'australia victoria',
  'Australia/Perth': 'australia western',
  'Pacific/Auckland': 'new zealand nz',
  'Pacific/Honolulu': 'usa us hawaii',
};
const POPULAR = ['UTC', 'Europe/Vienna', 'Europe/Berlin', 'Europe/London', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney',
  'Australia/Perth', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Johannesburg'];
const normal = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();

function resolveZone(value = 'UTC') {
  const input = String(value || 'UTC').trim();
  if (/^(utc|gmt|z)$/i.test(input)) return 'UTC';
  const offset = input.match(/^(?:(?:utc|gmt)\s*)?([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (offset) {
    const hours = Number(offset[2]), minutes = Number(offset[3] || 0);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) throw new Error('UTC offsets must be between -14:00 and +14:00.');
    return FixedOffsetZone.instance((offset[1] === '-' ? -1 : 1) * (hours * 60 + minutes)).name;
  }
  const exact = ZONES.find(zone => normal(zone) === normal(input));
  if (exact) return exact;
  const cities = ZONES.filter(zone => normal(zone.split('/').at(-1)) === normal(input));
  if (cities.length === 1) return cities[0];
  if (IANAZone.isValidZone(input)) return input;
  throw new Error('Choose a city from timezone autocomplete (for example Europe/Vienna), or enter UTC+05:30. City zones handle daylight saving automatically.');
}

function timezoneChoices(query = '', now = Date.now()) {
  const q = normal(query);
  const tokens = q.split(' ').filter(Boolean);
  const matches = q ? ZONES.filter(zone => tokens.every(token =>
    normal(`${zone} ${ALIASES[zone] || ''}`).includes(token))) : POPULAR;
  matches.sort((a, b) => Number(normal(b).endsWith(q)) - Number(normal(a).endsWith(q)));
  const choices = matches.slice(0, 25).map(zone => ({
    name: `${zone.replaceAll('_', ' ')} · UTC${DateTime.fromMillis(now, { zone }).toFormat('ZZ')}`,
    value: zone,
  }));
  // Fixed offsets and valid IANA aliases remain selectable even outside Intl's list.
  if (q) {
    try {
      const zone = resolveZone(query);
      if (!choices.some(choice => choice.value === zone)) choices.unshift({ name: zone, value: zone });
    } catch { /* partial search is expected */ }
  }
  return choices.slice(0, 25);
}

module.exports = { ZONES, resolveZone, timezoneChoices };
