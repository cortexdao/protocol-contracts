require("dotenv").config();
process.stdout.write(
  "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY
);
