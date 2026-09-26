import { copyFile, mkdir, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(projectRoot, 'dist');

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, 'assets'), { recursive: true });
await copyFile(join(projectRoot, 'index.html'), join(outputDir, 'index.html'));
await copyFile(join(projectRoot, 'metadata.json'), join(outputDir, 'metadata.json'));
await copyFile(join(projectRoot, 'assets/dream-school.css'), join(outputDir, 'assets/dream-school.css'));

try {
  await copyFile(join(projectRoot, 'manifest.json'), join(outputDir, 'manifest.json'));
} catch (_) {}

try {
  await copyFile(join(projectRoot, 'sw.js'), join(outputDir, 'sw.js'));
} catch (_) {}

try {
  const assetFiles = await readdir(join(projectRoot, 'assets'));
  for (const f of assetFiles) {
    if (f.endsWith('.svg') || f.endsWith('.png') || f.endsWith('.ico') || f.endsWith('.css') || f.endsWith('.js')) {
      await copyFile(join(projectRoot, 'assets', f), join(outputDir, 'assets', f));
    }
  }
} catch (_) {}

console.log('Prepared production files in dist/.');
