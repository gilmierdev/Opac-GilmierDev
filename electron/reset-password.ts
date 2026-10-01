import bcrypt from 'bcryptjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSystemDirs } from './config/paths'
import { provisioner } from './database/pg/provision'
import { pgDb } from './database/pg/client'
import { repositories } from './database/pg/repositories'

export interface ResetPasswordOptions {
  newPassword?: string
  username?: string
}

export async function runResetPassword(options: ResetPasswordOptions = {}): Promise<{
  username: string
  newPassword: string
}> {
  const password = options.newPassword || 'Admin1234!'
  const systemDirs = getSystemDirs()
  const prov = provisioner(systemDirs)
  const info = await prov.ensure()

  const db = pgDb({
    host: '127.0.0.1',
    port: info.port,
    user: info.appUser,
    password: info.appUserPassword,
    database: info.database
  })

  try {
    const repo = repositories(db)
    const targetUsername = options.username || 'admin'
    let user = await repo.users.findByUsername(targetUsername)

    if (!user) {
      // Find the first user in admin_users if specific username not found
      const firstRow = await db.one<{ id: number; username: string }>(
        'SELECT id, username FROM admin_users ORDER BY id ASC LIMIT 1'
      )
      if (!firstRow) {
        throw new Error('No administrator account found in the database. Please launch the app to set up the first administrator.')
      }
      user = { id: Number(firstRow.id) }
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await repo.users.updatePassword(user.id, passwordHash)

    const userInfo = await repo.users.getById(user.id)
    const resultUsername = userInfo?.username ?? targetUsername

    const resultMessage = [
      '====================================================',
      'OPAC LIBRARY SYSTEM - ADMIN PASSWORD RESET',
      '====================================================',
      `Username:     ${resultUsername}`,
      `New Password: ${password}`,
      '====================================================',
      'You can now log in to the Admin Dashboard with these credentials.'
    ].join('\n')

    console.log(resultMessage)

    try {
      writeFileSync(join(process.cwd(), '.password-reset.txt'), `${resultMessage}\n`, 'utf8')
    } catch {
      // ignore
    }

    return {
      username: resultUsername,
      newPassword: password
    }
  } finally {
    await db.end()
  }
}
