import { describe, expect, it } from 'vitest';
import { fitWidgets, type WidgetSize } from './widgetFit.js';

const fixed = (width: number): WidgetSize => ({ natural: width, min: width });
const hw: WidgetSize = { natural: 200, min: 90 };

describe('fitWidgets', () => {
  it('com espaço, todos na largura natural', () => {
    expect(fitWidgets([fixed(80), hw], 400, 2, 'end')).toEqual([80, 200]);
  });

  it('o hw encolhe antes de qualquer widget sumir', () => {
    // 80 + 2 + 200 = 282; sobra 250: o hw perde 32px.
    expect(fitWidgets([hw, fixed(80)], 250, 2, 'end')).toEqual([168, 80]);
    expect(fitWidgets([hw, fixed(80)], 172, 2, 'end')).toEqual([90, 80]);
  });

  it('o excesso passa de um widget para o seguinte sem encolher além do necessário', () => {
    // 100 + 100 = 200; sobra 160: o primeiro perde 20 (até o mínimo), o segundo os outros 20.
    const sizes = [
      { natural: 100, min: 80 },
      { natural: 100, min: 50 },
    ];
    expect(fitWidgets(sizes, 160, 0, 'end')).toEqual([80, 80]);
  });

  it('sem espaço nem com o hw no mínimo, some o widget mais longe da ilha', () => {
    // Direita: a ilha fica no começo, some o último.
    expect(fitWidgets([hw, fixed(80), fixed(60)], 180, 2, 'end')).toEqual([98, 80, null]);
    // Esquerda: a ilha fica no fim, some o primeiro.
    expect(fitWidgets([fixed(60), fixed(80), hw], 180, 2, 'start')).toEqual([null, 80, 98]);
  });

  it('depois de um widget sumir, o hw volta a crescer no espaço que sobrou', () => {
    expect(fitWidgets([hw, fixed(150)], 220, 2, 'end')).toEqual([200, null]);
  });

  it('nunca corta um widget: sem espaço para nenhum, somem todos', () => {
    expect(fitWidgets([fixed(80), fixed(60)], 50, 2, 'end')).toEqual([null, null]);
    expect(fitWidgets([hw], 50, 2, 'end')).toEqual([null]);
  });

  it('lista vazia', () => {
    expect(fitWidgets([], 100, 2, 'end')).toEqual([]);
  });
});
