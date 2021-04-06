const { program } = require("commander");

async function main(params) {
  // TODO: Do your funny business
  return params;
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
      process.stdout.write(result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  // if importing in another script
  module.exports = main;
}
