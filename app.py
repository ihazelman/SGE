"""Módulo principal da aplicação Flask, definindo rotas e lógica de negócios."""
# Standard library imports
import logging
import os
from datetime import datetime, timedelta
from functools import wraps

# Third-party imports
from flask import (Flask, jsonify, redirect, render_template,
                   request, session, url_for)
from sqlalchemy import and_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload

# Local application imports
import config
from models import (Equipe, EquipeMembro, Escala, Funcionario, Sonda,
                    UnidadeMaritima, db, init_db)
from routes_operacionais import operacionais_bp

# Configuração do Flask
app = Flask(__name__)

# Chave secreta fixa — sessões persistem entre restarts do servidor
app.secret_key = 'slb-one-subsea-escala-2025-xk9p'

# Credenciais de acesso (altere conforme necessário)
USUARIOS = {
    'admin': 'slb2025',
    'eng': 'slb2026',
}

# Configuração do banco de dados SQLite
DB_PATH = config.DATABASE_FILE_PATH  # <-- ALTERADO: Usa o caminho do arquivo config.py
app.config['SQLALCHEMY_DATABASE_URI'] = (
    'sqlite:///' + DB_PATH.replace('\\', '/')  # Garante compatibilidade de barras
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Desativa cache de arquivos estáticos

# Inicializa banco
init_db(app)
app.register_blueprint(operacionais_bp)

# Configuração de Log para Diagnóstico
log_file = os.path.join(os.path.dirname(DB_PATH), 'diagnostico.log')
logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filemode='w' # Sobrescreve o log a cada inicialização
)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter('[%(levelname)s] %(message)s')
console_handler.setFormatter(formatter)
logging.getLogger().addHandler(console_handler)

logging.info("=" * 50)
logging.info("  SLB One Subsea - Sistema de Gestao de Escalas - VERSAO: SQLite")
logging.info("=" * 50)
logging.info("Banco de dados configurado para: %s", DB_PATH)

# ==========================================
# AUTENTICAÇÃO
# ==========================================

def login_required(f):
    """Decorator para proteger rotas que exigem login."""
    @wraps(f)
    def decorated(*args, **kwargs):
        """Verifica a sessão do usuário."""
        if not session.get('logado'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Processa o login do usuário."""
    erro = None
    if request.method == 'POST':
        usuario = request.form.get('usuario', '')
        senha = request.form.get('senha', '')
        if USUARIOS.get(usuario) == senha:
            session['logado'] = True
            session['usuario'] = usuario
            return redirect(url_for('index'))
        erro = 'Usuário ou senha incorretos.'
    return render_template('login.html', erro=erro)

@app.route('/logout')
def logout():
    """Limpa a sessão e desloga o usuário."""
    session.clear()
    return redirect(url_for('login'))

# ==========================================
# ROTA: Página Principal
# ==========================================

@app.route('/')
@login_required
def index():
    """Renderiza a página principal da aplicação."""
    # Bloco de Diagnóstico: Verifica a conexão com o banco de dados

    username = session.get('usuario', 'Usuário')
    unids = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
    return render_template(
        'index.html',
        unidades_iniciais=[u.to_dict() for u in unids],
        username=username
    )

# ==========================================
# ROTAS: FUNCIONÁRIOS (SQLite)
# ==========================================

@app.route('/api/funcionarios', methods=['GET'])
def api_funcionarios_get():
    """Retorna uma lista de todos os funcionários."""
    try:
        funcs = Funcionario.query.order_by(Funcionario.nome).all()
        return jsonify([f.to_dict() for f in funcs])
    except SQLAlchemyError as e:
        logging.error("Erro ao listar funcionários: %s", e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/funcionarios', methods=['POST'])
def api_funcionarios_post():
    """Cria um novo funcionário."""
    data = request.json
    if not data or not data.get('gin') or not data.get('nome'):
        return jsonify({'error': 'GIN e Nome são obrigatórios'}), 400
    if Funcionario.query.filter_by(gin=data['gin']).first():
        return jsonify({'error': 'GIN já cadastrado'}), 400
    try:
        f = Funcionario(
            gin=data['gin'].strip(),
            nome=data['nome'].strip(),
            grade=data.get('grade', '').strip(),
            leader=bool(data.get('leader', False))
        )
        db.session.add(f)
        db.session.commit()
        return jsonify(f.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/funcionarios/<int:func_id>', methods=['GET'])
def api_funcionario_get(func_id):
    """Retorna os dados de um funcionário específico."""
    f = db.get_or_404(Funcionario, func_id)
    return jsonify(f.to_dict())

@app.route('/api/funcionarios/<int:func_id>', methods=['PUT'])
def api_funcionario_update(func_id):
    """Atualiza os dados de um funcionário existente."""
    f = db.get_or_404(Funcionario, func_id)
    data = request.json
    if not data:
        return jsonify({'error': 'JSON inválido'}), 400
    try:
        if 'gin' in data:
            existing = Funcionario.query.filter_by(gin=data['gin']).first()
            if existing and existing.id != func_id:
                return jsonify({'error': 'GIN já cadastrado'}), 400
            f.gin = data['gin'].strip()
        if 'nome' in data:
            f.nome = data['nome'].strip()
        if 'grade' in data:
            f.grade = data['grade'].strip()
        if 'leader' in data:
            f.leader = bool(data['leader'])
        db.session.commit()
        return jsonify(f.to_dict())
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/funcionarios/<int:func_id>', methods=['DELETE'])
def api_funcionario_delete(func_id):
    """Deleta um funcionário do banco de dados"""
    funcionario = db.get_or_404(Funcionario, func_id)

    try:
        nome = funcionario.nome

        db.session.delete(funcionario)
        db.session.commit()

        logging.info("Funcionário deletado: %s (ID: %s)", nome, func_id)

        return jsonify({'success': True})

    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error("Erro ao deletar funcionário: %s", e)
        return jsonify({'error': str(e)}), 400

# ==========================================
# ROTAS: ESCALAS (SQLite)
# ==========================================

@app.route('/api/escalas', methods=['GET'])
def api_escalas_get():
    """Lista todas as escalas"""
    lista = Escala.query.options(
        joinedload(Escala.funcionario)
    ).order_by(Escala.data_inicio).all()
    return jsonify([e.to_dict() for e in lista])

@app.route('/api/escalas', methods=['POST'])
def api_escalas_post():
    """Cria nova escala"""
    data = request.json
    if not data:
        return jsonify({'error': 'JSON inválido ou ausente'}), 400

    if not db.session.get(Funcionario, data.get('funcionario_id')):
        return jsonify({'error': 'Funcionário não encontrado'}), 400

    try:
        escala = Escala(
            funcionario_id=data['funcionario_id'],
            estado=data.get('estado'),
            operacao=data.get('operacao', ''),
            data_inicio=data.get('data_inicio'),
            data_fim=data.get('data_fim'),
            observacoes=data.get('observacoes', '')
        )
        db.session.add(escala)
        db.session.commit()
        return jsonify(escala.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/escalas/<escala_id>', methods=['GET', 'PUT', 'DELETE'])
def api_escala_detail(escala_id):
    """Busca, atualiza ou deleta uma escala específica."""
    escala = db.get_or_404(Escala, escala_id)

    if request.method == 'GET':
        escala_data = (Escala.query
                       .options(joinedload(Escala.funcionario))
                       .filter_by(id=escala_id).one())
        return jsonify(escala_data.to_dict())

    if request.method == 'PUT':
        data = request.json
        if not data:
            return jsonify({'error': 'JSON inválido ou ausente'}), 400
        try:
            if 'estado' in data:
                escala.estado = data['estado']
            if 'operacao' in data:
                escala.operacao = data['operacao']
            if 'data_inicio' in data:
                escala.data_inicio = data['data_inicio']
            if 'data_fim' in data:
                escala.data_fim = data['data_fim']
            if 'observacoes' in data:
                escala.observacoes = data['observacoes']
            db.session.commit()
            return jsonify({'success': True})
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400
    if request.method == 'DELETE':
        try:
            db.session.delete(escala)
            db.session.commit()
            return jsonify({'success': True})
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400

@app.route('/api/ferias', methods=['POST'])
def api_ferias_post():
    """Cria uma escala do tipo 'férias'."""
    data = request.json
    if (not data or not data.get('funcionario_id')
            or not data.get('data_inicio') or not data.get('data_fim')):
        return jsonify({'error': 'Dados incompletos para cadastrar férias'}), 400

    if not db.session.get(Funcionario, data.get('funcionario_id')):
        return jsonify({'error': 'Funcionário não encontrado'}), 400

    try:
        escala_ferias = Escala(
            funcionario_id=data['funcionario_id'],
            estado='ferias',  # Estado fixo para férias
            operacao='',      # Férias não têm operação
            data_inicio=data['data_inicio'],
            data_fim=data['data_fim'],
            observacoes='Período de férias'
        )
        db.session.add(escala_ferias)
        db.session.commit()
        return jsonify(escala_ferias.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/registrar-desembarque', methods=['POST'])
def registrar_desembarque():
    """
    Registra o desembarque. Se for após o 14º dia, ajusta o embarque
    para 14 dias e cria uma 'dobra' para o excedente.
    """
    data = request.json
    func_id = data.get('funcionario_id')
    unidade = data.get('unidade')

    # Usa a data enviada pelo usuário ou o dia atual como fallback
    data_escolhida_str = data.get('data_desembarque')
    if data_escolhida_str:
        hoje = datetime.strptime(data_escolhida_str, '%Y-%m-%d')
        hoje_str = data_escolhida_str
    else:
        hoje = datetime.now()
        hoje_str = hoje.strftime('%Y-%m-%d')

    # Busca o embarque ativo
    escala = Escala.query.filter_by(
        funcionario_id=func_id, estado='embarque', operacao=unidade
    ).filter(
        Escala.data_inicio <= hoje_str, Escala.data_fim >= hoje_str
    ).first()

    if not escala:
        return jsonify(
            {'error': 'Embarque ativo não encontrado para este funcionário nesta unidade.'}
        ), 404

    try:
        dt_inicio = datetime.strptime(escala.data_inicio, '%Y-%m-%d')
        dt_limite_normal = dt_inicio + timedelta(days=13) # Fim do 14º dia

        if hoje.date() > dt_limite_normal.date():
            # Caso de DOBRA: O embarque original termina no 14º dia
            escala.data_fim = dt_limite_normal.strftime('%Y-%m-%d')

            # Calcula o total de dias embarcados (stint original + dobra) para a folga proporcional
            dias_totais = (hoje.date() - dt_inicio.date()).days + 1

            # Cria a dobra do 15º dia até hoje
            nova_dobra = Escala(
                funcionario_id=func_id,
                estado='dobra',
                operacao=unidade,
                data_inicio=(dt_limite_normal + timedelta(days=1)).strftime('%Y-%m-%d'),
                data_fim=hoje_str,
                observacoes='Dobra automática (permanência após 14 dias)'
            )
            db.session.add(nova_dobra)
        else:
            # Desembarque normal ou antecipado
            escala.data_fim = hoje_str
            # Calcula dias embarcados reais
            dias_totais = (hoje.date() - dt_inicio.date()).days + 1

        # Gera a folga proporcional (1:1) após o desembarque, verificando duplicidade
        folga_inicio = (hoje + timedelta(days=1)).strftime('%Y-%m-%d')
        folga_fim = (hoje + timedelta(days=dias_totais)).strftime('%Y-%m-%d')

        folga_existente = Escala.query.filter_by(
            funcionario_id=func_id,
            estado='folga',
            data_inicio=folga_inicio,
            data_fim=folga_fim
        ).first()

        if not folga_existente:
            folga = Escala(
                funcionario_id=func_id,
                estado='folga',
                operacao='',
                data_inicio=folga_inicio,
                data_fim=folga_fim,
                observacoes=f'Folga proporcional ({dias_totais} dias)'
            )
            db.session.add(folga)

        db.session.commit()
        return jsonify({'success': True})
    except (SQLAlchemyError, ValueError) as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/registrar-dobra-planejada', methods=['POST'])
def registrar_dobra_planejada():
    """Registra um período de dobra planejado para um funcionário."""
    data = request.json
    try:
        nova_dobra = Escala(
            funcionario_id=data['funcionario_id'],
            estado='dobra',
            operacao=data['unidade'],
            data_inicio=data['data_inicio'],
            data_fim=data['data_fim'],
            observacoes=f"Dobra planejada: {data.get('observacoes', '')}"
        )
        db.session.add(nova_dobra)
        db.session.commit()
        return jsonify({'success': True})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

# ==========================================
# ROTAS: SONDAS (SQLite)
# ==========================================

@app.route('/api/sondas', methods=['GET'])
def api_sondas_get():
    """Lista unidades marítimas ATIVAS com pessoas embarcadas no momento.
    Otimizado para evitar N+1 queries.
    """
    try:
        # Parâmetros de filtro da URL - Limpa strings vazias
        raw_statuses = request.args.getlist('status')
        statuses = [s for s in raw_statuses if s]

        # REGRA DE OURO: Se não houver filtro, NUNCA mostra inativos no dashboard
        if not statuses:
            statuses = ['ativo', 'manutencao']

        include_disembarking = (
            request.args.get('include_disembarking', 'true').lower() == 'true'
        )

        hoje = datetime.now()
        hoje_str = hoje.strftime('%Y-%m-%d')

        # 1. Busca apenas escalas de embarque que estão ativas ou terminando hoje
        query_escalas = (Escala.query
                         .options(joinedload(Escala.funcionario))
                         .filter(Escala.estado == 'embarque'))

        if include_disembarking:
            query_escalas = query_escalas.filter(
                and_(Escala.data_inicio <= hoje_str, Escala.data_fim >= hoje_str))
        else:
            query_escalas = query_escalas.filter(
                and_(Escala.data_inicio <= hoje_str, Escala.data_fim > hoje_str))

        escalas_relevantes = query_escalas.all()
        # Remove duplicatas, caso uma escala satisfaça ambas as condições
        escalas_unicas = {escala.id: escala for escala in escalas_relevantes}.values()

        # 2. Agrupa as escalas únicas por operação para busca rápida
        escalas_por_operacao = {}
        for escala in escalas_unicas:
            operacao = escala.operacao
            if operacao not in escalas_por_operacao:
                escalas_por_operacao[operacao] = []
            escalas_por_operacao[operacao].append(escala)

        # 3. Busca unidades e sondas de forma otimizada, aplicando o filtro de status
        # REGRA: Unidades do tipo 'BASE' não aparecem no dashboard
        unidades_query = UnidadeMaritima.query.filter(or_(
            UnidadeMaritima.tipo_operacao != 'BASE',
            UnidadeMaritima.tipo_operacao == None
        ))
        if statuses:
            unidades_query = unidades_query.filter(
                UnidadeMaritima.status.in_(statuses))

        unidades_filtradas = unidades_query.order_by(UnidadeMaritima.poco).all()
        sondas_map = {}
        # Busca a sonda mais recente para cada unidade marítima
        all_sondas = Sonda.query.order_by(Sonda.data_criacao.desc()).all()
        for s in all_sondas:
            if s.unidade_maritima not in sondas_map:
                sondas_map[s.unidade_maritima] = s

        resultado = []
        for u in unidades_filtradas:
            pessoas_embarcadas = []
            # 4. Monta a lista de pessoas usando os dados pré-carregados
            if u.poco in escalas_por_operacao:
                for escala in escalas_por_operacao[u.poco]:
                    if not escala.funcionario:
                        continue
                    try:
                        data_inicio = datetime.strptime(
                            escala.data_inicio, '%Y-%m-%d')
                        dias_bordo = (hoje - data_inicio).days + 1
                    except (ValueError, TypeError):
                        dias_bordo = 0

                    # Define um status para o frontend usar
                    status_hoje = 'Embarcado'
                    if escala.data_fim == hoje_str:
                        status_hoje = 'Desembarcando'

                    pessoas_embarcadas.append({
                        'funcionario_id': escala.funcionario_id,
                        'nome':           escala.funcionario.nome,
                        'gin':            escala.funcionario.gin or '',
                        'data_embarque':  escala.data_inicio,
                        'dias_bordo':     dias_bordo,
                        'status_hoje':    status_hoje, # NOVO CAMPO
                    })

            sonda = sondas_map.get(u.poco)
            resultado.append({
                'id':               sonda.id if sonda else f'u{u.id}',
                'nome_poco':        u.poco,
                'unidade_maritima': u.poco,
                'localizacao':      u.sonda_nome or (sonda.localizacao if sonda else ''),
                'data_inicio':      (u.inicio_operacao
                                     or (sonda.data_inicio if sonda else '')),
                'equipe_id':        sonda.equipe_id if sonda else '',
                'tipo_operacao':    u.tipo_operacao or '',
                'contrato':         u.contrato or '',
                'tag':              u.tag or '',
                'sonda_registrada': sonda is not None,
                'sonda_id':         sonda.id if sonda else None,
                'unidade_id':       u.id,
                'pessoas_embarcadas': pessoas_embarcadas,
                'total_pessoas':    len(pessoas_embarcadas)
            })

        return jsonify(resultado)
    except (SQLAlchemyError, ValueError) as e:
        logging.error("Falha ao buscar dados das sondas: %s", e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/sondas', methods=['POST'])
def api_sondas_post():
    """Cria nova sonda"""
    data = request.json
    if not data or not data.get('nome_poco') or not data.get('unidade_maritima'):
        return jsonify(
            {'error': 'nome_poco e unidade_maritima são obrigatórios'}), 400

    try:
        sonda = Sonda(
            nome_poco=data['nome_poco'],
            unidade_maritima=data['unidade_maritima'],
            localizacao=data.get('localizacao', ''),
            data_inicio=data.get('data_inicio', ''),
            equipe_id=data.get('equipe_id', '')
        )
        db.session.add(sonda)
        db.session.commit()
        result = sonda.to_dict()
        result['pessoas_embarcadas'] = []
        result['total_pessoas'] = 0
        return jsonify(result), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/sondas/<sonda_id>', methods=['DELETE', 'PUT'])
def api_sonda(sonda_id):
    """Atualiza ou remove sonda"""
    sonda = db.get_or_404(Sonda, sonda_id)

    if request.method == 'DELETE':
        try:
            db.session.delete(sonda)
            db.session.commit()
            return jsonify({'success': True})
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400

    if request.method == 'PUT':
        data = request.json
        if not data:
            return jsonify({'error': 'JSON inválido ou ausente'}), 400
        try:
            if 'nome_poco' in data:
                sonda.nome_poco = data['nome_poco']
            if 'unidade_maritima' in data:
                sonda.unidade_maritima = data['unidade_maritima']
            if 'localizacao' in data:
                sonda.localizacao = data['localizacao']
            if 'data_inicio' in data:
                sonda.data_inicio = data['data_inicio']
            if 'equipe_id' in data:
                sonda.equipe_id = data['equipe_id']
            db.session.commit()
            return jsonify(sonda.to_dict())
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400

# ==========================================
# ROTAS: EQUIPES (SQLite)
# ==========================================

@app.route('/api/equipes', methods=['GET'])
def api_equipes_get():
    """Lista todas as equipes"""
    try:
        lista = Equipe.query.options(
            joinedload(Equipe.membros).joinedload(EquipeMembro.funcionario)
        ).order_by(Equipe.data_criacao.desc()).all()
        return jsonify([e.to_dict() for e in lista])
    except SQLAlchemyError as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/equipes', methods=['POST'])
def api_equipes_post():
    """Cria nova equipe"""
    data = request.json
    if not data:
        return jsonify({'error': 'JSON inválido ou ausente'}), 400

    atividade = data.get('atividade', 'embarque') # 'embarque' ou 'base'
    unidade = data.get('unidade_maritima', '')
    membros_datas = data.get('membros_datas', [])

    try:
        equipe = Equipe(
            nome=f"Atividade: {atividade.upper()}",
            unidade_maritima=unidade
        )
        db.session.add(equipe)
        db.session.flush()  # gera o id antes de adicionar membros

        datas_por_func = {str(m['funcionario_id']): m for m in membros_datas}

        for func_id in data.get('membros', []):
            d = datas_por_func.get(str(func_id), {})
            membro = EquipeMembro(
                equipe_id=equipe.id,
                funcionario_id=int(func_id),
                data_embarque=d.get('data_embarque', ''),
                data_desembarque=d.get('data_desembarque', '')
            )
            db.session.add(membro)

        # Cria escalas automaticamente para membros com datas definidas
        escalas_criadas = 0
        for func_id, d in datas_por_func.items():
            if d.get('data_embarque') and d.get('data_desembarque') and unidade:
                nova_escala = Escala(
                    funcionario_id=int(func_id),
                    estado=atividade,
                    operacao=unidade,
                    data_inicio=d['data_embarque'],
                    data_fim=d['data_desembarque'],
                    observacoes=f'Gerado via Montagem de Equipe ({atividade})'
                )
                db.session.add(nova_escala)
                escalas_criadas += 1

                # Se for embarque, gera automaticamente a folga de 14 dias
                if atividade == 'embarque':
                    try:
                        dt_inicio = datetime.strptime(d['data_embarque'], '%Y-%m-%d')
                        dt_fim = datetime.strptime(d['data_desembarque'], '%Y-%m-%d')
                        dias_embarcados = (dt_fim - dt_inicio).days + 1
                        folga_inicio = (dt_fim + timedelta(days=1)).strftime('%Y-%m-%d')
                        folga_fim = (
                            dt_fim + timedelta(days=dias_embarcados)
                        ).strftime('%Y-%m-%d')

                        # Verificar duplicidade de folga automática
                        folga_existente = Escala.query.filter_by(
                            funcionario_id=int(func_id),
                            estado='folga',
                            data_inicio=folga_inicio,
                            data_fim=folga_fim
                        ).first()

                        if not folga_existente:
                            escala_folga = Escala(
                                funcionario_id=int(func_id),
                                estado='folga',
                                operacao='',
                                data_inicio=folga_inicio,
                                data_fim=folga_fim,
                                observacoes=(
                                    f'Folga automática proporcional ({dias_embarcados} dias)'
                                )
                            )
                            db.session.add(escala_folga)
                    except (ValueError, TypeError) as e:
                        logging.error("Erro ao gerar folga automática: %s", e)

        db.session.commit()
        result = equipe.to_dict()
        result['escalas_criadas'] = escalas_criadas
        return jsonify(result), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipes/<equipe_id>', methods=['PUT', 'DELETE'])
def api_equipe(equipe_id):
    """Atualiza ou deleta equipe"""
    equipe = db.get_or_404(Equipe, equipe_id)

    if request.method == 'DELETE':
        try:
            db.session.delete(equipe)
            db.session.commit()
            return jsonify({'success': True})
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400

    if request.method == 'PUT':
        data = request.json
        if not data:
            return jsonify({'error': 'JSON inválido ou ausente'}), 400
        try:
            if 'nome' in data:
                equipe.nome = data['nome']
            if 'descricao' in data:
                equipe.descricao = data['descricao']
            if 'unidade_maritima' in data:
                equipe.unidade_maritima = data['unidade_maritima']

            if 'membros' in data:
                # Remove membros antigos e recria
                EquipeMembro.query.filter_by(equipe_id=equipe_id).delete()
                for func_id in data['membros']:
                    db.session.add(EquipeMembro(
                        equipe_id=equipe_id,
                        funcionario_id=int(func_id)
                    ))

            db.session.commit()
            return jsonify(equipe.to_dict())
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 400

# ==========================================
# ROTA: DASHBOARD DATA
# ==========================================

@app.route('/api/dashboard-data')
def api_dashboard_data():
    """Retorna dados consolidados para o dashboard. Otimizado."""
    try:
        hoje = datetime.now()
        hoje_str = hoje.strftime('%Y-%m-%d')

        total_funcionarios = db.session.query(Funcionario.id).count()

        # Query otimizada para buscar escalas relevantes com dados do funcionário
        escalas_relevantes = (Escala.query
                              .options(joinedload(Escala.funcionario))
                              .filter(Escala.data_fim >= hoje_str).all())

        total_escalas_ativas = 0
        escalas_proximas = 0
        alertas = []
        operacoes = {}

        for escala in escalas_relevantes:
            try:
                d_inicio = datetime.strptime(escala.data_inicio, '%Y-%m-%d')
                d_fim = datetime.strptime(escala.data_fim, '%Y-%m-%d')
            except (ValueError, TypeError):
                continue

            # Verifica escalas ativas hoje
            if escala.estado == 'embarque' and d_inicio <= hoje <= d_fim:
                total_escalas_ativas += 1
                op = escala.operacao or 'Sem operação'
                operacoes[op] = operacoes.get(op, 0) + 1

                dias_bordo = (hoje - d_inicio).days + 1
                nome = (escala.funcionario.nome if escala.funcionario
                        else f'ID {escala.funcionario_id}')

                # Adiciona à lista de alertas apenas funcionários com mais de 14 dias embarcados.
                if dias_bordo > 14:
                    alertas.append({
                        'funcionario': nome,
                        'mensagem': f'{dias_bordo} dias embarcado (acima de 14 dias)'
                    })

            # Verifica escalas que começarão nos próximos 30 dias
            if d_inicio > hoje and d_inicio <= (hoje + timedelta(days=30)):
                escalas_proximas += 1

        return jsonify({
            'total_funcionarios': total_funcionarios,
            'total_escalas':      total_escalas_ativas,
            'escalas_proximas':   escalas_proximas,
            'alertas':            alertas,
            'operacoes':          operacoes
        })
    except (SQLAlchemyError, ValueError) as e:
        logging.error("Falha ao buscar dados do dashboard: %s", e)
        return jsonify({'error': str(e)}), 500

# ==========================================
# ROTAS: UNIDADES MARÍTIMAS
# ==========================================

@app.route('/api/unidades', methods=['GET'])
def api_unidades():
    """Retorna os nomes dos poços cadastrados (para selects)"""
    unids = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
    return jsonify([u.poco for u in unids])

@app.route('/api/unidades-completas', methods=['GET'])
def api_unidades_completas_get():
    """Lista todas as unidades marítimas"""
    unids = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
    return jsonify([u.to_dict() for u in unids])

@app.route('/api/unidades-completas', methods=['POST'])
def api_unidades_completas_post():
    """Cria uma nova unidade marítima."""
    data = request.json
    tipo_op = data.get('tipo_operacao')

    # Lógica condicional para tipo BASE
    if tipo_op == 'BASE':
        base_local = data.get('base_local')
        if not base_local:
            return jsonify(
                {'error': 'Para o tipo BASE, o local da base é obrigatório'}), 400
        # Auto-gera 'poco' e limpa campos não aplicáveis
        data['poco'] = f"BASE - {base_local}"
        data['sonda_nome'] = ''
        data['contrato'] = ''
        data['tag'] = ''
    else:
        if not data.get('poco'):
            return jsonify(
                {'error': 'Campo Poço é obrigatório para este tipo de operação'}), 400
        # Garante que campos de base não sejam salvos para outros tipos
        data['base_local'] = ''
        data['servico_externo'] = False
        data['local_externo'] = ''
    try:
        u = UnidadeMaritima(
            poco=data['poco'].strip(),
            contrato=data.get('contrato', ''),
            sonda_nome=data.get('sonda_nome', ''),
            tag=data.get('tag', ''),
            inicio_operacao=data.get('inicio_operacao', ''),
            final_operacao=data.get('final_operacao', ''),
            status=data.get('status', 'ativo'),
            observacoes=data.get('observacoes', ''),
            tipo_operacao=data.get('tipo_operacao', ''),
            base_local=data.get('base_local', ''),
            servico_externo=bool(data.get('servico_externo', False)),
            local_externo=data.get('local_externo', '')
        )
        db.session.add(u)
        db.session.commit()
        return jsonify(u.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/unidades-completas/<int:unidade_id>', methods=['PUT'])
def api_unidade_completa_put(unidade_id):
    """Atualiza uma unidade marítima existente."""
    u = db.get_or_404(UnidadeMaritima, unidade_id)
    data = request.json
    if not data:
        return jsonify({'error': 'JSON inválido'}), 400
    tipo_op = data.get('tipo_operacao')

    try:
        # Atualiza campos comuns
        if 'inicio_operacao' in data:
            u.inicio_operacao = data['inicio_operacao']
        if 'final_operacao' in data:
            u.final_operacao = data['final_operacao']
        if 'observacoes' in data:
            u.observacoes = data['observacoes']
        if 'tipo_operacao' in data:
            u.tipo_operacao = data['tipo_operacao']
        if 'status' in data:
            u.status = data['status']

        # Lógica condicional para tipo BASE
        if tipo_op == 'BASE':
            base_local = data.get('base_local')
            if not base_local:
                return jsonify(
                    {'error': 'Para o tipo BASE, o local da base é obrigatório'}), 400
            u.poco = f"BASE - {base_local}"
            u.base_local = base_local
            u.servico_externo = bool(data.get('servico_externo', False))
            u.local_externo = (data.get('local_externo', '')
                               if u.servico_externo else '')
            # Limpa campos não aplicáveis
            u.sonda_nome = ''
            u.contrato = ''
            u.tag = ''
        else:
            if 'poco' in data:
                u.poco = data['poco'].strip()
            if 'contrato' in data:
                u.contrato = data['contrato']
            if 'sonda_nome' in data:
                u.sonda_nome = data['sonda_nome']
            if 'tag' in data:
                u.tag = data['tag']
            # Limpa campos de base
            u.base_local = ''
            u.servico_externo = False
            u.local_externo = ''

        db.session.commit()
        return jsonify(u.to_dict())
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/unidades-completas/<int:unidade_id>', methods=['DELETE'])
def api_unidade_completa_delete(unidade_id):
    """Exclui uma unidade marítima."""
    u = db.get_or_404(UnidadeMaritima, unidade_id)
    try:
        db.session.delete(u)
        db.session.commit()
        return jsonify({'success': True})
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

# ==========================================
# ROTA: OPERAÇÕES (histórico por poço)
# ==========================================

@app.route('/api/operacoes', methods=['GET'])
def api_operacoes():
    """Retorna histórico completo de operações por poço. Otimizado."""
    try:
        # 1. Buscar dados principais em poucas queries
        lista_unidades = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
        todas_escalas = (Escala.query
                         .options(joinedload(Escala.funcionario))
                         .order_by(Escala.data_inicio.desc()).all())
        todas_equipes = Equipe.query.order_by(Equipe.data_criacao.desc()).all()
        todas_sondas = Sonda.query.order_by(Sonda.data_criacao.desc()).all()

        # 2. Mapear dados para acesso rápido
        escalas_por_poco = {k: [] for k in [u.poco for u in lista_unidades]}
        for e in todas_escalas:
            if e.operacao in escalas_por_poco:
                escalas_por_poco[e.operacao].append(e)

        equipes_por_poco = {k: [] for k in [u.poco for u in lista_unidades]}
        for eq in todas_equipes:
            if eq.unidade_maritima in equipes_por_poco:
                equipes_por_poco[eq.unidade_maritima].append(eq)

        sondas_por_poco = {}
        for s in todas_sondas:
            if s.unidade_maritima not in sondas_por_poco:
                sondas_por_poco[s.unidade_maritima] = s

        # 3. Montar o resultado final
        resultado = []
        for u in lista_unidades:
            escalas_hist = escalas_por_poco.get(u.poco, [])
            historico = [{
                'funcionario_id':  e.funcionario.id,
                'nome':            e.funcionario.nome,
                'gin':             e.funcionario.gin or '',
                'grade':           e.funcionario.grade or '',
                'data_embarque':   e.data_inicio,
                'data_desembarque': e.data_fim,
                'estado':          e.estado
            } for e in escalas_hist if e.funcionario]
            equipes_hist = equipes_por_poco.get(u.poco, [])
            sonda = sondas_por_poco.get(u.poco)

            resultado.append({
                'id':              u.id,
                'poco':            u.poco,
                'tipo_operacao':   u.tipo_operacao or '',
                'contrato':        u.contrato or '',
                'operador':        u.operador or '',
                'status':          u.status or 'ativo',
                'sonda':           sonda.to_dict() if sonda else None,
                'historico_escalas': historico,
                'equipes':         [
                    {'id': eq.id, 'nome': eq.nome,
                     'data_criacao': eq.data_criacao.isoformat() if eq.data_criacao else ''}
                    for eq in equipes_hist
                ],
                'total_ocorrencias': len(historico)
            })

        return jsonify(resultado)
    except SQLAlchemyError as e:
        logging.error("Falha ao buscar dados de operações: %s", e)
        return jsonify({'error': str(e)}), 500

# ==========================================
# Inicialização
# ==========================================

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
