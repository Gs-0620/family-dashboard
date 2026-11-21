import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Detect actual privileged credentials, not normal publishable/anon keys or SDK vocabulary. */
export function inspectText(text) {
  const findings = []
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) findings.push('Supabase secret key')
  if (/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(text)) findings.push('GitHub token')
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      if (payload.role === 'service_role' || payload.role === 'supabase_admin') findings.push('Privileged JWT')
    } catch { /* A non-JWT string must not be mistaken for a credential. */ }
  }
  if (/['"]?(?:service_role|serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)['"]?\s*[:=]\s*['"][A-Za-z0-9_.-]{20,}['"]/.test(text)) findings.push('Service-role key assignment')
  return [...new Set(findings)]
}

/** Legacy writer and personal-data artifacts must never be shipped as public static files. */
export function inspectPath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  const parts = normalized.split('/')
  if (parts.some((part) => ['.env', '.git', 'node_modules', 'data', 'private-data'].includes(part))) return ['Private/data directory']
  if (/(?:^|\/)(?:data|expenses|settings|profile|pregnancy|family-data|dashboard-data)\.(?:json|csv|xlsx)$/.test(normalized)) return ['Public business data']
  if (/(?:^|\/)(?:github-writer|pat-writer|github-sync|write-to-github|save-to-github)(?:[./_-]|$)/.test(normalized)) return ['Legacy GitHub writer']
  return []
}

export async function checkDist(root = 'dist') {
  const failures = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = resolve(directory, entry.name)
      const name = relative(resolve(root), full)
      for (const reason of inspectPath(name)) failures.push(`${name}: ${reason}`)
      if (entry.isSymbolicLink()) failures.push(`${name}: Symbolic link`)
      else if (entry.isDirectory()) await walk(full)
      else {
        const text = await readFile(full, 'utf8')
        for (const reason of inspectText(text)) failures.push(`${name}: ${reason}`)
      }
    }
  }
  await walk(resolve(root))
  return failures
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const failures = await checkDist(process.argv[2] || 'dist')
    if (failures.length) {
      console.error('Unsafe static distribution:\n' + failures.join('\n'))
      process.exitCode = 1
    } else console.log('Static distribution security check passed.')
  } catch (error) {
    console.error(`Cannot check distribution: ${error.message}`)
    process.exitCode = 1
  }
}
