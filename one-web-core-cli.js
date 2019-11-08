#!/usr/bin/env node
const path = require('path');
const cpy = require('cpy');
const copydir = require('copy-dir');

process.on('unhandledRejection', (err) => {
  throw err;
});
const args = process.argv.slice(2);
const scriptIndex = args.findIndex((x) => x === 'build' || x === 'builddev');
const script = scriptIndex === -1 ? args[0] : args[scriptIndex];

const rollup = require('rollup');
const pj = require(`${process.cwd()}/package.json`);
const baseConfig = require('../rollup.base.config');

async function main() {
  const options = {
    dir: process.cwd() + '/dist',
    owcConfig: pj.owcConfig || {
      useMain: true,
      main: pj.main,
      bundleDependencies: [],
    },
  };

  if (pj.owcConfig) {
    if (!pj.owcConfig.entryFiles) {
      options.owcConfig.useMain = true;
      options.owcConfig.main = pj.main;
    }
    if (!pj.owcConfig.bundleDependencies) {
      options.owcConfig.bundleDependencies = [];
    }
  }

  const config = await baseConfig(options);

  switch (script) {
    case 'build':
      const rollupResult = config.map(async (c) => {
        return await rollup.rollup(c);
      });
      const res = await Promise.all(rollupResult);
      const writeResult = await Promise.all([
        res[0].write(config[0]),
        // res[1].write(config[1])
      ]);
      writeResult.forEach(() => console.log('[owc:cli]: Files written.'));
      break;
    case 'copy':
      const copyConfig = pj.copyAssets;
      if (!copyConfig) {
        throw Error(
          '[owc:cli]: No copyAssets config provided in package.json!'
        );
      }
      const copyPromiseList = [];
      for (const { src, dest, copyDirContent } of copyConfig) {
        const srcPaths = src.map((srcPath) => {
          return path.join(process.cwd(), srcPath);
        });

        if (copyDirContent) {
          srcPaths.forEach((srcPath) => {
            copyPromiseList.push(
              copydir(srcPath, `${process.cwd()}/dist/${dest}`, {
                utimes: true,
                mode: true,
                cover: true,
              })
            );
          });
        } else {
          copyPromiseList.push(
            cpy(srcPaths, `${process.cwd()}/dist/${dest}`, {
              parents: false,
            })
          );
        }
      }
      await Promise.all(copyPromiseList);
      console.log('[owc:cli]: Copied assets.');
      break;
    default:
      console.log('No command passed, available commands: build');
      break;
  }
}
main();
