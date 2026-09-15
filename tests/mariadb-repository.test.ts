/**
 * MariaDB 어댑터 계약 테스트.
 *
 * 기본적으로 건너뛴다. 실제 MariaDB에 붙여 돌리려면:
 *
 *   docker compose -f db/mariadb/docker-compose.yml up -d
 *   MARIADB_TEST_DATABASE=assistant_todo_test \
 *   MARIADB_TEST_HOST=127.0.0.1 \
 *   MARIADB_TEST_USER=root \
 *   MARIADB_TEST_PASSWORD=devpass \
 *     npm test -- mariadb
 *
 * ⚠️ 이 테스트는 매 케이스마다 모든 테이블을 비운다.
 *
 * 그래서 운영 설정(MARIADB_*)을 쳐다보지 않고 MARIADB_TEST_* 만 읽는다.
 * 운영 환경변수가 그대로 들어 있는 셸에서 무심코 돌려도 운영 DB를 비우는
 * 일이 없도록, 이름을 아예 분리해 둔 것이다.
 */
import mysql from "mysql2/promise";
import { describe, it } from "vitest";

import { createMariaDbTodoRepository } from "@/lib/repository/mariadb-todo-repository";

import { runRepositoryContract } from "./repository-contract";

function readTestEnv() {
  const host = process.env.MARIADB_TEST_HOST?.trim();
  const database = process.env.MARIADB_TEST_DATABASE?.trim();
  const user = process.env.MARIADB_TEST_USER?.trim();
  if (!host || !database || !user) return null;

  return {
    host,
    port: Number(process.env.MARIADB_TEST_PORT?.trim() || 3306),
    user,
    password: process.env.MARIADB_TEST_PASSWORD ?? "",
    database,
  };
}

const config = readTestEnv();

if (!config) {
  describe.skip("MariaDB — 리포지토리 계약", () => {
    it("MARIADB_TEST_* 가 없어 건너뜁니다", () => undefined);
  });
} else {
  // 비우는 순서는 상관없다 — FK 검사를 잠시 끄고 전부 비운다.
  const TABLES = [
    "todo_update_files",
    "todo_updates",
    "todo_recipients",
    "remind_logs",
    "todos",
    "meeting_bodies",
    "employees",
    "app_settings",
  ];

  const admin = mysql.createPool({ ...config, timezone: "Z", connectionLimit: 2 });

  runRepositoryContract({
    name: "MariaDB",
    async makeRepository() {
      const conn = await admin.getConnection();
      try {
        await conn.query("set foreign_key_checks = 0");
        for (const table of TABLES) await conn.query(`truncate table \`${table}\``);
        await conn.query("set foreign_key_checks = 1");
        // 단일 행 설정은 스키마가 만들어 두는 값이다 — 비운 뒤 되돌린다.
        await conn.query("insert ignore into app_settings (id) values (1)");
      } finally {
        conn.release();
      }
      return createMariaDbTodoRepository({ ...config, connectionLimit: 4 });
    },
    async teardown() {
      await admin.end();
    },
  });
}
