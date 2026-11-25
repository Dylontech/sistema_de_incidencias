import test from 'node:test';
import assert from 'node:assert/strict';
import seguridad from '../../desktop/src/seguridad.js';

test('la navegación exige el origen completo y rechaza prefijos, credenciales y otros puertos', () => {
  const base = 'https://municipio.example';
  assert.equal(seguridad.urlPermitida(`${base}/cuenta?tab=1`, base), true);
  for (const destino of [
    `${base}.ajeno.test/`, `${base}@ajeno.test/`, `${base}:444/`,
    'http://municipio.example/', 'javascript:alert(1)', 'no es una URL'
  ]) assert.equal(seguridad.urlPermitida(destino, base), false, destino);
});

test('IPC exige una ventana registrada y su frame principal en una URL autorizada', () => {
  const mainFrame = { url: 'https://municipio.example/' };
  const sender = { mainFrame };
  const ventana = { webContents: sender, isDestroyed: () => false };
  const permitidas = [{ ventana, url: 'https://municipio.example' }];
  assert.equal(seguridad.emisorPermitido({ sender, senderFrame: mainFrame }, permitidas), true);
  assert.equal(seguridad.emisorPermitido({ sender, senderFrame: { ...mainFrame } }, permitidas), false);
  mainFrame.url = 'https://municipio.example.ajeno.test';
  assert.equal(seguridad.emisorPermitido({ sender, senderFrame: mainFrame }, permitidas), false);
  assert.equal(seguridad.emisorPermitido({ sender, senderFrame: mainFrame }, []), false);
  assert.equal(seguridad.urlPermitida('file:///app/ui/config.html?x=1', 'file:///app/ui/config.html'), true);
  assert.equal(seguridad.urlPermitida('file:///app/ui/otra.html', 'file:///app/ui/config.html'), false);
});
