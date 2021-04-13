#!/usr/bin/env node
const { program, Option } = require("commander");

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus;
  }
}

program.option("-p, --pizza-type <type>", "flavour of pizza", "default pizza");
program.requiredOption("-c, --cheese <type>", "pizza must have cheese");
program.option("-t, --toppings <string...>", "a variadic option");
program.addOption(
  new Option("-d, --drink <size>", "drink size").choices([
    "small",
    "medium",
    "large",
  ])
);

async function importedFunction(pizzaType, cheese, toppings, drink) {
  // Code here
}

async function main(options) {
  const pizzaType = options.pizzaType;
  const cheese = options.cheese;
  const toppings = options.toppings;
  const drink = options.drink;
  const result = await importedFunction(pizzaType, cheese, toppings, drink);
  return result.toString();
}

if (!module.parent) {
  // If running in command line
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
  module.exports = importedFunction;
}
