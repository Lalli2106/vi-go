import os
import time
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Route, Stop, BoardingStatusEntry, BusLocation

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.config['SECRET_KEY'] = 'vi-go-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app, supports_credentials=True)
db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({'error': 'Not authenticated'}), 401


# ---------- Seed Routes ----------
def seed_routes():
    if Route.query.first():
        return
    routes_data = [
        {
            "id": "route-1", "name": "Route 1",
            "stops": [
                {"id": "r1s1", "name": "Omkar Nagar", "lat": 17.3373923106642, "lng": 78.5502614404764, "order": 1},
                {"id": "r1s2", "name": "Hasthinapuram 1", "lat": 17.3330897358747, "lng": 78.5527448744274, "order": 2},
                {"id": "r1s3", "name": "Hasthinapuram 2", "lat": 17.3295875457526, "lng": 78.5542436865079, "order": 3},
                {"id": "r1s4", "name": "BN Reddy", "lat": 17.3211054671823, "lng": 78.5635172349501, "order": 4},
                {"id": "r1s5", "name": "Vydehi Colony", "lat": 17.3217081443834, "lng": 78.5725252604787, "order": 5},
                {"id": "r1s6", "name": "Gautami Nagar", "lat": 17.3254939140216, "lng": 78.5723440300563, "order": 6},
                {"id": "r1s7", "name": "HUDA Park", "lat": 17.3275649853717, "lng": 78.5748159748412, "order": 7},
                {"id": "r1s8", "name": "Rythu Bazar", "lat": 17.3306409482693, "lng": 78.5757076110076, "order": 8},
                {"id": "r1s9", "name": "Kamala Nagar", "lat": 17.3300688377682, "lng": 78.5790628423281, "order": 9},
                {"id": "r1s10", "name": "Subhadra Nagar", "lat": 17.3289032524815, "lng": 78.5833811497877, "order": 10},
                {"id": "r1s11", "name": "Sharada Nagar", "lat": 17.3282594692515, "lng": 78.585372901519, "order": 11},
                {"id": "r1s12", "name": "Bhagyalatha 1", "lat": 17.3296000038989, "lng": 78.5874631423281, "order": 12},
                {"id": "r1s13", "name": "Bhagyalatha 2", "lat": 17.3316355846199, "lng": 78.5884992, "order": 13},
                {"id": "r1s14", "name": "Hayathnagar", "lat": 17.3273738976457, "lng": 78.6046680510635, "order": 14},
                {"id": "r1s15", "name": "Kuntloor 1", "lat": 17.3371377938064, "lng": 78.6168247865079, "order": 15},
                {"id": "r1s16", "name": "Y Junction", "lat": 17.3454705826446, "lng": 78.6320240134921, "order": 16},
            ]
        },
        {
            "id": "route-2", "name": "Route 2",
            "stops": [
                {"id": "r2s1", "name": "Neredmet", "lat": 17.4806238763548, "lng": 78.5339042236299, "order": 1},
                {"id": "r2s2", "name": "Neredmet X Roads", "lat": 17.4826101188758, "lng": 78.5371367639752, "order": 2},
                {"id": "r2s3", "name": "Vayipuri", "lat": 17.483774947662, "lng": 78.5449877244163, "order": 3},
                {"id": "r2s4", "name": "Sainikpuri X Roads", "lat": 17.4836840410937, "lng": 78.5500721866928, "order": 4},
                {"id": "r2s5", "name": "A.S. Rao Nagar 1", "lat": 17.4816371547685, "lng": 78.554607266792, "order": 5},
                {"id": "r2s6", "name": "A.S. Rao Nagar 2", "lat": 17.4804082871654, "lng": 78.5567945563835, "order": 6},
                {"id": "r2s7", "name": "Radhika Theatre", "lat": 17.4778484471592, "lng": 78.5621620739041, "order": 7},
                {"id": "r2s8", "name": "Kamala Nagar", "lat": 17.4757443465913, "lng": 78.5680286942652, "order": 8},
                {"id": "r2s9", "name": "Chiryal X Road", "lat": 17.507456208406, "lng": 78.6280587199175, "order": 9},
            ]
        }
    ]
    for r in routes_data:
        route = Route(id=r['id'], name=r['name'])
        db.session.add(route)
        for s in r['stops']:
            stop = Stop(id=s['id'], route_id=r['id'], name=s['name'], lat=s['lat'], lng=s['lng'], order=s['order'])
            db.session.add(stop)
    db.session.commit()


# ---------- Auth Endpoints ----------
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    display_name = data.get('display_name', '').strip()
    role = data.get('role', 'student')

    if not email or not password or not display_name:
        return jsonify({'error': 'All fields are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if role not in ('student', 'driver'):
        return jsonify({'error': 'Invalid role'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        display_name=display_name,
        role=role
    )
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({'id': user.id, 'display_name': user.display_name, 'role': user.role, 'email': user.email}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    login_user(user)
    return jsonify({'id': user.id, 'display_name': user.display_name, 'role': user.role, 'email': user.email})


@app.route('/logout', methods=['GET'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out'})


@app.route('/me', methods=['GET'])
@login_required
def me():
    return jsonify({
        'id': current_user.id,
        'display_name': current_user.display_name,
        'role': current_user.role,
        'email': current_user.email
    })


# ---------- Routes Endpoints ----------
@app.route('/routes', methods=['GET'])
@login_required
def get_routes():
    routes = Route.query.all()
    result = []
    for r in routes:
        stops = [{'id': s.id, 'name': s.name, 'lat': s.lat, 'lng': s.lng, 'order': s.order} for s in r.stops]
        result.append({'id': r.id, 'name': r.name, 'stops': stops})
    return jsonify(result)


# ---------- Location Endpoints ----------
@app.route('/update-location', methods=['POST'])
@login_required
def update_location():
    data = request.get_json()
    lat = data.get('lat')
    lng = data.get('lng')
    route_id = data.get('route_id')

    if lat is None or lng is None or not route_id:
        return jsonify({'error': 'lat, lng, and route_id are required'}), 400

    # Remove old locations for this user on this route
    BusLocation.query.filter_by(user_id=current_user.id, route_id=route_id).delete()

    loc = BusLocation(
        user_id=current_user.id,
        route_id=route_id,
        lat=lat,
        lng=lng,
        shared_by=current_user.display_name,
        timestamp=time.time() * 1000
    )
    db.session.add(loc)
    db.session.commit()
    return jsonify({'message': 'Location updated'})


@app.route('/stop-sharing', methods=['POST'])
@login_required
def stop_sharing():
    data = request.get_json()
    route_id = data.get('route_id')
    BusLocation.query.filter_by(user_id=current_user.id, route_id=route_id).delete()
    db.session.commit()
    return jsonify({'message': 'Stopped sharing'})


@app.route('/get-location', methods=['GET'])
@login_required
def get_location():
    route_id = request.args.get('route_id')
    if not route_id:
        return jsonify({'error': 'route_id required'}), 400

    # Get the most recent location for the route (within last 30 seconds)
    cutoff = (time.time() - 30) * 1000
    loc = BusLocation.query.filter(
        BusLocation.route_id == route_id,
        BusLocation.timestamp > cutoff
    ).order_by(BusLocation.timestamp.desc()).first()

    if loc:
        return jsonify({
            'lat': loc.lat,
            'lng': loc.lng,
            'timestamp': loc.timestamp,
            'route_id': loc.route_id,
            'shared_by': loc.shared_by
        })
    return jsonify(None)


# ---------- Status Endpoints ----------
@app.route('/update-status', methods=['POST'])
@login_required
def update_status():
    data = request.get_json()
    stop_id = data.get('stop_id')
    route_id = data.get('route_id')
    status = data.get('status')

    if not stop_id or not route_id or not status:
        return jsonify({'error': 'stop_id, route_id, and status required'}), 400
    if status not in ('ready', 'onway', 'absent'):
        return jsonify({'error': 'Invalid status'}), 400

    # Remove existing status for this user on this route
    BoardingStatusEntry.query.filter_by(user_id=current_user.id, route_id=route_id).delete()

    entry = BoardingStatusEntry(
        user_id=current_user.id,
        user_name=current_user.display_name,
        stop_id=stop_id,
        route_id=route_id,
        status=status,
        timestamp=time.time() * 1000
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify({'message': 'Status updated'})


@app.route('/reset-status', methods=['POST'])
@login_required
def reset_status():
    data = request.get_json()
    route_id = data.get('route_id')
    BoardingStatusEntry.query.filter_by(user_id=current_user.id, route_id=route_id).delete()
    db.session.commit()
    return jsonify({'message': 'Status reset'})


@app.route('/get-statuses', methods=['GET'])
@login_required
def get_statuses():
    route_id = request.args.get('route_id')
    if not route_id:
        return jsonify({'error': 'route_id required'}), 400

    statuses = BoardingStatusEntry.query.filter_by(route_id=route_id).all()
    return jsonify([{
        'userName': s.user_name,
        'stopId': s.stop_id,
        'routeId': s.route_id,
        'status': s.status,
        'timestamp': s.timestamp
    } for s in statuses])


# ---------- Serve Frontend ----------
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'login.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_routes()
    app.run(debug=True, port=5000)
