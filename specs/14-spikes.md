# 14 · Spikes

Pontos que ninguém verificou ainda. Cada spike se resolve **antes** de implementar a feature que depende dele: um experimento pequeno e descartável, e o resultado (o que funciona, com a API exata) entra na spec dependente. Depois disso, o spike sai desta lista.

## S4 · Publicação no extensions.gnome.org (futuro, fora da v1)

- **Pergunta**: o review do EGO aceita uma extensão que lê credenciais de CLIs de terceiros e chama endpoints não documentados com User-Agent de outro cliente?
- **Pronto quando**: há uma resposta das diretrizes do EGO ou de um reviewer; enquanto isso, a instalação é só via `install.sh`.

## S5 · Arrastar e soltar no St (antes da spec 17)

- **Pergunta**: o `js/ui/dnd.js` do Shell 50 (`DND.makeDraggable`, `acceptDrop`/`handleDragOver` no alvo) funciona do painel do editor para as pílulas da barra, com o editor em grab modal e a barra em outra camada do `layoutManager`?
- **Pronto quando**: há um protótipo arrastando um ator do editor para uma pílula e reordenando dentro dela, com o índice de destino calculado pelo x do ponteiro, e a API exata anotada na spec 17.

## S6 · Recarregar o stylesheet em runtime (antes da spec 19)

- **Pergunta**: `St.ThemeContext.get_for_stage(global.stage).get_theme()` com `load_stylesheet`/`unload_stylesheet` reaplica as cores em todos os atores da Island sem recriá-los? Quanto custa cada recarga (dá para 10 por segundo durante o arraste)?
- **Pronto quando**: há medida do tempo de recarga com a barra e a ilha abertas e a forma de aplicar anotada na spec 19. Se for lento, a prévia durante o arraste cai para "aplica ao soltar".

## S9 · Barreira de pressão para o auto-ocultar (antes da spec 18)

- **Pergunta**: `Layout.PressureBarrier` + `Meta.Barrier` na borda de cima de cada monitor funcionam com o strut removido e com janela maximizada? Que limiar e tempo (o canto ativo usa 100px em 1000ms) dão uma revelação sem disparo acidental?
- **Pronto quando**: há protótipo revelando a barra por pressão em dois monitores, e os valores estão na spec 18.
