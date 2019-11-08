#!/usr/bin/env node

const { existsSync } = require('fs');
const { promisify } = require('util');
const path = require('path');
const caporal = require('caporal');
const glob = require('glob');
const execa = require('execa');
const compose = require('compose-function');

const { stdout, stderr } = process;
const ONEWEBPLATFORM_PATH = path.resolve(__dirname, '..');

caporal
  .version('0.0.1')
  .command(
    'bootstrap',
    'bootstrap the one-web-platform for local development ' +
      '(npm i, npm run build, copy to static-file-host)'
  )
  .argument(
    '[packages...]',
    'the packages you want to execute the command(s) for'
  )
  .option(
    '--build',
    'Will build the package if the package.json has a build-script',
    caporal.BOOL
  )
  .option(
    '--install',
    'Will run `npm ci` or `npm i` in the package (when it respectively ' +
      "has or hasn't a package-lock.json",
    caporal.BOOL
  )
  .option(
    '--copy',
    "Will copy the package to '../static-file-host' if it has a build-script",
    caporal.BOOL
  )
  .option(
    '--generate',
    'Will generate the entryFiles if it has a generate-script',
    caporal.BOOL
  )
  .action(async (args, options, logger) => {
    logger.info(`Bootstrapping project relative to ${ONEWEBPLATFORM_PATH}`);
    logger.debug(`Arguments`, args);
    logger.debug(`Options`, options);
    let { build, install, copy } = options;

    if (!build && !install && !copy) {
      build = install = copy = true;
      logger.info('No options for install, build or copy given, executing all');
    } else {
      switch (true) {
        case install:
          logger.info('executing build');
        case build:
          logger.info('executing build');
        case copy:
          logger.info('executing copy-to-static');
      }
    }

    let res = await promisify(glob)(`${ONEWEBPLATFORM_PATH}/*/package.json`);

    // filter packages to user defined ones
    if (args.packages.length > 0) {
      res = res.filter((d) => args.packages.find((p) => d.indexOf(p) > 0));
    }

    logger.debug('executing for', res);
    res.forEach((pkgjsonpath) => {
      // skip for the current directory (./demo-dev-utils)
      if (pkgjsonpath.indexOf(__dirname) > 0) {
        return;
      }
      if (install) {
        // run npm i or npm ci
        compose(
          npmi,
          (dir) => {
            logger.info(
              `running 'npm i' for '${path.relative(ONEWEBPLATFORM_PATH, dir)}'`
            );
            return dir;
          },
          path.dirname
        )(pkgjsonpath);
      }

      if (build || copy) {
        // build the package
        logger.info(`loading ${pkgjsonpath}`);
        const pkgjson = require(pkgjsonpath);
        if (build && pkgjson.scripts.build) {
          compose(
            npmbuild,
            (dir) => {
              logger.info(
                `running 'npm run build' for './${path.relative(
                  ONEWEBPLATFORM_PATH,
                  dir
                )}'`
              );
              return dir;
            },
            path.dirname
          )(pkgjsonpath);
        }

        if (copy) {
          // copy a built package to static-file-host
          if (existsSync(path.resolve(path.dirname(pkgjsonpath), 'dist'))) {
            copyToStatic(path.dirname(pkgjsonpath), pkgjson, logger);
          }
        }
      }
    });
  })
  .command('start', 'start proxy dev server')
  .action((args, options, logger) => {
    logger.info('Starting dev proxy server');
    return execa.node(path.resolve(__dirname, './dev-proxy-server.js'), {
      stdout,
      stderr,
    });
  });

caporal.parse(process.argv);

const npmi = (cwd) => {
  const nodeModulesExists = existsSync(path.resolve(cwd, 'node_modules'));
  const packageLockExists = existsSync(path.resolve(cwd, 'package-lock.json'));
  // only use npm ci when node_modules doesn't exist
  if (!nodeModulesExists && packageLockExists) {
    return execa.commandSync('npm ci', {
      cwd,
      stdout,
      stderr,
    });
  }
  return execa.commandSync('npm i', {
    cwd,
    stdout,
    stderr,
  });
};

const npmbuild = (cwd) => {
  return execa.commandSync('npm run build', {
    cwd,
    stdout,
    stderr,
  });
};

const copyToStatic = (cwd, pkgjson, logger) => {
  const { name, version } = pkgjson;
  const staticFileDir = path.resolve(__dirname, '../static-file-host');
  const sourceDir = path.resolve(cwd, 'dist');
  const destDir = path.resolve(staticFileDir, name, version);
  execa.commandSync(`mkdir -p ${destDir}`);
  const cmd = `cp -R ${sourceDir}/ ${destDir}`;
  logger.info(`Copying: ${cmd}`);
  return execa.commandSync(cmd, { cwd, stdout, stderr });
};
