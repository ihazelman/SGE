// ============================================
// SISTEMA DE MONTAGEM DE EQUIPES - DRAG AND DROP
// ============================================

let equipeMontada = [];
let equipeDatas = {}; // Armazena datas individuais: {funcId: {embarque, desembarque}}
let graficoEquipe = null;

// Inicializa sistema de equipes
document.addEventListener('DOMContentLoaded', async () => {
    // A carga de funcionários agora é centralizada no app.js
    // A função carregarFuncionariosParaEquipes será chamada quando a aba for clicada.
    carregarEquipes();
    
    // Filtro de funcionários (para a aba de montagem de equipes)
    const filtro = document.getElementById('filtro-funcionarios');
    if (filtro) {
        filtro.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#funcionarios-disponiveis .funcionario-card');
            
            cards.forEach(card => {
                const nome = card.querySelector('h4').textContent.toLowerCase();
                const gin = card.dataset.gin.toLowerCase();
                
                if (nome.includes(termo) || gin.includes(termo)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // Filtro para a TABELA principal de funcionários
    const filtroTabela = document.getElementById('filtro-tabela-funcionarios');
    if (filtroTabela) {
        filtroTabela.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const linhas = document.querySelectorAll('#tabela-funcionarios-corpo tr');
            
            linhas.forEach(linha => {
                const textoLinha = linha.textContent.toLowerCase();
                if (textoLinha.includes(termo)) {
                    linha.style.display = ''; // ou 'table-row'
                } else {
                    linha.style.display = 'none';
                }
            });
        });
    }
    
    // Preenche select de unidades com dados completos
    const selectUnidade = document.getElementById('equipe-unidade');
    if (selectUnidade) {
        fetch('/api/unidades-completas')
            .then(r => r.json())
            .then(unidades => {
                selectUnidade.innerHTML = '<option value="">Selecione...</option>';
                unidades.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.poco;
                    const prefixo = u.tipo_operacao ? `[${u.tipo_operacao}] ` : '';
                    const sufixo  = u.contrato      ? ` — ${u.contrato}`      : '';
                    option.textContent = `${prefixo}${u.poco}${sufixo}`;
                    selectUnidade.appendChild(option);
                });
            });
    }

    // UNIFICADO: Configura as zonas de arrastar e soltar (Drag and Drop)
    const disponiveis = document.getElementById('funcionarios-disponiveis');
    const equipe = document.getElementById('equipe-montada');
    
    if (disponiveis) {
        disponiveis.addEventListener('dragover', handleDragOver);
        disponiveis.addEventListener('drop', (e) => handleDrop(e, 'disponiveis'));
        disponiveis.addEventListener('dragleave', handleDragLeave);
    }
    
    if (equipe) {
        equipe.addEventListener('dragover', handleDragOver);
        equipe.addEventListener('drop', (e) => handleDrop(e, 'equipe'));
        equipe.addEventListener('dragleave', handleDragLeave);
    }
});

function carregarFuncionariosParaEquipes() {
    // Esta função é chamada quando a aba 'equipes' é ativada.
    // Garante que a lista de funcionários esteja pronta para uso.
    if (typeof window.funcionarios !== 'undefined' && Array.isArray(window.funcionarios)) {
        renderizarListasDeEquipe();
    } else {
        console.warn("A lista de funcionários não está disponível. Tentando carregar novamente.");
        // Fallback caso a carga inicial falhe ou a aba seja acessada diretamente.
        if (typeof carregarDados === 'function') {
            carregarDados().then(() => renderizarListasDeEquipe());
        }
    }
}

function renderizarListasDeEquipe() {
    const containerDisponiveis = document.getElementById('funcionarios-disponiveis');
    const containerEquipe = document.getElementById('equipe-montada');

    if (!containerDisponiveis || !containerEquipe) return;

    containerDisponiveis.innerHTML = '';
    containerEquipe.innerHTML = '<p style="text-align: center; color: #666; margin-top: 150px;" class="placeholder-text">Arraste funcionários aqui</p>';

    const disponiveis = funcionarios.filter(f => !equipeMontada.includes(String(f.id)));
    const naEquipe = funcionarios.filter(f => equipeMontada.includes(String(f.id)));

    disponiveis.forEach(func => {
        containerDisponiveis.appendChild(criarCardFuncionario(func, false));
    });

    if (naEquipe.length > 0) {
        containerEquipe.innerHTML = '';
        naEquipe.forEach(func => {
            containerEquipe.appendChild(criarCardFuncionario(func, true));
        });
    }
    atualizarContador(naEquipe.length);
    atualizarGrafico();
}

// Cria card de funcionário
function criarCardFuncionario(func, naEquipe = false) {
    const card = document.createElement('div');
    card.className = 'funcionario-card';
    card.draggable = true;
    card.dataset.id = func.id;
    card.dataset.gin = func.gin || '';
    
    // Verifica se já tem data salva
    const dataEmbarque = equipeDatas[func.id]?.embarque || '';
    const dataDesembarque = equipeDatas[func.id]?.desembarque || '';
    
    card.innerHTML = `
        <h4>
            <span class="badge-gin">${func.gin || 'N/A'}</span>
            ${func.nome}
        </h4>
        <p>📋 ${func.grade || 'Sem cargo'}</p>
        
        ${naEquipe ? `
            <div class="data-embarque-field">
                <label>📅 Data Embarque:</label>
                <input type="date" 
                       class="input-data-embarque" 
                       data-func-id="${func.id}"
                       value="${dataEmbarque}"
                       onclick="event.stopPropagation()"
                       onmousedown="event.stopPropagation()">
                ${dataDesembarque ? `<div class="data-desembarque-info">↳ Desembarque: ${formatarDataSimples(dataDesembarque)}</div>` : ''}
            </div>
        ` : ''}
    `;
    
    // Eventos de drag
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    // Se estiver na equipe, adicionar listener para mudança de data
    if (naEquipe) {
        const inputData = card.querySelector('.input-data-embarque');
        if (inputData) {
            inputData.addEventListener('change', function(e) {
                const funcId = this.dataset.funcId;
                const dataEmb = this.value;
                
                if (dataEmb) {
                    // Calcula data de desembarque (+14 dias)
                    const data = new Date(dataEmb);
                    data.setDate(data.getDate() + 14);
                    const dataDesemb = data.toISOString().split('T')[0];
                    
                    // Salva as datas
                    equipeDatas[funcId] = {
                        embarque: dataEmb,
                        desembarque: dataDesemb
                    };
                    
                    // Atualiza visualização
                    renderizarListasDeEquipe();
                } else {
                    delete equipeDatas[funcId];
                    renderizarListasDeEquipe();
                }
            });
        }
    }
    
    return card;
}

// Função auxiliar para formatar data
function formatarDataSimples(dataISO) {
    if (!dataISO) return '';
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR');
}

// Drag Start
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
    e.dataTransfer.setData('funcionario-id', e.target.dataset.id);
}

// Drag End
function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
    return false;
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, zona) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();
    
    e.currentTarget.classList.remove('drag-over');
    
    const funcId = e.dataTransfer.getData('funcionario-id');
    
    if (zona === 'equipe') {
        // Adiciona à equipe
        if (!equipeMontada.includes(funcId)) {
            equipeMontada.push(funcId);
        }
    } else {
        // Remove da equipe
        equipeMontada = equipeMontada.filter(id => id !== funcId);
    }
    
    renderizarListasDeEquipe();
    
    return false;
}

// Atualiza contador
function atualizarContador(num) {
    const contador = document.getElementById('contador-equipe');
    if (contador) {
        contador.textContent = num;
    }
}

// Atualiza gráfico
function atualizarGrafico() {
    const canvas = document.getElementById('grafico-equipe');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (graficoEquipe) {
        graficoEquipe.destroy();
    }
    
    const membros = funcionarios.filter(f => equipeMontada.includes(f.id));
    
    if (membros.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('Monte uma equipe para ver o gráfico', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Conta por grade/cargo
    const gradeCount = {};
    membros.forEach(m => {
        const grade = m.grade || 'Sem Grade';
        gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });
    
    const labels = Object.keys(gradeCount);
    const data = Object.values(gradeCount);
    
    const backgroundColors = ['#0114dc', '#28a745', '#ffc107', '#fd7e14', '#9333ea', '#6c757d', '#17a2b8', '#dc3545'];
    
    graficoEquipe = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Membros',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: true,
                    text: `Composição da Equipe por Grade (${membros.length} membros)`,
                    font: {
                        size: 14
                    }
                }
            },
            scales: {
                y: {
                    display: false
                },
                x: {
                    display: false
                }
            }
        }
    });
}

// Salvar equipe
async function salvarEquipe() {
    const atividade = document.getElementById('equipe-atividade').value;
    const unidade = document.getElementById('equipe-unidade').value;
    
    if (!atividade) {
        mostrarAlerta('Selecione a atividade', 'warning');
        return;
    }

    if (equipeMontada.length === 0) {
        mostrarAlerta('Adicione pelo menos um funcionário à equipe', 'warning');
        return;
    }
    
    // Prepara dados com datas individuais
    const membrosComDatas = equipeMontada.map(funcId => ({
        funcionario_id: funcId,
        data_embarque: equipeDatas[funcId]?.embarque || '',
        data_desembarque: equipeDatas[funcId]?.desembarque || ''
    }));
    
    const data = {
        atividade: atividade,
        unidade_maritima: unidade,
        membros: equipeMontada,
        membros_datas: membrosComDatas // Novo: datas individuais
    };
    
    try {
        const response = await fetch('/api/equipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Mensagem diferente se escalas foram criadas
            if (result.escalas_criadas) {
                mostrarAlerta(
                    `Planejamento salvo e ${result.escalas_criadas} escalas criadas com sucesso!`, 
                    'success'
                );
            } else {
                mostrarAlerta('Equipe salva com sucesso!', 'success');
            }
            
            document.getElementById('equipe-atividade').value = 'embarque';
            document.getElementById('equipe-unidade').value = '';
            equipeMontada = [];
            equipeDatas = {}; // Limpa datas individuais
            renderizarListasDeEquipe();
            carregarEquipes();
        }
    } catch (error) {
        mostrarAlerta('Erro ao salvar equipe', 'danger');
    }
}

// Carrega equipes salvas
async function carregarEquipes() {
    showLoader();
    try {
        const response = await fetch('/api/equipes');
        const equipes = await response.json();
        renderizarEquipesSalvas(equipes);
    } catch (error) {
        // Silenciosamente falha se não conseguir carregar equipes
    } finally {
        hideLoader();
    }
}

// Renderiza equipes salvas
function renderizarEquipesSalvas(equipes) {
    const container = document.getElementById('equipes-salvas');
    if (!container) return;
    
    if (equipes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhuma equipe salva ainda</p>';
        return;
    }
    
    container.innerHTML = '';
    
    equipes.forEach(equipe => {
        const card = document.createElement('div');
        card.className = 'equipe-card-salva';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3>👷 ${equipe.nome}</h3>
                <div>
                    <button onclick="abrirEditarEquipe('${equipe.id}')" style="margin-right: 5px;">✏️ Editar</button>
                    <button class="danger" onclick="excluirEquipe('${equipe.id}')">Excluir</button>
                </div>
            </div>
            <div class="equipe-info">
                <div class="equipe-info-item">
                    <label>Unidade:</label>
                    <strong>${equipe.unidade_maritima || 'Não definida'}</strong>
                </div>
                <div class="equipe-info-item">
                    <label>Total de Membros:</label>
                    <strong style="color: #0114dc;">${equipe.total_membros}</strong>
                </div>
                <div class="equipe-info-item">
                    <label>Data de Criação:</label>
                    <strong>${equipe.data_criacao ? new Date(equipe.data_criacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</strong>
                </div>
            </div>
            <div class="equipe-membros">
                ${equipe.membros_info.map(m => `
                    <span class="membro-chip">${m.gin} - ${m.nome}</span>
                `).join('')}
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Excluir equipe
async function excluirEquipe(id) {
    if (!await customConfirm('Deseja realmente excluir esta equipe?')) return;
    
    try {
        const response = await fetch(`/api/equipes/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            mostrarAlerta('Equipe excluída com sucesso!', 'success');
            carregarEquipes();
        }
    } catch (error) {
        mostrarAlerta('Erro ao excluir equipe', 'danger');
    }
}

// ============================================
// EDITAR EQUIPE
// ============================================

let equipeMontadaEdit = [];
let equipeEditandoId = null;

// Abre modal de edição
async function abrirEditarEquipe(equipeId) {
    try {
        // Busca dados da equipe
        const response = await fetch('/api/equipes');
        const equipes = await response.json();
        const equipe = equipes.find(e => e.id === equipeId);
        
        if (!equipe) {
            mostrarAlerta('Equipe não encontrada', 'danger');
            return;
        }
        
        equipeEditandoId = equipeId;
        
        // Preenche campos
        document.getElementById('edit-equipe-id').value = equipe.id;
        document.getElementById('edit-equipe-nome').value = equipe.nome;
        document.getElementById('edit-equipe-unidade').value = equipe.unidade_maritima || '';
        
        // Preenche select de unidades com dados completos
        const selectUnidade = document.getElementById('edit-equipe-unidade');
        selectUnidade.innerHTML = '<option value="">Selecione...</option>';
        try {
            const rU = await fetch('/api/unidades-completas');
            const unidadesCompletas = await rU.json();
            unidadesCompletas.forEach(u => {
                const option = document.createElement('option');
                option.value = u.poco;
                const prefixo = u.tipo_operacao ? `[${u.tipo_operacao}] ` : '';
                const sufixo  = u.contrato      ? ` — ${u.contrato}`      : '';
                option.textContent = `${prefixo}${u.poco}${sufixo}`;
                if (u.poco === equipe.unidade_maritima) option.selected = true;
                selectUnidade.appendChild(option);
            });
        } catch(e) {
            // fallback: usa o array em memória
            unidades.forEach(u => {
                const option = document.createElement('option');
                const poco = typeof u === 'string' ? u : u.poco;
                option.value = poco;
                option.textContent = poco;
                if (poco === equipe.unidade_maritima) option.selected = true;
                selectUnidade.appendChild(option);
            });
        }
        
        // Define membros atuais (normaliza para string para manter consistência com drag&drop)
        equipeMontadaEdit = equipe.membros.map(String);
        
        // Renderiza funcionários
        renderizarFuncionariosDisponiveisEdit();
        renderizarEquipeMontadaEdit();
        
        // Configura drag and drop no modal
        setupDragDropEdit();
        
        // Filtro
        const filtro = document.getElementById('edit-filtro-funcionarios');
        filtro.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#edit-funcionarios-disponiveis .funcionario-card');
            
            cards.forEach(card => {
                const nome = card.querySelector('h4').textContent.toLowerCase();
                const gin = card.dataset.gin.toLowerCase();
                
                if (nome.includes(termo) || gin.includes(termo)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
        
        // Abre modal
        document.getElementById('editar-equipe-modal').classList.add('active');
        
    } catch (error) {
        mostrarAlerta('Erro ao carregar equipe', 'danger');
    }
}

// Fecha modal de edição
function closeEditarEquipeModal() {
    document.getElementById('editar-equipe-modal').classList.remove('active');
    document.getElementById('form-editar-equipe').reset();
    equipeMontadaEdit = [];
    equipeEditandoId = null;
}

// Renderiza funcionários disponíveis no modal de edição
function renderizarFuncionariosDisponiveisEdit() {
    const container = document.getElementById('edit-funcionarios-disponiveis');
    if (!container) return;
    
    container.innerHTML = '';
    
    const disponivel = funcionarios.filter(f => !equipeMontadaEdit.includes(String(f.id)));
    
    if (disponivel.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; margin-top: 100px;">Todos na equipe</p>';
        return;
    }
    
    disponivel.forEach(func => {
        const card = criarCardFuncionario(func);
        card.classList.add('edit-card');
        container.appendChild(card);
    });
}

// Renderiza equipe montada no modal de edição
function renderizarEquipeMontadaEdit() {
    const container = document.getElementById('edit-equipe-membros');
    if (!container) return;
    
    const placeholder = container.querySelector('.placeholder-text');
    
    if (equipeMontadaEdit.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
        container.innerHTML = '<p style="text-align: center; color: #666; margin-top: 120px;" class="placeholder-text">Arraste funcionários aqui</p>';
        document.getElementById('edit-contador-equipe').textContent = 0;
        return;
    }
    
    if (placeholder) placeholder.style.display = 'none';
    container.innerHTML = '';
    
    const membros = funcionarios.filter(f => equipeMontadaEdit.includes(String(f.id)));
    
    membros.forEach(func => {
        const card = criarCardFuncionario(func, true);
        card.classList.add('edit-card');
        container.appendChild(card);
    });
    
    document.getElementById('edit-contador-equipe').textContent = membros.length;
}

// Configura drag and drop no modal de edição
function setupDragDropEdit() {
    const disponiveis = document.getElementById('edit-funcionarios-disponiveis');
    const membros = document.getElementById('edit-equipe-membros');
    
    if (disponiveis) {
        disponiveis.addEventListener('dragover', handleDragOver);
        disponiveis.addEventListener('drop', (e) => handleDropEdit(e, 'disponiveis'));
        disponiveis.addEventListener('dragleave', handleDragLeave);
    }
    
    if (membros) {
        membros.addEventListener('dragover', handleDragOver);
        membros.addEventListener('drop', (e) => handleDropEdit(e, 'equipe'));
        membros.addEventListener('dragleave', handleDragLeave);
    }
}

function handleDropEdit(e, zona) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();
    
    e.currentTarget.classList.remove('drag-over');
    
    const funcId = e.dataTransfer.getData('funcionario-id');
    
    if (zona === 'equipe') {
        // Adiciona à equipe
        if (!equipeMontadaEdit.includes(funcId)) {
            equipeMontadaEdit.push(funcId);
        }
    } else {
        // Remove da equipe
        equipeMontadaEdit = equipeMontadaEdit.filter(id => id !== funcId);
    }
    
    renderizarFuncionariosDisponiveisEdit();
    renderizarEquipeMontadaEdit();
    
    return false;
}

// Submete edição de equipe
document.addEventListener('DOMContentLoaded', () => {
    const formEditarEquipe = document.getElementById('form-editar-equipe');
    if (formEditarEquipe) {
        formEditarEquipe.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (equipeMontadaEdit.length === 0) {
                mostrarAlerta('Adicione pelo menos um funcionário à equipe', 'warning');
                return;
            }
            
            const data = {
                nome: document.getElementById('edit-equipe-nome').value,
                unidade_maritima: document.getElementById('edit-equipe-unidade').value,
                membros: equipeMontadaEdit
            };
            
            try {
                const response = await fetch(`/api/equipes/${equipeEditandoId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    mostrarAlerta('Equipe atualizada com sucesso!', 'success');
                    closeEditarEquipeModal();
                    carregarEquipes();
                } else {
                    mostrarAlerta('Erro ao atualizar equipe', 'danger');
                }
            } catch (error) {
                mostrarAlerta('Erro ao atualizar equipe', 'danger');
            }
        });
    }
});
