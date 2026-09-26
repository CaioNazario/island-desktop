# 10 · Hardware

Origem: `design/markup.html` 321–328 (blocos na pílula direita); `design/logic.js` `hw` (~286) e o tick de `componentDidMount`.

## Blocos

Cinco blocos de duas linhas, gap 2px, sem entrelinha:
- Rótulo: 8.5px/500, `letter-spacing .08em`, `neutral-500`.
- Valor: 11.5px/500, dígitos tabulares.
- Largura fixa por bloco, medida para o valor mais largo possível, para a barra não "pular": CPU `100%`, RAM `99.9G`, GPU `100%`, TEMP `100°`, NET `↓99.9`.
- Tooltip no hover (500ms de atraso) com o detalhe; estilo Nocturne (fundo `bg`, anel `neutral-800`, 11px), não o tooltip do sistema.
- Clique não faz nada.

| Bloco | Valor | Cor | Tooltip |
|---|---|---|---|
| CPU | `12%` | `accent-300` se ≥60%, senão `text` | `CPU 12%` |
| RAM | `7.2G` (usada, 1 casa) | `text` | `RAM 7.2 / 16 GB` |
| GPU | `8%` | `text` | `GPU 8%` |
| TEMP | `54°` | `#f75d59` se ≥70°, senão `text` | `Temperatura 54°C` |
| NET | `↓1.2` (MB/s, 1 casa; ≥100 sem casa) | `text` | `Rede ↓1.2 MB/s ↑86 KB/s` |

Os limiares, a formatação e os cálculos por delta ficam em `src/core/hardware.ts`. Leitura de arquivos em `src/services/hardware.ts`, sempre assíncrona.

## Fontes

Amostragem a cada **1s** (exceto quando indicado).

- **CPU**: delta de `/proc/stat` (linha `cpu`), `1 − Δidle/Δtotal`, onde idle inclui `iowait`.
- **RAM**: `/proc/meminfo`, `MemTotal − MemAvailable`.
- **GPU**, primeira que existir:
  1. `amdgpu`: `/sys/class/drm/card*/device/gpu_busy_percent`
  2. `i915`: `100 − Δrc6_residency_ms / Δt_ms × 100` de `/sys/class/drm/card*/power/rc6_residency_ms`
  3. `xe`: mesma conta com `/sys/class/drm/card*/device/tile0/gt0/gtidle/idle_residency_ms`
  4. NVIDIA: `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits`, se o binário existir, a cada **5s** (é subprocesso)
  5. nenhuma → o bloco GPU some
- **TEMP**, primeira que existir em `/sys/class/hwmon/*`: `coretemp` (`Package id 0`) → `k10temp` (`Tctl`) → `/sys/class/thermal/thermal_zone*` do tipo `x86_pkg_temp` → some.
- **NET**: delta de `/proc/net/dev` somando interfaces físicas (exclui `lo`, `docker*`, `veth*`, `br-*`, `virbr*`, `tun*`, `wg*`). Download em MB/s, upload em KB/s.

## Largura mínima

A ordem em que os blocos somem por falta de espaço está na spec 02: NET → GPU → TEMP.

## Critérios de aceite

- [ ] Testes de `hardware.ts` cobrem: cálculo de CPU por delta, RC6 → %, limiares de cor, formatação de RAM/NET, largura máxima de cada valor.
- [ ] Em Intel i915 (máquina de referência) o bloco GPU mostra uso coerente com `intel_gpu_top`.
- [ ] Sem GPU reconhecida, o bloco GPU some e os outros não se mexem.
- [ ] A barra não muda de largura quando os valores oscilam.
- [ ] A amostragem não gera I/O síncrono no main loop.
