// Gets an owner back in when the admin password is lost or every admin is
// locked out, and gives a password to an admin who only ever signed in with
// Google (admins cannot use Google sign-in). Needs a shell on the server, so
// it asks for no password.
//
//   npm run admin:reset                        list the admins
//   npm run admin:reset -- --email <email>     reset that account
//   docker compose exec api npm run admin:reset -- --email <email>
//
// Resetting gives the account a random temporary password (printed once, to
// be replaced at the first login), unlocks it, makes it an admin and signs
// out every session it had.

const bcrypt = require("bcryptjs");
const { generatePassword } = require("../db/seed");

async function listAdmins(pool) {
  const result = await pool.query(
    `SELECT id, name, email, is_locked
     FROM users
     WHERE role = 'admin' AND deleted_at IS NULL
     ORDER BY id`
  );
  return result.rows;
}

// Returns the account and its temporary password, or null when no account
// (that has not been deleted) has this email.
async function resetAdmin(pool, email) {
  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `UPDATE users
     SET password = $1,
         role = 'admin',
         is_locked = FALSE,
         must_change_password = TRUE,
         password_set = TRUE,
         token_version = token_version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(email) = LOWER($2) AND deleted_at IS NULL
     RETURNING id, name, email`,
    [hashed, String(email).trim()]
  );
  if (result.rows.length === 0) return null;

  // A reset link that is still in someone's inbox must not outlive this.
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [result.rows[0].id]);
  return { user: result.rows[0], password };
}

function emailArgument(argv) {
  const index = argv.indexOf("--email");
  if (index !== -1) return argv[index + 1] || "";
  const inline = argv.find((arg) => arg.startsWith("--email="));
  return inline ? inline.slice("--email=".length) : null;
}

async function run(pool, argv, log = console.log) {
  const email = emailArgument(argv);

  if (email === null) {
    const admins = await listAdmins(pool);
    if (admins.length === 0) {
      log("There is no admin. Create the first one with: npm run db:seed -- --admin-only");
      log("or make an existing account the admin with: npm run admin:reset -- --email <email>");
      return true;
    }
    log("Admins:");
    admins.forEach((admin) => log(`  ${admin.email}  (${admin.name})${admin.is_locked ? "  LOCKED" : ""}`));
    log("Reset one with: npm run admin:reset -- --email <email>");
    return true;
  }

  if (!email.trim()) {
    log("Usage: npm run admin:reset -- --email <email>");
    return false;
  }

  const reset = await resetAdmin(pool, email);
  if (!reset) {
    log(`No account with the email ${email.trim()} (deleted accounts cannot be reset).`);
    return false;
  }

  log(`Admin access restored for ${reset.user.email}: unlocked, signed out everywhere.`);
  log(`Temporary password, shown only this once (change it at first login): ${reset.password}`);
  return true;
}

module.exports = { listAdmins, resetAdmin, run };

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  const pool = require("../db/db");
  run(pool, process.argv.slice(2))
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
      return pool.end();
    })
    .catch((err) => {
      console.error("ADMIN RESET FAILED:", err.message);
      process.exit(1);
    });
}
