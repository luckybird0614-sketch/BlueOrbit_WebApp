import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

type SqlValue = string | number | null;

function mysqlSettings() {
  const database = (process.env.MYSQL_DATABASE || "blueorbit_web").trim();
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("MYSQL_DATABASE must contain only letters, numbers, and underscores");
  }
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database,
  };
}

const settings = mysqlSettings();

export const pool = mysql.createPool({
  host: settings.host,
  port: settings.port,
  user: settings.user,
  password: settings.password,
  database: settings.database,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

export async function initDb(): Promise<void> {
  const admin = await mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${settings.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY users_email (email)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INT NOT NULL,
      preferred_name VARCHAR(80) NOT NULL DEFAULT '',
      medication_name VARCHAR(80) NOT NULL DEFAULT '',
      storage_low_f DOUBLE NOT NULL DEFAULT 36,
      storage_high_f DOUBLE NOT NULL DEFAULT 46,
      use_celsius TINYINT NOT NULL DEFAULT 0,
      tag_name VARCHAR(120) NOT NULL DEFAULT '',
      device_id VARCHAR(80) NOT NULL DEFAULT '',
      device_name VARCHAR(120) NOT NULL DEFAULT '',
      PRIMARY KEY (user_id),
      CONSTRAINT profiles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(64) NOT NULL,
      user_id INT NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (token),
      KEY sessions_user (user_id),
      CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await ensureAuthSchema();
}

async function ensureAuthSchema(): Promise<void> {
  const [columns] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM users LIKE 'email_verified_at'");
  const addedVerificationColumn = columns.length === 0;
  if (addedVerificationColumn) {
    await pool.query("ALTER TABLE users ADD COLUMN email_verified_at VARCHAR(40) NULL");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      purpose VARCHAR(16) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY auth_tokens_hash (token_hash),
      KEY auth_tokens_user (user_id, purpose),
      CONSTRAINT auth_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await migrateFromSqlite();
  if (addedVerificationColumn) {
    await pool.query("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL");
  }
}

export async function get<T>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows[0] as T | undefined;
}

export async function run(sql: string, params: SqlValue[] = []): Promise<{ insertId: number }> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return { insertId: Number(result.insertId) };
}

async function migrateFromSqlite(): Promise<void> {
  const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if (Number(existing?.n ?? 0) > 0) {
    return;
  }
  const sqlitePath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), "data", "app.sqlite");
  if (!existsSync(sqlitePath)) {
    return;
  }
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const users = sqlite.prepare("SELECT id, email, password_hash, created_at FROM users").all() as (UserRow & {
      created_at: string;
    })[];
    const profiles = sqlite.prepare("SELECT * FROM profiles").all() as ProfileRow[];
    const sessions = sqlite.prepare("SELECT token, user_id, expires_at FROM sessions").all() as {
      token: string;
      user_id: number;
      expires_at: number;
    }[];
    if (users.length === 0) {
      return;
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const user of users) {
        await connection.execute(
          "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
          [user.id, user.email, user.password_hash, user.created_at],
        );
      }
      for (const profile of profiles) {
        await connection.execute(
          `INSERT INTO profiles (
             user_id, preferred_name, medication_name, storage_low_f, storage_high_f,
             use_celsius, tag_name, device_id, device_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profile.user_id,
            profile.preferred_name,
            profile.medication_name,
            profile.storage_low_f,
            profile.storage_high_f,
            profile.use_celsius,
            profile.tag_name,
            profile.device_id,
            profile.device_name,
          ],
        );
      }
      for (const session of sessions) {
        await connection.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
          session.token,
          session.user_id,
          session.expires_at,
        ]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    console.log(`Copied ${users.length} account(s) from SQLite into MySQL`);
  } finally {
    sqlite.close();
  }
}

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
};

export type ProfileRow = {
  user_id: number;
  preferred_name: string;
  medication_name: string;
  storage_low_f: number;
  storage_high_f: number;
  use_celsius: number;
  tag_name: string;
  device_id: string;
  device_name: string;
};

export function publicUser(user: UserRow, profile: ProfileRow) {
  return {
    id: user.id,
    email: user.email,
    preferredName: profile.preferred_name,
    medicationName: profile.medication_name,
    storageLowF: profile.storage_low_f,
    storageHighF: profile.storage_high_f,
    useCelsius: Number(profile.use_celsius) === 1,
    tagName: profile.tag_name,
    deviceId: profile.device_id,
    deviceName: profile.device_name,
  };
}
