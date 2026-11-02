import { eq } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, AuthConfigResponse, GoogleAuthResponse, MeResponse } from '@pitch/shared';
import { buildApp } from '../app';
import { seedCards } from '../db/seed';
import { packBoxes, playerCards, squadSlots, users } from '../db/schema';
import { suggestUsername } from '../services/google';
import { FakeClock, resetTestData, testDb } from '../../test/helpers';

/** Kiá»ƒm token Google tháº­t (jose) nhÆ°ng vá»›i cáº·p khoÃ¡ tá»± sinh â€” khÃ´ng cáº§n máº¡ng (ADR-0010). */
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const JSON_HEADERS = { 'content-type': 'application/json' };
const START = new Date('2026-05-01T00:00:00Z');

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const keys = createLocalJWKSet({ keys: [jwk] });
const otherKeys = await generateKeyPair('RS256');

const clock = new FakeClock(START);
const app = buildApp({
  db: testDb(),
  clock,
  rateLimit: false,
  googleClientId: CLIENT_ID,
  googleKeys: keys,
});
const disabled = buildApp({ db: testDb(), clock, rateLimit: false });
afterAll(async () => {
  await app.close();
  await disabled.close();
});

beforeEach(async () => {
  clock.set(START);
  await resetTestData(testDb());
  await seedCards(testDb());
});

const nowSec = () => Math.floor(clock.now().getTime() / 1000);

async function idToken(
  claims: JWTPayload = {},
  opts: { key?: typeof privateKey; aud?: string; iss?: string; exp?: number } = {},
): Promise<string> {
  return new SignJWT({ email: 'nguyen.van.a@gmail.com', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? CLIENT_ID)
    .setSubject((claims.sub as string | undefined) ?? 'google-sub-1')
    .setIssuedAt(nowSec())
    .setExpirationTime(opts.exp ?? nowSec() + 3600)
    .sign(opts.key ?? privateKey);
}

const google = (payload: object, a = app, cookies?: Record<string, string>) =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/google',
    payload,
    headers: JSON_HEADERS,
    ...(cookies ? { cookies } : {}),
  });
const sidOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'sid')?.value;
const errorCode = (res: { json: () => unknown }) => ApiError.parse(res.json()).error.code;

describe('GET /config/auth', () => {
  it('cÃ³ GOOGLE_CLIENT_ID â†’ tráº£ client id; khÃ´ng cÃ³ â†’ null (web áº©n nÃºt Google)', async () => {
    const on = AuthConfigResponse.parse(
      (await app.inject({ method: 'GET', url: '/api/v1/config/auth' })).json(),
    );
    expect(on.data.googleClientId).toBe(CLIENT_ID);
    const off = AuthConfigResponse.parse(
      (await disabled.inject({ method: 'GET', url: '/api/v1/config/auth' })).json(),
    );
    expect(off.data.googleClientId).toBeNull();
  });
});

describe('POST /auth/google', () => {
  it('chÆ°a cáº¥u hÃ¬nh GOOGLE_CLIENT_ID â†’ 404', async () => {
    const res = await google({ idToken: await idToken() }, disabled);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('not_found');
  });

  it('token sai aud / háº¿t háº¡n / sai iss / sai chá»¯ kÃ½ / rÃ¡c â†’ 401, khÃ´ng táº¡o gÃ¬', async () => {
    const bad = [
      await idToken({}, { aud: 'client-khac.apps.googleusercontent.com' }),
      await idToken({}, { exp: nowSec() - 120 }),
      await idToken({}, { iss: 'https://evil.example.com' }),
      await idToken({}, { key: otherKeys.privateKey }),
      'khong-phai-jwt',
    ];
    for (const token of bad) {
      for (const body of [{ idToken: token }, { idToken: token, username: 'ten_moi' }]) {
        const res = await google(body);
        expect(res.statusCode).toBe(401);
        expect(errorCode(res)).toBe('invalid_credentials');
        expect(sidOf(res)).toBeUndefined();
      }
    }
    expect(await testDb().select().from(users)).toHaveLength(0);
  });

  it('token háº¿t háº¡n theo Ä‘á»“ng há»“ server', async () => {
    const token = await idToken();
    clock.advance(2 * 3600 * 1000);
    expect((await google({ idToken: token })).statusCode).toBe(401);
  });

  it('user má»›i chÆ°a cÃ³ username â†’ needs_username + gá»£i Ã½ tÃªn, chÆ°a táº¡o tÃ i khoáº£n/phiÃªn', async () => {
    const res = await google({ idToken: await idToken() });
    expect(res.statusCode).toBe(200);
    expect(GoogleAuthResponse.parse(res.json()).data).toEqual({
      status: 'needs_username',
      suggestedUsername: 'nguyen_van_a',
    });
    expect(sidOf(res)).toBeUndefined();
    expect(await testDb().select().from(users)).toHaveLength(0);
  });

  it('user má»›i + username â†’ 201 + phiÃªn; nháº­n Ä‘Ãºng quÃ  tÃ¢n thá»§; khÃ´ng cÃ³ máº­t kháº©u', async () => {
    const res = await google({ idToken: await idToken(), username: 'Moi_Google' });
    expect(res.statusCode).toBe(201);
    const result = GoogleAuthResponse.parse(res.json()).data;
    if (result.status !== 'signed_in') throw new Error('pháº£i signed_in');
    expect(result.me).toMatchObject({ username: 'Moi_Google', coins: 0, freePack5Credits: 1 });

    const sid = sidOf(res)!;
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
    expect(MeResponse.parse(me.json()).data.id).toBe(result.me.id);

    const db = testDb();
    const userId = Number(result.me.id);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({
      googleSub: 'google-sub-1',
      passwordHash: null,
      email: 'nguyen.van.a@gmail.com',
    });
    expect(await db.select().from(playerCards).where(eq(playerCards.userId, userId))).toHaveLength(
      11,
    );
    const [box] = await db.select().from(packBoxes).where(eq(packBoxes.userId, userId));
    expect(box).toMatchObject({ bronzeLeft: 58, silverLeft: 30, goldLeft: 10, legendLeft: 2 });
    expect(await db.select().from(squadSlots).where(eq(squadSlots.userId, userId))).toHaveLength(
      11,
    );
  });

  it('email chÆ°a xÃ¡c minh thÃ¬ khÃ´ng lÆ°u email', async () => {
    const res = await google({
      idToken: await idToken({ email_verified: false }),
      username: 'chua_xac_minh',
    });
    expect(res.statusCode).toBe(201);
    const [u] = await testDb().select().from(users);
    expect(u!.email).toBeNull();
  });

  it('cÃ¹ng sub Ä‘Äƒng nháº­p láº¡i â†’ cÃ¹ng user, khÃ´ng táº¡o thÃªm; username gá»­i kÃ¨m bá»‹ bá» qua', async () => {
    const first = GoogleAuthResponse.parse(
      (await google({ idToken: await idToken(), username: 'lan_dau' })).json(),
    ).data;
    const again = await google({ idToken: await idToken(), username: 'ten_khac' });
    expect(again.statusCode).toBe(200);
    const second = GoogleAuthResponse.parse(again.json()).data;
    expect(second.status).toBe('signed_in');
    if (first.status !== 'signed_in' || second.status !== 'signed_in') throw new Error();
    expect(second.me.id).toBe(first.me.id);
    expect(second.me.username).toBe('lan_dau');
    expect(sidOf(again)).toBeTruthy();
    expect(await testDb().select().from(users)).toHaveLength(1);
  });

  it('Ä‘Äƒng nháº­p láº¡i xoay phiÃªn: cookie cÅ© trÃªn trÃ¬nh duyá»‡t bá»‹ huá»·', async () => {
    const first = await google({ idToken: await idToken(), username: 'xoay_phien' });
    const oldSid = sidOf(first)!;
    const again = await google({ idToken: await idToken() }, app, { sid: oldSid });
    expect(sidOf(again)).not.toBe(oldSid);
    const oldMe = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: oldSid } });
    expect(oldMe.statusCode).toBe(401);
  });

  it('username Ä‘Ã£ cÃ³ ngÆ°á»i dÃ¹ng â†’ 409, khÃ´ng táº¡o tÃ i khoáº£n', async () => {
    await google({ idToken: await idToken({ sub: 'sub-a' }), username: 'Trung_Ten' });
    const res = await google({ idToken: await idToken({ sub: 'sub-b' }), username: 'trung_ten' });
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('username_taken');
    expect(await testDb().select().from(users)).toHaveLength(1);
  });

  it('tÃ i khoáº£n Google khÃ´ng Ä‘Äƒng nháº­p Ä‘Æ°á»£c báº±ng máº­t kháº©u (ká»ƒ cáº£ máº­t kháº©u rá»—ng/báº¥t ká»³)', async () => {
    await google({ idToken: await idToken(), username: 'chi_google' });
    for (const password of ['x', 'mat-khau-bat-ky']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'chi_google', password },
        headers: JSON_HEADERS,
      });
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('invalid_credentials');
    }
  });

  it('username sai Ä‘á»‹nh dáº¡ng â†’ 400', async () => {
    const res = await google({ idToken: await idToken(), username: 'co dau cach' });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('validation_error');
  });
});

describe('suggestUsername', () => {
  it('láº¥y pháº§n trÆ°á»›c @, Ä‘á»•i kÃ½ tá»± láº¡ thÃ nh _, cáº¯t 20 kÃ½ tá»±; quÃ¡ ngáº¯n â†’ null', () => {
    expect(suggestUsername('nguyen.van.a@gmail.com')).toBe('nguyen_van_a');
    expect(suggestUsername('a-very-long-name-for-email@x.com')).toBe('a_very_long_name_for');
    expect(suggestUsername('ab@x.com')).toBeNull();
    expect(suggestUsername(null)).toBeNull();
  });
});
