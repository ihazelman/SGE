# -*- coding: utf-8 -*-
"""Define os modelos de dados (ORM) e a configuração inicial do banco de dados."""
from datetime import datetime
import uuid

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

db = SQLAlchemy()

def init_db(app):
    """Inicializa o banco de dados com a aplicação Flask."""
    db.init_app(app)
    with app.app_context():
        db.create_all()
        _migrar(db.engine)

def _migrar(engine):
    """Garante que as colunas do schema novo existem no banco legado."""
    migracoes = [
        "ALTER TABLE funcionarios ADD COLUMN grade VARCHAR(50)",
        "ALTER TABLE funcionarios ADD COLUMN leader BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE unidades_maritimas ADD COLUMN tipo_operacao VARCHAR(100)",
        "ALTER TABLE unidades_maritimas ADD COLUMN sonda_nome VARCHAR(200)",
        "ALTER TABLE unidades_maritimas ADD COLUMN operador VARCHAR(200)",
        "ALTER TABLE unidades_maritimas ADD COLUMN tag VARCHAR(100)",
        "ALTER TABLE unidades_maritimas ADD COLUMN base_local VARCHAR(50)",
        "ALTER TABLE unidades_maritimas ADD COLUMN servico_externo BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE unidades_maritimas ADD COLUMN local_externo VARCHAR(200)",
    ]
    with engine.connect() as conn:
        for sql in migracoes:
            try:
                conn.execute(text(sql))
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()  # Desfaz a transação falha

class UnidadeMaritima(db.Model):
    """Representa uma unidade marítima (poço) cadastrada no sistema."""

    __tablename__ = 'unidades_maritimas'

    id               = db.Column(db.Integer, primary_key=True)
    poco             = db.Column(db.String(200), nullable=False)
    contrato         = db.Column(db.String(200))
    operador         = db.Column(db.String(200))
    airgap           = db.Column(db.String(50))
    lamina_dagua     = db.Column(db.String(50))
    inicio_operacao  = db.Column(db.String(20))
    final_operacao   = db.Column(db.String(20))
    status           = db.Column(db.String(20), default='ativo')
    observacoes      = db.Column(db.Text)
    tipo_operacao    = db.Column(db.String(100), default='')
    sonda_nome       = db.Column(db.String(200), default='')
    tag              = db.Column(db.String(100), default='')
    data_criacao     = db.Column(db.DateTime, default=datetime.now)
    base_local       = db.Column(db.String(50), default='')
    servico_externo  = db.Column(db.Boolean, default=False, nullable=False)
    local_externo    = db.Column(db.String(200), default='')

    def to_dict(self):
        """Retorna representação em dicionário da unidade."""
        return {
            'id':              self.id,
            'poco':            self.poco,
            'contrato':        self.contrato or '',
            'sonda_nome':      self.sonda_nome or '',
            'tag':             self.tag or '',
            'inicio_operacao': self.inicio_operacao or '',
            'final_operacao':  self.final_operacao or '',
            'observacoes':     self.observacoes or '',
            'tipo_operacao':   self.tipo_operacao or '',
            'status':          self.status or 'ativo',
            'data_criacao':    self.data_criacao.isoformat() if self.data_criacao else None,
            'base_local':      self.base_local or '',
            'servico_externo': self.servico_externo,
            'local_externo':   self.local_externo or '',
        }

    def __repr__(self):
        """Retorna representação em string da unidade."""
        return f'<UnidadeMaritima {self.poco}>'


class Funcionario(db.Model):
    """Representa um funcionário cadastrado no sistema."""

    __tablename__ = 'funcionarios'

    id     = db.Column(db.Integer, primary_key=True)
    gin    = db.Column(db.String(50), unique=True, nullable=False)
    nome   = db.Column(db.String(200), nullable=False)
    grade  = db.Column(db.String(50))
    leader = db.Column(db.Boolean, default=False, nullable=False)
    data_criacao = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        """Retorna representação em dicionário do funcionário."""
        return {
            'id':     self.id,
            'gin':    self.gin,
            'nome':   self.nome,
            'grade':  self.grade or '',
            'leader': self.leader,
            'data_criacao': self.data_criacao.isoformat() if self.data_criacao else None,
        }

    def __repr__(self):
        """Retorna representação em string do funcionário."""
        return f'<Funcionario {self.nome} GIN:{self.gin}>'


class Equipe(db.Model):
    """Representa uma equipe de trabalho associada a uma unidade marítima."""

    __tablename__ = 'equipes'

    id               = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    nome             = db.Column(db.String(200), nullable=False)
    descricao        = db.Column(db.Text, default='')
    unidade_maritima = db.Column(db.String(200), default='')
    data_criacao     = db.Column(db.DateTime, default=datetime.now)

    membros = db.relationship('EquipeMembro', backref='equipe', lazy=True,
                              cascade='all, delete-orphan')

    def to_dict(self):
        """Retorna representação em dicionário da equipe."""
        membros_info = [{
            'id':    m.funcionario.id,
            'nome':  m.funcionario.nome,
            'gin':   m.funcionario.gin or '',
            'grade': m.funcionario.grade or ''
        } for m in self.membros if m.funcionario]

        membro_ids = [m.funcionario_id for m in self.membros]

        return {
            'id':               self.id,
            'nome':             self.nome,
            'descricao':        self.descricao or '',
            'unidade_maritima': self.unidade_maritima or '',
            'total_membros':    len(membro_ids),
            'data_criacao':     self.data_criacao.isoformat() if self.data_criacao else '',
            'membros_info':     membros_info,
            'membros':          membro_ids
        }

    def __repr__(self):
        """Retorna representação em string da equipe."""
        return f'<Equipe {self.nome}>'


class EquipeMembro(db.Model):
    """Representa a associação entre um funcionário e uma equipe."""

    __tablename__ = 'equipe_membros'

    id              = db.Column(db.Integer, primary_key=True)
    equipe_id       = db.Column(db.String(36), db.ForeignKey('equipes.id'), nullable=False)
    funcionario_id  = db.Column(db.Integer, db.ForeignKey('funcionarios.id'), nullable=False)
    data_embarque   = db.Column(db.String(20), default='')
    data_desembarque = db.Column(db.String(20), default='')

    funcionario = db.relationship('Funcionario', lazy='joined')

    def __repr__(self):
        """Retorna representação em string do membro da equipe."""
        return f'<EquipeMembro equipe={self.equipe_id} func={self.funcionario_id}>'


class Sonda(db.Model):
    """Representa uma sonda associada a uma unidade marítima."""

    __tablename__ = 'sondas'

    id               = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    nome_poco        = db.Column(db.String(200), nullable=False)
    unidade_maritima = db.Column(db.String(200), nullable=False)
    localizacao      = db.Column(db.String(200), default='')
    data_inicio      = db.Column(db.String(20), default='')
    equipe_id        = db.Column(db.String(36), default='')
    data_criacao     = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        """Retorna representação em dicionário da sonda."""
        return {
            'id':               self.id,
            'nome_poco':        self.nome_poco,
            'unidade_maritima': self.unidade_maritima,
            'localizacao':      self.localizacao or '',
            'data_inicio':      self.data_inicio or '',
            'equipe_id':        self.equipe_id or '',
            'data_criacao':     self.data_criacao.isoformat() if self.data_criacao else '',
        }

    def __repr__(self):
        """Retorna representação em string da sonda."""
        return f'<Sonda {self.nome_poco}>'


class Escala(db.Model):
    """Representa um período de escala (embarque, folga, férias, dobra) de um funcionário."""

    __tablename__ = 'escalas'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    funcionario_id = db.Column(db.Integer, db.ForeignKey('funcionarios.id'), nullable=False)
    estado         = db.Column(db.String(50), nullable=False)
    operacao       = db.Column(db.String(200), default='')
    data_inicio    = db.Column(db.String(20), nullable=False)
    data_fim       = db.Column(db.String(20), nullable=False)
    observacoes    = db.Column(db.Text, default='')
    data_criacao   = db.Column(db.DateTime, default=datetime.now)

    funcionario = db.relationship('Funcionario')

    def to_dict(self):
        """Retorna representação em dicionário da escala."""
        return {
            'id':             self.id,
            'funcionario_id': self.funcionario_id,
            'funcionario_nome': self.funcionario.nome if self.funcionario else 'Desconhecido',
            'estado':         self.estado,
            'operacao':       self.operacao or '',
            'data_inicio':    self.data_inicio,
            'data_fim':       self.data_fim,
            'observacoes':    self.observacoes or '',
            'data_criacao':   self.data_criacao.isoformat() if self.data_criacao else ''
        }

    def __repr__(self):
        """Retorna representação em string da escala."""
        return f'<Escala {self.estado} func={self.funcionario_id}>'
