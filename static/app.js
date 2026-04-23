// Estado global
let funcionarios = [];
let escalas = [];
let loaderRequestCount = 0;
let ganttCursorDate = null; // Armazena a data da linha de referência arrastável

// Mapeamento de estados
const ESTADOS_LABELS = {
    'embarque': '🚢 Embarque',
    'folga': '🏖️ Folga',
    'base': '🏠 Base',
    'dobra': '⚠️ Dobra',
    'ferias': '✈️ Férias'
};

const ESTADOS_CORES = {
    'embarque': '#0114dc',
    'folga': '#43e97b',
    'base': '#e9700d', // Laranja para Base
    'dobra': '#ff6b6b',
    'ferias': '#ffc107'
};

// Helper functions for loader
function showLoader() {
    loaderRequestCount++;
    const loader = document.getElementById('loader-overlay');
    if (loader) loader.style.display = 'flex';
}

function hideLoader() {
    loaderRequestCount--;
    if (loaderRequestCount <= 0) {
        const loader = document.getElementById('loader-overlay');
        if (loader) loader.style.display = 'none';
        loaderRequestCount = 0; // Reset to avoid negative numbers
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
    try { inicializarFormularios(); } catch(e) { console.warn('inicializarFormularios:', e); }
    
    // Define datas padrão para o Gantt (próximos 30 dias)
    const hoje = new Date();
    const daquiA30Dias = new Date();
    daquiA30Dias.setDate(hoje.getDate() + 30);
    
    document.getElementById('gantt-inicio').valueAsDate = hoje;
    document.getElementById('gantt-fim').valueAsDate = daquiA30Dias;
});

// Controla visibilidade do campo operação
function toggleOperacao() {
    const estado = document.getElementById('escala-estado').value;
    const operacaoGroup = document.getElementById('operacao-group');
    const operacaoSelect = document.getElementById('escala-operacao');
    
    // Operação é obrigatória apenas para embarque, base e dobra
    if (estado === 'embarque' || estado === 'base' || estado === 'dobra') {
        operacaoGroup.style.display = 'block';
        operacaoSelect.required = true;
    } else {
        operacaoGroup.style.display = 'none';
        operacaoSelect.required = false;
        operacaoSelect.value = '';
    }
    
    // Se for embarque, configura auto-cálculo de desembarque
    const dataInicio = document.getElementById('escala-inicio');
    const dataFim = document.getElementById('escala-fim');
    
    if (estado === 'embarque') {
        // Adiciona listener para calcular data de desembarque
        dataInicio.addEventListener('change', calcularDataDesembarque);
        // Calcula imediatamente se já tiver data
        if (dataInicio.value) {
            calcularDataDesembarque();
        }
    } else {
        // Remove listener se não for embarque
        dataInicio.removeEventListener('change', calcularDataDesembarque);
    }
}

// Calcula data de desembarque (14 dias após embarque)
function calcularDataDesembarque() {
    const estado = document.getElementById('escala-estado').value;
    
    // Só calcula se for embarque
    if (estado !== 'embarque') return;
    
    const dataInicio = document.getElementById('escala-inicio').value;
    if (!dataInicio) return;
    
    // Adiciona 14 dias
    const dataEmbarque = new Date(dataInicio);
    dataEmbarque.setDate(dataEmbarque.getDate() + 14);
    
    // Formata para YYYY-MM-DD
    const ano = dataEmbarque.getFullYear();
    const mes = String(dataEmbarque.getMonth() + 1).padStart(2, '0');
    const dia = String(dataEmbarque.getDate()).padStart(2, '0');
    const dataDesembarque = `${ano}-${mes}-${dia}`;
    
    // Preenche campo de data fim
    document.getElementById('escala-fim').value = dataDesembarque;
}

// Navegação entre tabs
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    const tabEl = document.getElementById(tabName);
    if (tabEl) tabEl.classList.add('active');
    
    if (tabName === 'dashboard') {
        atualizarDashboard();
        carregarSondas(); // ADICIONADO: Atualiza a lista de cartões de sondas ao entrar na aba
    } else if (tabName === 'gantt') {
        atualizarGantt();
    } else if (tabName === 'equipes') {
        if (typeof carregarFuncionariosParaEquipes === 'function') {
            carregarFuncionariosParaEquipes(); // Esta função agora está em equipes.js e é chamada aqui
        }
    } else if (tabName === 'unidades') {
        if (typeof carregarUnidades === 'function') {
            carregarUnidades();
        }
    }
}

// Carrega todos os dados
async function carregarDados() {
    showLoader();
    try {
        const [funcResp, escalasResp, unidResp] = await Promise.all([
            fetch('/api/funcionarios'),
            fetch('/api/escalas'),
            fetch('/api/unidades-completas')
        ]);

        if (!funcResp.ok) throw new Error('Falha ao buscar funcionários: ' + funcResp.status);
        if (!escalasResp.ok) throw new Error('Falha ao buscar escalas: ' + escalasResp.status);
        if (!unidResp.ok) throw new Error('Falha ao buscar unidades: ' + unidResp.status);

        const funcData = await funcResp.json();
        const escalasData = await escalasResp.json();
        const unidData = await unidResp.json();

        if (!Array.isArray(funcData)) throw new Error('Resposta de funcionários inválida');
        if (!Array.isArray(escalasData)) throw new Error('Resposta de escalas inválida');

        funcionarios = funcData;
        escalas = escalasData;
        unidades = unidData;

        atualizarTabelaFuncionarios();
        atualizarTabelaEscalas();
        atualizarTabelaFerias();
        atualizarSelects();
        atualizarDashboard();

        // Sincroniza com a aba de unidades se a função de renderização estiver disponível
        if (typeof atualizarListaUnidades === 'function') {
            atualizarListaUnidades();
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarAlerta('Erro ao carregar dados: ' + error.message, 'danger');
    } finally {
        hideLoader();
    }
}

// Atualiza selects de funcionários
function atualizarSelects() {
    // This function is synchronous and doesn't need a loader
    const selects = [
        document.getElementById('escala-funcionario'),
        document.getElementById('ferias-funcionario'),
        document.getElementById('escala-operacao'),
        document.getElementById('sug-operacao'),
        document.getElementById('editar-periodo-operacao')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        const isFuncionarioSelect = select.id.includes('funcionario');
        select.innerHTML = '<option value="">Selecione...</option>';

        if (isFuncionarioSelect) {
            funcionarios.forEach(func => {
                const option = document.createElement('option');
                option.value = func.id;
                option.textContent = func.nome;
                select.appendChild(option);
            });
        } else {
            // Popula select de Operações/Unidades usando o campo 'poco'
            unidades.forEach(u => {
                const option = document.createElement('option');
                option.value = u.poco;
                option.textContent = u.poco;
                select.appendChild(option);
            });
        }
    });
}

// Inicializa formulários
function inicializarFormularios() {
    // Formulário de Escalas
    const formEscala = document.getElementById('form-escala');
    if (formEscala) formEscala.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const estado = document.getElementById('escala-estado').value;
        const operacao = document.getElementById('escala-operacao').value;
        
        // Valida operação para estados que precisam
        if ((estado === 'embarque' || estado === 'base' || estado === 'dobra') && !operacao) {
            mostrarAlerta('Selecione uma operação', 'warning');
            return;
        }
        
        const data = {
            funcionario_id: parseInt(document.getElementById('escala-funcionario').value),
            estado: estado,
            operacao: operacao,
            data_inicio: document.getElementById('escala-inicio').value,
            data_fim: document.getElementById('escala-fim').value,
            observacoes: document.getElementById('escala-obs').value
        };
        
        try {
            const response = await fetch('/api/escalas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                let mensagem = `Período de ${ESTADOS_LABELS[estado]} criado com sucesso!`;
                if (result.alerta_descanso) {
                    mensagem += ' ⚠️ ATENÇÃO: Funcionário sem 7 dias consecutivos de folga!';
                }
                if (result.alerta_folga) {
                    mensagem += ' ⚠️ ATENÇÃO: Embarcando durante período de folga!';
                }
                mostrarAlerta(mensagem, result.alerta_descanso || result.alerta_folga ? 'warning' : 'success');
                e.target.reset();
                toggleOperacao(); // Reset visibility
                carregarDados();
            } else {
                mostrarAlerta(result.error || 'Erro ao criar período', 'danger');
            }
        } catch (error) {
            mostrarAlerta('Erro ao criar período', 'danger');
        }
    });
    
    // Formulário de Férias (mantido por compatibilidade)
    document.getElementById('form-ferias').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            funcionario_id: parseInt(document.getElementById('ferias-funcionario').value),
            data_inicio: document.getElementById('ferias-inicio').value,
            data_fim: document.getElementById('ferias-fim').value
        };
        
        try {
            const response = await fetch('/api/ferias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                mostrarAlerta('Férias cadastradas com sucesso!', 'success');
                e.target.reset();
                carregarDados();
            }
        } catch (error) {
            mostrarAlerta('Erro ao cadastrar férias', 'danger');
        }
    });
    
    // Formulário de Sugestões
    document.getElementById('form-suggestion').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            operacao: document.getElementById('sug-operacao').value,
            data_inicio: document.getElementById('sug-inicio').value,
            data_fim: document.getElementById('sug-fim').value,
            quantidade: document.getElementById('sug-quantidade').value
        };
        
        try {
            const response = await fetch('/api/sugerir-escalas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const sugestoes = await response.json();
            mostrarSugestoes(sugestoes);
        } catch (error) {
            mostrarAlerta('Erro ao buscar sugestões', 'danger');
        }
    });
}

// Mostra sugestões de funcionários
function mostrarSugestoes(sugestoes) {
    const container = document.getElementById('suggestions-result');
    
    if (sugestoes.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">Nenhum funcionário disponível para esta operação.</div>';
        return;
    }
    
    let html = '<h3 style="margin-top: 20px;">Funcionários Sugeridos (em ordem de prioridade)</h3>';
    
    sugestoes.forEach((sug, index) => {
        const cardClass = sug.tem_descanso ? 'suggestion-card' : 'suggestion-card no-rest';
        html += `
            <div class="${cardClass}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${index + 1}. ${sug.nome}</strong>
                        ${sug.tem_descanso 
                            ? '<span class="badge badge-success">Descanso OK</span>' 
                            : '<span class="badge badge-warning">Sem 7 dias de folga</span>'}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Modal de sugestões
function showSuggestionModal() {
    document.getElementById('suggestion-modal').classList.add('active');
}

function closeSuggestionModal() {
    document.getElementById('suggestion-modal').classList.remove('active');
    document.getElementById('suggestions-result').innerHTML = '';
}

// Atualiza tabela de funcionários
function atualizarTabelaFuncionarios() {
    const tbody = document.querySelector('#tabela-funcionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (funcionarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhum funcionário cadastrado</td></tr>';
        return;
    }

    funcionarios.forEach(func => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${func.gin || '-'}</td>
            <td>${func.nome || '-'}</td>
            <td>${func.grade || '-'}</td>
            <td style="text-align:center;">${func.leader ? '⭐' : '—'}</td>
            <td>
                    <button onclick="verHistoricoFuncionario(${func.id})" style="background:#6c757d; margin-right:5px;">📜 Histórico</button>
                    <button onclick="abrirEditarFuncionario(${func.id})" style="background:#0114dc; margin-right: 5px;">✏️ Editar</button>
                <button class="danger" onclick="excluirFuncionario(${func.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza contador acima da tabela se existir
    const contador = document.getElementById('contador-funcionarios');
    if (contador) contador.textContent = funcionarios.length + ' funcionário(s) cadastrado(s)';
}

// Atualiza tabela de escalas
function atualizarTabelaEscalas() {
    const tbody = document.querySelector('#tabela-escalas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    escalas.forEach(escala => {
        const func = funcionarios.find(f => f.id == escala.funcionario_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${func ? func.nome : 'N/A'}</td>
            <td><span style="font-weight: bold;">${ESTADOS_LABELS[escala.estado] || escala.estado}</span></td>
            <td>${escala.operacao || '-'}</td>
            <td>${formatarData(escala.data_inicio)}</td>
            <td>${formatarData(escala.data_fim)}</td>
            <td>${escala.observacoes || '-'}</td>
            <td>
                <button onclick="editarPeriodo('${escala.id}')" style="background: #0114dc; margin-right: 5px;">
                    ✏️ Editar
                </button>
                <button class="danger" onclick="excluirEscala('${escala.id}')">
                    🗑️ Excluir
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Atualiza tabela de férias
function atualizarTabelaFerias() {
    const tbody = document.querySelector('#tabela-ferias tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const ferias = escalas.filter(e => e.estado === 'ferias');
    
    ferias.forEach(feria => {
        const func = funcionarios.find(f => f.id == feria.funcionario_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${func ? func.nome : 'N/A'}</td>
            <td>${formatarData(feria.data_inicio)}</td>
            <td>${formatarData(feria.data_fim)}</td>
            <td>
                <button class="danger" onclick="excluirFerias('${feria.id}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Atualiza dashboard
async function atualizarDashboard() {
    showLoader();
    try {
        const response = await fetch('/api/dashboard-data');
        const data = await response.json();
        
        document.getElementById('total-funcionarios').textContent = data.total_funcionarios;
        document.getElementById('total-escalas').textContent = data.total_escalas;
        document.getElementById('escalas-proximas').textContent = data.escalas_proximas;
        
        // Alertas
        const alertasContainer = document.getElementById('alertas-container');
        if (data.alertas.length === 0) {
            alertasContainer.innerHTML = '<div class="alert alert-success">✅ Nenhum alerta no momento</div>';
        } else {
            let html = '';
            data.alertas.forEach(alerta => {
                html += `<div class="alert alert-warning">⚠️ <strong>${alerta.funcionario}:</strong> ${alerta.mensagem}</div>`;
            });
            alertasContainer.innerHTML = html;
        }
        
        // Gráfico de operações
        const operacoesChart = document.getElementById('operacoes-chart');
        let chartHtml = '<table style="width: 100%;"><tbody>';
        for (const [operacao, count] of Object.entries(data.operacoes)) {
            const percentage = data.total_funcionarios > 0 
                ? (count / data.total_funcionarios * 100).toFixed(1) 
                : 0;
            chartHtml += `
                <tr>
                    <td style="width: 150px; font-weight: 600;">${operacao}</td>
                    <td>
                        <div style="background: #e0e0e0; border-radius: 4px; height: 24px; position: relative;">
                            <div style="background: #0114dc; width: ${percentage}%; height: 100%; border-radius: 4px;"></div>
                            <span style="position: absolute; right: 10px; top: 2px; font-size: 12px; font-weight: 600;">
                                ${count} (${percentage}%)
                            </span>
                        </div>
                    </td>
                </tr>
            `;
        }
        chartHtml += '</tbody></table>';
        operacoesChart.innerHTML = chartHtml;
        
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
    } finally {
        hideLoader();
    }
}

// Atualiza Gantt
function atualizarGantt() {
    showLoader();
    try {
    const inicio = new Date(document.getElementById('gantt-inicio').value + 'T00:00:00');
    const fim    = new Date(document.getElementById('gantt-fim').value   + 'T00:00:00');

    if (!inicio || !fim || isNaN(inicio) || isNaN(fim) || inicio > fim) {
        mostrarAlerta('Selecione um período válido', 'warning');
        hideLoader(); // Hide immediately if period is invalid
        return;
    }

    const container = document.getElementById('gantt-chart');
    container.innerHTML = '';

    const DIA_PX = 40; // largura reduzida por dia

    // Gera lista de dias
    const dias = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        dias.push(new Date(d));
    }

    // Largura total da área de timeline
    const timelineW = dias.length * DIA_PX;

    // Usa a lista global de funcionários carregada via API
    const lista = funcionarios;

    // ── HEADER ──────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'gantt-header';

    const headerName = document.createElement('div');
    headerName.className = 'gantt-name-col';
    headerName.textContent = 'Funcionário';
    header.appendChild(headerName);

    const timeline = document.createElement('div');
    timeline.className = 'gantt-timeline';
    timeline.style.width = timelineW + 'px';

    dias.forEach(dia => {
        const dow = dia.getDay(); // 0=dom, 6=sab
        const isWeekend = dow === 0 || dow === 6;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'gantt-day' + (isWeekend ? ' weekend' : '');
        dayDiv.textContent = `${dia.getDate()}/${dia.getMonth() + 1}`;
        timeline.appendChild(dayDiv);
    });

    header.appendChild(timeline);
    container.appendChild(header);

    // ── LINHAS DOS FUNCIONÁRIOS ──────────────────────────
    lista.forEach(func => {
        const row = document.createElement('div');
        row.className = 'gantt-row';

        // Coluna com o nome (sticky left)
        const nameCol = document.createElement('div');
        nameCol.className = 'gantt-name-col';
        nameCol.textContent = func.nome;
        nameCol.setAttribute('data-fullname', func.nome);
        nameCol.title = func.nome;
        row.appendChild(nameCol);

        // Área de células
        const cellsContainer = document.createElement('div');
        cellsContainer.className = 'gantt-cells';
        cellsContainer.style.width = timelineW + 'px';

        dias.forEach(dia => {
            const dow = dia.getDay();
            const cell = document.createElement('div');
            cell.className = 'gantt-cell' + (dow === 0 || dow === 6 ? ' weekend' : '');
            cellsContainer.appendChild(cell);
        });

        // Barras de escala
        const escalasFunc = escalas.filter(e => e.funcionario_id == func.id);
        escalasFunc.forEach(escala => {
            const dInicio = new Date(escala.data_inicio + 'T00:00:00');
            const dFim    = new Date(escala.data_fim    + 'T00:00:00');

            if (dFim < inicio || dInicio > fim) return;

            // Ajusta o início e fim para o que é visível no gráfico
            const vInicio = dInicio < inicio ? inicio : dInicio;
            const vFim    = dFim > fim ? fim : dFim;

            const offsetDias = Math.round((vInicio - inicio) / 86400000);
            const duracaoDias = Math.round((vFim - vInicio) / 86400000) + 1;

            const bar = document.createElement('div');
            bar.className = 'gantt-bar';
            bar.classList.add(escala.estado); // Usa as classes do CSS para cores consistentes
            bar.style.left   = (offsetDias  * DIA_PX) + 'px';
            bar.style.width  = (duracaoDias * DIA_PX - 2) + 'px';

            // Lógica de hachura para Folga Inflexível (primeiros 7 dias)
            if (escala.estado === 'folga') {
                const dataInicioReal = new Date(escala.data_inicio + 'T00:00:00');
                
                // REGRA: Folga Inflexível é APENAS imediato após embarque.
                // Verifica se existe um embarque terminando no dia anterior ao início desta folga.
                const dataAnterior = new Date(dataInicioReal);
                dataAnterior.setDate(dataAnterior.getDate() - 1);
                const anoAnt = dataAnterior.getFullYear();
                const mesAnt = String(dataAnterior.getMonth() + 1).padStart(2, '0');
                const diaAnt = String(dataAnterior.getDate()).padStart(2, '0');
                const strDataAnterior = `${anoAnt}-${mesAnt}-${diaAnt}`;

                const ehPosEmbarque = escalasFunc.some(e => 
                    e.estado === 'embarque' && e.data_fim === strDataAnterior
                );

                // Dias passados desde o início real da folga até o início da visualização atual
                const diasPassados = Math.round((vInicio - dataInicioReal) / 86400000);
                
                if (ehPosEmbarque && diasPassados < 7) {
                    // Calcula largura da hachura: min(duração visível, dias restantes dos 7 iniciais)
                    const diasHachurados = Math.min(duracaoDias, 7 - diasPassados);
                    const larguraHachura = diasHachurados * DIA_PX;
                    
                    bar.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(0,0,0,0.2) 0, rgba(0,0,0,0.2) 5px, transparent 5px, transparent 10px)';
                    bar.style.backgroundSize = `${larguraHachura}px 100%`;
                    bar.style.backgroundRepeat = 'no-repeat';
                    bar.title += '\n🔒 Folga Inflexível (Primeiros 7 dias)';
                }
            }

            // Tenta encontrar a unidade marítima correspondente para exibir Sonda e Poço
            const unidadeInfo = unidades.find(u => u.poco === escala.operacao);
            const textoExibicao = (unidadeInfo && unidadeInfo.sonda_nome) 
                ? `${unidadeInfo.sonda_nome} - ${escala.operacao}` 
                : (escala.operacao || ESTADOS_LABELS[escala.estado] || escala.estado);

            bar.textContent  = textoExibicao;
            bar.title        = `${func.nome}\n${ESTADOS_LABELS[escala.estado] || escala.estado}\n${textoExibicao}\n${formatarData(escala.data_inicio)} → ${formatarData(escala.data_fim)}`;

            cellsContainer.appendChild(bar);
        });

        row.appendChild(cellsContainer);
        container.appendChild(row);
    });

    // ── CURSOR ARRASTÁVEL (LINHA DE REFERÊNCIA) ────────────────
    const NAME_COL_WIDTH = 180;
    if (!ganttCursorDate) {
        ganttCursorDate = new Date();
        ganttCursorDate.setHours(0,0,0,0);
    }

    // Calcula a posição do cursor baseada na data salva
    const diffTime = ganttCursorDate.getTime() - inicio.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    // Limita a posição visual dentro dos limites do gráfico atual
    const visibleOffset = Math.max(0, Math.min(diffDays * DIA_PX, timelineW));

    const cursor = document.createElement('div');
    cursor.className = 'gantt-cursor';
    cursor.style.left = (NAME_COL_WIDTH + visibleOffset) + 'px';
    cursor.title = `Referência: ${ganttCursorDate.toLocaleDateString('pt-BR')}\n(Arraste para mover)`;
    container.appendChild(cursor);

    // Lógica para arrastar a linha
    cursor.addEventListener('mousedown', (e) => {
        const onMouseMove = (mE) => {
            const rect = container.getBoundingClientRect();
            let x = mE.clientX - rect.left;
            // Restringe o movimento à área das células (após a coluna de nomes)
            x = Math.max(NAME_COL_WIDTH, Math.min(x, NAME_COL_WIDTH + timelineW));
            cursor.style.left = x + 'px';
            
            // Converte a posição X de volta para uma data para persistência
            const dOffset = Math.round((x - NAME_COL_WIDTH) / DIA_PX);
            const newDate = new Date(inicio);
            newDate.setDate(newDate.getDate() + dOffset);
            ganttCursorDate = newDate;
            cursor.title = `Referência: ${ganttCursorDate.toLocaleDateString('pt-BR')}\n(Arraste para mover)`;
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });

    if (lista.length === 0) {
        container.innerHTML += '<p style="padding:20px;color:#999;text-align:center;">Nenhum funcionário encontrado.</p>';
    }
    } finally {
        hideLoader();
    }
}

// Função para visualizar o histórico de um funcionário específico
function verHistoricoFuncionario(id) {
    const func = funcionarios.find(f => f.id == id);
    if (!func) return;

    const escalasFunc = escalas.filter(e => e.funcionario_id == id)
        .sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));

    let html = `<h3>Histórico de ${func.nome}</h3>`;
    if (escalasFunc.length === 0) {
        html += '<p>Nenhum registro encontrado.</p>';
    } else {
        html += `<table style="width:100%; border-collapse:collapse; margin-top:10px;">
            <thead><tr style="background:#eee;"><th>Período</th><th>Tipo</th><th>Operação</th><th style="text-align:right;">Ações</th></tr></thead>
            <tbody>`;
        escalasFunc.forEach(e => {
            html += `<tr style="border-bottom:1px solid #ddd;">
                <td style="padding:5px;">${formatarData(e.data_inicio)} - ${formatarData(e.data_fim)}</td>
                <td><span style="color:${ESTADOS_CORES[e.estado]}">●</span> ${ESTADOS_LABELS[e.estado]}</td>
                <td>${e.operacao || '—'}</td>
                <td style="text-align:right; padding:5px; white-space:nowrap;">
                    <button onclick="editarPeriodoHistorico('${e.id}')" style="background:#0114dc; padding:4px 8px; font-size:10px;">✏️</button>
                    <button onclick="excluirEscalaHistorico('${e.id}', ${id})" style="background:#dc3545; padding:4px 8px; font-size:10px;">🗑️</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }
    
    mostrarAlertaPersonalizado(html);
}

async function excluirEscalaHistorico(escalaId, funcId) {
    if (!await customConfirm('Deseja realmente excluir este período?')) return;
    try {
        const res = await fetch(`/api/escalas/${escalaId}`, { method: 'DELETE' });
        if (res.ok) {
            mostrarAlerta('Período excluído com sucesso!', 'success');
            const historyModal = document.querySelector('.modal.active[style*="z-index: 10001"]');
            if (historyModal) historyModal.remove();
            await carregarDados();
            verHistoricoFuncionario(funcId); // Reabre o histórico atualizado
        }
    } catch (error) {
        mostrarAlerta('Erro ao excluir período', 'danger');
    }
}

function editarPeriodoHistorico(escalaId) {
    const historyModal = document.querySelector('.modal.active[style*="z-index: 10001"]');
    if (historyModal) historyModal.remove();
    editarPeriodo(escalaId);
}

// Funções de exclusão
async function excluirFuncionario(id) {
    if (!await customConfirm('Deseja realmente excluir este funcionário?')) return;
    
    try {
        await fetch(`/api/funcionarios/${id}`, { method: 'DELETE' });
        mostrarAlerta('Funcionário excluído com sucesso!', 'success');
        carregarDados();
    } catch (error) {
        mostrarAlerta('Erro ao excluir funcionário', 'danger');
    }
}

async function excluirEscala(id) {
    if (!await customConfirm('Deseja realmente excluir este período?')) return;
    
    try {
        await fetch(`/api/escalas/${id}`, { method: 'DELETE' });
        mostrarAlerta('Período excluído com sucesso!', 'success');
        carregarDados();
    } catch (error) {
        mostrarAlerta('Erro ao excluir período', 'danger');
    }
}

async function excluirFerias(id) {
    if (!await customConfirm('Deseja realmente excluir estas férias?')) return;
    
    try {
        await fetch(`/api/ferias/${id}`, { method: 'DELETE' });
        mostrarAlerta('Férias excluídas com sucesso!', 'success');
        carregarDados();
    } catch (error) {
        mostrarAlerta('Erro ao excluir férias', 'danger');
    }
}

// Utilitários
function formatarData(dataStr) {
    const data = new Date(dataStr + 'T00:00:00');
    return data.toLocaleDateString('pt-BR');
}

function mostrarAlerta(mensagem, tipo) {
    const alertasAntigos = document.querySelectorAll('.alert-flutuante');
    alertasAntigos.forEach(a => a.remove());
    
    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo} alert-flutuante`;
    alerta.textContent = mensagem;
    alerta.style.position = 'fixed';
    alerta.style.top = '20px';
    alerta.style.right = '20px';
    alerta.style.zIndex = '10000';
    alerta.style.minWidth = '300px';
    alerta.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
    
    document.body.appendChild(alerta);
    
    setTimeout(() => {
        alerta.remove();
    }, 5000);
}

function mostrarAlertaPersonalizado(html) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '10001';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            ${html}
            <div class="btn-group" style="margin-top:20px;">
                <button onclick="this.closest('.modal').remove()" style="width:100%;">Fechar</button>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

/**
 * Diálogos personalizados para substituir alert, confirm e prompt nativos.
 */
function customAlert(mensagem) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; text-align:center;">
                <h3 style="color: #0114dc; margin-bottom: 15px;">Aviso</h3>
                <p style="margin: 20px 0; font-size: 13px; color: #333;">${mensagem}</p>
                <button style="width:100%;">OK</button>
            </div>
        `;
        modal.querySelector('button').onclick = () => {
            modal.remove();
            resolve();
        };
        document.body.appendChild(modal);
    });
}

function customConfirm(mensagem) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; text-align:center;">
                <h3 style="color: #0114dc; margin-bottom: 15px;">Confirmação</h3>
                <p style="margin: 20px 0; font-size: 13px; color: #333;">${mensagem}</p>
                <div class="btn-group" style="display: flex; gap: 10px;">
                    <button class="secondary" id="confirm-cancel" style="flex:1; margin-top:0;">Cancelar</button>
                    <button id="confirm-ok" style="flex:1; margin-top:0;">Confirmar</button>
                </div>
            </div>
        `;
        const cleanup = (val) => {
            modal.remove();
            resolve(val);
        };
        modal.querySelector('#confirm-ok').onclick = () => cleanup(true);
        modal.querySelector('#confirm-cancel').onclick = () => cleanup(false);
        document.body.appendChild(modal);
    });
}

function customPrompt(mensagem, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px;">
                <h3 style="color: #0114dc; margin-bottom: 15px;">Entrada de Dados</h3>
                <p style="margin: 15px 0 5px; font-size: 12px; color: #666;">${mensagem}</p>
                <input type="text" id="prompt-input" value="${defaultValue}" style="margin-bottom: 20px; padding: 10px; font-size: 14px;">
                <div class="btn-group" style="display: flex; gap: 10px;">
                    <button class="secondary" id="prompt-cancel" style="flex:1; margin-top:0;">Cancelar</button>
                    <button id="prompt-ok" style="flex:1; margin-top:0;">OK</button>
                </div>
            </div>
        `;
        const input = modal.querySelector('#prompt-input');
        const cleanup = (val) => {
            modal.remove();
            resolve(val);
        };
        modal.querySelector('#prompt-ok').onclick = () => cleanup(input.value);
        modal.querySelector('#prompt-cancel').onclick = () => cleanup(null);
        document.body.appendChild(modal);
        input.focus();
        input.select();
    });
}


// Variável global de unidades (preenchida por unidades.js)
let unidades = [];

// ============================================
// GERENCIAMENTO DE SONDAS
// ============================================

let sondas = [];

// Carrega sondas do servidor
async function carregarSondas() {
    showLoader();
    try {
        const response = await fetch('/api/sondas');
        sondas = await response.json();
        
        atualizarSondasContainer();
        atualizarAlerta14Dias(); // Atualiza alerta de 14+ dias
    } catch (error) {
        console.error('Erro ao carregar sondas:', error);
    } finally {
        hideLoader();
    }
}

// Atualiza container de sondas no dashboard
function atualizarSondasContainer() {
    const container = document.getElementById('sondas-container');
    if (!container) return;

    if (sondas.length === 0) {
        container.innerHTML = `
            <div class="empty-sondas">
                <h3>Nenhuma operação ativa cadastrada</h3>
                <p>Cadastre uma Unidade Marítima com status "Ativo" para exibi-la aqui automaticamente.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    // Cores por tipo de operação
    const tipoColor = { ITH: '#0114dc', LWO: '#28a745', IBAP: '#fd7e14', IANM: '#9333ea' };

    sondas.forEach(sonda => {
        const card = document.createElement('div');
        card.className = 'sonda-card';

        const tipoBg    = tipoColor[sonda.tipo_operacao] || '#555';
        const tipoBadge = sonda.tipo_operacao
            ? `<span style="background:${tipoBg};color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:6px;">${sonda.tipo_operacao}</span>`
            : '';
        const contratoBadge = sonda.contrato
            ? `<span style="background:#e3f2fd;color:#0114dc;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${sonda.contrato}</span>`
            : '';

        // Botões: editar sonda se já registrada, ou "Registrar Sonda" se não
        const botoesHtml = sonda.sonda_registrada
            ? `<button onclick="finalizarOperacao(${sonda.unidade_id}, '${sonda.nome_poco}')" style="background:#6c757d; margin-right:5px;" title="Finalizar Operação">Finalizar</button>
               <button onclick="abrirEditarSonda('${sonda.sonda_id}')" style="margin-right:5px;">✏️ Editar</button>
               <button class="danger" onclick="excluirSonda('${sonda.sonda_id}')">Excluir</button>`
            : `<button onclick="finalizarOperacao(${sonda.unidade_id}, '${sonda.nome_poco}')" style="background:#6c757d; margin-right:5px;" title="Finalizar Operação">Finalizar</button>
               <button onclick="registrarSondaParaUnidade('${sonda.nome_poco}')" style="background:#28a745;">Registrar Sonda</button>`;

        let pessoasHtml = '';
        if (sonda.pessoas_embarcadas.length === 0) {
            pessoasHtml = '<p style="color:#999;text-align:center;padding:10px;font-size:11px;">Nenhuma pessoa embarcada no momento</p>';
        } else {
            const pessoasAcima14 = sonda.pessoas_embarcadas.filter(p => p.dias_bordo > 14);
            const alertaHtml = pessoasAcima14.length > 0
                ? `<div style="background:#fff5f5;border:1px solid #feb2b2;padding:8px;margin-bottom:10px;border-radius:6px;display:flex;align-items:center;gap:8px;">
                       <span style="color:#e53e3e;font-size:16px;">🚨</span>
                       <span style="color:#c53030;font-size:11px;font-weight:600;">${pessoasAcima14.length} SUBSTITUIÇÃO(ÕES) PENDENTE(S)</span>
                   </div>`
                : '';

            pessoasHtml = alertaHtml + `
                <table class="pessoas-table">
                    <thead><tr><th>Colaborador</th><th>Embarque</th><th style="text-align:center;">Status</th><th style="text-align:right;">Permanência</th></tr></thead>
                    <tbody>
                        ${sonda.pessoas_embarcadas.map(p => {
                            let badgeClass = 'badge-dias';
                            let rowClass   = '';
                            const isDobra = p.dias_bordo > 14;
                            if (isDobra) { badgeClass += ' critico-roxo'; rowClass = 'row-alerta-roxo'; }
                            else if (p.dias_bordo > 10) { badgeClass += ' alerta'; }
                            return `<tr class="${rowClass}" 
                                        onclick="abrirAcoesFuncionario(${p.funcionario_id}, '${p.nome}', ${p.dias_bordo}, '${sonda.nome_poco}')" 
                                        style="cursor:pointer;" 
                                        title="Clique para ações de desembarque ou dobra">
                                <td>
                                    <div style="font-weight:600;color:#333;">${p.nome}</div>
                                    <div style="font-size:9px;color:#888;">GIN: ${p.gin}</div>
                                </td>
                                <td style="font-size:11px;">${formatarData(p.data_embarque)}</td>
                                <td style="text-align:center;">
                                    <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${p.status_hoje === 'Desembarcando' ? '#f6ad55' : '#ebf8ff'};color:${p.status_hoje === 'Desembarcando' ? '#7b341e' : '#2b6cb0'};font-weight:700;">
                                        ${p.status_hoje.toUpperCase()}
                                    </span>
                                </td>
                                <td style="text-align:right;"><span class="${badgeClass}" style="font-size:10px;padding:2px 8px;">${p.dias_bordo}d</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
        }

        card.innerHTML = `
            <div class="sonda-header">
                <div>
                    <div style="margin-bottom:4px;">${tipoBadge}${contratoBadge}</div>
                    <h3 style="margin:0; font-size: 16px;">📍 ${sonda.nome_poco}</h3>
                    ${sonda.tag ? `<span style="font-size:11px;color:#888;">TAG: ${sonda.tag}</span>` : ''}
                </div>
                <div>${botoesHtml}</div>
            </div>
            <div class="sonda-info">
                <div class="sonda-info-item">
                    <label>Sonda / Drillship:</label>
                    <strong>${sonda.localizacao || '—'}</strong>
                </div>
                <div class="sonda-info-item">
                    <label>Início Operação:</label>
                    <strong>${sonda.data_inicio ? formatarData(sonda.data_inicio) : '—'}</strong>
                </div>
                <div class="sonda-info-item">
                    <label>Pessoas Embarcadas:</label>
                    <strong style="color:#0114dc;font-size:20px;">${sonda.total_pessoas}</strong>
                </div>
            </div>
            ${pessoasHtml}
        `;

        container.appendChild(card);
    });
}

// Abre o modal de ações rápidas para quem está embarcado
function abrirAcoesFuncionario(id, nome, dias, unidade) {
    document.getElementById('acoes-func-nome').textContent = nome;
    document.getElementById('acoes-func-dias').textContent = dias;
    document.getElementById('acoes-func-unidade').textContent = unidade;
    
    // Define a data de desembarque padrão como hoje
    document.getElementById('acoes-func-data-desembarque').valueAsDate = new Date();

    // Armazena dados no modal
    const modal = document.getElementById('modal-acoes-embarcado');
    modal.dataset.funcionarioId = id;
    modal.dataset.unidade = unidade;
    
    modal.classList.add('active');
}

function fecharModalAcoes() {
    document.getElementById('modal-acoes-embarcado').classList.remove('active');
}

async function confirmarDesembarque() {
    const modal = document.getElementById('modal-acoes-embarcado');
    const dataDesemb = document.getElementById('acoes-func-data-desembarque').value;

    if (!dataDesemb) {
        mostrarAlerta('Por favor, selecione uma data de desembarque.', 'warning');
        return;
    }

    if(!await customConfirm(`Confirmar desembarque de ${document.getElementById('acoes-func-nome').textContent} na data ${formatarData(dataDesemb)}?`)) return;

    const res = await fetch('/api/registrar-desembarque', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            funcionario_id: modal.dataset.funcionarioId,
            unidade: modal.dataset.unidade,
            data_desembarque: dataDesemb
        })
    });
    if(res.ok) {
        mostrarAlerta('Desembarque registrado. Folgas geradas!', 'success');
        fecharModalAcoes();
        carregarDados();
        carregarSondas();
    }
}

/**
 * Altera o status da unidade para 'inativo', finalizando a operação no dashboard.
 */
async function finalizarOperacao(unidadeId, nomePoco) {
    if (!await customConfirm(`Deseja realmente finalizar essa operação e retirar essa sonda do dashboard?`)) return;

    showLoader();
    try {
        const response = await fetch(`/api/unidades-completas/${unidadeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'inativo' })
        });

        if (response.ok) {
            mostrarAlerta(`Operação em ${nomePoco} finalizada com sucesso!`, 'success');
            await carregarSondas();
            if (typeof carregarUnidades === 'function') carregarUnidades();
        } else {
            const result = await response.json();
            mostrarAlerta(result.error || 'Erro ao finalizar operação', 'danger');
        }
    } catch (error) {
        mostrarAlerta('Erro na comunicação com o servidor', 'danger');
    } finally {
        hideLoader();
    }
}

async function registrarDobraRapida() {
    const dias = await customPrompt("Quantos dias de dobra deseja adicionar?");
    if (!dias || isNaN(dias)) return;
    
    const modal = document.getElementById('modal-acoes-embarcado');
    // Aqui poderíamos calcular as datas automaticamente baseadas no desembarque previsto
    // Para simplificar, vamos redirecionar para a aba de escalas ou abrir o form de dobra
    fecharModalAcoes();
    showTab('dashboard'); // ou abrir um form específico
    // Como o usuário quer algo rápido:
    mostrarAlerta('Funcionalidade de dobra rápida acionada. Use o formulário de escalas para definir o período exato.', 'info');
    document.getElementById('escala-funcionario').value = modal.dataset.funcionarioId;
    document.getElementById('escala-estado').value = 'dobra';
    document.getElementById('escala-operacao').value = modal.dataset.unidade;
    document.getElementById('escala-group').scrollIntoView();
}

// Abre o modal de nova sonda pré-preenchido com a unidade
function registrarSondaParaUnidade(poco) {
    showModalSonda().then(() => {
        const sel = document.getElementById('sonda-unidade');
        if (sel) {
            for (const opt of sel.options) {
                if (opt.value === poco) { opt.selected = true; break; }
            }
        }
        const poco_input = document.getElementById('sonda-poco');
        if (poco_input && !poco_input.value) poco_input.value = poco;
    }).catch(() => {});
}

// Modal de sonda - NOVA
async function showModalSonda() {
    const modal = document.getElementById('sonda-modal');
    
    // Remove ID de edição (modo criação)
    delete modal.dataset.editandoId;
    
    // Reseta título e botão para modo criação
    const titulo = modal.querySelector('h2');
    titulo.textContent = '🛢️ Nova Sonda/Poço';
    
    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.textContent = 'Cadastrar Sonda';
    
    // Preenche select de unidades (unidades é array de objetos com .poco)
    const select = document.getElementById('sonda-unidade');
    select.innerHTML = '<option value="">Selecione...</option>';
    unidades.forEach(unidade => {
        const option = document.createElement('option');
        const poco = typeof unidade === 'string' ? unidade : unidade.poco;
        option.value = poco;
        option.textContent = poco;
        select.appendChild(option);
    });
    
    // Preenche select de equipes
    try {
        const response = await fetch('/api/equipes');
        const equipesData = await response.json();
        
        const selectEquipe = document.getElementById('sonda-equipe');
        selectEquipe.innerHTML = '<option value="">Nenhuma equipe (adicionar depois)</option>';
        
        equipesData.forEach(equipe => {
            const option = document.createElement('option');
            option.value = equipe.id;
            option.textContent = `${equipe.nome} (${equipe.total_membros} pessoas)`;
            option.dataset.membros = JSON.stringify(equipe.membros_info);
            selectEquipe.appendChild(option);
        });
        
        // Listener para mostrar preview da equipe
        selectEquipe.addEventListener('change', function() {
            const preview = document.getElementById('preview-equipe');
            const membrosPreview = document.getElementById('membros-preview');
            
            if (this.value) {
                const selectedOption = this.options[this.selectedIndex];
                const membros = JSON.parse(selectedOption.dataset.membros || '[]');
                
                membrosPreview.innerHTML = membros.map(m => 
                    `<span style="display: inline-block; background: #e3f2fd; padding: 3px 8px; margin: 3px; border-radius: 12px; font-size: 11px;">
                        ${m.gin} - ${m.nome}
                    </span>`
                ).join('');
                
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        });
    } catch (error) {
        console.error('Erro ao carregar equipes:', error);
    }
    
    modal.classList.add('active');
}

function closeModalSonda() {
    const modal = document.getElementById('sonda-modal');
    modal.classList.remove('active');
    document.getElementById('form-sonda').reset();
}

// Formulário de sonda - já implementado na função abrirEditarSonda acima

// Carrega sondas ao iniciar
document.addEventListener('DOMContentLoaded', () => {
    carregarSondas();
});

// Excluir sonda
async function excluirSonda(id) {
    if (!confirm('Deseja realmente excluir esta sonda?')) return;
    
    try {
        const response = await fetch(`/api/sondas/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            mostrarAlerta('Sonda excluída com sucesso!', 'success');
            carregarSondas();
        }
    } catch (error) {
        mostrarAlerta('Erro ao excluir sonda', 'danger');
    }
}

// ============================================
// EDITAR FUNCIONÁRIO
// ============================================

// Abre modal de edição
async function abrirEditarFuncionario(funcId) {
    // Busca primeiro no array local, se vazio vai direto à API
    let func = funcionarios.find(f => f.id == funcId);
    if (!func) {
        try {
            const r = await fetch(`/api/funcionarios/${funcId}`);
            func = await r.json();
        } catch(e) {}
    }
    if (!func || func.error) {
        mostrarAlerta('Funcionário não encontrado', 'danger');
        return;
    }

    document.getElementById('edit-func-id').value = func.id;
    document.getElementById('edit-func-gin').value = func.gin || '';
    document.getElementById('edit-func-nome').value = func.nome || '';
    document.getElementById('edit-func-grade').value = func.grade || '';
    document.getElementById('edit-func-leader').checked = !!func.leader;

    document.getElementById('editar-funcionario-modal').classList.add('active');
}

// Fecha modal de edição
function closeEditarFuncionarioModal() {
    document.getElementById('editar-funcionario-modal').classList.remove('active');
    document.getElementById('form-editar-funcionario').reset();
}

// Submete edição
document.addEventListener('DOMContentLoaded', () => {
    const formEditar = document.getElementById('form-editar-funcionario');
    if (formEditar) {
        formEditar.addEventListener('submit', async (e) => {
            e.preventDefault();
            const funcId = document.getElementById('edit-func-id').value;
            const data = {
                gin:    document.getElementById('edit-func-gin').value.trim(),
                nome:   document.getElementById('edit-func-nome').value.trim(),
                grade:  document.getElementById('edit-func-grade').value.trim(),
                leader: document.getElementById('edit-func-leader').checked
            };
            try {
                const response = await fetch(`/api/funcionarios/${funcId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    const updated = await response.json();
                    // Atualiza array local sem recarregar a página
                    const idx = funcionarios.findIndex(f => f.id == funcId);
                    if (idx >= 0) funcionarios[idx] = updated;
                    else funcionarios.push(updated);
                    atualizarTabelaFuncionarios();
                    atualizarSelects();
                    closeEditarFuncionarioModal();
                    mostrarAlerta('Funcionário atualizado com sucesso!', 'success');
                } else {
                    const result = await response.json();
                    mostrarAlerta(result.error || 'Erro ao atualizar funcionário', 'danger');
                }
            } catch (error) {
                mostrarAlerta('Erro ao atualizar funcionário', 'danger');
            }
        });
    }
});

// ============================================
// MODAL NOVO FUNCIONÁRIO
// ============================================

function abrirModalNovoFuncionario() {
    document.getElementById('novo-funcionario-modal').classList.add('active');
}

function fecharModalNovoFuncionario() {
    const modal = document.getElementById('novo-funcionario-modal');
    modal.classList.remove('active');
    document.getElementById('form-novo-funcionario').reset();
}

// Formulário de novo funcionário
document.addEventListener('DOMContentLoaded', () => {
    const formNovoFunc = document.getElementById('form-novo-funcionario');

    if (formNovoFunc) {
        formNovoFunc.addEventListener('submit', async (e) => {
            e.preventDefault();

            const data = {
                gin:    document.getElementById('novo-func-gin').value.trim(),
                nome:   document.getElementById('novo-func-nome').value.trim(),
                grade:  document.getElementById('novo-func-grade').value.trim(),
                leader: document.getElementById('novo-func-leader').checked
            };
            
            try {
                const response = await fetch('/api/funcionarios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    const novo = await response.json();
                    funcionarios.push(novo);
                    atualizarTabelaFuncionarios();
                    atualizarSelects();
                    fecharModalNovoFuncionario();
                    mostrarAlerta('Funcionário cadastrado com sucesso!', 'success');
                } else {
                    const result = await response.json();
                    mostrarAlerta(result.error || 'Erro ao cadastrar funcionário', 'danger');
                }
            } catch (error) {
                mostrarAlerta('Erro ao cadastrar funcionário: ' + error.message, 'danger');
            }
        });
    } else {
        console.error('❌ Form novo funcionário NÃO encontrado!');
    }
});

// ============================================
// EDITAR SONDA
// ============================================

async function abrirEditarSonda(sondaId) {
    const sonda = sondas.find(s => s.id === sondaId);
    
    if (!sonda) {
        mostrarAlerta('Sonda não encontrada', 'danger');
        return;
    }
    
    const modal = document.getElementById('sonda-modal');
    
    // Preenche select de unidades
    const selectUnidade = document.getElementById('sonda-unidade');
    selectUnidade.innerHTML = '<option value="">Selecione...</option>';
    
    try {
        const response = await fetch('/api/unidades');
        const unidadesLista = await response.json();
        unidadesLista.forEach(unidade => {
            const option = document.createElement('option');
            option.value = unidade;
            option.textContent = unidade;
            if (unidade === sonda.unidade_maritima) {
                option.selected = true;
            }
            selectUnidade.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar unidades:', error);
    }
    
    // Preenche select de equipes
    const selectEquipe = document.getElementById('sonda-equipe');
    selectEquipe.innerHTML = '<option value="">Nenhuma</option>';
    
    try {
        const response = await fetch('/api/equipes');
        const equipesLista = await response.json();
        equipesLista.forEach(equipe => {
            const option = document.createElement('option');
            option.value = equipe.id;
            option.textContent = `${equipe.nome} (${equipe.total_membros} pessoas)`;
            option.dataset.membros = JSON.stringify(equipe.membros_info);
            selectEquipe.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar equipes:', error);
    }
    
    // Preenche campos
    document.getElementById('sonda-poco').value = sonda.nome_poco;
    document.getElementById('sonda-localizacao').value = sonda.localizacao || '';
    document.getElementById('sonda-inicio').value = sonda.data_inicio || '';
    
    // Armazena ID para edição
    modal.dataset.editandoId = sondaId;
    
    // Muda título e botão do modal
    const titulo = modal.querySelector('h2');
    titulo.textContent = '✏️ Editar Sonda';
    
    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.textContent = 'Salvar Alterações';
    
    modal.classList.add('active');
}

// Atualiza submit do form de sonda para suportar edição
document.addEventListener('DOMContentLoaded', () => {
    const formSonda = document.getElementById('form-sonda');
    if (formSonda) {
        formSonda.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const modal = document.getElementById('sonda-modal');
            const editandoId = modal.dataset.editandoId;
            
            const data = {
                nome_poco: document.getElementById('sonda-poco').value,
                unidade_maritima: document.getElementById('sonda-unidade').value,
                localizacao: document.getElementById('sonda-localizacao').value,
                data_inicio: document.getElementById('sonda-inicio').value,
                equipe_id: document.getElementById('sonda-equipe').value
            };
            
            try {
                let response;
                if (editandoId) {
                    // Editando
                    response = await fetch(`/api/sondas/${editandoId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                } else {
                    // Criando nova
                    response = await fetch('/api/sondas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                }
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (editandoId) {
                        mostrarAlerta('Sonda atualizada com sucesso!', 'success');
                    } else if (result.escalas_criadas) {
                        mostrarAlerta(`Sonda criada e ${result.escalas_criadas} escalas de embarque geradas automaticamente!`, 'success');
                    } else {
                        mostrarAlerta('Sonda criada com sucesso!', 'success');
                    }
                    
                    closeModalSonda();
                    carregarSondas();
                } else {
                    mostrarAlerta('Erro ao salvar sonda', 'danger');
                }
            } catch (error) {
                mostrarAlerta('Erro ao salvar sonda', 'danger');
            }
        });
    }
});

// Atualiza closeModalSonda para resetar estado de edição
function closeModalSonda() {
    const modal = document.getElementById('sonda-modal');
    modal.classList.remove('active');
    document.getElementById('form-sonda').reset();
    document.getElementById('preview-equipe').innerHTML = '';
    
    // Reseta estado de edição
    delete modal.dataset.editandoId;
    
    // Reseta título e botão
    const titulo = modal.querySelector('h2');
    titulo.textContent = '🛢️ Nova Sonda/Poço';
    
    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.textContent = 'Cadastrar Sonda';
}

// ============================================
// ALERTA DE FUNCIONÁRIOS ACIMA DE 14 DIAS
// ============================================

function atualizarAlerta14Dias() {
    const alertaContainer = document.getElementById('alerta-14-dias');
    const listaAlertas = document.getElementById('lista-alertas-14-dias');
    
    if (!alertaContainer || !listaAlertas) return;

    const pessoasAcima14 = [];

    sondas.forEach(sonda => {
        sonda.pessoas_embarcadas.forEach(pessoa => {
            if (pessoa.dias_bordo > 14) {
                pessoasAcima14.push({
                    ...pessoa,
                    sonda: sonda.nome_poco,
                    unidade: sonda.unidade_maritima
                });
            }
            });
    });

    // Mostra/esconde alerta
    if (pessoasAcima14.length === 0) {
        alertaContainer.style.display = 'none';
        return;
    }
    
    alertaContainer.style.display = 'block';
    
    // Ordena por dias (maior primeiro)
    pessoasAcima14.sort((a, b) => b.dias_bordo - a.dias_bordo);
    
    // Renderiza lista
    listaAlertas.innerHTML = `
        <div style="background: white; padding: 15px; border-radius: 8px;">
            <p style="color: #7e22ce; font-weight: bold; margin-bottom: 15px;">
                ${pessoasAcima14.length} funcionário(s) necessita(m) substituição urgente:
            </p>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #e9d5ff; text-align: left;">
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea;">GIN</th>
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea;">Nome</th>
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea;">Sonda/Poço</th>
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea;">Unidade</th>
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea;">Data Embarque</th>
                        <th style="padding: 8px; border-bottom: 2px solid #9333ea; text-align: center;">Dias a Bordo</th>
                    </tr>
                </thead>
                <tbody>
                    ${pessoasAcima14.map(pessoa => `
                        <tr style="border-bottom: 1px solid #e9d5ff;">
                            <td style="padding: 10px;">${pessoa.gin}</td>
                            <td style="padding: 10px;"><strong>${pessoa.nome}</strong></td>
                            <td style="padding: 10px;">${pessoa.sonda}</td>
                            <td style="padding: 10px;">${pessoa.unidade}</td>
                            <td style="padding: 10px;">${formatarData(pessoa.data_embarque)}</td>
                            <td style="padding: 10px; text-align: center;">
                                <span style="background: #9333ea; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">
                                    ${pessoa.dias_bordo} dias
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
// ============================================
// EDITAR PERÍODO
// ============================================

async function editarPeriodo(id) {
    const escala = escalas.find(e => e.id === id);
    
    if (!escala) {
        await customAlert('Período não encontrado');
        return;
    }
    
    const funcionario = funcionarios.find(f => f.id == escala.funcionario_id);
    
    // Preenche formulário
    document.getElementById('editar-periodo-id').value = escala.id;
    document.getElementById('editar-periodo-funcionario').value = funcionario ? funcionario.nome : 'N/A';
    document.getElementById('editar-periodo-estado').value = escala.estado;
    document.getElementById('editar-periodo-operacao').value = escala.operacao || '';
    document.getElementById('editar-periodo-inicio').value = escala.data_inicio;
    document.getElementById('editar-periodo-fim').value = escala.data_fim;
    document.getElementById('editar-periodo-observacoes').value = escala.observacoes || '';
    
    // Preenche select de unidades com os poços cadastrados
    const selectOp = document.getElementById('editar-periodo-operacao');
    if (selectOp) {
        // Já deve estar preenchido pelo atualizarSelects(), apenas define o valor
        selectOp.value = escala.operacao || '';
    }
    
    // Abre modal
    document.getElementById('modal-editar-periodo').classList.add('active');
}

function fecharModalEditarPeriodo() {
    document.getElementById('modal-editar-periodo').classList.remove('active');
    document.getElementById('form-editar-periodo').reset();
}

// Event listener para salvar edição
document.addEventListener('DOMContentLoaded', () => {
    const formEditar = document.getElementById('form-editar-periodo');
    
    if (formEditar) {
        formEditar.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('editar-periodo-id').value;
            const dados = {
                estado: document.getElementById('editar-periodo-estado').value,
                operacao: document.getElementById('editar-periodo-operacao').value,
                data_inicio: document.getElementById('editar-periodo-inicio').value,
                data_fim: document.getElementById('editar-periodo-fim').value,
                observacoes: document.getElementById('editar-periodo-observacoes').value
            };
            
            try {
                const response = await fetch(`/api/escalas/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                
                if (response.ok) {
                    await customAlert('Período atualizado com sucesso!');
                    fecharModalEditarPeriodo();
                    await carregarDados();
                } else {
                    await customAlert('Erro ao atualizar período');
                }
            } catch (error) {
                await customAlert('Erro ao atualizar período');
                console.error(error);
            }
        });
    }
});