# Resultados

Gerado em 2026-10-19T18:51:21.406Z por `pnpm relatorio` a partir de `resultados/<branch>/*.json`.

"Testes" e "Falhando com bugs" vêm do Jest sobre a branch inteira e incluem os 2 testes de `src/app/app.spec.ts`, que já existem na base. "Mutation score" é medido sobre o **código corrigido** (os cinco patches de `gabarito/fixes` aplicados). O Stryker exige suíte verde, então os testes que falham no código corrigido ficam fora do score; "Excluídos do Stryker" conta esses testes, listados na seção abaixo. "Score com bugs" é a medição secundária (`--versao com-bugs`), sobre o código da branch como está. Motivo da escolha em `docs/decisoes.md`.

Cobertura e mutation score consideram apenas os arquivos-alvo (`regras-reserva.service.ts`, `reserva.component.ts`, `sala.service.ts`). O template `reserva.component.html` entra no `mutate` do Stryker, mas o Stryker não gera mutantes para bindings de templates Angular.

| Suíte | Testes | Falhando com bugs | Linhas | Branches | Mutation score | Excluídos do Stryker | Score com bugs | Bugs detectados | Bugs protegidos | Bugs ignorados |
|---|---|---|---|---|---|---|---|---|---|---|
| `rodada/claude-codigo` | 96 | 11 | 100% | 100% | 85.4% | 4 | — | 4 (bug-02, bug-03, bug-04, bug-05) | 1 (bug-01) | 0 |
| `rodada/claude-especificacao` | 103 | 16 | 100% | 100% | 83.94% | 1 | — | 5 (bug-01, bug-02, bug-03, bug-04, bug-05) | 0 | 0 |

## Testes excluídos do mutation score

Testes que falham no código corrigido (principal) e, se medido, no código com bugs (secundário). Na versão corrigida, um teste que falha costuma ser um teste que afirma o comportamento com bug ou um teste quebrado.

### `rodada/claude-codigo`

- Código corrigido: 4
  - RegrasReservaService exigeAprovacaoGestor não exige aprovação para 10 participantes
  - RegrasReservaService horarioInicioPermitido recusa horário sem minutos
  - ReservaComponent validações recusa data anterior a hoje
  - ReservaComponent aprovação do gestor não avisa com 10 participantes

### `rodada/claude-especificacao`

- Código corrigido: 1
  - ReservaComponent R6 — botão "Reservar" não dispara reserva duplicada ao enviar duas vezes seguidas

## Contagens heurísticas

> **Heurística.** Contagens por expressão regular sobre o texto dos specs, sem análise sintática. Servem só de apoio à leitura humana e podem contar a mais ou a menos. Os padrões estão em `scripts/medir-padroes.mjs`.

| Suíte | "should create" | Dublês (`jest.fn`, `jest.spyOn`, `useValue`) | Asserções sobre o DOM | Asserções sobre o componente | Timers falsos |
|---|---|---|---|---|---|
| `rodada/claude-codigo` | 0 | 4 | 3 | 60 | 18 |
| `rodada/claude-especificacao` | 0 | 4 | 9 | 43 | 16 |

Detalhes por suíte (testes que detectaram ou protegeram cada bug, mutantes sobreviventes, relatório HTML do Stryker) ficam em `resultados/<branch>/`.
