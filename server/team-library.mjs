import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const skillRoot = fileURLToPath(new URL('../.agents/skills/', import.meta.url));
// Display-only front matter extraction. No YAML execution, scripts or arbitrary paths.
function field(header, name) {
  const lines = header.split('\n');
  const i = lines.findIndex(line => line.startsWith(`${name}:`));
  if (i < 0) return '';
  let text = lines[i].slice(name.length + 1).trim();
  if (/^[>|][-+]?$/.test(text)) {
    const rest = [];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) rest.push(lines[j].trim());
    text = rest.join(' ');
  }
  return text.replace(/^['"]|['"]$/g, '');
}
export function readSkillLibrary(root = skillRoot) {
  return readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(item.name)).flatMap(item => {
    const path = join(root, item.name, 'SKILL.md');
    let stat;
    try { stat = lstatSync(path); } catch { return []; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512000) return [];
    const content = readFileSync(path, 'utf8');
    const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
    const files = readdirSync(join(root, item.name), { withFileTypes: true }).filter(f => !f.isSymbolicLink() && !f.name.startsWith('.')).map(f => ({ name: f.name, directory: f.isDirectory() }));
    return [{ id: item.name, name: field(header, 'name') || item.name, description: field(header, 'description'), content, source: `.agents/skills/${item.name}/SKILL.md`, version: createHash('sha256').update(content).digest('hex').slice(0, 12), bytes: stat.size, updatedAt: stat.mtime.toISOString(), files }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export function mountTeamLibrary(app) {
  app.get('/api/team-library/skills', (req, res) => res.json({ skills: readSkillLibrary() }));
}
