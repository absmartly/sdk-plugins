import { URLMatcher } from '../URLMatcher';

describe('URLMatcher', () => {
  describe('Simple pattern matching', () => {
    it('matches exact URLs', () => {
      expect(URLMatcher.matches('https://example.com/page', 'https://example.com/page')).toBe(true);
      expect(URLMatcher.matches('https://example.com/page', 'https://example.com/other')).toBe(
        false
      );
    });

    it('matches wildcard patterns with *', () => {
      expect(URLMatcher.matches('https://example.com/*', 'https://example.com/any/path')).toBe(
        true
      );
      expect(URLMatcher.matches('https://example.com/*', 'https://example.com/')).toBe(true);
      expect(URLMatcher.matches('https://example.com/*', 'https://other.com/page')).toBe(false);
    });

    it('matches middle wildcards', () => {
      expect(
        URLMatcher.matches(
          'https://example.com/products/*/details',
          'https://example.com/products/123/details'
        )
      ).toBe(true);
      expect(
        URLMatcher.matches(
          'https://example.com/products/*/details',
          'https://example.com/products/abc/details'
        )
      ).toBe(true);
      expect(
        URLMatcher.matches(
          'https://example.com/products/*/details',
          'https://example.com/products/123/reviews'
        )
      ).toBe(false);
    });

    it('matches prefix wildcards', () => {
      expect(URLMatcher.matches('*/checkout', 'https://example.com/checkout')).toBe(true);
      expect(URLMatcher.matches('*/checkout', 'http://test.com/checkout')).toBe(true);
      expect(URLMatcher.matches('*/checkout', 'https://example.com/cart')).toBe(false);
    });

    it('matches wildcards containing domain', () => {
      expect(URLMatcher.matches('*example.com*', 'https://example.com/page')).toBe(true);
      expect(URLMatcher.matches('*example.com*', 'https://www.example.com/page')).toBe(true);
      expect(URLMatcher.matches('*example.com*', 'https://test.com/page')).toBe(false);
    });

    it('matches single character wildcard ?', () => {
      expect(URLMatcher.matches('https://example.com/page?', 'https://example.com/page1')).toBe(
        true
      );
      expect(URLMatcher.matches('https://example.com/page?', 'https://example.com/page2')).toBe(
        true
      );
      expect(URLMatcher.matches('https://example.com/page?', 'https://example.com/page12')).toBe(
        false
      );
    });

    it('escapes regex special characters', () => {
      expect(
        URLMatcher.matches('https://example.com/test.html', 'https://example.com/test.html')
      ).toBe(true);
      expect(
        URLMatcher.matches('https://example.com/test.html', 'https://example.com/testXhtml')
      ).toBe(false);
    });
  });

  describe('Array of patterns', () => {
    it('matches if any pattern matches', () => {
      const patterns = ['https://example.com/products/*', 'https://example.com/shop/*'];

      expect(URLMatcher.matches(patterns, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(patterns, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(patterns, 'https://example.com/about')).toBe(false);
    });

    it('handles empty array', () => {
      expect(URLMatcher.matches([], 'https://example.com/page')).toBe(true);
    });
  });

  describe('Advanced configuration with include/exclude', () => {
    it('handles exclude patterns', () => {
      const filter = {
        include: ['https://example.com/*'],
        exclude: ['https://example.com/admin/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/settings')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://other.com/page')).toBe(false);
    });

    it('exclude takes precedence over include', () => {
      const filter = {
        include: ['https://example.com/*'],
        exclude: ['https://example.com/products/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(false);
    });

    it('matches all when no include patterns', () => {
      const filter = {
        exclude: ['https://example.com/admin/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://other.com/page')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
    });
  });

  describe('Regex mode', () => {
    it('supports regex patterns', () => {
      const filter = {
        include: ['^https://example\\.com/(products|shop)/.*'],
        mode: 'regex' as const,
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('handles multiple regex patterns', () => {
      const filter = {
        include: ['^https://example\\.com/products/.*', '^https://example\\.com/shop/.*'],
        mode: 'regex' as const,
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('handles invalid regex patterns gracefully', () => {
      const filter = {
        include: ['[invalid regex'],
        mode: 'regex' as const,
      };

      // Should return false and not throw
      expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles URLs with query parameters', () => {
      expect(
        URLMatcher.matches(
          'https://example.com/products/*',
          'https://example.com/products/123?color=red'
        )
      ).toBe(true);
    });

    it('handles URLs with hash fragments', () => {
      expect(
        URLMatcher.matches('https://example.com/page', 'https://example.com/page#section')
      ).toBe(false);
      expect(
        URLMatcher.matches('https://example.com/page*', 'https://example.com/page#section')
      ).toBe(true);
    });

    it('handles empty string pattern', () => {
      expect(URLMatcher.matches('', 'https://example.com/page')).toBe(false);
    });

    it('handles undefined/empty filters', () => {
      const filter = {};
      expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(true);
    });
  });

  describe('Real-world use cases', () => {
    it('E-commerce: Product pages', () => {
      const filter = 'https://shop.example.com/products/*';

      expect(URLMatcher.matches(filter, 'https://shop.example.com/products/shoes')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://shop.example.com/products/shoes/nike')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://shop.example.com/cart')).toBe(false);
    });

    it('SPA: Multiple page patterns', () => {
      const filter = ['*/products/*', '*/shop/*', '*/checkout'];

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/checkout')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('Multi-domain: Include multiple domains', () => {
      const filter = {
        include: ['*example.com/*', '*example.net/*'],
        exclude: ['*example.com/admin/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.net/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://other.com/page')).toBe(false);
    });
  });
});
