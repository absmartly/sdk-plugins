const path = require('path');

// Define all the build variants
const BUILDS = {
  // DOM Changes only (smallest bundle)
  'dom-only': {
    entry: './src/entries/dom-only.ts',
    filename: 'absmartly-dom-changes-core.min.js',
    library: 'ABsmartlyDOM'
  },
  // DOM + Overrides Lite (medium bundle)
  'dom-lite': {
    entry: './src/entries/dom-with-overrides-lite.ts',
    filename: 'absmartly-dom-changes-lite.min.js',
    library: 'ABsmartlyDOMLite'
  },
  // DOM + Overrides Full (full features)
  'dom-full': {
    entry: './src/entries/dom-with-overrides-full.ts',
    filename: 'absmartly-sdk-plugins.min.js',
    library: 'ABsmartlySDKPlugins'
  },
  // Overrides Lite only (for use with existing DOM plugin)
  'overrides-lite': {
    entry: './src/entries/overrides-lite-only.ts',
    filename: 'absmartly-overrides-lite.min.js',
    library: 'ABsmartlyOverridesLite'
  },
  // Overrides Full only (for use with existing DOM plugin)
  'overrides-full': {
    entry: './src/entries/overrides-full-only.ts',
    filename: 'absmartly-overrides-full.min.js',
    library: 'ABsmartlyOverridesFull'
  },
  // Cookie Plugin only (standalone cookie management)
  'cookie-only': {
    entry: './src/entries/cookie-only.ts',
    filename: 'absmartly-cookie.min.js',
    library: 'ABsmartlyCookie'
  },
  // Web Vitals Plugin only (standalone web vitals tracking)
  'vitals-only': {
    entry: './src/entries/vitals-only.ts',
    filename: 'absmartly-vitals.min.js',
    library: 'ABsmartlyVitals'
  }
};

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  // Get the build type from environment variable or build all
  const buildType = env?.BUILD_TYPE || 'all';

  // Helper function to create config for a single build
  const createConfig = (buildKey, buildInfo) => ({
    entry: buildInfo.entry,
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? buildInfo.filename : buildInfo.filename.replace('.min.js', '.dev.js'),
      library: {
        name: buildInfo.library,
        type: 'umd'
      },
      globalObject: 'this'
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [],
    externals: {
      '@absmartly/javascript-sdk': {
        commonjs: '@absmartly/javascript-sdk',
        commonjs2: '@absmartly/javascript-sdk',
        amd: '@absmartly/javascript-sdk',
        root: 'ABsmartly'
      }
    },
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new (require('terser-webpack-plugin'))({
          terserOptions: {
            compress: {
              drop_console: false,  // Keep console.log statements for debugging
              drop_debugger: true,
              pure_funcs: [] // Don't remove console.* calls
            },
            mangle: true,
            format: {
              comments: false
            }
          },
          extractComments: false
        })
      ] : []
    },
    // Add a name for better webpack output
    name: buildKey
  });

  // If building a specific variant
  if (buildType !== 'all' && BUILDS[buildType]) {
    return createConfig(buildType, BUILDS[buildType]);
  }

  // Build all variants
  if (buildType === 'all') {
    return Object.entries(BUILDS).map(([key, config]) => createConfig(key, config));
  }

  // Invalid build type
  throw new Error(`Invalid BUILD_TYPE: ${buildType}. Valid options: ${Object.keys(BUILDS).join(', ')}, all`);
};