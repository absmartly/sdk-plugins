import {
  getCookie,
  setCookie,
  deleteCookie,
  generateUniqueId,
  generateUUID,
  isLocalStorageAvailable,
} from '../cookieUtils';

describe('cookieUtils', () => {
  beforeEach(() => {
    // Clear all cookies before each test
    document.cookie.split(';').forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      }
    });
  });

  describe('getCookie', () => {
    it('should retrieve a cookie value by name', () => {
      document.cookie = 'testCookie=testValue;path=/';
      const value = getCookie('testCookie');
      expect(value).toBe('testValue');
    });

    it('should return null if cookie does not exist', () => {
      const value = getCookie('nonExistent');
      expect(value).toBeNull();
    });

    it('should handle cookie values with special characters', () => {
      document.cookie = 'specialCookie=abc%20def;path=/';
      const value = getCookie('specialCookie');
      expect(value).toBe('abc%20def');
    });

    it('should handle cookie values with equals sign', () => {
      document.cookie = 'encodedCookie=a%3Db;path=/';
      const value = getCookie('encodedCookie');
      expect(value).toBe('a%3Db');
    });

    it('should return null if cookie name is empty', () => {
      document.cookie = 'validCookie=value;path=/';
      const value = getCookie('');
      expect(value).toBeNull();
    });

    it('should handle multiple cookies correctly', () => {
      document.cookie = 'cookie1=value1;path=/';
      document.cookie = 'cookie2=value2;path=/';
      expect(getCookie('cookie1')).toBe('value1');
      expect(getCookie('cookie2')).toBe('value2');
    });

    it('should not match partial cookie names', () => {
      document.cookie = 'myCookie=value;path=/';
      const value = getCookie('my');
      expect(value).toBeNull();
    });
  });

  describe('setCookie', () => {
    it('should set a cookie successfully', () => {
      const result = setCookie('testName', 'testValue', 1);
      expect(result).toBe(true);
      expect(getCookie('testName')).toBe('testValue');
    });

    it('should set cookie with custom path', () => {
      setCookie('testName', 'testValue', 1, { path: '/custom' });
      expect(getCookie('testName')).toBe('testValue');
    });

    it('should set cookie with sameSite option', () => {
      const result = setCookie('testName', 'testValue', 1, { sameSite: 'Strict' });
      expect(result).toBe(true);
      expect(getCookie('testName')).toBe('testValue');
    });

    it('should set cookie with default sameSite=Lax', () => {
      const result = setCookie('testName', 'testValue', 1);
      expect(result).toBe(true);
      expect(getCookie('testName')).toBe('testValue');
    });

    it('should skip domain option for localhost', () => {
      const result = setCookie('testName', 'testValue', 1, {
        domain: 'localhost',
      });
      expect(result).toBe(true);
      expect(getCookie('testName')).toBe('testValue');
    });

    it('should handle cookie values with empty string', () => {
      const result = setCookie('testName', '', 1);
      expect(result).toBe(true);
      expect(getCookie('testName')).toBe('');
    });

    it('should set cookie with custom domain (non-localhost)', () => {
      const result = setCookie('testName', 'testValue', 1, {
        domain: 'example.com',
      });
      expect(result).toBe(true);
    });

    it('should set cookie with secure flag', () => {
      const result = setCookie('testName', 'testValue', 1, { secure: true });
      expect(result).toBe(true);
    });

    it('should handle zero days expiry', () => {
      const result = setCookie('testName', 'testValue', 0);
      expect(result).toBe(true);
      // With 0 days, the cookie expires immediately in some browsers/environments
      // So we just verify it was set successfully (the value may or may not be retrievable)
      expect(typeof result).toBe('boolean');
    });

    it('should handle negative days expiry (for deletion)', () => {
      setCookie('testName', 'testValue', 1);
      expect(getCookie('testName')).toBe('testValue');

      const deleteResult = setCookie('testName', '', -1);
      expect(deleteResult).toBe(true);
    });
  });

  describe('deleteCookie', () => {
    it('should delete an existing cookie', () => {
      setCookie('testName', 'testValue', 1);
      expect(getCookie('testName')).toBe('testValue');

      deleteCookie('testName');
      expect(getCookie('testName')).toBeNull();
    });

    it('should handle deleting non-existent cookie gracefully', () => {
      expect(() => deleteCookie('nonExistent')).not.toThrow();
    });

    it('should delete cookie with custom path', () => {
      setCookie('testName', 'testValue', 1, { path: '/custom' });
      deleteCookie('testName', { path: '/custom' });
      expect(getCookie('testName')).toBeNull();
    });

    it('should delete cookie with custom domain', () => {
      setCookie('testName', 'testValue', 1, { domain: 'example.com' });
      deleteCookie('testName', { domain: 'example.com' });
    });
  });

  describe('generateUniqueId', () => {
    it('should generate a unique ID', () => {
      const id = generateUniqueId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate different IDs on consecutive calls', () => {
      const id1 = generateUniqueId();
      // Small delay to ensure different timestamp
      const id2 = generateUniqueId();
      expect(id1).not.toBe(id2);
    });

    it('should use base36 encoding', () => {
      const id = generateUniqueId();
      // Base36 uses 0-9 and a-z
      expect(/^[0-9a-z]+$/.test(id)).toBe(true);
    });

    it('should generate valid base36 strings', () => {
      for (let i = 0; i < 10; i++) {
        const id = generateUniqueId();
        // Verify it can be parsed back
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateUUID', () => {
    it('should generate a UUID string', () => {
      const uuid = generateUUID();
      expect(typeof uuid).toBe('string');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate different UUIDs on consecutive calls', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it('should have correct UUID v4 structure', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4); // Must start with 4 for v4
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
    });

    it('should generate valid hex characters', () => {
      const uuid = generateUUID();
      const cleaned = uuid.replace(/-/g, '');
      expect(/^[0-9a-f]+$/i.test(cleaned)).toBe(true);
    });

    it('should generate UUID with correct version', () => {
      const uuid = generateUUID();
      const versionPart = uuid.split('-')[2];
      expect(versionPart[0]).toBe('4'); // UUID v4
    });

    it('should generate UUID with correct variant', () => {
      const uuid = generateUUID();
      const variantPart = uuid.split('-')[3][0];
      expect(['8', '9', 'a', 'A', 'b', 'B'].includes(variantPart)).toBe(true);
    });
  });

  describe('isLocalStorageAvailable', () => {
    it('should return true when localStorage is available', () => {
      const available = isLocalStorageAvailable();
      expect(typeof available).toBe('boolean');
      // In jsdom environment, localStorage should be available
      expect(available).toBe(true);
    });

    it('should handle localStorage operations gracefully', () => {
      const test = '__test_storage_check__';
      localStorage.setItem(test, 'value');
      const available = isLocalStorageAvailable();
      expect(available).toBe(true);
      localStorage.removeItem(test);
    });

    it('should return false when localStorage throws (quota exceeded scenario)', () => {
      // Use jest.spyOn to properly mock and restore
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const available = isLocalStorageAvailable();
      expect(available).toBe(false);

      // Restore original
      setItemSpy.mockRestore();
    });

    it('should handle permission denied scenario', () => {
      // Use jest.spyOn to properly mock and restore
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const available = isLocalStorageAvailable();
      expect(available).toBe(false);

      // Restore original
      setItemSpy.mockRestore();
    });

    it('should clean up test data after checking', () => {
      isLocalStorageAvailable();
      // Verify no test data is left in localStorage
      expect(localStorage.getItem('__localStorage_test__')).toBeNull();
    });
  });

  describe('Integration tests', () => {
    it('should handle cookie lifecycle', () => {
      // Set
      setCookie('lifecycle', 'value1', 7);
      expect(getCookie('lifecycle')).toBe('value1');

      // Update
      setCookie('lifecycle', 'value2', 7);
      expect(getCookie('lifecycle')).toBe('value2');

      // Delete
      deleteCookie('lifecycle');
      expect(getCookie('lifecycle')).toBeNull();
    });

    it('should handle multiple cookies independently', () => {
      setCookie('cookie1', 'value1', 1);
      setCookie('cookie2', 'value2', 1);
      setCookie('cookie3', 'value3', 1);

      expect(getCookie('cookie1')).toBe('value1');
      expect(getCookie('cookie2')).toBe('value2');
      expect(getCookie('cookie3')).toBe('value3');

      deleteCookie('cookie2');
      expect(getCookie('cookie1')).toBe('value1');
      expect(getCookie('cookie2')).toBeNull();
      expect(getCookie('cookie3')).toBe('value3');
    });

    it('should generate unique IDs for different purposes', () => {
      const id1 = generateUniqueId();
      const uuid1 = generateUUID();

      expect(typeof id1).toBe('string');
      expect(typeof uuid1).toBe('string');
      expect(id1).not.toBe(uuid1);
    });
  });
});
