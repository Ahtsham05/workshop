const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');
const multer = require('multer');
const passport = require('passport');
const request = require('supertest');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User } = require('../../src/models');
const { jwtStrategy } = require('../../src/config/passport');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const Joi = require('joi');
const auth = require('../../src/middlewares/auth');
const validate = require('../../src/middlewares/validate');
const { notFutureDate } = require('../../src/validations/custom.validation');
const { clearOrganizationTimeZone } = require('../../src/middlewares/businessTimeZone');
const {
  businessTimeZoneContext,
  getBusinessTimeZone,
  getBusinessDayRange,
} = require('../../src/utils/businessTimezone');

/**
 * The organization's time zone (Settings → Localization) reaches every request handler —
 * JSON and multipart alike — through the real JWT `auth` middleware, and the business day
 * computed downstream is that zone's day.
 */
setupTestDB();
jest.setTimeout(60000);

passport.use('jwt', jwtStrategy);
const app = express();
app.use(express.json());
app.use(passport.initialize());
app.use('/v1', businessTimeZoneContext);
const echo = (req, res) => {
  const { start, end, calendarDate } = getBusinessDayRange(new Date('2026-11-15T02:43:02Z'));
  res.send({ zone: getBusinessTimeZone(), calendarDate, start, end });
};
app.get('/v1/echo', auth(), echo);
app.post('/v1/upload', auth(), multer({ storage: multer.memoryStorage() }).single('file'), echo);
app.get('/v1/public', echo);
// A cash-affecting entry with a "when did it happen" date (same guard as load/sim/installments).
app.post(
  '/v1/entry',
  auth(),
  validate({ body: Joi.object({ date: Joi.date().custom(notFutureDate).required() }) }),
  (req, res) => res.send({ ok: true })
);

const makeUser = async (orgFields) => {
  const org = await Organization.create({ name: 'Store', owner: new mongoose.Types.ObjectId(), ...orgFields });
  const user = await User.create({
    name: 'Owner',
    email: `owner${Date.now()}${Math.random().toString(16).slice(2)}@example.com`,
    password: 'password1',
    organizationId: org._id,
  });
  const token = tokenService.generateToken(user._id, moment().add(10, 'minutes'), tokenTypes.ACCESS);
  return { org, token };
};

describe('per-request business time zone', () => {
  test('a New York store gets New York days on JSON and multipart requests', async () => {
    const { token } = await makeUser({ timeZone: 'America/New_York', countryCode: 'US' });
    const json = await request(app).get('/v1/echo').set('Authorization', `Bearer ${token}`).expect(200);
    expect(json.body).toEqual({
      zone: 'America/New_York',
      calendarDate: '2026-11-14', // 9:43 PM EST on the 14th (already the 15th in UTC/Pakistan)
      start: '2026-11-14T05:00:00.000Z',
      end: '2026-11-15T04:59:59.999Z',
    });
    const upload = await request(app)
      .post('/v1/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.alloc(300000, 1), 'big.bin')
      .expect(200);
    expect(upload.body.zone).toBe('America/New_York');
  });

  test('no zone chosen: single-zone country, else the Asia/Karachi default', async () => {
    const uk = await makeUser({ countryCode: 'GB' });
    expect((await request(app).get('/v1/echo').set('Authorization', `Bearer ${uk.token}`)).body.zone).toBe('Europe/London');
    const pk = await makeUser({});
    const res = await request(app).get('/v1/echo').set('Authorization', `Bearer ${pk.token}`);
    expect(res.body).toMatchObject({ zone: 'Asia/Karachi', calendarDate: '2026-11-15' });
    expect((await request(app).get('/v1/public')).body.zone).toBe('Asia/Karachi');
  });

  test('concurrent requests from different orgs never see each other’s zone', async () => {
    const la = await makeUser({ timeZone: 'America/Los_Angeles' });
    const pk = await makeUser({ timeZone: 'Asia/Karachi' });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app)
          .get('/v1/echo')
          .set('Authorization', `Bearer ${(i % 2 ? la : pk).token}`)
          .then((r) => [i % 2 ? 'America/Los_Angeles' : 'Asia/Karachi', r.body.zone])
      )
    );
    results.forEach(([expected, actual]) => expect(actual).toBe(expected));
  });

  test('a changed zone applies on the next request once the cache is cleared', async () => {
    const { org, token } = await makeUser({ timeZone: 'America/Chicago' });
    expect((await request(app).get('/v1/echo').set('Authorization', `Bearer ${token}`)).body.zone).toBe('America/Chicago');
    await Organization.updateOne({ _id: org._id }, { timeZone: 'America/Denver' });
    clearOrganizationTimeZone(org._id);
    expect((await request(app).get('/v1/echo').set('Authorization', `Bearer ${token}`)).body.zone).toBe('America/Denver');
  });

  test('the schema rejects an unknown zone', async () => {
    await expect(Organization.create({ name: 'X', owner: new mongoose.Types.ObjectId(), timeZone: 'Mars/Base' })).rejects.toThrow(
      /Unknown time zone/
    );
  });

  test('every authenticated response names the zone (so all users\u2019 browsers follow a change)', async () => {
    const { token } = await makeUser({ timeZone: 'America/Phoenix' });
    const res = await request(app).get('/v1/echo').set('Authorization', `Bearer ${token}`);
    expect(res.headers['x-business-time-zone']).toBe('America/Phoenix');
    expect((await request(app).get('/v1/public')).headers['x-business-time-zone']).toBeUndefined();
  });

  describe('changing the zone never makes a colleague\u2019s save fail', () => {
    // 8:30 PM in New York on 14 Nov = 6:30 AM on 15 Nov in Pakistan.
    const NOW = new Date('2026-11-15T01:30:00Z');
    beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] }));
    afterEach(() => jest.useRealTimers());

    const post = (token, date) => request(app).post('/v1/entry').set('Authorization', `Bearer ${token}`).send({ date });

    test('within 24 h of PKT → New York, a tab still on PKT can save "15 Nov"', async () => {
      const { token } = await makeUser({ timeZone: 'America/New_York', timeZoneChange: { from: 'Asia/Karachi', at: new Date(NOW.getTime() - 3600000) } });
      await post(token, '2026-11-14').expect(200);
      await post(token, '2026-11-15T01:29:00Z').expect(200); // PKT 15 Nov 06:29, NY 14 Nov 20:29
      await post(token, '2026-11-15T12:00:00Z').expect(200); // still 15 Nov in PKT
      await post(token, '2026-11-15T19:30:00Z').expect(400); // 16 Nov in both — truly future
    });

    test('after the grace period only the new zone counts', async () => {
      const { token } = await makeUser({ timeZone: 'America/New_York', timeZoneChange: { from: 'Asia/Karachi', at: new Date(NOW.getTime() - 25 * 3600000) } });
      await post(token, '2026-11-15T04:59:00Z').expect(200); // 23:59 NY 14 Nov
      await post(token, '2026-11-15T12:00:00Z').expect(400); // 15 Nov 7 AM NY = future
    });
  });
});
