// ==========================================
// UNIDADES MARÍTIMAS
// ==========================================

async function carregarUnidades() {
    showLoader();
    try {
        const r = await fetch('/api/unidades-completas');
        if (r.ok) {
            unidades = await r.json();
            atualizarListaUnidades();
        }
    } catch (e) {
        console.error('Erro ao carregar unidades:', e);
    } finally {
        hideLoader();
    }
}

function atualizarListaUnidades() {
    const container = document.getElementById('unidades-container');
    if (!container) return;

    if (!unidades || unidades.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:#666;grid-column:1/-1;">
                <p style="font-size:18px;margin-bottom:10px;">🚢 Nenhuma unidade marítima cadastrada</p>
                <p>Clique em "➕ Nova Unidade" para adicionar.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    unidades.forEach(u => {
        const card = document.createElement('div');
        card.className = 'unidade-card';

        const tipoColor = { ITH: '#0114dc', LWO: '#28a745', IBAP: '#fd7e14', IANM: '#9333ea', BASE: '#e9700d' };
        const tipoBg    = tipoColor[u.tipo_operacao] || '#666';
        const labelTipo = u.tipo_operacao === 'BASE' && u.base_local ? `BASE: ${u.base_local}` : (u.tipo_operacao || '');

        const campo = (icone, label, valor) => `
            <div class="unidade-info-item">
                <label>${icone} ${label}</label>
                <strong>${valor || '—'}</strong>
            </div>`;

        const isBase = u.tipo_operacao === 'BASE';
        const tituloPoco = isBase ? u.base_local : u.poco;

        card.innerHTML = `
            <div class="unidade-header">
                <div class="unidade-titulo">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        ${u.tipo_operacao ? `<span style="background:${tipoBg};color:white;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">${labelTipo}</span>` : ''}
                        ${!isBase && u.contrato ? `<span style="background:#e3f2fd;color:#0114dc;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${u.contrato}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items: baseline; gap: 10px;">
                        <h3 class="unidade-codigo" style="margin-bottom:0;">${tituloPoco || '—'}</h3>
                        ${!isBase ? `<span style="color:#666;font-size:12px;">TAG: <strong>${u.tag || '—'}</strong></span>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button onclick="editarUnidade(${u.id})" style="padding:6px 12px;font-size:12px;">✏️ Editar</button>
                    <button onclick="excluirUnidade(${u.id})" class="danger" style="padding:6px 12px;font-size:12px;">🗑️</button>
                </div>
            </div>
            <div class="unidade-info-grid">
                ${!isBase ? campo('🛢️', 'Sonda', u.sonda_nome) : ''}
                ${campo('📅', 'Data Início', u.inicio_operacao ? formatarData(u.inicio_operacao) : '')}
                ${campo('📅', 'Data Fim',    u.final_operacao ? formatarData(u.final_operacao) : '')}
            </div>
            <div class="unidade-highlight" style="margin-top: 10px; min-height: 50px;">
                <label style="color:#999;font-size:10px;text-transform:uppercase;margin-bottom:5px;display:block;">📝 Descrição</label>
                <p style="margin:0;color:#333;font-size:12px;line-height:1.4;">${u.observacoes || '—'}</p>
                ${u.servico_externo ? `<p style="margin-top:5px; font-size:11px; color:#0114dc;"><strong>📍 Local Externo:</strong> ${u.local_externo || '—'}</p>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function toggleCamposUnidade() {
    const tipo = document.getElementById('unidade-tipo-operacao').value;
    const isBase = tipo === 'BASE';

    const groupNormal = document.getElementById('group-operacao-normal');
    const groupBase = document.getElementById('group-operacao-base');
    
    const inputBase = document.getElementById('unidade-base-local');
    const inputPoco = document.getElementById('unidade-poco');
    
    groupNormal.style.display = isBase ? 'none' : 'block';
    groupBase.style.display = isBase ? 'block' : 'none';

    if (inputPoco) inputPoco.required = !isBase;
    if (inputBase) inputBase.required = isBase;

    const isExterno = document.getElementById('unidade-servico-externo').checked;
    const groupExterno = document.getElementById('group-local-externo');
    const inputExterno = document.getElementById('unidade-local-externo');
    
    // O grupo de serviço externo só é visível se for BASE
    if (isBase) {
        groupExterno.style.display = isExterno ? 'block' : 'none';
        if (inputExterno) inputExterno.required = isExterno;
    } else {
        // Garante que se não for base, o campo de serviço externo esteja oculto
        groupExterno.style.display = 'none';
        if (inputExterno) inputExterno.required = false;
    }
}

function abrirModalNovaUnidade() {
    const modal = document.getElementById('modal-unidade');
    if (!modal) return;
    document.getElementById('form-unidade').reset();
    document.getElementById('unidade-id').value = '';
    toggleCamposUnidade();
    const titulo = document.getElementById('titulo-modal-unidade');
    if (titulo) titulo.textContent = '➕ Nova Unidade Marítima';
    modal.classList.add('active');
}

function fecharModalUnidade() {
    const modal = document.getElementById('modal-unidade');
    if (modal) modal.classList.remove('active');
}

async function editarUnidade(id) {
    // Busca no array local ou vai direto à API
    let u = unidades.find(x => x.id == id);
    if (!u) {
        try {
            const r = await fetch('/api/unidades-completas');
            const lista = await r.json();
            u = lista.find(x => x.id == id);
            if (lista.length) unidades = lista; // atualiza cache
        } catch(e) {}
    }
    if (!u) { alert('Unidade não encontrada'); return; }

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    set('unidade-id',             u.id);
    set('unidade-tipo-operacao',  u.tipo_operacao);
    set('unidade-poco',           u.poco);
    set('unidade-sonda',          u.sonda_nome);
    set('unidade-contrato',       u.contrato);
    set('unidade-tag',            u.tag);
    set('unidade-inicio-op',      u.inicio_operacao);
    set('unidade-final-op',       u.final_operacao);
    set('unidade-observacoes',    u.observacoes);
    set('unidade-base-local',     u.base_local);
    set('unidade-local-externo',  u.local_externo);
    
    const checkExterno = document.getElementById('unidade-servico-externo');
    if (checkExterno) checkExterno.checked = !!u.servico_externo;

    toggleCamposUnidade();
    const titulo = document.getElementById('titulo-modal-unidade');
    if (titulo) titulo.textContent = '✏️ Editar Unidade Marítima';
    document.getElementById('modal-unidade').classList.add('active');
}

async function excluirUnidade(id) {
    if (!confirm('Excluir esta unidade marítima?')) return;
    try {
        const r = await fetch(`/api/unidades-completas/${id}`, { method: 'DELETE' });
        if (r.ok) {
            unidades = unidades.filter(x => x.id != id);
            atualizarListaUnidades();
        } else { alert('Erro ao excluir unidade'); }
    } catch (e) { alert('Erro ao excluir unidade'); }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-unidade');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id  = document.getElementById('unidade-id').value;
            const get = elId => { const el = document.getElementById(elId); return el ? el.value : ''; };

            const dados = {
                tipo_operacao:   get('unidade-tipo-operacao'),
                poco:            get('unidade-poco'),
                sonda_nome:      get('unidade-sonda'),
                contrato:        get('unidade-contrato'),
                tag:             get('unidade-tag'),
                inicio_operacao: get('unidade-inicio-op'),
                final_operacao:  get('unidade-final-op'),
                observacoes:     get('unidade-observacoes'),
                base_local:      get('unidade-base-local'),
                // Só envia 'servico_externo' se o tipo for BASE
                servico_externo: (get('unidade-tipo-operacao') === 'BASE') 
                                 ? document.getElementById('unidade-servico-externo').checked 
                                 : false,
                local_externo:   get('unidade-local-externo')
            };

            try {
                const url    = id ? `/api/unidades-completas/${id}` : '/api/unidades-completas';
                const method = id ? 'PUT' : 'POST';
                const r = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                if (r.ok) {
                    const salva = await r.json();
                    if (id) {
                        const idx = unidades.findIndex(x => x.id == id);
                        if (idx >= 0) unidades[idx] = salva; else unidades.push(salva);
                    } else {
                        unidades.push(salva);
                    }
                    atualizarListaUnidades();
                    fecharModalUnidade();
                    alert(id ? 'Unidade atualizada com sucesso!' : 'Unidade cadastrada com sucesso!');
                } else {
                    const err = await r.json();
                    alert('Erro: ' + (err.error || 'Erro desconhecido'));
                }
            } catch (e) {
                alert('Erro ao salvar unidade');
            }
        });
    }

    carregarUnidades();
});
