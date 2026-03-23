from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='student')  # 'student' or 'driver'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    statuses = db.relationship('BoardingStatusEntry', backref='user', lazy=True, cascade='all, delete-orphan')
    locations = db.relationship('BusLocation', backref='user', lazy=True, cascade='all, delete-orphan')


class Route(db.Model):
    __tablename__ = 'routes'
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    stops = db.relationship('Stop', backref='route', lazy=True, order_by='Stop.order', cascade='all, delete-orphan')


class Stop(db.Model):
    __tablename__ = 'stops'
    id = db.Column(db.String(50), primary_key=True)
    route_id = db.Column(db.String(50), db.ForeignKey('routes.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    order = db.Column(db.Integer, nullable=False)


class BoardingStatusEntry(db.Model):
    __tablename__ = 'boarding_statuses'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    user_name = db.Column(db.String(100), nullable=False)
    stop_id = db.Column(db.String(50), nullable=False)
    route_id = db.Column(db.String(50), db.ForeignKey('routes.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'ready', 'onway', 'absent'
    timestamp = db.Column(db.Float, nullable=False)


class BusLocation(db.Model):
    __tablename__ = 'bus_locations'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    route_id = db.Column(db.String(50), db.ForeignKey('routes.id'), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    shared_by = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.Float, nullable=False)
