"""
元素音乐平台 - 独立注册服务
提供用户注册API，直接操作SQLite数据库
运行在:5666端口，通过Nginx反向代理到主服务
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import hashlib
import datetime
import os

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 数据库文件路径
DB_PATH = '/opt/element-music/server/db/element_music.db'

def sha256(password):
    """SHA256加密密码"""
    return hashlib.sha256(password.encode()).hexdigest()

def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    用户注册API
    POST /api/auth/register
    Body: { username, password, confirmPassword, nickname }
    """
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        confirm_password = data.get('confirmPassword', '')
        nickname = data.get('nickname', '').strip()
        
        # 1. 验证必填字段
        if not username or not password or not confirm_password:
            return jsonify({
                'success': False,
                'error': '请填写所有必填字段'
            }), 400
        
        # 2. 验证用户名格式（3-20位，仅字母数字下划线）
        if not username.isalnum() and '_' not in username:
            return jsonify({
                'success': False,
                'error': '用户名格式不正确'
            }), 400
        
        if len(username) < 3 or len(username) > 20:
            return jsonify({
                'success': False,
                'error': '用户名必须为3-20位'
            }), 400
        
        # 3. 验证密码长度
        if len(password) < 6:
            return jsonify({
                'success': False,
                'error': '密码长度至少为6位'
            }), 400
        
        # 4. 验证确认密码
        if password != confirm_password:
            return jsonify({
                'success': False,
                'error': '两次输入的密码不一致'
            }), 400
        
        # 5. 检查用户名是否已存在
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT id FROM users WHERE username = ? AND is_deleted = 0',
            (username,)
        )
        
        if cursor.fetchone():
            conn.close()
            return jsonify({
                'success': False,
                'error': '用户名已存在'
            }), 400
        
        # 6. 创建新用户（默认角色为user）
        password_hash = sha256(password)
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute(
            '''INSERT INTO users (username, password_hash, role, nickname, status, created_at, updated_at) 
               VALUES (?, ?, 'user', ?, 1, ?, ?)''',
            (username, password_hash, nickname or username, now, now)
        )
        
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # 7. 返回成功响应
        return jsonify({
            'success': True,
            'message': '注册成功，请登录',
            'data': {
                'username': username,
                'userId': user_id
            }
        }), 201
        
    except Exception as e:
        print(f'[REGISTER] 注册失败: {e}')
        return jsonify({
            'success': False,
            'error': '注册失败，请稍后重试'
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """健康检查端点"""
    return jsonify({
        'success': True,
        'message': '注册服务正常运行',
        'version': '1.0.0'
    })

if __name__ == '__main__':
    print('🎵 元素音乐 - 注册服务启动中...')
    print(f'📊 数据库: {DB_PATH}')
    print(f'🌐 监听端口: 5666')
    app.run(host='0.0.0.0', port=5666, debug=False)
