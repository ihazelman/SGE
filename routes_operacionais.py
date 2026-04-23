"""Módulo contendo rotas para Sondas, Unidades Marítimas e Operações."""
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
from sqlalchemy import and_, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload
from models import db, UnidadeMaritima, Sonda, Escala, Equipe, Funcionario

operacionais_bp = Blueprint('operacionais', __name__)

@operacionais_bp.route('/api/sondas', methods=['GET'])
def api_sondas_get():
    """Lista unidades marítimas ATIVAS com pessoas embarcadas no momento."""
    try:
        raw_statuses = request.args.getlist('status')
        statuses = [s for s in raw_statuses if s]
        if not statuses:
            statuses = ['ativo', 'manutencao']

        include_disembarking = request.args.get('include_disembarking', 'true').lower() == 'true'
        hoje_str = datetime.now().strftime('%Y-%m-%d')

        query_escalas = Escala.query.options(joinedload(Escala.funcionario)).filter(Escala.estado == 'embarque')

        if include_disembarking:
            query_escalas = query_escalas.filter(and_(Escala.data_inicio <= hoje_str, Escala.data_fim >= hoje_str))
        else:
            query_escalas = query_escalas.filter(and_(Escala.data_inicio <= hoje_str, Escala.data_fim > hoje_str))

        escalas_relevantes = query_escalas.all()
        escalas_por_operacao = {}
        for escala in {escala.id: escala for escala in escalas_relevantes}.values():
            operacao = escala.operacao
            if operacao not in escalas_por_operacao:
                escalas_por_operacao[operacao] = []
            escalas_por_operacao[operacao].append(escala)

        unidades_query = UnidadeMaritima.query.filter(or_(
            UnidadeMaritima.tipo_operacao != 'BASE',
            UnidadeMaritima.tipo_operacao == None
        ))
        if statuses:
            unidades_query = unidades_query.filter(UnidadeMaritima.status.in_(statuses))

        unidades_filtradas = unidades_query.order_by(UnidadeMaritima.poco).all()
        sondas_map = {}
        all_sondas = Sonda.query.order_by(Sonda.data_criacao.desc()).all()
        for s in all_sondas:
            if s.unidade_maritima not in sondas_map:
                sondas_map[s.unidade_maritima] = s

        resultado = []
        hoje = datetime.now()
        for u in unidades_filtradas:
            pessoas_embarcadas = []
            if u.poco in escalas_por_operacao:
                for escala in escalas_por_operacao[u.poco]:
                    if not escala.funcionario: continue
                    try:
                        dias_bordo = (hoje - datetime.strptime(escala.data_inicio, '%Y-%m-%d')).days + 1
                    except: dias_bordo = 0
                    pessoas_embarcadas.append({
                        'funcionario_id': escala.funcionario_id,
                        'nome': escala.funcionario.nome,
                        'gin': escala.funcionario.gin or '',
                        'data_embarque': escala.data_inicio,
                        'dias_bordo': dias_bordo,
                        'status_hoje': 'Desembarcando' if escala.data_fim == hoje_str else 'Embarcado',
                    })

            sonda = sondas_map.get(u.poco)
            resultado.append({
                'id': sonda.id if sonda else f'u{u.id}',
                'nome_poco': u.poco,
                'unidade_maritima': u.poco,
                'localizacao': u.sonda_nome or (sonda.localizacao if sonda else ''),
                'data_inicio': (u.inicio_operacao or (sonda.data_inicio if sonda else '')),
                'tipo_operacao': u.tipo_operacao or '',
                'contrato': u.contrato or '',
                'tag': u.tag or '',
                'sonda_registrada': sonda is not None,
                'sonda_id': sonda.id if sonda else None,
                'equipe_id': sonda.equipe_id if sonda else '',
                'unidade_id': u.id,
                'pessoas_embarcadas': pessoas_embarcadas,
                'total_pessoas': len(pessoas_embarcadas)
            })
        return jsonify(resultado)
    except Exception as e:
        logging.error("Falha ao buscar dados das sondas: %s", e)
        return jsonify({'error': str(e)}), 500

@operacionais_bp.route('/api/sondas', methods=['POST'])
def api_sondas_post():
    data = request.json
    try:
        sonda = Sonda(nome_poco=data['nome_poco'], unidade_maritima=data['unidade_maritima'],
                      localizacao=data.get('localizacao', ''), data_inicio=data.get('data_inicio', ''))
        db.session.add(sonda)
        db.session.commit()
        return jsonify(sonda.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@operacionais_bp.route('/api/sondas/<sonda_id>', methods=['DELETE', 'PUT'])
def api_sonda(sonda_id):
    sonda = db.get_or_404(Sonda, sonda_id)
    if request.method == 'DELETE':
        db.session.delete(sonda)
        db.session.commit()
        return jsonify({'success': True})
    if request.method == 'PUT':
        data = request.json
        for key in ['nome_poco', 'unidade_maritima', 'localizacao', 'data_inicio']:
            if key in data: setattr(sonda, key, data[key])
        db.session.commit()
        return jsonify(sonda.to_dict())

@operacionais_bp.route('/api/unidades', methods=['GET'])
def api_unidades():
    unids = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
    return jsonify([u.poco for u in unids])

@operacionais_bp.route('/api/unidades-completas', methods=['GET'])
def api_unidades_completas_get():
    unids = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
    return jsonify([u.to_dict() for u in unids])

@operacionais_bp.route('/api/unidades-completas', methods=['POST'])
def api_unidades_completas_post():
    data = request.json
    try:
        u = UnidadeMaritima(poco=data['poco'].strip(), contrato=data.get('contrato', ''),
                            tipo_operacao=data.get('tipo_operacao', ''), status=data.get('status', 'ativo'))
        db.session.add(u)
        db.session.commit()
        return jsonify(u.to_dict()), 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@operacionais_bp.route('/api/unidades-completas/<int:unidade_id>', methods=['PUT', 'DELETE'])
def api_unidade_completa_detail(unidade_id):
    u = db.get_or_404(UnidadeMaritima, unidade_id)
    if request.method == 'DELETE':
        db.session.delete(u)
        db.session.commit()
        return jsonify({'success': True})
    data = request.json
    for key in ['poco', 'contrato', 'status', 'tipo_operacao']:
        if key in data: setattr(u, key, data[key])
    db.session.commit()
    return jsonify(u.to_dict())

@operacionais_bp.route('/api/operacoes', methods=['GET'])
def api_operacoes():
    """Retorna histórico completo de operações por poço."""
    try:
        # 1. Buscar dados principais em poucas queries (Otimizado)
        lista_unidades = UnidadeMaritima.query.order_by(UnidadeMaritima.poco).all()
        todas_escalas = (Escala.query
                         .options(joinedload(Escala.funcionario))
                         .order_by(Escala.data_inicio.desc()).all())
        todas_equipes = Equipe.query.order_by(Equipe.data_criacao.desc()).all()
        todas_sondas = Sonda.query.order_by(Sonda.data_criacao.desc()).all()

        # 2. Mapear dados para acesso rápido evitando loops aninhados O(N*M)
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

        # 3. Montar o resultado com todos os campos necessários para o frontend
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
        return jsonify({'error': str(e)}), 500