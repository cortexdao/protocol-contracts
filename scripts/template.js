#!/usr/bin/env node
const { program } = require("commander");

async function main(options) {
  // TODO: Do your funny business
  return options;
}

if (!module.parent) {
  // If running in command line
  program.version("0.0.1");
  program.option("-a, --always <string>", "some description", "default value");
  program.option("-b, --beating <string>", "some description", "default value");
  program.option("-c, --chads <string>", "some description", "default value");
  program.parse(process.argv);
  const options = program.opts();
  main(options)
    .then((result) => {
      if (!(typeof result === "string" || result instanceof Buffer)) {
        process.exit(1);
      }
      process.stdout.write(result);
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
} else {
  // if importing in another script
  module.exports = main;
}
