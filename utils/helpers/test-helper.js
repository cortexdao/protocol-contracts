const { expect } = require("chai");
const _ = require("lodash");

const deepEqual = (expected, actual) => {
  const zipped = _.zip(_.flatMapDeep(expected), _.flatMapDeep(actual));
  zipped.forEach((pair) => {
    if (pair[0] === undefined || pair[1] === undefined) {
      expect.fail(pair[0], pair[1], `Expected: ${pair[0]}, Actual: ${pair[1]}`);
    }
    expect(pair[0]).to.deep.equal(pair[1]);
  });
};

module.exports = {
  deepEqual,
};
