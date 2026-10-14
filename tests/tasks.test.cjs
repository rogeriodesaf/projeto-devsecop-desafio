const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/script.js', 'utf8');

function element() {
  return { value: '', textContent: '', children: [],
    appendChild(child) { this.children.push(child); },
    addEventListener(event, handler) { this.handler = handler; } };
}
async function setup(response) {
  const nodes = Object.fromEntries(['db-status', 'task-list', 'new-task', 'output', 'add-task'].map(id => [id, element()]));
  const context = { document: { getElementById: id => nodes[id], createElement: element },
    fetch: async () => response, console };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}
const ok = { ok: true, json: async () => ({ status: 'Conectado', itens: [{ task: 'Inicial' }] }) };
test('carrega as tarefas iniciais', async () => {
  const nodes = await setup(ok);
  assert.equal(nodes['task-list'].children[0].textContent, 'Inicial');
  assert.equal(nodes['db-status'].textContent, 'Conectado');
});
test('entrada com HTML e JavaScript permanece texto, sem execução', async () => {
  const nodes = await setup(ok);
  const payload = '<img src=x onerror=alert(1)>" ); throw new Error("execução"); //';
  nodes['new-task'].value = payload;
  assert.doesNotThrow(() => nodes['add-task'].handler());
  assert.equal(nodes.output.children[0].textContent, payload);
  assert.equal(nodes.output.children[0].children.length, 0);
  assert.equal(nodes['new-task'].value, '');
});
test('ignora espaços e preserva várias tarefas', async () => {
  const nodes = await setup(ok);
  nodes['new-task'].value = '  ';
  nodes['add-task'].handler();
  assert.equal(nodes.output.children.length, 0);
  for (const task of ['Um', 'Dois']) {
    nodes['new-task'].value = task;
    nodes['add-task'].handler();
  }
  assert.equal(nodes.output.children.length, 2);
});
test('erro HTTP não expõe stack trace', async () => {
  const nodes = await setup({ ok: false });
  assert.equal(nodes['db-status'].textContent, 'Não foi possível carregar as tarefas. Tente novamente mais tarde.');
});
test('dados inválidos não são renderizados', async () => {
  const nodes = await setup({ ok: true, json: async () => ({ status: 'OK', itens: [{ task: null }] }) });
  assert.equal(nodes['task-list'].children.length, 0);
  assert.match(nodes['db-status'].textContent, /Não foi possível/);
});
