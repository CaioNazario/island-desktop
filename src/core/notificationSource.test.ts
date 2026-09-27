import { describe, expect, it } from 'vitest';
import { identifySource } from './notificationSource.js';

// Payload real do Brave 1.x no GNOME 50 (spike S1, specs/14-spikes.md):
// `new Notification("teste wpp", {body: "oi"})` em web.whatsapp.com, visto
// pelo `dbus-monitor`: app_name "Brave", summary = título, body com o
// domínio na primeira linha e uma linha em branco antes do corpo.
const BRAVE_WHATSAPP = { appName: 'Brave', body: 'web.whatsapp.com\n\noi' };

const fromBrave = (domain: string, text = 'oi') => identifySource('Brave', `${domain}\n\n${text}`);

describe('identifySource', () => {
  it('site da tabela: nome e ícone da tabela, sem a linha do domínio', () => {
    expect(identifySource(BRAVE_WHATSAPP.appName, BRAVE_WHATSAPP.body)).toEqual({
      name: 'WhatsApp',
      glyph: 'whatsapp-logo-fill',
      body: 'oi',
    });
  });

  it.each([
    ['music.youtube.com', 'YouTube Music', 'youtube-logo-fill'],
    ['www.youtube.com', 'YouTube', 'youtube-logo-fill'],
    ['open.spotify.com', 'Spotify', 'spotify-logo-fill'],
  ])('%s → %s', (domain, name, glyph) => {
    expect(fromBrave(domain)).toMatchObject({ name, glyph });
  });

  it('ignora o www.', () => {
    expect(fromBrave('www.youtube.com').name).toBe('YouTube');
    expect(fromBrave('www.github.com').name).toBe('Github');
  });

  it('casa o subdomínio mais específico primeiro', () => {
    expect(fromBrave('music.youtube.com').name).toBe('YouTube Music');
    expect(fromBrave('m.youtube.com').name).toBe('YouTube');
  });

  it('domínio fora da tabela: rótulo registrável capitalizado e globo', () => {
    expect(fromBrave('twitch.tv')).toEqual({ name: 'Twitch', glyph: 'globe', body: 'oi' });
    expect(fromBrave('www.github.com').name).toBe('Github');
    expect(fromBrave('gist.github.com').name).toBe('Github');
  });

  it('sufixo de segundo nível não vira o nome', () => {
    expect(fromBrave('g1.globo.com.br').name).toBe('Globo');
    expect(fromBrave('www.bbc.co.uk').name).toBe('Bbc');
  });

  it('ignora a porta', () => {
    expect(fromBrave('app.example.com:8443').name).toBe('Example');
  });

  it('corpo com várias linhas mantém as linhas depois do domínio', () => {
    expect(fromBrave('web.whatsapp.com', 'Fulano\nboa noite').body).toBe('Fulano\nboa noite');
  });

  it('só o domínio, sem corpo', () => {
    expect(identifySource('Brave', 'web.whatsapp.com').body).toBe('');
  });

  it('domínio em link com body-markup', () => {
    const body = '<a href="https://web.whatsapp.com/">web.whatsapp.com</a>\n\noi';
    expect(identifySource('Brave', body)).toMatchObject({ name: 'WhatsApp', body: 'oi' });
  });

  it.each(['Google Chrome', 'Chromium'])('%s usa a mesma regra do Brave', (appName) => {
    expect(identifySource(appName, 'web.whatsapp.com\n\noi').name).toBe('WhatsApp');
  });

  it('navegador sem domínio na primeira linha fica como app', () => {
    expect(identifySource('Brave', 'Download concluído\n\narquivo.zip')).toEqual({
      name: 'Brave',
      glyph: null,
      body: 'Download concluído\n\narquivo.zip',
    });
  });

  it('app nativo fica com o próprio nome e ícone, mesmo com domínio no corpo', () => {
    expect(identifySource('Thunderbird', 'github.com\n\nnovo e-mail')).toEqual({
      name: 'Thunderbird',
      glyph: null,
      body: 'github.com\n\nnovo e-mail',
    });
  });

  it('Firefox fica como app até o S1 ter o formato dele', () => {
    expect(identifySource('Firefox', 'web.whatsapp.com\n\noi').name).toBe('Firefox');
  });
});
