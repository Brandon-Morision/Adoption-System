$env:TEST_URL = "https://localhost:3443/api"
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
npx tsx test/suite.ts

