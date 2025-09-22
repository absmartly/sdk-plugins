import { OverridesPluginLite } from '../OverridesPluginLite';

describe('OverridesPluginLite', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({ experiments: [] }),
      peek: jest.fn(),
      __plugins: undefined,
    };

    // Clear cookies
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.split('=');
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });

    // Clear query string
    delete (window as any).location;
    (window as any).location = new URL('http://localhost');
  });

  describe('plugin registration', () => {
    it('should register with context on initialization', async () => {
      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
      });

      await plugin.initialize();

      // Check registration
      expect(mockContext.__plugins).toBeDefined();
      expect(mockContext.__plugins?.overridesPlugin).toBeDefined();
      expect(mockContext.__plugins?.overridesPlugin?.name).toBe('OverridesPluginLite');
      expect(mockContext.__plugins?.overridesPlugin?.version).toBe('1.0.0');
      expect(mockContext.__plugins?.overridesPlugin?.initialized).toBe(true);
      expect(mockContext.__plugins?.overridesPlugin?.capabilities).toContain('cookie-overrides');
      expect(mockContext.__plugins?.overridesPlugin?.capabilities).toContain('query-overrides');
      expect(mockContext.__plugins?.overridesPlugin?.instance).toBe(plugin);
    });

    it('should unregister from context on destroy', async () => {
      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
      });

      await plugin.initialize();
      expect(mockContext.__plugins?.overridesPlugin).toBeDefined();

      plugin.destroy();
      expect(mockContext.__plugins?.overridesPlugin).toBeUndefined();
    });

    it('should not register twice', async () => {
      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
      });

      await plugin.initialize();
      const firstRegistration = mockContext.__plugins?.overridesPlugin;

      await plugin.initialize();
      expect(mockContext.__plugins?.overridesPlugin).toBe(firstRegistration);
    });

    it('should use ready() alias', async () => {
      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
      });

      await plugin.ready();

      expect(mockContext.__plugins?.overridesPlugin).toBeDefined();
      expect(mockContext.__plugins?.overridesPlugin?.initialized).toBe(true);
    });
  });

  describe('override functionality', () => {
    it('should apply cookie overrides', async () => {
      document.cookie = 'test_overrides=exp1:1,exp2:0';

      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
      });

      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('exp2', 0);
    });

    it('should apply query string overrides', async () => {
      (window as any).location = new URL('http://localhost?_exp_test=2&_exp_another=1');

      const plugin = new OverridesPluginLite({
        context: mockContext,
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('test', 2);
      expect(mockContext.override).toHaveBeenCalledWith('another', 1);
    });

    it('should prefer query string over cookies', async () => {
      document.cookie = 'test_overrides=exp1:0';
      (window as any).location = new URL('http://localhost?_exp_exp1=2');

      const plugin = new OverridesPluginLite({
        context: mockContext,
        cookieName: 'test_overrides',
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      await plugin.initialize();

      // Should use query string value (2) not cookie value (0)
      expect(mockContext.override).toHaveBeenCalledWith('exp1', 2);
      expect(mockContext.override).toHaveBeenCalledTimes(1);
    });
  });
});