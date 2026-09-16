import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses Vercel-compatible Next.js scripts and pinned Supabase packages", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.build, "next build");
  assert.match(pkg.dependencies["@supabase/supabase-js"], /^\d+\.\d+\.\d+$/);
  assert.match(pkg.dependencies["@supabase/ssr"], /^\d+\.\d+\.\d+$/);
  assert.ok(!pkg.dependencies.wrangler);
});

test("protects POS tables and uses a private image bucket", async () => {
  const sql = await read("supabase/migrations/20260915170000_initial_wingpro_pos.sql");
  const policySql = await read("supabase/migrations/20260915173000_explicit_server_only_rls.sql");
  const tables = ["config","members","product_categories","products","receipts","sales","items","jobs","leaves","expenses","files","operations","stock_adjustments"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(policySql, new RegExp(`on public\\.${table} for all`, "i"));
  }
  assert.match(sql, /'wingpro-files', 'wingpro-files', false/);
  assert.match(sql, /references auth\.users\(id\)/);
});

test("keeps secrets server-side", async () => {
  const example = await read(".env.example");
  assert.match(example, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.match(example, /^SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  const admin = await read("lib/supabase/admin.ts");
  assert.match(admin, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test("member upserts target the case-insensitive email index", async () => {
  const server = await read("lib/server.ts");
  const dataRoute = await read("app/api/data/route.ts");
  assert.match(server, /ON CONFLICT\(\(lower\(email\)\)\)/);
  assert.match(dataRoute, /ON CONFLICT\(\(lower\(email\)\)\)/);
  assert.doesNotMatch(`${server}\n${dataRoute}`, /ON CONFLICT\(email\)/);
});

test("enforces configurable cashier permissions on the server", async () => {
  const migration = await read("supabase/migrations/20260916012411_cashier_permissions.sql");
  const server = await read("lib/server.ts");
  const dataRoute = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(migration, /permissions jsonb not null/);
  assert.match(server, /export function permit/);
  assert.match(dataRoute, /permit\(me,required\[action\]\)/);
  assert.match(dataRoute, /permit\(me,'discount'\)/);
  assert.match(dataRoute, /role,memberPermissions/);
  assert.doesNotMatch(dataRoute, /JSON\.stringify\(memberPermissions\)/);
  assert.doesNotMatch(pos, /บัญชี ChatGPT/);
});
