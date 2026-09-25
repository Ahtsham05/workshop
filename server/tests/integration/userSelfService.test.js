const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { User, Branch } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');

setupTestDB();

// Built here rather than pulled from tests/fixtures/user.fixture.js: that fixture calls
// `mongoose.Types.ObjectId()` without `new`, which this version of Mongoose rejects at
// import time (it takes tests/integration/user.test.js down with it).
const userOne = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Appearance Tester',
  email: 'appearance.tester@example.com',
  password: 'password1',
  isEmailVerified: false,
};

// insertMany skips the model's pre-save hook, so the password has to be hashed here or
// every isPasswordMatch() would compare bcrypt output against plain text.
const hashedPassword = bcrypt.hashSync('password1', bcrypt.genSaltSync(8));

const insertUsers = async (users) => {
  await User.insertMany(users.map((user) => ({ ...user, password: hashedPassword })));
};

const userOneAccessToken = tokenService.generateToken(
  userOne._id,
  moment().add(config.jwt.accessExpirationMinutes, 'minutes'),
  tokenTypes.ACCESS
);

describe('Appearance: profile photo + UI preferences', () => {
  describe('PATCH /v1/users/me/ui-preferences', () => {
    test('saves the row colours and branch tint onto the signed-in user', async () => {
      await insertUsers([userOne]);

      const res = await request(app)
        .patch('/v1/users/me/ui-preferences')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ rowScheme: 'sand', alternateRows: false, branchTint: 'strong' })
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ rowScheme: 'sand', alternateRows: false, branchTint: 'strong' });

      const dbUser = await User.findById(userOne._id);
      expect(dbUser.uiPreferences.rowScheme).toBe('sand');
      expect(dbUser.uiPreferences.alternateRows).toBe(false);
      expect(dbUser.uiPreferences.branchTint).toBe('strong');
    });

    test('merges a partial change instead of resetting the other choices', async () => {
      await insertUsers([userOne]);
      await User.findByIdAndUpdate(userOne._id, {
        uiPreferences: { rowScheme: 'mint', alternateRows: false, branchTint: 'medium' },
      });

      const res = await request(app)
        .patch('/v1/users/me/ui-preferences')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ branchTint: 'off' })
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ rowScheme: 'mint', alternateRows: false, branchTint: 'off' });
    });

    test('rejects a scheme that is not on the list', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch('/v1/users/me/ui-preferences')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ rowScheme: 'neon-pink' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('requires a signed-in user', async () => {
      await request(app).patch('/v1/users/me/ui-preferences').send({ rowScheme: 'sand' }).expect(httpStatus.UNAUTHORIZED);
    });

    test('defaults are what a brand new user gets', async () => {
      await insertUsers([userOne]);
      const dbUser = await User.findById(userOne._id);
      expect(dbUser.uiPreferences.rowScheme).toBe('default');
      expect(dbUser.uiPreferences.alternateRows).toBe(true);
      expect(dbUser.uiPreferences.branchTint).toBe('subtle');
    });
  });

  describe('DELETE /v1/users/me/photo', () => {
    test('clears the photo on the signed-in user', async () => {
      await insertUsers([userOne]);
      await User.findByIdAndUpdate(userOne._id, {
        photo: { url: 'https://cdn.example/x.jpg', publicId: 'users/x' },
      });

      const res = await request(app)
        .delete('/v1/users/me/photo')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .expect(httpStatus.OK);

      expect(res.body).toEqual({ url: '', publicId: '' });
      const dbUser = await User.findById(userOne._id);
      expect(dbUser.photo.url).toBe('');
    });

    test('requires a signed-in user', async () => {
      await request(app).delete('/v1/users/me/photo').expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/users/me/photo', () => {
    test('rejects a request with no file', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users/me/photo')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/users/me', () => {
    test('returns the account with the join date the profile page shows', async () => {
      await insertUsers([userOne]);

      const res = await request(app)
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .expect(httpStatus.OK);

      expect(res.body.email).toBe(userOne.email);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body.createdAt).toBeDefined();
    });

    test('requires a signed-in user', async () => {
      await request(app).get('/v1/users/me').expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('PATCH /v1/users/me', () => {
    test('lets a person fix their own name without the editUsers permission', async () => {
      await insertUsers([userOne]);

      const res = await request(app)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ name: 'Ahtsham Ali' })
        .expect(httpStatus.OK);

      expect(res.body.name).toBe('Ahtsham Ali');
      const dbUser = await User.findById(userOne._id);
      expect(dbUser.name).toBe('Ahtsham Ali');
    });

    test('rejects an email that another account already uses', async () => {
      const other = { ...userOne, _id: new mongoose.Types.ObjectId(), email: 'taken@example.com' };
      await insertUsers([userOne, other]);

      await request(app)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ email: 'taken@example.com' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('refuses fields that are not the account holder\'s to change', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ systemRole: 'superAdmin' })
        .expect(httpStatus.BAD_REQUEST);

      const dbUser = await User.findById(userOne._id);
      expect(dbUser.systemRole).toBe('staff');
    });

    test('requires a signed-in user', async () => {
      await request(app).patch('/v1/users/me').send({ name: 'x' }).expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/users/me/password', () => {
    test('changes the password when the current one is right', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users/me/password')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ currentPassword: 'password1', newPassword: 'newpassword2' })
        .expect(httpStatus.OK);

      const dbUser = await User.findById(userOne._id);
      expect(await dbUser.isPasswordMatch('newpassword2')).toBe(true);
      expect(await dbUser.isPasswordMatch('password1')).toBe(false);
    });

    test('rejects a wrong current password', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users/me/password')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ currentPassword: 'notmypassword1', newPassword: 'newpassword2' })
        .expect(httpStatus.UNAUTHORIZED);

      const dbUser = await User.findById(userOne._id);
      expect(await dbUser.isPasswordMatch('password1')).toBe(true);
    });

    test('rejects reusing the current password', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users/me/password')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ currentPassword: 'password1', newPassword: 'password1' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('enforces the same password rule as signup', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users/me/password')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ currentPassword: 'password1', newPassword: 'short1' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('requires a signed-in user', async () => {
      await request(app)
        .post('/v1/users/me/password')
        .send({ currentPassword: 'password1', newPassword: 'newpassword2' })
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('Branch colour', () => {
    test('stores a colour key on the branch', async () => {
      const branch = await Branch.create({
        organizationId: new mongoose.Types.ObjectId(),
        name: 'Warehouse',
        appearance: { colorKey: 'teal' },
      });
      expect(branch.appearance.colorKey).toBe('teal');
    });

    test('defaults to no colour', async () => {
      const branch = await Branch.create({
        organizationId: new mongoose.Types.ObjectId(),
        name: 'Main',
      });
      expect(branch.appearance.colorKey).toBe('');
    });

    test('refuses a colour outside the palette', async () => {
      await expect(
        Branch.create({
          organizationId: new mongoose.Types.ObjectId(),
          name: 'Bad',
          appearance: { colorKey: 'chartreuse' },
        })
      ).rejects.toThrow();
    });
  });
});
