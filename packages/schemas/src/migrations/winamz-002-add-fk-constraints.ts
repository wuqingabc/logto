/**
 * WinAMZ migration 002: add foreign key constraints to winamz_agents.
 *
 * [winamz] This is a WinAMZ-specific migration file.
 * It does not modify any existing Logto tables.
 *
 * Run this after winamz-001-create-tables.ts has been applied.
 *
 * To apply manually:
 *   psql $DATABASE_URL -c "$(cat packages/schemas/src/migrations/winamz-002-add-fk-constraints.ts | node -e "
 *     let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
 *       const m = d.match(/export const up = \`([\s\S]*?)\`/);
 *       if(m) process.stdout.write(m[1]);
 *     });
 *   ")"
 */

export const up = `
  ALTER TABLE winamz_agents
    ADD CONSTRAINT fk_winamz_agents_org
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

  ALTER TABLE winamz_agents
    ADD CONSTRAINT fk_winamz_agents_owner
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
`;

export const down = `
  ALTER TABLE winamz_agents DROP CONSTRAINT IF EXISTS fk_winamz_agents_org;
  ALTER TABLE winamz_agents DROP CONSTRAINT IF EXISTS fk_winamz_agents_owner;
`;
