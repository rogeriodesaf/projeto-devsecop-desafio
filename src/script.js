'use strict';

function appendTask(list, task) {
    const li = document.createElement('li');
    li.textContent = task;
    list.appendChild(li);
}

fetch('db.json')
    .then(response => {
        if (!response.ok) throw new Error('Falha ao carregar tarefas');
        return response.json();
    })
    .then(data => {
        if (typeof data.status !== 'string' || !Array.isArray(data.itens) ||
            !data.itens.every(item => item && typeof item.task === 'string')) {
            throw new Error('Dados inválidos');
        }
        document.getElementById('db-status').textContent = data.status;
        const list = document.getElementById('task-list');
        data.itens.forEach(item => appendTask(list, item.task));
    })
    .catch(() => {
        document.getElementById('db-status').textContent =
            'Não foi possível carregar as tarefas. Tente novamente mais tarde.';
    });

function addTask() {
    const input = document.getElementById('new-task');
    const task = input.value.trim();
    if (!task) return;
    appendTask(document.getElementById('output'), task);
    input.value = '';
}

document.getElementById('add-task').addEventListener('click', addTask);
