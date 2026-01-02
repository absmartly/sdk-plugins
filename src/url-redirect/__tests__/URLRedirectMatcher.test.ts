import { URLRedirectMatcher } from '../URLRedirectMatcher';
import { URLRedirect } from '../types';

describe('URLRedirectMatcher', () => {
  describe('domain redirects', () => {
    const domainRedirect: URLRedirect = {
      from: 'https://old-domain.com',
      to: 'https://new-domain.com',
      type: 'domain',
      preservePath: true,
    };

    it('should match domain and preserve path', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://old-domain.com/some/path?query=1#hash',
        [domainRedirect],
        'test-exp',
        1
      );

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://new-domain.com/some/path?query=1#hash');
      expect(match?.experimentName).toBe('test-exp');
      expect(match?.variant).toBe(1);
      expect(match?.isControl).toBe(false);
    });

    it('should not match different domain', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://different-domain.com/path',
        [domainRedirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });

    it('should not preserve path when preservePath is false', () => {
      const redirect: URLRedirect = {
        ...domainRedirect,
        preservePath: false,
      };

      const match = URLRedirectMatcher.findMatch(
        'https://old-domain.com/some/path?query=1',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://new-domain.com/');
    });

    it('should identify control variant', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://old-domain.com/',
        [domainRedirect],
        'test-exp',
        0
      );

      expect(match?.isControl).toBe(true);
    });
  });

  describe('page redirects', () => {
    const pageRedirect: URLRedirect = {
      from: 'https://example.com/old-page',
      to: 'https://example.com/new-page',
      type: 'page',
      preservePath: true,
    };

    it('should match exact page path', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/old-page',
        [pageRedirect],
        'test-exp',
        1
      );

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://example.com/new-page');
    });

    it('should preserve query string and hash', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/old-page?utm_source=test#section',
        [pageRedirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/new-page?utm_source=test#section');
    });

    it('should not match different path', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/other-page',
        [pageRedirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });

    it('should not match subpath', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/old-page/subpath',
        [pageRedirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });
  });

  describe('multiple redirects', () => {
    const redirects: URLRedirect[] = [
      {
        from: 'https://example.com/page-a',
        to: 'https://example.com/new-page-a',
        type: 'page',
      },
      {
        from: 'https://example.com/page-b',
        to: 'https://example.com/new-page-b',
        type: 'page',
      },
      {
        from: 'https://old.example.com',
        to: 'https://new.example.com',
        type: 'domain',
      },
    ];

    it('should find first matching redirect', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page-a',
        redirects,
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/new-page-a');
    });

    it('should find second matching redirect', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page-b',
        redirects,
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/new-page-b');
    });

    it('should find domain redirect', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://old.example.com/any/path',
        redirects,
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://new.example.com/any/path');
    });
  });

  describe('buildTargetUrl', () => {
    it('should build target URL for matching redirect', () => {
      const redirect: URLRedirect = {
        from: 'https://old.com',
        to: 'https://new.com',
        type: 'domain',
      };

      const targetUrl = URLRedirectMatcher.buildTargetUrl('https://old.com/path', redirect);
      expect(targetUrl).toBe('https://new.com/path');
    });

    it('should return original URL for non-matching redirect', () => {
      const redirect: URLRedirect = {
        from: 'https://old.com',
        to: 'https://new.com',
        type: 'domain',
      };

      const targetUrl = URLRedirectMatcher.buildTargetUrl('https://other.com/path', redirect);
      expect(targetUrl).toBe('https://other.com/path');
    });
  });

  describe('invalid URLs', () => {
    it('should handle invalid current URL', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com',
        to: 'https://new.example.com',
        type: 'domain',
      };

      const match = URLRedirectMatcher.findMatch('not-a-url', [redirect], 'test-exp', 1);
      expect(match).toBeNull();
    });

    it('should handle invalid from URL in redirect', () => {
      const redirect: URLRedirect = {
        from: 'not-a-url',
        to: 'https://new.example.com',
        type: 'domain',
      };

      const match = URLRedirectMatcher.findMatch('https://example.com', [redirect], 'test-exp', 1);
      expect(match).toBeNull();
    });
  });
});
