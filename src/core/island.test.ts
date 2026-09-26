import { describe, expect, it } from 'vitest';
import { getSize, IslandState, type Scheduler } from './island.js';

class FakeScheduler implements Scheduler {
  private nextId = 1;
  private timers = new Map<number, { remaining: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { remaining: ms, callback });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  advance(ms: number): void {
    for (const [id, timer] of [...this.timers]) {
      timer.remaining -= ms;
      if (timer.remaining <= 0) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

describe('IslandState', () => {
  it('regra 1: gatilho do usuário substitui qualquer modo e fecha o cartão', () => {
    const state = new IslandState(new FakeScheduler());
    state.islandClick(); // abre o cartão a partir de compact
    expect(state.cardOpen).toBe(true);

    state.openFromTrigger('wifi');
    expect(state.mode).toBe('wifi');
    expect(state.cardOpen).toBe(false);

    state.openFromTrigger('bt');
    expect(state.mode).toBe('bt');
  });

  it('regra 2: clicar no gatilho do modo já aberto fecha a ilha', () => {
    const state = new IslandState(new FakeScheduler());
    state.openFromTrigger('quick');
    expect(state.mode).toBe('quick');

    state.openFromTrigger('quick');
    expect(state.mode).toBe('compact');
  });

  it('regra 3: evento automático não substitui modo fixo', () => {
    const state = new IslandState(new FakeScheduler());
    state.openFromTrigger('wifi');

    const opened = state.openAutomatic('music');
    expect(opened).toBe(false);
    expect(state.mode).toBe('wifi');
  });

  it('regra 3: evento automático não substitui o cartão central aberto', () => {
    const state = new IslandState(new FakeScheduler());
    state.islandClick();
    expect(state.cardOpen).toBe(true);

    const opened = state.openAutomatic('notif');
    expect(opened).toBe(false);
    expect(state.cardOpen).toBe(true);
    expect(state.mode).toBe('compact');
  });

  it('regra 3: evento automático abre a partir de compact ou modo transitório', () => {
    const state = new IslandState(new FakeScheduler());
    expect(state.openAutomatic('notif')).toBe(true);
    expect(state.mode).toBe('notif');

    expect(state.openAutomatic('music')).toBe(true);
    expect(state.mode).toBe('music');
  });

  it('regra 4: tecla de volume abre a partir de compact, mas não com modo fixo aberto', () => {
    const state = new IslandState(new FakeScheduler());
    state.volumeKey();
    expect(state.mode).toBe('volume');

    state.openFromTrigger('quick');
    state.volumeKey();
    expect(state.mode).toBe('quick');
  });

  it('regra 5: clique na ilha compacta abre o cartão por padrão', () => {
    const state = new IslandState(new FakeScheduler());
    expect(state.islandClick()).toBe('toggled-card');
    expect(state.cardOpen).toBe(true);
    expect(state.islandClick()).toBe('toggled-card');
    expect(state.cardOpen).toBe(false);
  });

  it('regra 5: clique na ilha compacta abre o calendário quando configurado', () => {
    const state = new IslandState(new FakeScheduler(), { islandClickOpens: 'calendar' });
    expect(state.islandClick()).toBe('opened-calendar');
    expect(state.mode).toBe('calendar');
  });

  it('regra 5: clique em notif abre stack', () => {
    const state = new IslandState(new FakeScheduler());
    state.openAutomatic('notif');
    expect(state.islandClick()).toBe('opened-stack');
    expect(state.mode).toBe('stack');
  });

  it('regra 6: timer transitório volta a compact só se o modo não mudou', () => {
    const scheduler = new FakeScheduler();
    const state = new IslandState(scheduler);
    state.openAutomatic('notif');
    scheduler.advance(4200);
    expect(state.mode).toBe('compact');
  });

  it('regra 6: timer expirado não fecha um modo diferente do armado', () => {
    const scheduler = new FakeScheduler();
    const state = new IslandState(scheduler);
    state.openAutomatic('notif');
    state.openFromTrigger('wifi');
    scheduler.advance(4200);
    expect(state.mode).toBe('wifi');
  });

  it('regra 7: hover cancela o timer; sair do hover rearma do zero', () => {
    const scheduler = new FakeScheduler();
    const state = new IslandState(scheduler);
    state.openAutomatic('notif');

    scheduler.advance(3000);
    state.hoverStart();
    expect(scheduler.pendingCount).toBe(0);

    scheduler.advance(5000);
    expect(state.mode).toBe('notif');

    state.hoverEnd();
    scheduler.advance(4199);
    expect(state.mode).toBe('notif');
    scheduler.advance(1);
    expect(state.mode).toBe('compact');
  });

  it('regra 8: arrastar um slider cancela o timer e soltar rearma', () => {
    const scheduler = new FakeScheduler();
    const state = new IslandState(scheduler);
    state.openAutomatic('volume');

    scheduler.advance(1000);
    state.dragStart();
    expect(scheduler.pendingCount).toBe(0);

    scheduler.advance(5000);
    expect(state.mode).toBe('volume');

    state.dragEnd();
    scheduler.advance(2599);
    expect(state.mode).toBe('volume');
    scheduler.advance(1);
    expect(state.mode).toBe('compact');
  });

  it('regra 9: Esc com senha focada fecha só o campo, um segundo Esc fecha a ilha', () => {
    const state = new IslandState(new FakeScheduler());
    state.openFromTrigger('wifi');

    expect(state.escape(true)).toBe('closed-password');
    expect(state.mode).toBe('wifi');

    expect(state.escape(false)).toBe('closed');
    expect(state.mode).toBe('compact');
  });

  it('regra 9: Esc em compact sem cartão não faz nada', () => {
    const state = new IslandState(new FakeScheduler());
    expect(state.escape(false)).toBe('noop');
  });

  it('onChange dispara em toda transição de mode/cardOpen, mas não em no-ops', () => {
    const scheduler = new FakeScheduler();
    let changes = 0;
    const state = new IslandState(scheduler, { onChange: () => changes++ });

    state.islandClick(); // abre cartão
    expect(changes).toBe(1);

    state.openFromTrigger('wifi'); // fecha cartão, muda modo
    expect(changes).toBe(2);

    expect(state.openAutomatic('music')).toBe(false); // bloqueado por modo fixo
    expect(changes).toBe(2);

    state.openFromTrigger('music'); // transitório
    expect(changes).toBe(3);

    scheduler.advance(4500); // timer expira, volta a compact
    expect(changes).toBe(4);

    expect(state.escape(false)).toBe('noop'); // já em compact
    expect(changes).toBe(4);
  });
});

describe('getSize', () => {
  it('retorna as medidas estáticas da tabela', () => {
    expect(getSize('compact')).toEqual({ width: 240, height: 30, radius: 15 });
    expect(getSize('notif')).toEqual({ width: 400, height: 62, radius: 22 });
    expect(getSize('music')).toEqual({ width: 500, height: 82, radius: 26 });
    expect(getSize('volume')).toEqual({ width: 320, height: 50, radius: 25 });
    expect(getSize('brightness')).toEqual({ width: 320, height: 50, radius: 25 });
  });

  it('stack: cresce por item até 6, com piso para lista vazia', () => {
    expect(getSize('stack', { stackItemCount: 0 })).toEqual({
      width: 400,
      height: 128,
      radius: 24,
    });
    expect(getSize('stack', { stackItemCount: 3 })).toEqual({
      width: 400,
      height: 212,
      radius: 24,
    });
    expect(getSize('stack', { stackItemCount: 6 })).toEqual({
      width: 400,
      height: 368,
      radius: 24,
    });
    expect(getSize('stack', { stackItemCount: 12 })).toEqual({
      width: 400,
      height: 368,
      radius: 24,
    });
  });

  it('calendar: semana ou mês', () => {
    expect(getSize('calendar', { calendarView: 'week' })).toEqual({
      width: 480,
      height: 150,
      radius: 24,
    });
    expect(getSize('calendar', { calendarView: 'month' })).toEqual({
      width: 480,
      height: 214,
      radius: 24,
    });
  });

  it('quick: com e sem linha de energia', () => {
    expect(getSize('quick')).toEqual({ width: 520, height: 58, radius: 29 });
    expect(getSize('quick', { quickEnergyOpen: true })).toEqual({
      width: 520,
      height: 106,
      radius: 29,
    });
  });

  it('wifi: base, energia e senha (com e sem erro)', () => {
    expect(getSize('wifi')).toEqual({ width: 520, height: 292, radius: 26 });
    expect(getSize('wifi', { wifiEnergyOpen: true })).toEqual({
      width: 520,
      height: 340,
      radius: 26,
    });
    expect(getSize('wifi', { wifiPasswordField: 'normal' })).toEqual({
      width: 520,
      height: 350,
      radius: 26,
    });
    expect(getSize('wifi', { wifiPasswordField: 'error' })).toEqual({
      width: 520,
      height: 368,
      radius: 26,
    });
    expect(getSize('wifi', { wifiEnergyOpen: true, wifiPasswordField: 'error' })).toEqual({
      width: 520,
      height: 416,
      radius: 26,
    });
  });

  it('bt: ligado/desligado e energia', () => {
    expect(getSize('bt')).toEqual({ width: 520, height: 348, radius: 26 });
    expect(getSize('bt', { btOn: false })).toEqual({ width: 520, height: 300, radius: 26 });
    expect(getSize('bt', { btEnergyOpen: true })).toEqual({ width: 520, height: 396, radius: 26 });
  });

  it('ai: altura cresce por provedor', () => {
    expect(getSize('ai', { providerCount: 1 })).toEqual({ width: 480, height: 158, radius: 24 });
    expect(getSize('ai', { providerCount: 2 })).toEqual({ width: 480, height: 266, radius: 24 });
  });
});
