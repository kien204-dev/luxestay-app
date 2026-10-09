// Starts a throwaway PostgreSQL in Docker, runs the browser tests (apps/web/test-e2e)
// against it, and removes the container again whatever the outcome.
import { spawnSync } from "node:child_process";

const COMPOSE = ["compose", "-p", "luxestay-test", "-f", "docker-compose.test.yml"];

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

let exitCode = run("docker", [...COMPOSE, "up", "-d", "--wait"]);

if (exitCode === 0) {
  exitCode = run("node", ["--test", "--test-concurrency=1", "apps/web/test-e2e/*.test.mjs"]);
} else {
  console.error("Could not start the test database. Is Docker running?");
}

run("docker", [...COMPOSE, "down", "-v"]);
process.exit(exitCode);
