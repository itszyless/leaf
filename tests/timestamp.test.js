const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimestamp } = require('../utils/timestamp');
const { ZONES, resolveZone, timezoneChoices } = require('../utils/timezones');
const now = Date.parse('2026-09-16T12:00:00Z'); // 14:00 in Vienna.
const parse = (text, options = {}) => parseTimestamp(text, { now, timezone: 'Europe/Vienna', ...options });

test('12-hour, 24-hour, case, punctuation and military variants', () => {
  for (const input of ['23:12', '11:12 PM', '11:12pm', '11:12 p.m.', '11:12P.M.', '11:12 P M', '2312', '2312h', '23.12', 'at 23:12']) {
    assert.equal(parse(input).dateTime.toISO(), '2026-09-16T23:12:00.000+02:00', input);
  }
  assert.equal(parse('7 AM').dateTime.toISO(), '2026-09-17T07:00:00.000+02:00');
  assert.equal(parse('12 AM').dateTime.hour, 0);
  assert.equal(parse('12 PM').dateTime.hour, 12);
  assert.equal(parse('23:12:45').dateTime.second, 45);
});
test('relative durations preserve the reference instant and accept common words', () => {
  const variants = [['in 2 hours', 7200], ['IN TWO HOURS', 7200], ['2h', 7200], ['2hrs from now', 7200],
    ['in a couple of hours', 7200], ['in a few hours', 10800], ['2h30m', 9000], ['2 hours and 30 minutes', 9000],
    ['in half an hour', 1800], ['in an hour and a half', 5400], ['in 1.5 hours', 5400],
    ['in a quarter of an hour', 900], ['after 30 seconds', 30], ['+45m', 2700]];
  for (const [input, seconds] of variants) assert.equal(parse(input).unix, now / 1000 + seconds, input);
});
test('natural future dates and explicit dates use the selected zone', () => {
  for (const input of ['tomorrow at 7pm', 'TOMORROW 7 PM']) {
    assert.equal(parse(input).dateTime.toISO(), '2026-09-17T19:00:00.000+02:00', input);
  }
  for (const input of ['September 20 at 4 pm', '20 September at 4pm']) {
    assert.equal(parse(input).dateTime.toISO(), '2026-09-20T16:00:00.000+02:00', input);
  }
  assert.equal(parse('next Friday at 23:12').dateTime.weekday, 5);
  assert.ok(parse('next Friday at 23:12').unix > now / 1000);
  for (const input of ['2027-04-20 11:12 PM', '2027/04/20 23:12', '20/04/2027 23:12', '20.04.2027 at 23:12']) {
    assert.equal(parse(input).dateTime.toISO(), '2027-04-20T23:12:00.000+02:00', input);
  }
  assert.equal(parse('04/20/2027 23:12', { dateOrder: 'mdy' }).dateTime.month, 4);
  assert.equal(parse('tomorrow').dateTime.hour, 0);
  assert.equal(parse('tomorrow at 2312').dateTime.hour, 23);
  assert.ok(parse('tonight').dateTime.hour >= 18);
  assert.ok(parse('tomorrow morning').dateTime.hour > 0 && parse('tomorrow morning').dateTime.hour < 12);
  assert.equal(parse('2027-04-20').dateTime.hour, 0);
});
test('daylight-saving gaps are rejected and repeated times have explicit choices', () => {
  assert.throws(() => parse('2027-03-28 02:30'), /does not exist/);
  const early = parse('2026-10-25 02:30');
  const late = parse('2026-10-25 02:30', { occurrence: 'later' });
  assert.equal(late.unix - early.unix, 3600);
  assert.ok(early.notes.some(note => note.includes('occurs twice')));
  assert.equal(parse('2027-01-20 14:00').dateTime.offset, 60);
  assert.equal(parse('2027-07-20 14:00').dateTime.offset, 120);
  assert.throws(() => parse('March 28, 2027 at 2:30am'), /does not exist/);
  const between = Date.parse('2026-10-25T00:45:00Z');
  assert.equal(parse('02:30', { now: between, occurrence: 'later' }).dateTime.toISO(), '2026-10-25T02:30:00.000+01:00');
});
test('calendar days differ from elapsed hours across daylight-saving transitions', () => {
  const before = Date.parse('2027-03-27T12:00:00Z');
  assert.equal(parse('in 24 hours', { now: before }).unix - before / 1000, 86400);
  assert.equal(parse('in 1 day', { now: before }).unix - before / 1000, 82800);
});
test('midnight boundaries, fractional offsets and explicit ISO instants', () => {
  const tokyo = parse('tomorrow at 01:00', { timezone: 'Asia/Tokyo', now: Date.parse('2026-09-16T23:00:00Z') });
  assert.equal(tokyo.dateTime.toISO(), '2026-09-18T01:00:00.000+09:00');
  assert.equal(parse('2027-04-20 12:00', { timezone: 'UTC+05:45' }).dateTime.offset, 345);
  assert.equal(parse('2027-04-20T12:00:00Z').unix, Date.parse('2027-04-20T12:00:00Z') / 1000);
  assert.equal(parse('now', { timezone: 'America/New_York' }).unix, now / 1000);
});
test('invalid dates, partially parsed garbage and ranges are not silently accepted', () => {
  for (const input of ['banana', 'tomorrow garbage', 'blah 7pm', '9pm to 10pm', '25:12', '13pm', '23:61', '2027-02-30', '31/04/2027', 'in 2 elephants', '']) {
    assert.throws(() => parse(input), undefined, input);
  }
  assert.throws(() => parse('tomorrow', { timezone: 'not/a/zone' }), /timezone/);
});
test('timezone autocomplete covers hundreds of zones with Discord-sized choices', () => {
  assert.ok(ZONES.length > 400);
  for (const query of ['', 'America', 'Asia', 'Europe', 'UTC+05:45', 'Vienna', 'Austria', 'New York']) {
    const choices = timezoneChoices(query, now);
    assert.ok(choices.length > 0 && choices.length <= 25, query);
    for (const choice of choices) {
      assert.ok(choice.name.length <= 100);
      assert.equal(typeof resolveZone(choice.value), 'string');
    }
  }
  assert.ok(timezoneChoices('Austria').some(c => c.value === 'Europe/Vienna'));
  assert.equal(resolveZone('europe/vienna'), 'Europe/Vienna');
  assert.equal(resolveZone('new york'), 'America/New_York');
  assert.throws(() => resolveZone('UTC+99'), /offsets/);
  assert.deepEqual(timezoneChoices('zzzzzzzz'), []);
});
