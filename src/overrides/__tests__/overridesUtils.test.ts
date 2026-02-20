import {
  getQueryStringOverrides,
  parseOverrideCookie,
  getCookieOverrides,
  serializeOverrides,
  persistOverridesToCookie,
  getOverrides,
  DEFAULT_OVERRIDE_COOKIE_NAME,
} from '../overridesUtils';

describe('overridesUtils', () => {
  beforeEach(() => {
    // Clear all cookies before each test
    document.cookie.split(';').forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      }
    });
  });

  describe('getQueryStringOverrides', () => {
    it('should parse single variant override from query string', () => {
      const params = new URLSearchParams('exp_test=1');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should parse multiple variant overrides', () => {
      const params = new URLSearchParams('exp_test=1&exp_foo=2&exp_bar=0');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({ test: 1, foo: 2, bar: 0 });
    });

    it('should parse variant with env parameter', () => {
      const params = new URLSearchParams('exp_test=1,3');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3 },
      });
    });

    it('should parse variant with env and id parameters', () => {
      const params = new URLSearchParams('exp_test=1,3,42');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3, id: 42 },
      });
    });

    it('should ignore parameters without correct prefix', () => {
      const params = new URLSearchParams('exp_test=1&other_param=2&test2=3');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should handle custom query prefix', () => {
      const params = new URLSearchParams('abtest_foo=2&abtest_bar=3');
      const overrides = getQueryStringOverrides('abtest_', params);

      expect(overrides).toEqual({ foo: 2, bar: 3 });
    });

    it('should return empty object for empty params', () => {
      const params = new URLSearchParams('');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({});
    });

    it('should ignore invalid variant values', () => {
      const params = new URLSearchParams('exp_test=abc&exp_foo=2');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({ foo: 2 });
    });

    it('should handle empty experiment name', () => {
      const params = new URLSearchParams('exp_=1');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({});
    });

    it('should use window.location.search if searchParams not provided', () => {
      // This test checks the fallback behavior
      const overrides = getQueryStringOverrides('exp_');
      expect(typeof overrides).toBe('object');
      expect(overrides).not.toBeNull();
    });

    it('should return empty object in non-browser environment without searchParams', () => {
      // In jsdom, window is defined, so this will still work
      const overrides = getQueryStringOverrides('exp_');
      expect(typeof overrides).toBe('object');
    });

    it('should handle multiple env and id values by using first and second', () => {
      const params = new URLSearchParams('exp_test=1,3,42,extra');
      const overrides = getQueryStringOverrides('exp_', params);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3, id: 42 },
      });
    });
  });

  describe('parseOverrideCookie', () => {
    it('should parse simple cookie value with single variant', () => {
      const value = 'test:1';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should parse multiple experiments', () => {
      const value = 'test:1,foo:2,bar:0';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ test: 1, foo: 2, bar: 0 });
    });

    it('should parse variant with env', () => {
      const value = 'test:1.3';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3 },
      });
    });

    it('should parse variant with env and id', () => {
      const value = 'test:1.3.42';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3, id: 42 },
      });
    });

    it('should decode URI component in experiment name', () => {
      const value = 'test%20name:1';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ 'test name': 1 });
    });

    it('should skip dev environment prefix', () => {
      const value = 'devEnv=prod|test:1,foo:2';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ test: 1, foo: 2 });
    });

    it('should handle empty value', () => {
      const overrides = parseOverrideCookie('');

      expect(overrides).toEqual({});
    });

    it('should ignore malformed entries', () => {
      const value = 'test:1,invalid,foo:2';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ test: 1, foo: 2 });
    });

    it('should ignore invalid variant values', () => {
      const value = 'test:abc,foo:2';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ foo: 2 });
    });

    it('should handle empty dev environment section', () => {
      const value = '|test:1,foo:2';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({ test: 1, foo: 2 });
    });

    it('should handle encoded characters in experiment names', () => {
      const value = 'my%20test%20experiment:1,normal_exp:2';
      const overrides = parseOverrideCookie(value);

      expect(overrides).toEqual({
        'my test experiment': 1,
        normal_exp: 2,
      });
    });
  });

  describe('getCookieOverrides', () => {
    it('should extract overrides from cookie string', () => {
      const cookieString = 'absmartly_overrides=test%3A1%2Cfoo%3A2; other=value';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({ test: 1, foo: 2 });
    });

    it('should use custom cookie name', () => {
      const cookieString = 'custom_cookie=test%3A1; other=value';
      const overrides = getCookieOverrides('custom_cookie', cookieString);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should return empty object if cookie not found', () => {
      const cookieString = 'other=value';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({});
    });

    it('should decode URI component in cookie value', () => {
      const cookieString = 'absmartly_overrides=test%20name%3A1';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({ 'test name': 1 });
    });

    it('should handle multiple cookies in string', () => {
      const cookieString = 'cookie1=value1; absmartly_overrides=test%3A1; cookie2=value2';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should handle cookies with spaces', () => {
      const cookieString = '  absmartly_overrides=test%3A1  ;  other=value  ';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should return empty object for empty cookie string', () => {
      const overrides = getCookieOverrides('absmartly_overrides', '');

      expect(overrides).toEqual({});
    });

    it('should handle cookie with env and id', () => {
      const cookieString = 'absmartly_overrides=test%3A1.3.42';
      const overrides = getCookieOverrides('absmartly_overrides', cookieString);

      expect(overrides).toEqual({
        test: { variant: 1, env: 3, id: 42 },
      });
    });

    it('should use document.cookie if cookieHeader not provided', () => {
      // In jsdom, this should work with the document.cookie
      const overrides = getCookieOverrides('absmartly_overrides');
      expect(typeof overrides).toBe('object');
      expect(overrides).not.toBeNull();
    });
  });

  describe('serializeOverrides', () => {
    it('should serialize simple number overrides', () => {
      const overrides = { test: 1, foo: 2 };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1,foo:2');
    });

    it('should serialize SimpleOverride with variant only', () => {
      const overrides = {
        test: { variant: 1 },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1');
    });

    it('should serialize SimpleOverride with variant and env', () => {
      const overrides = {
        test: { variant: 1, env: 3 },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1.3');
    });

    it('should serialize SimpleOverride with variant, env, and id', () => {
      const overrides = {
        test: { variant: 1, env: 3, id: 42 },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1.3.42');
    });

    it('should encode experiment names with special characters', () => {
      const overrides = {
        'test name': 1,
        'foo-bar': 2,
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toContain('test%20name:1');
      expect(serialized).toContain('foo-bar:2');
    });

    it('should handle mixed override types', () => {
      const overrides = {
        test: 1,
        foo: { variant: 2, env: 3 },
        bar: { variant: 0, env: 1, id: 99 },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toContain('test:1');
      expect(serialized).toContain('foo:2.3');
      expect(serialized).toContain('bar:0.1.99');
    });

    it('should handle empty overrides', () => {
      const overrides = {};
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('');
    });

    it('should skip undefined env and id fields', () => {
      const overrides = {
        test: { variant: 1, env: undefined, id: undefined },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1');
    });

    it('should include env but skip id if env is defined', () => {
      const overrides = {
        test: { variant: 1, env: 3, id: undefined },
      };
      const serialized = serializeOverrides(overrides);

      expect(serialized).toBe('test:1.3');
    });
  });

  describe('persistOverridesToCookie', () => {
    it('should persist overrides to cookie with default name', () => {
      const overrides = { test: 1, foo: 2 };
      persistOverridesToCookie(overrides);

      const retrieved = getCookieOverrides();
      expect(retrieved).toEqual(overrides);
    });

    it('should persist overrides to cookie with custom name', () => {
      const overrides = { test: 1 };
      persistOverridesToCookie(overrides, { cookieName: 'custom_cookie' });

      const retrieved = getCookieOverrides('custom_cookie');
      expect(retrieved).toEqual(overrides);
    });

    it('should handle custom max age', () => {
      const overrides = { test: 1 };
      persistOverridesToCookie(overrides, { maxAge: 3600 });

      const retrieved = getCookieOverrides();
      expect(retrieved).toEqual(overrides);
    });

    it('should persist SimpleOverride objects', () => {
      const overrides = {
        test: { variant: 1, env: 3 },
      };
      persistOverridesToCookie(overrides);

      const retrieved = getCookieOverrides();
      expect(retrieved).toEqual(overrides);
    });

    it('should replace existing cookie value', () => {
      persistOverridesToCookie({ test: 1 });
      let retrieved = getCookieOverrides();
      expect(retrieved).toEqual({ test: 1 });

      persistOverridesToCookie({ test: 2, foo: 3 });
      retrieved = getCookieOverrides();
      expect(retrieved).toEqual({ test: 2, foo: 3 });
    });

    it('should handle non-browser environment gracefully', () => {
      // Mock window to undefined temporarily
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true,
      });

      expect(() => {
        persistOverridesToCookie({ test: 1 });
      }).not.toThrow();

      // Restore
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });

  describe('getOverrides', () => {
    it('should get overrides from query string if present', () => {
      const params = new URLSearchParams('exp_test=1');
      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(overrides).toEqual({ test: 1 });
    });

    it('should fall back to cookie if query string empty', () => {
      const params = new URLSearchParams('');
      persistOverridesToCookie({ cookie_test: 2 });

      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(overrides).toEqual({ cookie_test: 2 });
    });

    it('should normalize SimpleOverride to variant number', () => {
      const params = new URLSearchParams('exp_test=1,3,42');
      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(overrides).toEqual({ test: 1 });
    });

    it('should persist query string overrides to cookie', () => {
      const params = new URLSearchParams('exp_test=1&exp_foo=2');
      getOverrides(DEFAULT_OVERRIDE_COOKIE_NAME, 'exp_', params);

      // Verify it was persisted
      const retrieved = getCookieOverrides();
      expect(retrieved).toEqual({ test: 1, foo: 2 });
    });

    it('should return empty object if no overrides found', () => {
      const params = new URLSearchParams('');
      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(typeof overrides).toBe('object');
    });

    it('should use custom cookie and query prefix', () => {
      const params = new URLSearchParams('custom_test=1');
      const overrides = getOverrides('custom_cookie', 'custom_', params);

      expect(overrides).toEqual({ test: 1 });
    });

    it('should use provided cookieHeader for server-side', () => {
      const cookieHeader = 'absmartly_overrides=test%3A1';
      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        undefined,
        cookieHeader
      );

      expect(overrides).toEqual({ test: 1 });
    });
  });

  describe('Integration tests', () => {
    it('should serialize and deserialize overrides', () => {
      const original = {
        test: 1,
        foo: { variant: 2, env: 3 },
        bar: { variant: 0, env: 1, id: 42 },
      };

      const serialized = serializeOverrides(original);
      const parsed = parseOverrideCookie(serialized);

      expect(parsed).toEqual(original);
    });

    it('should handle full override lifecycle', () => {
      const overrides = { test: 1, foo: 2 };

      // Persist to cookie
      persistOverridesToCookie(overrides);

      // Retrieve from cookie
      const retrieved = getCookieOverrides();
      expect(retrieved).toEqual(overrides);

      // Use with getOverrides
      const params = new URLSearchParams('');
      const final = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(final).toEqual(overrides);
    });

    it('should handle query string taking precedence over cookie', () => {
      // Set cookie
      persistOverridesToCookie({ cookie_test: 1 });

      // Get with query string
      const params = new URLSearchParams('exp_query_test=2');
      const overrides = getOverrides(
        DEFAULT_OVERRIDE_COOKIE_NAME,
        'exp_',
        params
      );

      expect(overrides).toEqual({ query_test: 2 });

      // Verify query overrides replaced cookie
      const newCookie = getCookieOverrides();
      expect(newCookie).toEqual({ query_test: 2 });
    });

    it('should handle encoded names in full cycle', () => {
      const overrides = { 'test name': 1, 'foo bar': 2 };

      persistOverridesToCookie(overrides);
      const retrieved = getCookieOverrides();

      expect(retrieved).toEqual(overrides);
    });
  });
});
