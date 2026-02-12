/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import * as path from 'path';
import * as fs from 'fs';

const SRC_DIR = path.resolve(__dirname, '..');

function getSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'generated') continue;
      results.push(...getSourceFiles(fullPath));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Production logging policy', () => {
  const CONSOLE_PATTERN = /console\.(log|warn|error|info|debug)\s*\(/g;
  const ALLOWED_VERSION_PATTERN = /console\.log\(`\[ABsmartly\].*\$\{.*\.VERSION\}.*initialized`\)/;

  const sourceFiles = getSourceFiles(SRC_DIR);

  it('should have found source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of sourceFiles) {
    const relativePath = path.relative(SRC_DIR, filePath);

    if (relativePath === 'utils/debug.ts') {
      it(`${relativePath} - console calls are gated by DEBUG`, () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (CONSOLE_PATTERN.test(line)) {
            CONSOLE_PATTERN.lastIndex = 0;
            const insideDebugGuard = lines
              .slice(0, i)
              .some(prev => prev.includes('if (DEBUG)') || prev.includes('if (BUILD_DEBUG)'));
            expect({
              file: relativePath,
              line: i + 1,
              code: line.trim(),
              insideDebugGuard,
            }).toEqual(expect.objectContaining({ insideDebugGuard: true }));
          }
          CONSOLE_PATTERN.lastIndex = 0;
        }
      });
      continue;
    }

    it(`${relativePath} - no direct console calls (except allowed version log)`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const violations: Array<{ line: number; code: string }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (CONSOLE_PATTERN.test(line)) {
          CONSOLE_PATTERN.lastIndex = 0;
          if (ALLOWED_VERSION_PATTERN.test(line)) continue;
          if (line.trimStart().startsWith('//')) continue;
          violations.push({ line: i + 1, code: line.trim() });
        }
        CONSOLE_PATTERN.lastIndex = 0;
      }

      if (violations.length > 0) {
        fail(
          `Found ${violations.length} disallowed console call(s) in ${relativePath}:\n` +
            violations.map(v => `  line ${v.line}: ${v.code}`).join('\n') +
            '\n\nUse logDebug() from utils/debug.ts instead.'
        );
      }
    });
  }
});

describe('DEBUG flag is off in production builds', () => {
  it('BUILD_DEBUG should be false', () => {
    const { BUILD_DEBUG } = require('../generated/buildInfo');
    expect(BUILD_DEBUG).toBe(false);
  });

  it('DEBUG export should be false', () => {
    const { DEBUG } = require('../utils/debug');
    expect(DEBUG).toBe(false);
  });

  it('logDebug should not call console.log when DEBUG is false', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    consoleSpy.mockClear();

    const { logDebug } = require('../utils/debug');
    logDebug('this should not appear');
    logDebug('this should not appear either', { experimentName: 'test' });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('Plugin initialization only produces version log', () => {
  let consoleSpy: jest.SpyInstance;
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalLog = console.log;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    console.log = originalLog;
  });

  it('DOMChangesPluginLite constructor only logs the version message', () => {
    const { createTestSDK, createTestContext } = require('./sdk-helper');
    const { createEmptyContextData } = require('./fixtures');
    const { DOMChangesPluginLite } = require('../core/DOMChangesPluginLite');

    const sdk = createTestSDK();
    const context = createTestContext(sdk, createEmptyContextData());

    consoleSpy.mockClear();
    const plugin = new DOMChangesPluginLite({ context });

    const calls = consoleSpy.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toMatch(/\[ABsmartly\] DOMChangesPluginLite v.+ initialized/);

    plugin.destroy();
  });

  it('URLRedirectPlugin constructor only logs the version message', () => {
    const { createTestSDK, createTestContext } = require('./sdk-helper');
    const { createEmptyContextData } = require('./fixtures');
    const { URLRedirectPlugin } = require('../url-redirect/URLRedirectPlugin');

    const sdk = createTestSDK();
    const context = createTestContext(sdk, createEmptyContextData());

    consoleSpy.mockClear();
    const plugin = new URLRedirectPlugin({ context });

    const calls = consoleSpy.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toMatch(/\[ABsmartly\] URLRedirectPlugin v.+ initialized/);

    plugin.destroy();
  });
});
