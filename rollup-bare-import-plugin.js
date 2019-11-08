const importmap = [];
const resolvedBare = {};

const importRegex = new RegExp(
  /^import(?:["'\s]*(?:[\w*{}\n\r\t, ]+)from\s*)?["'\s]*((?:[\.@\w/_-]+))["'\s].*;?$/gim
);

const createReplacerWithResolve = (resolvePlugin) => (importer) => async (
  match,
  importee
) => {
  const hasExtension = /^[\w\/\-@\.]+\.js$/.test(importee);
  let newCode = match;
  if (!hasExtension) {
    const resolvedPath = await resolvePlugin.resolveId(importee, importer);
    if (resolvedPath === null) {
      if (importer && importer.match(/bower_component/)) {
        console.log('IMportee', importee, importer);
        newCode = match.replace(importee, importee + '.js');
      }
      console.info(
        `Cannot resolve ${importee} from ${importer}. Maybe it'll be resolved by import-map`
      );
    } else {
      const startIndex = resolvedPath.indexOf(importee);
      const fixedBareImport = resolvedPath.substring(startIndex);
      newCode = match.replace(importee, fixedBareImport);
    }
  }
  return newCode;
};

async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

/**
 * Plugin that decides to resolve or exclude bare-imports
 * Excluded imports should be handled by an import-map
 *
 * @param {Object} obj configuration for bare-import resolver
 * @param {{[key:string]: string[]} } obj.invertedImportmap
 * each key represents an file that exports it's bare imports which are it's values
 * @param {Function} resolvePlugin Resolve plugin to resolve bare-imports
 */
module.exports = ({ bundleDependencies }, resolvePlugin) => {
  const createReplacerWithImporter = createReplacerWithResolve(resolvePlugin);
  return {
    async transform(code, id) {
      const replaceFn = createReplacerWithImporter(id);
      /**
       * https://regex101.com/r/VZAOi1/3
        import {
          Component
        } from '@angular2/core';
        import defaultMember from "module-name";
        import   *    as name from "module-name  ";
        import { member as alias } from "module-name";
        import { member1 , member2 } from "module-name";
        import { member1 , member2 as alias2 , member3 as alias3 } from "module-name";
        import defaultMember, { member, member } from "module-name";
        import defaultMember, * as name from "module-name";
        import   {  member }   from "  module-name";
        import "module-name";
        import './blaat.js';
       */
      return await replaceAsync(code, importRegex, replaceFn);
    },
    name: 'exclude bare imports plugin',
    ...resolvePlugin,
    resolveId: async (importee, importer) => {
      /**
       * 1. relative imports are always resolved
       * 2. bare-import is only resolved when it occurs in the invertedImportmap
       *    - it resolves only from the correct file in the invertedImportmap
       * - ??? Should we resolve bare-imports not mentioned in the invertedImportmap
       */
      // Always resolve relative import
      if (
        // relative import
        /^(\.\.\/|\.\/|\/)/.test(importee) ||
        // entrymodule always resolves
        !importer
      ) {
        const resolved = await resolvePlugin.resolveId(importee, importer);
        return resolved;
      }
      // resolve any bare import defined in "resolveDependencies" in pkg.json:
      if (bundleDependencies) {
        let doResolve = bundleDependencies.find((bd) =>
          importee.startsWith(bd)
        );
        if (doResolve) {
          const resolved = await resolvePlugin.resolveId(importee, importer);
          resolvedBare[importee] = resolved;
          return resolved;
        } else {
          importmap.push(importee);
        }
      }
      return false;
    },
    writeBundle() {
      if (Object.keys(resolvedBare).length) {
        console.log(
          'Resolved bare imports:\n',
          Object.keys(resolvedBare)
            .map((key) => `\t"${key}": "${resolvedBare[key]}"`)
            .join('\n')
        );
      }
      if (importmap.length) {
        console.log('External dependencies:\n\t', importmap.join('\n\t'));
      }
    },
  };
};
