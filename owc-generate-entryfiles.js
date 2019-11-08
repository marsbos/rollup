const glob = require('glob');

const createGlobAsPromise = (patterns, libName) => {
  return patterns.map((pattern) => {
    return new Promise((resolve, reject) => {
      glob(`${libName}${pattern}`, (err, matches) => {
        if (err) {
          reject(err);
        } else {
          const entries = matches.reduce((acc, curr) => {
            const key = curr.substring(
              curr.indexOf(libName) + libName.length,
              curr.indexOf('.js')
            );
            acc[key] = curr;
            return acc;
          }, {});
          resolve(entries);
        }
      });
    });
  });
};

module.exports = async (patterns, root) => {
  const globPromises = Promise.all(createGlobAsPromise(patterns, root));
  const allEntries = await globPromises;
  const flattenEntries = allEntries.reduce((acc, curr) => {
    for (let key in curr) {
      acc[key] = curr[key];
    }
    return acc;
  }, {});
  return flattenEntries;
};
