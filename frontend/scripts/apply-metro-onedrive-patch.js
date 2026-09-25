/**
 * MessMate: keep Metro working when the project lives inside OneDrive.
 *
 * OneDrive "Files On-Demand" stores files as cloud reparse points. Node's
 * readdir() then reports those placeholders as Dirent.isSymbolicLink() === true
 * even though lstat() says regular file/directory, while readlink() fails with
 * EINVAL because they are not links. metro-file-map trusts the Dirent, so:
 *   (a) #applyFileDelta aborts the whole file map on EINVAL, killing bundling
 *       with "Failed to construct transformer" + later "exists" TypeErrors;
 *   (b) the node crawlers skip real directories (e.g. a package's build/) and
 *       index real files as unresolved symlinks, so resolution reports
 *       "Unable to resolve module ... could not be found".
 *
 * Three idempotent patches restore the truth lstat() already knows:
 *   1. build/index.js                - #maybeReadLink downgrades EINVAL to a file
 *   2. build/crawlers/node/index.js  - crawl trusts lstat over Dirent
 *   3. build/crawlers/node/fallback.js - lazy readdir trusts lstat too
 *
 * Wired to "postinstall", so a wiped node_modules does not bring the crash
 * back. Never fails the install: missing target, already patched, or changed
 * shape all just report and exit 0.
 */

const fs = require('fs');
const path = require('path');

const BUILD = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'metro-file-map',
  'build'
);

const PATCHES = [
  {
    label: 'index.js #maybeReadLink EINVAL',
    file: path.join(BUILD, 'index.js'),
    marker: 'Downgrade to a normal file instead of aborting the file map',
    find: `                fileMetadata[constants_1.default.SYMLINK] = (0, normalizePathSeparatorsToPosix_1.default)(this.#pathUtils.resolveSymlinkToNormal(normalPath, symlinkTarget));
            });
        }
        return null;`,
    replace: `                fileMetadata[constants_1.default.SYMLINK] = (0, normalizePathSeparatorsToPosix_1.default)(this.#pathUtils.resolveSymlinkToNormal(normalPath, symlinkTarget));
            })
                .catch((error) => {
                // OneDrive "Files On-Demand" cloud placeholders are reparse points
                // that readdir() reports as Dirent.isSymbolicLink() === true, but they
                // are not links: readlink() fails with EINVAL (lstat() says regular
                // file). Downgrade to a normal file instead of aborting the file map.
                if (error && error.code === 'EINVAL') {
                    fileMetadata[constants_1.default.SYMLINK] = 0;
                    return;
                }
                throw error;
            });
        }
        return null;`,
  },
  {
    label: 'crawlers/node/index.js Dirent trust',
    file: path.join(BUILD, 'crawlers', 'node', 'index.js'),
    marker: 'are recorded as symlinks that readlink() later rejects with EINVAL',
    find: `                    const isDirectory = entry.isDirectory();
                    if (isDirectory && (name === '.git' || name === '.hg' || name === '.cxx')) {
                        continue;
                    }
                    const file = directory + path.sep + name;
                    const isSymbolicLink = entry.isSymbolicLink();`,
    replace: `                    const file = directory + path.sep + name;
                    // OneDrive "Files On-Demand" placeholders are cloud reparse points
                    // that readdir() reports as Dirent.isSymbolicLink() === true even
                    // though lstat() reports a regular file or directory. Trust lstat()
                    // whenever the Dirent claims a symlink: real directories must still
                    // be traversed and real files must still be indexed, otherwise they
                    // are recorded as symlinks that readlink() later rejects with EINVAL.
                    let isDirectory = entry.isDirectory();
                    let isSymbolicLink = entry.isSymbolicLink();
                    if (isSymbolicLink && !isDirectory) {
                        try {
                            const stat = fs.lstatSync(file);
                            if (stat.isDirectory()) {
                                isDirectory = true;
                                isSymbolicLink = false;
                            }
                            else if (stat.isFile()) {
                                isSymbolicLink = false;
                            }
                        }
                        catch {
                            // Unreadable entry: fall back to the Dirent's view.
                        }
                    }
                    if (isDirectory && (name === '.git' || name === '.hg' || name === '.cxx')) {
                        continue;
                    }`,
  },
  {
    label: 'crawlers/node/fallback.js Dirent trust',
    file: path.join(BUILD, 'crawlers', 'node', 'fallback.js'),
    marker: 'directories are crawled and real files are indexed',
    find: `            if (entry.isDirectory()) {
                // NOTE(@kitten): ".git" and ".hg" check replace the VCS_DIRECTORIES ignore pattern
                // NOTE(@kitten): \`.cxx\` is ephemeral and should always be safe to ignore
                if (!result.has(name) && name !== '.git' && name !== '.hg' && name !== '.cxx') {
                    const childDir = new Map();
                    markDir(childDir, FallbackFlag.VISITED);
                    result.set(name, childDir);
                }
            }
            else if (entry.isSymbolicLink()) {
                // We can skip reading the symlink target here, since it'll be read lazily
                if (includeSymlinks && !result.has(name)) {
                    result.set(name, [null, 0, 0, null, 1, null]);
                }
            }
            else if (entry.isFile()) {`,
    replace: `            // OneDrive "Files On-Demand" placeholders are cloud reparse points
            // that readdir() reports as Dirent.isSymbolicLink() === true even though
            // lstat() reports a regular file or directory. Trust lstat() so real
            // directories are crawled and real files are indexed instead of being
            // recorded as symlinks that readlink() later rejects with EINVAL.
            let isDirectory = entry.isDirectory();
            let isSymbolicLink = entry.isSymbolicLink();
            let isFile = entry.isFile();
            if (isSymbolicLink && !isDirectory && !isFile) {
                try {
                    const stat = fs_1.default.lstatSync(childAbsolutePath);
                    if (stat.isDirectory()) {
                        isDirectory = true;
                        isSymbolicLink = false;
                    }
                    else if (stat.isFile()) {
                        isFile = true;
                        isSymbolicLink = false;
                    }
                }
                catch {
                    // Unreadable entry: fall back to the Dirent's view.
                }
            }
            if (isDirectory) {
                // NOTE(@kitten): ".git" and ".hg" check replace the VCS_DIRECTORIES ignore pattern
                // NOTE(@kitten): \`.cxx\` is ephemeral and should always be safe to ignore
                if (!result.has(name) && name !== '.git' && name !== '.hg' && name !== '.cxx') {
                    const childDir = new Map();
                    markDir(childDir, FallbackFlag.VISITED);
                    result.set(name, childDir);
                }
            }
            else if (isSymbolicLink) {
                // We can skip reading the symlink target here, since it'll be read lazily
                if (includeSymlinks && !result.has(name)) {
                    result.set(name, [null, 0, 0, null, 1, null]);
                }
            }
            else if (isFile) {`,
  },
];

function main() {
  for (const patch of PATCHES) {
    const tag = `[metro-onedrive-patch ${patch.label}]`;
    if (!fs.existsSync(patch.file)) {
      console.log(`${tag} target not installed; skipped.`);
      continue;
    }
    const source = fs.readFileSync(patch.file, 'utf8');
    if (source.includes(patch.marker)) {
      console.log(`${tag} already applied.`);
      continue;
    }
    if (!source.includes(patch.find)) {
      console.warn(
        `${tag} target shape not recognised - Metro may have changed. ` +
          'The project may still hit OneDrive reparse-point failures.'
      );
      continue;
    }
    fs.writeFileSync(patch.file, source.replace(patch.find, patch.replace), 'utf8');
    console.log(`${tag} applied.`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PATCHES };