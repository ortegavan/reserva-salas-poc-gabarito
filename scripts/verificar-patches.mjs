import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DIR_FIXES, executar, lerArgumentos, prepararClone } from './lib/comum.mjs';

const args = lerArgumentos();
const { clone, commit, limpar } = prepararClone(args.app, args.branch, {
  manterTemp: args['manter-temp'],
  instalar: false,
});

try {
  const patches = readdirSync(DIR_FIXES)
    .filter((f) => /^bug-\d+\.patch$/.test(f))
    .sort();
  let falhas = 0;
  console.log(`Branch ${args.branch} @ ${commit}`);
  for (const patch of patches) {
    const r = executar('git', ['apply', '--check', path.join(DIR_FIXES, patch)], {
      cwd: clone,
      permitirFalha: true,
      silencioso: true,
    });
    console.log(`  ${patch}: ${r.status === 0 ? 'aplica limpo' : `NÃO APLICA\n${r.stderr}`}`);
    if (r.status !== 0) {
      falhas++;
    }
  }
  process.exitCode = falhas === 0 ? 0 : 1;
} finally {
  limpar();
}
