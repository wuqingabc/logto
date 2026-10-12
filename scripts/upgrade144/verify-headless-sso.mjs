#!/usr/bin/env node
/**
 * Clone-only Logto runtime gate, Node >=22; writes no tokens or cookies to disk.
 * Usage: node scripts/upgrade144/verify-headless-sso.mjs /private/path/probe.json
 * File must be owned by the caller and chmod 600; all values stay out of logs.
 * Required JSON fields: endpoint, clientId, clientSecret, redirectUri, username,
 * password, organizationId, origin. Optional audience defaults to https://api.winamz.com.
 * Optional ssoClientId, ssoClientSecret, ssoRedirectUri select a separate embedded app.
 * Optional scope defaults to Core's lean login scopes. Uses cloned registered client redirects.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

let stage = 'private configuration';
try {
  const path = process.argv[2];
  assert(path, 'configuration required');
  const metadata = await lstat(path);
  assert(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0);
  assert(process.getuid === undefined || metadata.uid === process.getuid());
  const config = JSON.parse(await readFile(path, 'utf8'));
  for (const key of [
    'endpoint',
    'clientId',
    'clientSecret',
    'redirectUri',
    'username',
    'password',
    'organizationId',
    'origin',
  ]) {
    assert(typeof config[key] === 'string' && config[key].length > 0);
  }
  const endpoint = new URL(config.endpoint);
  // Explicitly confine all HTTP requests to the cloned local/private instance.
  assert(
    ['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password
  );
  assert(
    endpoint.hostname === 'localhost' ||
      endpoint.hostname === '[::1]' ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(endpoint.hostname)
  );
  const base = endpoint.origin;
  const audience = config.audience ?? 'https://api.winamz.com';
  const scope =
    config.scope ??
    'openid profile email offline_access urn:logto:scope:organizations urn:logto:scope:organization_roles';
  const callback = new URL(config.redirectUri);
  const ssoClientId = config.ssoClientId ?? config.clientId;
  const ssoClientSecret = config.ssoClientSecret ?? config.clientSecret;
  const ssoRedirectUri = config.ssoRedirectUri ?? config.redirectUri;
  if (config.ssoClientId) assert(config.ssoClientSecret && config.ssoRedirectUri);
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const loginState = randomBytes(20).toString('base64url');
  class Jar {
    values = new Map();
    add(response) {
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const separator = pair.indexOf('=');
        const key = pair.slice(0, separator);
        if (/max-age=0(?:;|$)/i.test(cookie) || pair.slice(separator + 1) === '')
          this.values.delete(key);
        else this.values.set(key, pair);
      }
    }
    header() {
      return [...this.values.values()].join('; ');
    }
  }
  const sourceJar = new Jar();
  const webviewJar = new Jar();
  const call = async (path, init = {}, jar) => {
    const target = new URL(path, base);
    assert(target.origin === base);
    const response = await fetch(target, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      headers: { ...(jar && { Cookie: jar.header() }), ...init.headers },
    });
    jar?.add(response);
    return response;
  };
  const json = async (path, method, body, jar = sourceJar) =>
    call(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json', 'Logto-App-Id': config.clientId },
        body: JSON.stringify(body),
      },
      jar
    );
  const readJson = async (response, status = 200) => {
    assert.equal(response.status, status);
    return response.json();
  };
  const authorization = (state, prompt, sso = false) => {
    const url = new URL('/oidc/auth', base);
    url.search = new URLSearchParams({
      client_id: sso ? ssoClientId : config.clientId,
      redirect_uri: sso ? ssoRedirectUri : config.redirectUri,
      response_type: 'code',
      scope: sso ? (config.ssoScope ?? 'openid profile email') : scope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(!sso && { resource: audience }),
      ...(prompt && { prompt }),
    });
    return url;
  };
  const followCode = async (start, jar, state, expectedCallback = callback) => {
    let current = new URL(start, base);
    for (let count = 0; count < 12; count++) {
      if (
        current.origin === expectedCallback.origin &&
        current.pathname === expectedCallback.pathname
      ) {
        assert.equal(current.searchParams.get('state'), state);
        const error = current.searchParams.get('error');
        if (error) throw Object.assign(new Error('authorization rejected'), { oauthError: error });
        const code = current.searchParams.get('code');
        assert(code);
        return code;
      }
      assert.equal(current.origin, base);
      const response = await call(current, {}, jar);
      assert(response.status >= 300 && response.status < 400);
      assert(response.headers.get('location'));
      current = new URL(response.headers.get('location'), current);
    }
    throw new Error('redirect limit');
  };
  const childCodeWithConsent = async (jar, state, bridgeToken) => {
    try {
      await followCode(authorization(state, 'none', true), jar, state, new URL(ssoRedirectUri));
    } catch (error) {
      if (error.oauthError !== 'consent_required') throw error;
      // This fixture user explicitly authorizes the new client through the normal consent API.
      const initial = await call(authorization(state, undefined, true), {}, jar);
      assert(initial.status >= 300 && initial.status < 400);
      const accepted = await readJson(await call('/api/interaction/consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Logto-App-Id': ssoClientId },
        body: '{}',
      }, jar));
      assert(accepted.redirectTo);
      await followCode(accepted.redirectTo, jar, state, new URL(ssoRedirectUri));
      console.log('PASS first-use fixture consent through official interaction API');
    }
    // Prove subsequent SSO using a fresh cookie jar populated ONLY by the bearer bridge.
    const independent = new Jar();
    const primed = await call('/api/internal/silent-grant', { method: 'POST', headers: {
      Origin: config.origin, Authorization: `Bearer ${bridgeToken}`,
    } }, independent);
    assert.equal((await readJson(primed)).ok, true);
    jar.values = independent.values;
    console.log('PASS independent cookie jar primed after fixture client authorization');
    return followCode(authorization(state, 'none', true), jar, state, new URL(ssoRedirectUri));
  };
  const exchange = async (parameters) =>
    readJson(
      await call('/oidc/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...parameters,
        }),
      })
    );
  const payload = (value) =>
    JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  const checkAccess = (value, expectedClientId = config.clientId) => {
    const claims = payload(value);
    assert.equal(claims.client_id, expectedClientId);
    assert(Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience);
    assert(typeof claims.sub === 'string' && typeof claims.winamz_session_uid === 'string');
    assert(claims.exp > Math.floor(Date.now() / 1000));
    return claims;
  };

  stage = 'headless interaction';
  const initial = await call(authorization(loginState), {}, sourceJar);
  assert(initial.status >= 300 && initial.status < 400 && sourceJar.header());
  assert.equal((await json('/api/experience', 'PUT', { interactionEvent: 'SignIn' })).status, 204);
  const verified = await readJson(
    await json('/api/experience/verification/password', 'POST', {
      identifier: { type: 'username', value: config.username },
      password: config.password,
    })
  );
  assert(verified.verificationId);
  assert.equal(
    (
      await json('/api/experience/identification', 'POST', {
        verificationId: verified.verificationId,
      })
    ).status,
    204
  );
  const submitted = await readJson(await json('/api/experience/submit', 'POST', {}));
  assert(submitted.redirectTo);
  const code = await followCode(submitted.redirectTo, sourceJar, loginState);
  stage = 'authorization code exchange';
  const loginTokens = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
    resource: audience,
  });
  const loginClaims = checkAccess(loginTokens.access_token);
  assert(loginTokens.refresh_token && loginTokens.id_token);
  console.log('PASS headless authorization code login');

  stage = 'organization refresh';
  const orgTokens = await exchange({
    grant_type: 'refresh_token',
    refresh_token: loginTokens.refresh_token,
    organization_id: config.organizationId,
    resource: audience,
    scope: scope
      .split(/\s+/)
      .filter((value) => value !== 'offline_access')
      .join(' '),
  });
  const orgClaims = checkAccess(orgTokens.access_token);
  assert.equal(orgClaims.organization_id, config.organizationId);
  assert.equal(orgClaims.sub, loginClaims.sub);
  assert.equal(orgClaims.winamz_session_uid, loginClaims.winamz_session_uid);
  console.log('PASS organization refresh preserves authenticated session');

  stage = 'silent grant preflight';
  const preflight = await call('/api/internal/silent-grant', {
    method: 'OPTIONS',
    headers: {
      Origin: config.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), config.origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  stage = 'ID token rejection';
  const idRejected = await call('/api/internal/silent-grant', {
    method: 'POST',
    headers: {
      Origin: config.origin,
      Authorization: `Bearer ${loginTokens.id_token}`,
    },
  });
  assert.equal(idRejected.status, 401);
  assert.equal(idRejected.headers.getSetCookie().length, 0);
  stage = 'silent session priming';
  const granted = await call(
    '/api/internal/silent-grant',
    {
      method: 'POST',
      headers: {
        Origin: config.origin,
        Authorization: `Bearer ${orgTokens.access_token}`,
      },
    },
    webviewJar
  );
  const result = await readJson(granted);
  assert.equal(result.ok, true);
  assert.equal(result.sub, loginClaims.sub);
  assert.equal(result.sessionId, undefined);
  assert(webviewJar.values.size >= 2);
  assert.equal(granted.headers.get('access-control-allow-origin'), config.origin);
  assert.equal(granted.headers.get('access-control-allow-credentials'), 'true');
  console.log('PASS CORS, ID token rejection and independent cookie jar priming');

  stage = 'cookie-only prompt none SSO';
  const ssoState = randomBytes(20).toString('base64url');
  const ssoCode = await childCodeWithConsent(webviewJar, ssoState, orgTokens.access_token);
  const ssoTokens = await exchange({
    grant_type: 'authorization_code',
    code: ssoCode,
    redirect_uri: ssoRedirectUri,
    client_id: ssoClientId,
    client_secret: ssoClientSecret,
    code_verifier: verifier,
  });
  assert.equal(payload(ssoTokens.id_token).sub, loginClaims.sub);
  const userInfo = await readJson(await call('/oidc/me', { headers: { Authorization: `Bearer ${ssoTokens.access_token}` } }));
  assert.equal(userInfo.sub, loginClaims.sub);
  console.log('PASS cookie-only prompt=none SSO for original user');
} catch {
  // Intentionally omit exception text: provider errors can contain secrets or redirect URLs.
  console.error(`FAIL ${stage}; no credential, token, cookie or redirect details logged`);
  process.exitCode = 1;
}
