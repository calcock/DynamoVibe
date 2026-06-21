import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Parse profile names from ~/.aws/config and ~/.aws/credentials without
 * pulling in extra deps. Config sections look like `[profile name]`;
 * credentials sections look like `[name]`. The literal `default` is included.
 */
export function listAwsProfiles(): string[] {
  const names = new Set<string>()
  const home = homedir()
  const sources: Array<{ path: string; stripPrefix: boolean }> = [
    { path: join(home, '.aws', 'config'), stripPrefix: true },
    { path: join(home, '.aws', 'credentials'), stripPrefix: false }
  ]

  for (const { path, stripPrefix } of sources) {
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*\[([^\]]+)\]\s*$/)
      if (!m) continue
      let name = m[1].trim()
      if (stripPrefix && name.startsWith('profile ')) name = name.slice('profile '.length)
      if (name === 'default' || !stripPrefix || name) names.add(name)
    }
  }
  return [...names].sort()
}
