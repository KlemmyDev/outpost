// Makes a consistent copy of Outpost's database while it's running.
// install.sh runs it inside the container before every update:
//   docker exec outpost node /app/docker/backup.mjs /data/backups/<name>.db
// VACUUM INTO writes a clean, self-contained copy (no -wal file needed).
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const [, , target, source = '/data/outpost.db'] = process.argv
if (!target) {
  console.error('usage: backup.mjs <target.db> [source.db]')
  process.exit(2)
}
if (!existsSync(source)) {
  console.log(`no database at ${source} yet, nothing to back up`)
  process.exit(0)
}
if (existsSync(target)) {
  console.error(`${target} already exists`)
  process.exit(1)
}
const db = new DatabaseSync(source, { readOnly: true })
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
db.close()
console.log(`backed up ${source} to ${target}`)
