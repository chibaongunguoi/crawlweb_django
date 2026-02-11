#!/usr/bin/env python
"""
Script để tạo user test cho chức năng đăng nhập
"""

import bcrypt
import sys

def create_user_hash():
    print("=== Tạo User Test ===\n")
    
    username = input("Nhập username (mặc định: testuser): ").strip() or "testuser"
    password = input("Nhập password (mặc định: test123): ").strip() or "test123"
    role = input("Nhập role (admin/user/company, mặc định: user): ").strip() or "user"
    
    # Hash password
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    hashed_password_str = hashed_password.decode('utf-8')
    
    print("\n=== Thông tin User ===")
    print(f"Username: {username}")
    print(f"Password: {password}")
    print(f"Hashed Password: {hashed_password_str}")
    print(f"Role: {role}")
    
    print("\n=== MongoDB Insert Command ===")
    print(f"""
db.User.insertOne({{
  username: "{username}",
  password: "{hashed_password_str}",
  role: "{role}"
}})
    """)
    
    print("\nHoặc sử dụng mongosh:")
    print(f"""
mongosh mongodb://localhost:27017/pbl4_db
use pbl4_db
db.User.insertOne({{username: "{username}", password: "{hashed_password_str}", role: "{role}"}})
    """)

if __name__ == "__main__":
    try:
        create_user_hash()
    except KeyboardInterrupt:
        print("\n\nĐã hủy!")
        sys.exit(0)
