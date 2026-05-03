# 🎌 Anichin App — Nonton Donghua Sub Indo

UI untuk streaming donghua berbasis React, menggunakan [anichin-api](https://github.com/asmindev/anichin-api).

---

## 📁 Struktur Project

```
anichin-app/
├── public/
│   └── index.html
├── src/
│   ├── index.js
│   └── App.jsx        ← semua UI ada di sini
├── .env               ← konfigurasi URL API
├── package.json
└── README.md
```

---

## 🚀 Cara Jalankan di Termux

### LANGKAH 1 — Install dependensi Termux

Buka Termux, jalankan satu per satu:

```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts python git -y
```

Cek versi Node (minimal v16):
```bash
node -v
npm -v
```

---

### LANGKAH 2 — Jalankan API (anichin-api)

Taruh folder `anichin-api-main` di storage Termux, lalu:

```bash
# Masuk ke folder API
cd ~/anichin-api-main

# Install dependensi Python
pip install -r requirements.txt

# Jalankan API (biarkan terminal ini terbuka)
python main.py
```

API akan berjalan di: `http://localhost:5000`

> **Tips:** Buka sesi Termux baru (swipe dari kiri) untuk langkah selanjutnya agar API tetap jalan.

---

### LANGKAH 3 — Setup & Jalankan UI

Di sesi Termux baru:

```bash
# Pindah ke folder anichin-app
cd ~/anichin-app

# Install dependensi Node (agak lama, bisa 5-10 menit)
npm install

# Jalankan UI
npm start
```

UI akan berjalan di: `http://localhost:3000`

Buka browser HP kamu → ketik `http://localhost:3000` ✅

---

## ⚙️ Konfigurasi URL API

Edit file `.env` di folder `anichin-app`:

```env
# Jika API & UI di HP yang sama (Termux):
REACT_APP_API_BASE=http://localhost:5000

# Jika API di HP lain / PC (ganti IP-nya):
REACT_APP_API_BASE=http://192.168.1.100:5000
```

Cari IP HP kamu dengan:
```bash
ifconfig | grep 'inet '
# atau
ip addr | grep 'inet '
```

Setelah edit `.env`, restart UI dengan `Ctrl+C` lalu `npm start` lagi.

---

## 🔄 Menjalankan Setiap Kali Buka Termux

Buat 2 sesi Termux:

**Sesi 1 — API:**
```bash
cd ~/anichin-api-main && python main.py
```

**Sesi 2 — UI:**
```bash
cd ~/anichin-app && npm start
```

---

## 💡 Tips Termux

- Simpan kedua perintah di atas ke alias supaya cepat:
  ```bash
  echo "alias api='cd ~/anichin-api-main && python main.py'" >> ~/.bashrc
  echo "alias ui='cd ~/anichin-app && npm start'" >> ~/.bashrc
  source ~/.bashrc
  ```
  Setelah itu tinggal ketik `api` dan `ui`.

- Agar Termux tidak mati saat layar mati:
  ```bash
  termux-wake-lock
  ```

- Untuk akses dari HP/laptop lain di WiFi yang sama, gunakan IP lokal HP di `.env`.

---

## 🎮 Fitur Aplikasi

| Fitur | Keterangan |
|---|---|
| 🏠 Home | Konten terbaru dari anichin.moe |
| 🔍 Cari | Search donghua by nama |
| 🏷️ Genre | Filter by genre |
| ❤️ Favorit | Simpan favorit (localStorage) |
| 📋 Detail | Info lengkap + list episode |
| ▶️ Tonton | Player + pilih server & kualitas |
| 🕐 Lanjutkan | Auto ingat episode terakhir |

---

## ❗ Troubleshooting

**`npm install` gagal / lama:**
```bash
npm install --legacy-peer-deps
```

**API tidak bisa diakses:**
- Pastikan python main.py sudah jalan
- Cek apakah port 5000 sudah dipakai: `ss -tlnp | grep 5000`

**Layar putih / error CORS:**
- Pastikan API sudah jalan
- Cek URL di `.env` sudah benar
- API sudah support CORS (flask-cors sudah ada di requirements.txt)

**Node versi lama:**
```bash
pkg install nodejs-lts -y
```
