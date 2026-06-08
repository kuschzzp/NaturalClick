#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..')
const MANIFEST_REL_PATH = 'naturalclick-extension/manifest.json'
const VERSION_TEXT_FILES = [
	'README.md',
	'README.zh-CN.md',
	'docs/runtime-configuration-and-diagnostics.md',
	'docs/runtime-configuration-and-diagnostics.zh-CN.md',
]

function parseVersion(version) {
	const value = String(version || '').trim()
	const match = value.match(/^0\.(\d+)\.(\d+)$/)
	if (!match) {
		throw new Error(`unexpected version format: ${version}`)
	}
	const minor = Number(match[1])
	const patch = Number(match[2])
	if (!Number.isInteger(minor) || minor < 1 || !Number.isInteger(patch) || patch < 1 || patch > 99) {
		throw new Error(`version tail must stay in 1-99 and carry after 0.X.99, got ${version}`)
	}
	return { minor, patch, text: `0.${minor}.${patch}` }
}

function computeNextVersion(version) {
	const parsed = parseVersion(version)
	if (parsed.patch >= 99) return `0.${parsed.minor + 1}.1`
	return `0.${parsed.minor}.${parsed.patch + 1}`
}

function isCarryRelease(version) {
	return parseVersion(version).patch === 1
}

function normalizeTargetVersion(currentVersion, target) {
	const value = String(target || 'patch').trim()
	if (!value || value === 'patch' || value === 'next') return computeNextVersion(currentVersion)
	if (value === 'current') return parseVersion(currentVersion).text
	return parseVersion(value).text
}

function readManifest(repoRoot = DEFAULT_REPO_ROOT) {
	const manifestPath = path.join(repoRoot, MANIFEST_REL_PATH)
	return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function readManifestVersion(repoRoot = DEFAULT_REPO_ROOT) {
	return String(readManifest(repoRoot).version || '').trim()
}

function writeManifestVersion(repoRoot, version, dryRun = false) {
	const manifestPath = path.join(repoRoot, MANIFEST_REL_PATH)
	const manifest = readManifest(repoRoot)
	manifest.version = version
	if (!dryRun) {
		fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`)
	}
	return MANIFEST_REL_PATH
}

function replaceVersionInFile(repoRoot, relPath, currentVersion, nextVersion, dryRun = false) {
	const filePath = path.join(repoRoot, relPath)
	const source = fs.readFileSync(filePath, 'utf8')
	if (!source.includes(currentVersion)) {
		throw new Error(`${relPath} does not mention current version ${currentVersion}`)
	}
	const updated = source.split(currentVersion).join(nextVersion)
	if (updated === source) return null
	if (!dryRun) fs.writeFileSync(filePath, updated)
	return relPath
}

function syncVersionFiles(options = {}) {
	const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT
	const dryRun = Boolean(options.dryRun)
	const currentVersion = options.currentVersion || readManifestVersion(repoRoot)
	const nextVersion = normalizeTargetVersion(currentVersion, options.targetVersion || 'patch')
	parseVersion(currentVersion)
	parseVersion(nextVersion)
	if (currentVersion === nextVersion) {
		return {
			currentVersion,
			nextVersion,
			dryRun,
			changed: [],
			carryRelease: isCarryRelease(nextVersion),
		}
	}
	const manifest = readManifest(repoRoot)
	if (String(manifest.version || '').trim() !== currentVersion) {
		throw new Error(`manifest version changed while bumping: expected ${currentVersion}, got ${manifest.version}`)
	}
	const changed = [writeManifestVersion(repoRoot, nextVersion, dryRun)]
	for (const file of VERSION_TEXT_FILES) {
		const relPath = replaceVersionInFile(repoRoot, file, currentVersion, nextVersion, dryRun)
		if (relPath) changed.push(relPath)
	}
	return {
		currentVersion,
		nextVersion,
		dryRun,
		changed,
		carryRelease: isCarryRelease(nextVersion),
	}
}

function printUsage() {
	console.log([
		'Usage:',
		'  node scripts/bump-version.js patch [--dry-run]',
		'  node scripts/bump-version.js 0.X.Y [--dry-run]',
		'',
		'Rules:',
		'  - Versions must use 0.X.Y.',
		'  - Y must stay in 1-99.',
		'  - 0.X.99 bumps to 0.(X+1).1.',
		'  - Every 0.X.1 release must be committed and pushed once.',
	].join('\n'))
}

function main(argv = process.argv.slice(2)) {
	if (argv.includes('--help') || argv.includes('-h')) {
		printUsage()
		return
	}
	const dryRun = argv.includes('--dry-run')
	const targetVersion = argv.find((arg) => !arg.startsWith('-')) || 'patch'
	const result = syncVersionFiles({ targetVersion, dryRun })
	const mode = result.dryRun ? 'dry run' : 'updated'
	console.log(`NaturalClick version ${mode}: ${result.currentVersion} -> ${result.nextVersion}`)
	for (const file of result.changed) console.log(`- ${file}`)
	if (!result.changed.length) console.log('- no files changed')
	if (result.carryRelease) {
		console.log('')
		console.log(`Release rule: ${result.nextVersion} is a 0.X.1 release; validate, commit, and push it once.`)
		console.log('  node scripts/validate-runtime-contracts.js')
		console.log('  git add -A')
		console.log(`  git commit -m "Release NaturalClick Agent ${result.nextVersion}"`)
		console.log('  git push')
	}
}

if (require.main === module) {
	try {
		main()
	} catch (error) {
		console.error(error?.message || error)
		process.exit(1)
	}
}

module.exports = {
	computeNextVersion,
	isCarryRelease,
	normalizeTargetVersion,
	parseVersion,
	readManifestVersion,
	syncVersionFiles,
}
