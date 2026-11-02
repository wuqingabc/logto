#!/usr/bin/env node
/**
 * Clone-only OLD→NEW Logto compatibility gate, Node >=22; never logs tokens or cookies.
 * Usage: node scripts/upgrade144/verify-legacy-sso.mjs /private/path/probe.json capture|verify /private/path/legacy-sso.json
 * File must be owned by the caller and chmod 600; all values stay out of logs.
 * Required JSON fields: endpoint, clientId, clientSecret, redirectUri, username,
 * password, organizationId, origin. Optional audience defaults to https://api.winamz.com.
 * Optional ssoClientId, ssoClientSecret, ssoRedirectUri select a separate embedded app.
 * Optional scope defaults to Core's lean login scopes. Uses cloned registered client redirects.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readFile, open } from 'node:fs/promises';

let stage = 'private configuration';
let lastStatus;
let callbackError;
try {
  const path = process.argv[2];
  const mode = process.argv[3];
  const snapshotPath = process.argv[4];
  assert(['capture', 'verify'].includes(mode) && snapshotPath);
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
    lastStatus = response.status;
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
    if (response.status !== status) {
      const handle = await open(snapshotPath + '.error.json', 'w', 0o600);
      await handle.chmod(0o600);
      await handle.writeFile(await response.text());
      await handle.close();
    }
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
        if (error && /^[a-z_]+$/.test(error)) callbackError = error;
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
    assert(typeof claims.sub === 'string');
    if (mode === 'verify') assert(typeof claims.winamz_session_uid === 'string');
    assert(claims.exp > Math.floor(Date.now() / 1000));
    return claims;
  };

  if (mode === 'capture') {
    stage = 'headless interaction';
    const initial = await call(authorization(loginState), {}, sourceJar);
    assert(initial.status >= 300 && initial.status < 400 && sourceJar.header());
    stage = 'initialize headless experience';
    assert.equal(
      (await json('/api/experience', 'PUT', { interactionEvent: 'SignIn' })).status,
      204
    );
    stage = 'verify headless password';
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
    stage = 'submit headless authentication';
    const submitted = await readJson(await json('/api/experience/submit', 'POST', {}));
    assert(submitted.redirectTo);
    stage = 'resolve headless authorization code';
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
    console.log('PASS organization refresh preserves authenticated session');

    stage = 'private legacy snapshot';
    const handle = await open(snapshotPath, 'wx', 0o600);
    await handle.writeFile(
      JSON.stringify({
        version: 1,
        endpoint: base,
        tokens: orgTokens,
        idToken: loginTokens.id_token,
        claims: orgClaims,
        cookies: [...sourceJar.values.values()],
      }) + '\n'
    );
    await handle.close();
    console.log('PASS legacy refresh token and original cookies saved privately');
  } else {
    stage = 'private legacy snapshot';
    const snapshotMeta = await lstat(snapshotPath);
    assert(
      snapshotMeta.isFile() && !snapshotMeta.isSymbolicLink() && (snapshotMeta.mode & 0o077) === 0
    );
    assert(process.getuid === undefined || snapshotMeta.uid === process.getuid());
    const saved = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(saved.endpoint, base);
    assert(saved.serverSession?.payload?.uid);
    for (const cookie of saved.cookies)
      sourceJar.values.set(cookie.slice(0, cookie.indexOf('=')), cookie);
    stage = 'legacy database authentication context';
    const verifyOriginalContext = () =>
      execFileSync(
        'python3',
        [
          fileURLToPath(new URL('./probe-fixture.py', import.meta.url)),
          'verify-session',
          dirname(snapshotPath),
        ],
        { stdio: ['ignore', 'inherit', 'pipe'] }
      );
    verifyOriginalContext();
    stage = 'legacy refresh token organization refresh';
    const checkpointPath = snapshotPath + '.verify.json';
    const sourceRefreshDigest = createHash('sha256')
      .update(saved.tokens.refresh_token)
      .digest('hex');
    let refreshed;
    let reusedCheckpoint = false;
    try {
      const metadata = await lstat(checkpointPath);
      assert(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0);
      assert(process.getuid === undefined || metadata.uid === process.getuid());
      const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      assert(
        checkpoint.legacyRefreshSucceeded && checkpoint.sourceRefreshDigest === sourceRefreshDigest
      );
      refreshed = checkpoint.tokens;
      reusedCheckpoint = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      refreshed = await exchange({
        grant_type: 'refresh_token',
        refresh_token: saved.tokens.refresh_token,
        organization_id: config.organizationId,
        resource: audience,
        scope: scope
          .split(/\s+/)
          .filter((value) => value !== 'offline_access')
          .join(' '),
      });
    }
    const refreshedClaims = checkAccess(refreshed.access_token);
    assert.equal(refreshedClaims.sub, saved.claims.sub);
    assert.equal(refreshedClaims.organization_id, config.organizationId);
    assert.equal(refreshedClaims.winamz_session_uid, saved.serverSession.payload.uid);
    if (!reusedCheckpoint) {
      const checkpoint = await open(checkpointPath, 'wx', 0o600);
      await checkpoint.writeFile(
        JSON.stringify({
          legacyRefreshSucceeded: true,
          sourceRefreshDigest,
          tokens: refreshed,
          verifiedAt: new Date().toISOString(),
        }) + '\n'
      );
      await checkpoint.close();
    }
    console.log(
      reusedCheckpoint
        ? 'PASS verified legacy refresh checkpoint restored'
        : 'PASS pre-upgrade refresh token preserves original user and session UID'
    );

    stage = 'legacy original cookie authentication';
    const cookieState = randomBytes(20).toString('base64url');
    const cookieCode = await followCode(authorization(cookieState, 'none'), sourceJar, cookieState);
    const cookieTokens = await exchange({
      grant_type: 'authorization_code',
      code: cookieCode,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
      resource: audience,
    });
    const cookieClaims = checkAccess(cookieTokens.access_token);
    assert.equal(cookieClaims.sub, saved.claims.sub);
    assert.equal(cookieClaims.winamz_session_uid, saved.serverSession.payload.uid);
    console.log('PASS pre-upgrade signed cookies complete prompt=none authorization');

    stage = 'legacy refreshed token bridge';
    const bridge = await call(
      '/api/internal/silent-grant',
      {
        method: 'POST',
        headers: {
          Origin: config.origin,
          Authorization: `Bearer ${refreshed.access_token}`,
        },
      },
      webviewJar
    );
    assert.equal((await readJson(bridge)).ok, true);
    assert(webviewJar.values.size >= 2);
    stage = 'legacy bridged cross-client silent SSO';
    const childState = randomBytes(20).toString('base64url');
    const childCode = await childCodeWithConsent(webviewJar, childState, refreshed.access_token);
    const childTokens = await exchange({
      grant_type: 'authorization_code',
      code: childCode,
      client_id: ssoClientId,
      client_secret: ssoClientSecret,
      redirect_uri: ssoRedirectUri,
      code_verifier: verifier,
    });
    assert.equal(payload(childTokens.id_token).sub, saved.claims.sub);
    const userInfo = await readJson(await call('/oidc/me', { headers: { Authorization: `Bearer ${childTokens.access_token}` } }));
    assert.equal(userInfo.sub, saved.claims.sub);
    console.log('PASS old refresh token bridges original session to embedded client');

    stage = 'preserved authentication after cross-client SSO';
    verifyOriginalContext();
    stage = 'protocol logout';
    const logoutUrl = new URL('/oidc/session/end', base);
    logoutUrl.searchParams.set('id_token_hint', cookieTokens.id_token ?? saved.idToken);
    const logout = await call(logoutUrl, {}, webviewJar);
    assert.equal(logout.status, 200);
    const html = await logout.text();
    const action = html.match(/<form[^>]+action="([^"]+)"/i)?.[1];
    assert(action);
    const fields = new URLSearchParams({ logout: 'yes' });
    for (const input of html.matchAll(/<input[^>]*>/gi)) {
      const name = input[0].match(/name="([^"]+)"/i)?.[1];
      const value = input[0].match(/value="([^"]*)"/i)?.[1];
      if (name && value !== undefined) fields.set(name, value.replace(/&amp;/g, '&'));
    }
    assert(fields.has('xsrf'));
    const confirmation = await call(
      action.replace(/&amp;/g, '&'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fields,
      },
      webviewJar
    );
    assert(confirmation.status >= 200 && confirmation.status < 400);
    stage = 'post-logout bridge rejection';
    const denied = await call('/api/internal/silent-grant', {
      method: 'POST',
      headers: {
        Origin: config.origin,
        Authorization: `Bearer ${refreshed.access_token}`,
      },
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.getSetCookie().length, 0);
    console.log('PASS protocol logout invalidates source session; bridge returns401');
  }
} catch {
  console.error(`FAIL ${stage} (HTTP ${lastStatus ?? 'none'}); callback ${callbackError ?? "none"}; sensitive details suppressed`);
  process.exitCode = 1;
}
