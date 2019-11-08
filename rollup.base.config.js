const path = require('path');
const resolve = require('rollup-plugin-node-resolve');
const babel = require('rollup-plugin-babel');
const { terser } = require('rollup-plugin-terser');

const resolveBareImportPlugin = require('./rollup-bare-import-plugin');
const replace = require('rollup-plugin-re');
const pluginSyntaxDynamicImport = require('@babel/plugin-syntax-dynamic-import');
const pluginSyntaxImportMeta = require('@babel/plugin-syntax-import-meta');
const pluginExternalHelpers = require('@babel/plugin-external-helpers');
const babelPresetEnv = require('@babel/preset-env');
const { getOverwrites } = require('./overwrites');
const generateEntryFiles = require('./owc-generate-entryfiles');
const production = false; // process.env["NODE_ENV"] === "development" ? false : true;

module.exports = async ({ dir, owcConfig }) => {
  let files;
  if (!owcConfig.useMain) {
    const generatePromiseList = owcConfig.entryFiles.map((entry) => {
      return generateEntryFiles(entry.glob, entry.root);
    });
    const entryFilesArray = await Promise.all(generatePromiseList);
    files = entryFilesArray.reduce((acc, curr) => {
      for (let key in curr) {
        acc[key] = curr[key];
      }
      return acc;
    }, {});
  } else {
    files = owcConfig.main;
  }

  const config = async ({ legacy, production }) => ({
    input: files,
    output: {
      dir: path.join(dir, legacy ? 'nomodule' : 'module'),
      entryFileNames: `[name].js`,
      // ES for modern browsers, System for legacy
      format: legacy ? 'system' : 'es',
      sourcemap: false,
    },
    plugins: [
      replace({
        patterns: await getOverwrites(),
      }),
      // Resolve bare imports
      resolveBareImportPlugin(
        { bundleDependencies: owcConfig.bundleDependencies },
        resolve()
      ),
      // 'Compile'
      babel({
        exclude: '**/babel-helpers.js',
        externalHelpers: true,
        plugins: [
          pluginSyntaxDynamicImport,
          pluginExternalHelpers,
          pluginSyntaxImportMeta,
        ],
        presets: [
          [
            babelPresetEnv,
            {
              targets: legacy
                ? ['ie 11']
                : [
                    'last 2 Chrome major versions',
                    // "last 2 ChromeAndroid major versions",
                    // "last 2 Edge major versions",
                    // "last 2 Firefox major versions",
                    // "last 2 Safari major versions",
                    // "last 2 iOS major versions",
                  ],
            },
          ],
        ],
      }),
      // Minify
      production && terser(),
    ],
  });

  return [
    await config({ legacy: false, production }),
    // await config({ legacy: true, production })
  ];
};
