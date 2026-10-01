const { isValidTimezone } = require("../utils/time");
const { getStorageProblems } = require("../services/storage");

const MIN_JWT_SECRET_LENGTH = 32;

// Checked once at startup so a misconfigured server stops immediately with a
// clear message, instead of starting and answering every request with a 500.
function getEnvProblems(env = process.env) {
  const problems = [];

  for (const name of ["DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"]) {
    if (!env[name]) problems.push(`${name} is not set`);
  }

  if (env.JWT_SECRET && env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (env.JWT_SECRET && /^replace_with/i.test(env.JWT_SECRET)) {
    problems.push("JWT_SECRET still has its placeholder value from .env.example");
  }

  if (env.APP_TIMEZONE && !isValidTimezone(env.APP_TIMEZONE)) {
    problems.push(`APP_TIMEZONE "${env.APP_TIMEZONE}" is not a valid IANA timezone (e.g. Asia/Ho_Chi_Minh)`);
  }

  problems.push(...getStorageProblems());

  return problems;
}

module.exports = { getEnvProblems, MIN_JWT_SECRET_LENGTH };
