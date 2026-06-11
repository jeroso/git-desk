import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export interface SshHost {
  alias: string
  hostName?: string
  user?: string
  identityFile?: string
}

export function parseSshConfig(text: string): SshHost[] {
  const hosts: SshHost[] = []
  let current: SshHost | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const match = /^(\S+)\s+(.+)$/.exec(line)
    if (!match) continue
    const keyword = match[1].toLowerCase()
    const value = match[2].trim()

    if (keyword === 'host') {
      if (current) hosts.push(current)
      // skip wildcard-only patterns
      if (value.includes('*') || value.includes('?')) {
        current = null
        continue
      }
      current = { alias: value.split(/\s+/)[0] }
    } else if (current) {
      if (keyword === 'hostname') current.hostName = value
      else if (keyword === 'user') current.user = value
      else if (keyword === 'identityfile') current.identityFile = value
    }
  }
  if (current) hosts.push(current)
  return hosts
}

export async function readSshHosts(): Promise<SshHost[]> {
  try {
    const text = await readFile(path.join(homedir(), '.ssh', 'config'), 'utf8')
    return parseSshConfig(text)
  } catch {
    return []
  }
}
