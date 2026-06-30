#!/usr/bin/env python3
"""
Advanced Order Processing System with Duplicate Detection and Filtering
Language: Python 3
Framework: Flask
Database: PostgreSQL
"""

import os
import json
import hashlib
import re
from datetime import datetime, timedelta
from urllib.parse import urlparse
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify
from flask_cors import CORS

# ============================================================================
# Configuration
# ============================================================================

app = Flask(__name__)
CORS(app)

# Database Configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost/order_processor_db')

# API Configuration
ADMIN_API_URL = 'https://kd1s.com/admin/adminapi/v2/'
ADMIN_API_KEY = '9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b'

EXTERNAL_API_URL = 'https://kd1s.com/apikd1s'
EXTERNAL_API_KEY = 'ce5d33dc71b144c60cab2f8f977bbc21'

# Service Configuration
SOURCE_SERVICE_ID = 17337  # Service to fetch orders from
TARGET_SERVICE_ID = 17828  # Service to send orders to

# Security Configuration
USER_CHECK_WINDOW = 30 * 60  # 30 minutes in seconds
GLOBAL_COOLDOWN = 60 * 60   # 60 minutes in seconds

# ============================================================================
# Database Functions
# ============================================================================

def get_db_connection():
    """Create database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        return None

def init_database():
    """Initialize database tables"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cur = conn.cursor()
        
        # Create requests table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS processed_requests (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(255) UNIQUE NOT NULL,
                user_hash VARCHAR(255) NOT NULL,
                url_hash VARCHAR(255) NOT NULL,
                original_url TEXT NOT NULL,
                service_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                error_message TEXT,
                INDEX idx_user_hash (user_hash),
                INDEX idx_url_hash (url_hash),
                INDEX idx_created_at (created_at)
            )
        """)
        
        # Create statistics table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS statistics (
                id SERIAL PRIMARY KEY,
                total_requests INTEGER DEFAULT 0,
                successful_requests INTEGER DEFAULT 0,
                failed_requests INTEGER DEFAULT 0,
                duplicate_requests INTEGER DEFAULT 0,
                last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Database initialized successfully")
        return True
    except Exception as e:
        print(f"Database initialization error: {e}")
        return False

# ============================================================================
# Security Functions
# ============================================================================

def generate_hash(data):
    """Generate SHA256 hash"""
    return hashlib.sha256(data.encode()).hexdigest()

def extract_username_from_url(url):
    """Extract username from social media URL"""
    try:
        # Remove protocol and www
        url = re.sub(r'https?://(www\.)?', '', url)
        
        # Extract username based on platform
        if 'instagram.com' in url:
            match = re.search(r'instagram\.com/([^/?]+)', url)
            if match:
                return match.group(1)
        elif 'tiktok.com' in url:
            match = re.search(r'tiktok\.com/@([^/?]+)', url)
            if match:
                return match.group(1)
        elif 'telegram.org' in url or 't.me' in url:
            match = re.search(r'(?:t\.me|telegram\.org)/([^/?]+)', url)
            if match:
                return match.group(1)
        elif 'facebook.com' in url:
            match = re.search(r'facebook\.com/([^/?]+)', url)
            if match:
                return match.group(1)
        
        return url
    except:
        return url

def normalize_url(url):
    """Normalize URL to detect duplicates"""
    try:
        # Remove protocol
        url = re.sub(r'https?://', '', url)
        # Remove www
        url = re.sub(r'www\.', '', url)
        # Remove trailing slashes
        url = url.rstrip('/')
        # Convert to lowercase
        url = url.lower()
        # Remove query parameters
        url = url.split('?')[0]
        return url
    except:
        return url

def check_duplicate_user(user_hash, conn):
    """Check if user made request in last 30 minutes"""
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT * FROM processed_requests 
            WHERE user_hash = %s 
            AND created_at > NOW() - INTERVAL '30 minutes'
            LIMIT 1
        """, (user_hash,))
        
        result = cur.fetchone()
        cur.close()
        
        return result is not None
    except Exception as e:
        print(f"Error checking duplicate user: {e}")
        return False

def check_duplicate_url(url_hash, conn):
    """Check if same URL was requested in last 30 minutes"""
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT * FROM processed_requests 
            WHERE url_hash = %s 
            AND created_at > NOW() - INTERVAL '30 minutes'
            LIMIT 1
        """, (url_hash,))
        
        result = cur.fetchone()
        cur.close()
        
        return result is not None
    except Exception as e:
        print(f"Error checking duplicate URL: {e}")
        return False

# ============================================================================
# API Functions
# ============================================================================

def fetch_pending_orders():
    """Fetch pending orders from admin API"""
    try:
        headers = {'Authorization': f'Bearer {ADMIN_API_KEY}'}
        params = {
            'service': SOURCE_SERVICE_ID,
            'status': 'Pending'
        }
        
        response = requests.get(
            f"{ADMIN_API_URL}orders",
            headers=headers,
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json().get('orders', [])
        else:
            print(f"Error fetching orders: {response.status_code}")
            return []
    except Exception as e:
        print(f"Error fetching orders: {e}")
        return []

def send_order_to_external_api(url, quantity):
    """Send validated order to external API"""
    try:
        headers = {'Authorization': f'Bearer {EXTERNAL_API_KEY}'}
        data = {
            'service': TARGET_SERVICE_ID,
            'link': url,
            'quantity': quantity
        }
        
        response = requests.post(
            EXTERNAL_API_URL,
            headers=headers,
            json=data,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            return True, response.json()
        else:
            return False, response.text
    except Exception as e:
        print(f"Error sending order: {e}")
        return False, str(e)

def cancel_order(order_id):
    """Cancel order and refund"""
    try:
        headers = {'Authorization': f'Bearer {ADMIN_API_KEY}'}
        data = {'action': 'cancel_and_refund'}
        
        response = requests.post(
            f"{ADMIN_API_URL}orders/{order_id}",
            headers=headers,
            json=data,
            timeout=10
        )
        
        return response.status_code in [200, 201]
    except Exception as e:
        print(f"Error canceling order: {e}")
        return False

# ============================================================================
# Processing Functions
# ============================================================================

def process_orders():
    """Main order processing function"""
    print(f"\n{'='*60}")
    print(f"🔄 Processing orders at {datetime.now()}")
    print(f"{'='*60}")
    
    conn = get_db_connection()
    if not conn:
        print("❌ Database connection failed")
        return
    
    try:
        # Fetch pending orders
        orders = fetch_pending_orders()
        print(f"📥 Fetched {len(orders)} pending orders")
        
        if not orders:
            print("✅ No pending orders")
            conn.close()
            return
        
        # Process each order
        for order in orders:
            try:
                order_id = order.get('id')
                url = order.get('link', '')
                quantity = order.get('quantity', 0)
                
                print(f"\n📋 Processing Order #{order_id}")
                print(f"   URL: {url}")
                print(f"   Quantity: {quantity}")
                
                # Generate hashes
                user_hash = generate_hash(order_id)
                normalized_url = normalize_url(url)
                url_hash = generate_hash(normalized_url)
                
                # Check for duplicate user
                if check_duplicate_user(user_hash, conn):
                    print(f"   ❌ DUPLICATE USER - Canceling and refunding")
                    cancel_order(order_id)
                    continue
                
                # Check for duplicate URL
                if check_duplicate_url(url_hash, conn):
                    print(f"   ❌ DUPLICATE URL - Canceling and refunding")
                    cancel_order(order_id)
                    continue
                
                # Send to external API
                print(f"   📤 Sending to external API...")
                success, response = send_order_to_external_api(url, quantity)
                
                if success:
                    print(f"   ✅ Order sent successfully")
                    
                    # Save to database
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO processed_requests 
                        (order_id, user_hash, url_hash, original_url, service_id, quantity, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (order_id, user_hash, url_hash, url, TARGET_SERVICE_ID, quantity, 'completed'))
                    conn.commit()
                    cur.close()
                else:
                    print(f"   ❌ Failed to send order: {response}")
                    
                    # Save error to database
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO processed_requests 
                        (order_id, user_hash, url_hash, original_url, service_id, quantity, status, error_message)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (order_id, user_hash, url_hash, url, SOURCE_SERVICE_ID, quantity, 'failed', str(response)))
                    conn.commit()
                    cur.close()
            
            except Exception as e:
                print(f"   ❌ Error processing order: {e}")
                continue
        
        print(f"\n{'='*60}")
        print(f"✅ Order processing completed")
        print(f"{'='*60}\n")
    
    except Exception as e:
        print(f"❌ Error in process_orders: {e}")
    
    finally:
        conn.close()

# ============================================================================
# Flask Routes
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    conn = get_db_connection()
    db_status = "connected" if conn else "disconnected"
    if conn:
        conn.close()
    
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'database': db_status,
        'service': 'order-processor'
    })

@app.route('/api/stats', methods=['GET'])
def stats():
    """Get statistics"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM processed_requests
        """)
        
        stats = cur.fetchone()
        cur.close()
        conn.close()
        
        return jsonify({
            'total_requests': stats['total'] or 0,
            'successful_requests': stats['successful'] or 0,
            'failed_requests': stats['failed'] or 0,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config', methods=['GET'])
def config():
    """Get configuration"""
    return jsonify({
        'source_service': SOURCE_SERVICE_ID,
        'target_service': TARGET_SERVICE_ID,
        'user_check_window': USER_CHECK_WINDOW,
        'global_cooldown': GLOBAL_COOLDOWN,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/', methods=['GET'])
def index():
    """Index endpoint"""
    return jsonify({
        'name': 'Order Processor',
        'version': '1.0.0',
        'language': 'Python',
        'framework': 'Flask',
        'database': 'PostgreSQL',
        'endpoints': {
            'health': '/api/health',
            'stats': '/api/stats',
            'config': '/api/config'
        }
    })

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    print("🚀 Starting Order Processor (Python/Flask)")
    
    # Initialize database
    init_database()
    
    # Start Flask app
    port = int(os.getenv('PORT', 10001))
    app.run(host='0.0.0.0', port=port, debug=False)
