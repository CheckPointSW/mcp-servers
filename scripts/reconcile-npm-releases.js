#!/usr/bin/env node
// Repair GitHub metadata for workspace versions that are already on npm, even
// when changeset publish failed after publishing only part of a release.
// Run without --apply to preview; --apply creates missing tags and releases.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function githubApi(repository, endpoint, { method = 'GET', body, paginate = false } = {}) {
  const args = ['api', '--method', method, `repos/${repository}/${endpoint}`];
  if (paginate) args.push('--paginate', '--slurp');
  if (body) args.push('--input', '-');
  try {
    return JSON.parse(execFileSync('gh', args, {
      encoding: 'utf8', input: body ? JSON.stringify(body) : undefined,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    // Only a real 404 means absent. Auth, rate-limit, and network failures must
    // fail the job rather than being mistaken for an existing or missing release.
    if (method === 'GET' && /\(HTTP 404\)/.test(String(error.stderr))) return null;
    throw new Error(`GitHub ${method} ${endpoint} failed: ${error.stderr || error.message}`, { cause: error });
  }
}

export async function npmMetadata(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm lookup for ${name}@${version} failed: HTTP ${response.status}`);
  return response.json();
}

export async function reconcileReleases({
  cwd = rootDir, repository = process.env.GITHUB_REPOSITORY, apply = false,
  expectedPackages = [], wait = sleep,
  github = (endpoint, options) => githubApi(repository, endpoint, options),
  metadata = npmMetadata,
  git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
  log = console.log,
} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Set GITHUB_REPOSITORY to owner/repo');
  if (!Array.isArray(expectedPackages) || expectedPackages.some(pkg =>
    !pkg || typeof pkg.name !== 'string' || !pkg.name || typeof pkg.version !== 'string' || !pkg.version)) {
    throw new Error('Expected published packages must be an array of {name, version} objects');
  }
  const expectedVersions = new Set(expectedPackages.map(pkg => `${pkg.name}@${pkg.version}`));
  const unmatchedVersions = new Set(expectedVersions);
  const retryDelays = [2_000, 4_000, 8_000, 16_000];

  const releases = new Set(github('releases?per_page=100', { paginate: true }).flat().map(release => release.tag_name));
  const tags = new Map(github('git/matching-refs/tags').map(ref => [ref.ref, ref.object]));
  const plan = [];
  for (const dir of readdirSync(resolve(cwd, 'packages'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const manifestPath = `packages/${dir.name}/package.json`;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(resolve(cwd, manifestPath), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (pkg.private || !pkg.name || !pkg.version) continue;
    const tag = `${pkg.name}@${pkg.version}`;
    unmatchedVersions.delete(tag);
    let tagObject = tags.get(`refs/tags/${tag}`);
    const hasTag = Boolean(tagObject);
    const hasRelease = releases.has(tag);
    if (hasTag && hasRelease) continue;

    let published = await metadata(pkg.name, pkg.version);
    // A successful publish can precede registry visibility. Only versions the
    // publisher explicitly reported as successful must become visible here.
    if (published === null && expectedVersions.has(tag)) {
      for (const delay of retryDelays) {
        log(`Waiting ${delay}ms for expected npm version ${tag} to become visible`);
        await wait(delay);
        published = await metadata(pkg.name, pkg.version);
        if (published !== null) break;
      }
      if (published === null) {
        throw new Error(`Expected published npm version ${tag} is still unavailable after ${retryDelays.length + 1} attempts; retry the release job after registry propagation`);
      }
    }
    if (published === null) {
      log(`Skipping ${tag}: version is not published on npm`);
      continue;
    }
    if (published.name !== pkg.name || published.version !== pkg.version) {
      throw new Error(`npm returned unexpected metadata for ${tag}`);
    }
    while (tagObject?.type === 'tag') tagObject = github(`git/tags/${tagObject.sha}`).object;
    const taggedCommit = tagObject?.type === 'commit' ? tagObject.sha : undefined;
    const commit = published.gitHead || taggedCommit;
    if (!/^[a-f0-9]{40}$/i.test(commit || '')) {
      throw new Error(`Cannot determine the published source commit for ${tag}; refusing to tag HEAD`);
    }
    if (hasTag && taggedCommit !== commit) throw new Error(`Existing tag ${tag} does not match npm gitHead ${commit}`);

    // Never tag a newer HEAD for an older npm version. Require the recorded
    // commit to belong to this history and contain the same workspace version.
    try {
      git(['merge-base', '--is-ancestor', commit, 'HEAD']);
    } catch (error) {
      if (error.status === 1) {
        throw new Error(`npm gitHead ${commit} for ${tag} is not in this branch's history`, { cause: error });
      }
      throw new Error(`Could not verify npm gitHead ${commit} for ${tag} against this branch's history; ensure full git history is fetched: ${error.message}`, { cause: error });
    }
    const source = JSON.parse(git(['show', `${commit}:${manifestPath}`]));
    if (source.name !== pkg.name || source.version !== pkg.version) {
      throw new Error(`Published commit ${commit} does not contain ${tag} at ${manifestPath}`);
    }
    plan.push({ name: pkg.name, version: pkg.version, tag, commit, hasTag, hasRelease });
  }
  if (unmatchedVersions.size > 0) {
    throw new Error(`Expected published versions do not match public workspace manifests: ${[...unmatchedVersions].join(', ')}`);
  }

  // Validate the whole plan before writing anything. A rerun skips metadata
  // already repaired, including a tag created before release creation failed.
  for (const item of plan) {
    log(`${apply ? 'Repairing' : 'Would repair'} ${item.tag} at ${item.commit}`);
    if (!apply) continue;
    if (!item.hasTag) github('git/refs', { method: 'POST', body: { ref: `refs/tags/${item.tag}`, sha: item.commit } });
    if (!item.hasRelease) github('releases', { method: 'POST', body: {
      tag_name: item.tag, target_commitish: item.commit, name: item.tag, body: '',
      prerelease: item.version.includes('-'), make_latest: 'false',
    } });
  }
  return plan.map(({ name, version }) => ({ name, version }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/reconcile-npm-releases.js [--apply]');
    const apply = args.includes('--apply');
    const expectedPackages = JSON.parse(process.env.EXPECTED_PUBLISHED_PACKAGES || '[]');
    const packages = await reconcileReleases({ apply, expectedPackages });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `changed=${apply && packages.length > 0}\npackages=${JSON.stringify(packages)}\n`);
    console.log(`${apply ? 'Repaired' : 'Would repair'} metadata for ${packages.length} package(s)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
