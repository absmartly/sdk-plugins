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

  describe('path-prefix redirects', () => {
    const pathPrefixRedirect: URLRedirect = {
      from: 'https://example.com',
      to: 'https://example.com/v1',
      type: 'path-prefix',
      preservePath: true,
    };

    it('should prepend path prefix to current path', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [pathPrefixRedirect],
        'test-exp',
        1
      );

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://example.com/v1/about');
    });

    it('should handle root path', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/',
        [pathPrefixRedirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/');
    });

    it('should preserve query string and hash', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/pricing?plan=pro#features',
        [pathPrefixRedirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/pricing?plan=pro#features');
    });

    it('should handle deep paths', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://example.com/blog/2024/my-post',
        [pathPrefixRedirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/blog/2024/my-post');
    });

    it('should not match different domain', () => {
      const match = URLRedirectMatcher.findMatch(
        'https://other.com/about',
        [pathPrefixRedirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });

    it('should not preserve query when preservePath is false', () => {
      const redirect: URLRedirect = {
        ...pathPrefixRedirect,
        preservePath: false,
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about?ref=test',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/about');
    });

    it('should work with cross-domain prefix redirect', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com',
        to: 'https://dev.example.com',
        type: 'path-prefix',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://dev.example.com/about');
    });

    it('should handle trailing slash in prefix', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com',
        to: 'https://example.com/v1/',
        type: 'path-prefix',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/about');
    });
  });

  describe('pattern redirects', () => {
    it('should match wildcard pattern and replace in target', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://dev.example.com/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://dev.example.com/about');
    });

    it('should handle root path with wildcard', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://example.com/v1/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/');
    });

    it('should handle deep paths', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://example.com/v1/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/blog/2024/post',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/blog/2024/post');
    });

    it('should match path prefix pattern', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/blog/*',
        to: 'https://example.com/v2/blog/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/blog/my-post',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v2/blog/my-post');
    });

    it('should not match non-matching prefix', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/blog/*',
        to: 'https://example.com/v2/blog/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });

    it('should not match different domain', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://dev.example.com/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://other.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
    });

    it('should preserve query string and hash', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://dev.example.com/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page?utm=test#section',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://dev.example.com/page?utm=test#section');
    });

    it('should not preserve query when preservePath is false', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://dev.example.com/*',
        type: 'pattern',
        preservePath: false,
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page?utm=test#section',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://dev.example.com/page');
    });

    it('should handle multiple wildcards', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*/items/*',
        to: 'https://example.com/v2/*/products/*',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/shop/items/shoes',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v2/shop/products/shoes');
    });

    it('should support $1 $2 indexed references to reorder captures', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*/items/*',
        to: 'https://example.com/v2/$2/by-shop/$1',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/shop/items/shoes',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v2/shoes/by-shop/shop');
    });

    it('should support $1 reference with single capture', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://example.com/v1/$1',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/about',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/v1/about');
    });

    it('should support reusing same capture multiple times', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://example.com/$1/mirror/$1',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/page/mirror/page');
    });

    it('should treat out-of-range $N references as empty string', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/*',
        to: 'https://example.com/$1/extra/$2',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/page',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/page/extra/');
    });

    it('should handle exact path with no wildcard', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/old',
        to: 'https://example.com/new',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/old',
        [redirect],
        'test-exp',
        1
      );

      expect(match?.targetUrl).toBe('https://example.com/new');
    });

    it('should not match exact path pattern against different path', () => {
      const redirect: URLRedirect = {
        from: 'https://example.com/old',
        to: 'https://example.com/new',
        type: 'pattern',
      };

      const match = URLRedirectMatcher.findMatch(
        'https://example.com/other',
        [redirect],
        'test-exp',
        1
      );

      expect(match).toBeNull();
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
