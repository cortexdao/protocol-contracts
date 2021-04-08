#!/usr/bin/env node
const { program } = require("commander");

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus;
  }
}

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
    .catch((error) => {
      const exitStatus = error.exitStatus || 1;
      process.exit(exitStatus);
    });
} else {
  // if importing in another script
  module.exports = main;
}
