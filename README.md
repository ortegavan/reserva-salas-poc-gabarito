# reserva-salas-poc-gabarito

Gabarito e instrumentos de medição do experimento "Teste verde, bug vivo". A aplicação medida está no repositório `reserva-salas-poc` (branches `main` e `base-com-especificacao`; protocolo e prompts na branch `experimento`). Este repositório fica separado para que a ferramenta que gera os testes nunca tenha o gabarito acessível pelo git.

**Não abra este repositório numa sessão de IA que vá gerar testes para a aplicação.**

## Conteúdo

- `gabarito/bugs.md`: os cinco bugs plantados, regra violada, arquivo e linha.
- `gabarito/fixes/bug-0N.patch`: um patch por bug, que corrige só aquele bug.
- `scripts/`: instrumentos de medição.
- `resultados/`: saída das medições (criado pelos scripts).
- `docs/decisoes.md`: decisões, arquivos-fonte lidos e limitações.

## Uso

```bash
pnpm install

APP=<caminho-ou-url-do-repo-da-aplicação>
BRANCH=rodada/<ferramenta>-codigo

pnpm verificar:patches --app $APP --branch $BRANCH   # git apply --check de cada patch
pnpm medir:cobertura   --app $APP --branch $BRANCH   # cobertura de linhas e branches dos arquivos-alvo
pnpm medir:mutacao     --app $APP --branch $BRANCH   # mutation score (Stryker) sobre o código corrigido
pnpm medir:mutacao     --app $APP --branch $BRANCH --versao com-bugs   # medição secundária, código com bugs
pnpm medir:bugs        --app $APP --branch $BRANCH   # detectado / protegido / ignorado por bug
pnpm medir:padroes     --app $APP --branch $BRANCH   # contagens heurísticas nos specs
pnpm relatorio                                       # consolida resultados/ em resultados.json e README.md
```

Cada script clona só a branch pedida num diretório temporário, instala as dependências com `pnpm install --frozen-lockfile` e apaga o clone ao final (`--manter-temp` preserva). Requer Node.js 22+, pnpm e git.

Saídas em `resultados/<branch>/` (com `/` trocado por `__`): `cobertura.json`, `mutacao.json` e `stryker/mutation.{json,html}` (código corrigido), `mutacao-com-bugs.json` e `stryker-com-bugs/` (se medido), `bugs.json`, `padroes.json`.

## Limitações conhecidas

- O Stryker não muta templates Angular. O bug do template (B4) não afeta o mutation score; só `medir:bugs` o enxerga.
- O Stryker exige suíte verde. O mutation score principal é medido sobre o código corrigido (os cinco patches aplicados); os testes que falham nessa versão ficam fora do score e são listados no relatório.
- `medir:padroes` é heurística por expressão regular.

Detalhes em `docs/decisoes.md`.
