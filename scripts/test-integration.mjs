// Starts a throwaway PostgreSQL in Docker, runs the API integration tests
// against it, and removes the container again whatever the outcome.
import { spawnSync } from "node:child_process";

const COMPOSE = ["compose", "-p", "luxestay-test", "-f", "docker-compose.test.yml"];

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

let exitCode = run("docker", [...COMPOSE, "up", "-d", "--wait"]);

if (exitCode === 0) {
  exitCode = run("npm", ["run", "test:integration", "--workspace", "apps/api"]);
} else {
  console.error("Could not start the test database. Is Docker running?");
}

run("docker", [...COMPOSE, "down", "-v"]);
process.exit(exitCode);
