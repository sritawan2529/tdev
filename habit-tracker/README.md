# CEO Habit OS v2 Cloud

เว็บแอปสำหรับโฟกัสสิ่งสำคัญในแต่ละวัน ติดตาม Habit และซิงก์ข้อมูลอย่างปลอดภัยระหว่างหลายอุปกรณ์

## Features
- Top 3 Today
- Daily Habits
- Daily Score
- Current / Best Streak
- Evening Reflection
- Dark Mode
- Responsive
- Local-first: เก็บข้อมูลใน LocalStorage และใช้งานต่อได้เมื่อ Cloud ขัดข้อง
- สมัครสมาชิก / เข้าสู่ระบบ
- Cloud Sync พร้อมป้องกันการเขียนทับข้อมูลใหม่จากอีกอุปกรณ์
- PostgreSQL backup ผ่าน Backend API

## Run
เปิดไฟล์ `index.html` ใน browser ได้ทันที

## Backend

Backend อยู่ใน `backend/` และใช้ Node.js, Express และ PostgreSQL

```bash
cd backend
npm install
cp .env.example .env
npm start
```

API หลัก:

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/state`
- `PUT /api/state`

ตั้งค่า URL ของ Backend ใน `config.js` หลังสร้าง Railway domain

## GitHub Pages
Repo นี้ใช้โฟลเดอร์ `habit-tracker/` ดังนั้นถ้าเปิด GitHub Pages จาก root ของ repo ให้เข้าผ่าน `/habit-tracker/`

Frontend อนุญาตให้เชื่อมต่อ API จาก `https://sritawan2529.github.io` ผ่านตัวแปร `ALLOWED_ORIGINS`
