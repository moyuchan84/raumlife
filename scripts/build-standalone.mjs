/**
 * 단독 실행판: 서버 없이 한 개의 HTML 파일로 컴퓨터와 대결한다.
 *   node scripts/build-standalone.mjs  →  dist/standalone/index.html
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  define: { 'process.env.PACE': '"1"' },
  logLevel: 'info',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/client/style.css', 'utf8');
let html = await readFile('src/client/index.html', 'utf8');
// 함수로 치환해야 번들 안의 `$&` 같은 패턴이 해석되지 않는다
html = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', () => `<script>window.__LH_LOCAL__ = true;</script>\n<script>\n${js}\n</script>`);
// Artifact 게시용 조각: 게시 시스템이 html/head/body 를 감싸므로 본문만 둔다
const fragment = `<title>인생 섬 여행</title>
<style>
${css}
</style>
<div id="app"></div>
<div id="conn" class="conn hidden">연결이 끊겼습니다. 다시 연결하는 중…</div>
<script>window.__LH_LOCAL__ = true;</script>
<script>
${js}
</script>
`;
await mkdir('dist/standalone', { recursive: true });
await writeFile('dist/standalone/artifact.html', fragment);
await writeFile('dist/standalone/index.html', html);
console.log(`dist/standalone/index.html  ${(html.length / 1024 / 1024).toFixed(2)}MB`);
